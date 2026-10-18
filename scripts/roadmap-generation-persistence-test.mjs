import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { loadEnv } from 'vite'
import { createAiConfig } from '../server/ai/config.ts'
import { RoadmapService } from '../server/ai/service.ts'

const config = createAiConfig({ ...loadEnv('development', process.cwd(), ''), ...process.env })
const db = new Client({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false } })
const originalFetch = globalThis.fetch
await db.connect()
try {
  await db.query('begin')
  const owner = (await db.query("select user_id,organisation_id from organisation_memberships where active and role='owner' limit 1")).rows[0]
  assert.ok(owner)
  const auth = { userId: owner.user_id, organisationId: owner.organisation_id, role: 'owner' }
  const studentKey = randomUUID()
  await db.query('insert into student_registry_records(organisation_id,external_key,payload) values($1,$2,$3)', [auth.organisationId,studentKey,{id:studentKey,name:'Synthetic generation fixture',grade:'12'}])
  const metadata = (await db.query('select raw_metadata from ai_model_catalogue where model_id=any($1::text[])', [config.allowedModels])).rows.map(row => row.raw_metadata)
  await db.query('update ai_model_health set healthy=true where model_id=any($1::text[])', [config.allowedModels])
  let calls = 0, rejectFactual = false
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://openrouter.ai/api/v1/models') return Response.json({ data: metadata })
    assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions')
    calls++
    const body = JSON.parse(init.body)
    const evidence = JSON.parse(body.messages[1].content)
    const roadmap = {
      roadmap_title: 'Synthetic persistence test', career_id: rejectFactual ? 'not-in-evidence' : evidence.primary_career.career_id,
      summary: 'Discuss the supplied interests with a counsellor.', why_it_fits: [], important_tradeoffs: [],
      eligibility_summary: { ...evidence.deterministic_eligibility, explanation: 'Use only the supplied eligibility assessment.', source_record_ids: [] },
      stages: [], course_options: [], college_programmes: [], exam_steps: [], backup_routes: [],
      next_actions: [], questions_for_counsellor: [], missing_or_unverified: [], decisive_constraints: [],
    }
    return Response.json({ model: body.model, choices: [{ message: { content: JSON.stringify(roadmap) } }], usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 } })
  }
  const service = new RoadmapService(db, { ...config, apiKey: 'mock-provider-no-charge' })
  const request = {
    studentExternalId: studentKey,
    profile: { grade: 'Class 12', stream: 'Humanities', subjects: { History: 'love' }, skills: { Research: 'enjoy' }, scoreBand: '80-89%', budget: 'Prefer not to answer', examWillingness: 'Open' },
    primaryCareer: { name: 'Law, policy & public affairs', fitFactors: ['matches History'], concerns: [] }, alternativeCareers: [],
  }
  const first = await service.generate(auth, { ...request, force: true })
  assert.equal(first.status, 'draft')
  const cached = await service.generate(auth, request)
  assert.equal(cached.id, first.id)
  assert.equal(cached.cached, true)
  assert.equal(calls, 1, 'Reusing a valid saved draft must not call the provider')
  let current = first
  for (const status of ['reviewed', 'approved', 'published']) current = await service.update(auth, current.id, { expectedVersion: current.version, status })
  const oldLink = (await db.query('select student_roadmap_id from roadmap_generations where id=$1', [first.id])).rows[0].student_roadmap_id
  const regenerated = await service.generate(auth, { ...request, force: true })
  assert.equal(regenerated.id, first.id)
  assert.equal(regenerated.status, 'draft', 'Fresh AI wording must not inherit publication')
  assert.equal(regenerated.version, current.version + 1, 'Regeneration must invalidate stale editors')
  const stored = (await db.query('select reviewed_at,approved_at,student_roadmap_id from roadmap_generations where id=$1', [first.id])).rows[0]
  assert.equal(stored.reviewed_at, null)
  assert.equal(stored.approved_at, null)
  assert.notEqual(stored.student_roadmap_id, oldLink)
  assert.equal(calls, 2)
  const failuresBefore=Number((await db.query('select coalesce(sum(consecutive_failures),0) failures from ai_model_health where model_id=any($1::text[])',[config.allowedModels])).rows[0].failures)
  rejectFactual=true
  await assert.rejects(service.generate(auth,{...request,force:true}),error=>error.statusCode===422)
  assert.equal((await service.latest(auth,studentKey)).version,regenerated.version,'Rejected AI text must not overwrite the saved draft')
  const failuresAfter=Number((await db.query('select coalesce(sum(consecutive_failures),0) failures from ai_model_health where model_id=any($1::text[])',[config.allowedModels])).rows[0].failures)
  assert.ok(failuresAfter>failuresBefore,'Schema-valid factual failures must count against model health')
  const callsBeforeArchive=calls
  await db.query('update student_registry_records set archived_at=now() where organisation_id=$1 and external_key=$2',[auth.organisationId,studentKey])
  await assert.rejects(service.generate(auth, { ...request, force:true }), error=>error.statusCode===404)
  await assert.rejects(service.update(auth, regenerated.id, {expectedVersion:regenerated.version,status:'reviewed'}), error=>error.statusCode===404)
  assert.equal(calls,callsBeforeArchive,'Archived student writes must fail before a provider call')
  console.log('Generation persistence passed: cached reuse, forced regeneration resets publication/approval, advances version and links the new roadmap. All writes rolled back; provider calls mocked.')
} finally {
  globalThis.fetch = originalFetch
  await db.query('rollback')
  await db.end()
}
