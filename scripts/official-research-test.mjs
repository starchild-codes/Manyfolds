import assert from 'node:assert/strict'
import { loadEnv } from 'vite'
import { Client } from 'pg'
import { OfficialResearchService, officialResearchSources, researchSelection } from '../server/ai/research.ts'
import { createAiConfig } from '../server/ai/config.ts'
const year = new Date().getUTCFullYear()
assert.throws(() => researchSelection({ subject: 'https://127.0.0.1', topic: 'dates', cycle: year }))
assert.throws(() => researchSelection({ subject: 'jee', topic: 'private student notes', cycle: year }))
assert.throws(() => researchSelection({ subject: 'jee', topic: 'dates', cycle: year + 2 }))
const annotation = (url, content = `Official ${year} examination schedule and important notice.`) => ({ type: 'url_citation', url_citation: { url, title: 'Official notice', content } })
const sources = officialResearchSources([
 annotation('https://jeemain.nta.nic.in/notice'), annotation('https://jeemain.nta.nic.in/notice'),
 annotation('https://jeemain.nta.nic.in.attacker.example/'), annotation('https://attacker.example/nta.ac.in/'),
 annotation('http://nta.ac.in/'), annotation('https://user@nta.ac.in/'), annotation('https://nta.ac.in:8443/'),
 annotation('https://nta.ac.in/old', 'Official 2020 examination schedule and important notice.'),
 { type: 'url_citation', url_citation: { url: 'https://nta.ac.in/generated-link', title: 'No extractive content' } },
], ['jeemain.nta.nic.in', 'nta.ac.in'], year)
assert.equal(sources.length, 1)
assert.equal(sources[0].url, 'https://jeemain.nta.nic.in/notice')

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }, config = createAiConfig({ ...env, MANYFOLDS_LIVE_DATA_ENABLED: 'true' })
const db = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const originalFetch = globalThis.fetch
await db.connect()
try {
 await db.query('begin')
 const members = (await db.query("select user_id,organisation_id from organisation_memberships where active and role='owner'")).rows
 const owner = members[0], other = members.find(row => row.organisation_id !== owner.organisation_id)
 assert.ok(owner && other)
 const auth = { userId: owner.user_id, organisationId: owner.organisation_id, role: 'owner' }
 // Isolate this transaction from real saved searches; rollback restores them.
 await db.query('delete from official_research_requests where organisation_id=$1', [auth.organisationId])
 const pool = { query: (...args) => db.query(...args), connect: async () => ({
  query: (sql, args) => db.query(sql === 'begin' ? 'savepoint research_reservation' : sql === 'commit' ? 'release savepoint research_reservation' : sql === 'rollback' ? 'rollback to savepoint research_reservation' : sql, args), release() {},
 }) }
 const service = new OfficialResearchService(pool, config)
 let calls = 0
 globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions')
  const body = JSON.parse(init.body)
  assert.equal(body.plugins[0].engine, 'exa')
  assert.equal(body.plugins[0].max_results, 2)
  assert.ok(!JSON.stringify(body).includes(owner.user_id))
  calls++
  return new Response(JSON.stringify({ usage: { prompt_tokens: 1000, completion_tokens: 80, total_tokens: 1080, cost: 0.001 }, choices: [{ message: { content: 'Untrusted generated prose must not appear', annotations: [annotation('https://jeemain.nta.nic.in/notice')] } }] }), { status: 200 })
 }
 const selection = { subject: 'jee', topic: 'dates', cycle: year }
 await assert.rejects(service.search({ ...auth, role: 'teacher' }, selection), error => error.statusCode === 403)
 const result = await service.search(auth, selection)
 assert.equal(result.status, 'sources_found'); assert.equal(result.cached, false); assert.equal(calls, 1)
 assert.ok(!JSON.stringify(result).includes('Untrusted generated prose'))
 const cached = await service.search(auth, selection)
 assert.equal(cached.cached, true); assert.equal(calls, 1)
 await assert.rejects(service.search(auth, { ...selection, topic: 'fees' }), error => error.statusCode === 429)
 assert.equal((await service.list({ ...auth, role: 'teacher' })).results.length, 1)
 assert.equal((await service.list({ ...auth, organisationId: other.organisation_id })).results.length, 0)
 const usage = (await db.query('select usage from official_research_requests where organisation_id=$1', [auth.organisationId])).rows[0].usage
 assert.equal(usage[0].prompt_tokens, 1000)
 // Direct authenticated SQL cannot cross a school boundary or create paid calls.
 await db.query("select set_config('request.jwt.claim.sub',$1,true)", [other.user_id])
 await db.query('set local role authenticated')
 assert.equal((await db.query('select id from official_research_requests where organisation_id=$1', [auth.organisationId])).rowCount, 0)
 await db.query('reset role')
 console.log('Official research passed: query/privacy restrictions, official citation/year filtering, no generated prose, usage ledger, durable cache/cooldown, teacher read-only, cross-school API and RLS isolation. Rolled back; no paid provider call.')
} finally {
 globalThis.fetch = originalFetch
 await db.query('rollback').catch(() => {})
 await db.end()
}
