import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import { Pool } from 'pg'
import { VerificationAdminService } from '../server/ai/verificationAdmin.ts'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })
try {
  const { rows } = await pool.query("select user_id,organisation_id from organisation_memberships where active and role in ('owner','admin') limit 1")
  assert.ok(rows[0], 'An active admin workspace is required')
  const auth = { userId: rows[0].user_id, organisationId: rows[0].organisation_id, role: 'owner' }
  const service = new VerificationAdminService(pool, new Set([auth.userId]))
  await assert.rejects(new VerificationAdminService(pool).list(auth), (error) => error.statusCode === 403)
  const workspace = await service.list(auth)
  const key = `nsp:2026-27:test-${randomUUID()}`
  const originalFetch = globalThis.fetch
  const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const pastDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  try {
    await pool.query(
      `insert into catalogue_import_candidates(candidate_key,entity_type,source_url,source_cycle,source_hash,payload)
       values($1,'scholarship','https://scholarships.gov.in/All-Scholarships','2026-27','test-hash',$2)`,
      [key, { name: 'Unsupported Test Scheme', deadline: pastDate, applicationState: 'open', applicationMode: 'general', cardHash: 'test-hash' }],
    )
    const cards = Array.from({ length: 20 }, (_, i) => `<h6>Real Scheme ${i}</h6><br>Student Application Open till : ${futureDate.split('-').reverse().join('-')}`).join('')
    let fetches = 0
    globalThis.fetch = async () => { fetches++; return new Response(`Academic Year 2026-27 ${cards}`, { status: 200 }) }
    await assert.rejects(service.reviewCandidate(auth, key, { action:'publish', notes:'Synthetic expiry protection check.' }), error => error.statusCode === 409 && /window has ended/i.test(error.message))
    assert.equal(fetches, 0, 'An expired candidate must be refused before fetching or publishing')
    await pool.query("update catalogue_import_candidates set payload=jsonb_set(payload,'{deadline}',to_jsonb($2::text)) where candidate_key=$1", [key, futureDate])
    await assert.rejects(
      service.reviewCandidate(auth, key, { action: 'publish', notes: 'Checked the current official feed.' }),
      (error) => error.statusCode === 409 && /listing changed/i.test(error.message),
    )
    await pool.query("update catalogue_import_candidates set payload=jsonb_set(payload,'{deadline}','\"2027-12-31\"'::jsonb) where candidate_key=$1", [key])
    await assert.rejects(service.reviewCandidate(auth, key, { action:'publish', notes:'Synthetic cross-year source check.' }), error => error.statusCode === 409 && /listing changed/i.test(error.message), 'The 2026-27 source cycle must allow dates in 2027, while still checking the exact official card')
    await pool.query("update catalogue_import_candidates set payload=jsonb_set(payload,'{deadline}','\"2026-02-31\"'::jsonb) where candidate_key=$1", [key])
    await assert.rejects(service.reviewCandidate(auth, key, { action:'publish', notes:'Synthetic invalid-date check.' }), error => error.statusCode === 422, 'Invalid calendar dates must not be published')
  } finally {
    globalThis.fetch = originalFetch
    await pool.query('delete from catalogue_import_candidates where candidate_key=$1', [key])
  }
  console.log('Verification workspace permission and candidate-change protection checks passed. Checking dataset coverage separately.')
  const published=category=>workspace.coverage.find(row=>row.category===category)?.published||0
  const requirements=[
    {name:'Named programmes',actual:published('Named programmes'),minimum:5},
    {name:'Programmes with checked eligibility',actual:published('Programmes with checked eligibility'),minimum:2},
    {name:'Visible fee gaps',actual:workspace.gapStats.programmes_missing_fees,minimum:5},
    {name:'Current verified relationships',actual:workspace.gapStats.verified_relationship_claims,minimum:2},
    {name:'Delhi programme coverage',actual:workspace.stateCoverage.find(row=>row.state==='Delhi')?.published||0,minimum:2},
    {name:'NSP review candidates',actual:workspace.candidates.length,minimum:20},
    {name:'NLSIU source monitor',actual:Number(workspace.sourceMonitors.some(row=>row.monitor_key==='nlsiu-ballb')),minimum:1},
  ]
  const unmet=requirements.filter(row=>row.actual<row.minimum)
  console.log(JSON.stringify({coverageRequirements:requirements}))
  assert.equal(unmet.length,0,'Unmet dataset checks: '+unmet.map(row=>row.name+' ('+row.actual+'/'+row.minimum+')').join(', '))
  console.log('Verification workspace coverage and candidate queue passed')
} finally {
  await pool.end()
}
