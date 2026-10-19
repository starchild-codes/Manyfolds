import assert from 'node:assert/strict'
import { loadEnv } from 'vite'
import { Client } from 'pg'
import { OfficialResearchService, officialResearchSources, researchSelection } from '../server/ai/research.ts'
import { createAiConfig } from '../server/ai/config.ts'
import { groundedResearchAnswers, selectionFromQuestion } from '../server/ai/researchAnswer.ts'
const year = new Date().getUTCFullYear()
assert.throws(() => researchSelection({ subject: 'https://127.0.0.1', topic: 'dates', cycle: year }))
assert.throws(() => researchSelection({ subject: 'jee', topic: 'private student notes', cycle: year }))
assert.throws(() => researchSelection({ subject: 'jee', topic: 'dates', cycle: year + 2 }))
for (const [question,subject,topic,cycle] of [
 [`When is JEE Main ${year + 1}?`,'jee','dates',year+1],
 [`When is JEE${year + 1}?`,'jee','dates',year+1],
 [`What are the NEET UG eligibility requirements for ${year}?`,'neet','eligibility',year],
 [`CUET UG ${year} application fees`,'cuet','fees',year],
 ['When is CLAT next year?','clat','dates',year+1],
 ['When is NID DAT this year?','nid','dates',year],
 [`Delhi University ${year} admission deadlines`,'du','dates',year],
]) assert.deepEqual(selectionFromQuestion(question,year+1,year),{subject,topic,cycle})
assert.throws(()=>selectionFromQuestion('When is the exam in 2027?',year,year),/Name one supported exam/)
assert.throws(()=>selectionFromQuestion('When are JEE and NEET next year?',year,year),/Name one/)
assert.throws(()=>selectionFromQuestion('When is JEE Advanced next year?',year,year),/currently supports/)
assert.throws(()=>selectionFromQuestion('What are CUET PG fees next year?',year,year),/currently supports/)
assert.throws(()=>selectionFromQuestion(`JEE Main dates in ${year} and ${year+1}?`,year,year),/one admission or exam year/)
const annotation = (url, content = `Official ${year} examination schedule and important notice.`) => ({ type: 'url_citation', url_citation: { url, title: 'Official notice', content } })
const sources = officialResearchSources([
 annotation('https://jeemain.nta.nic.in/notice'), annotation('https://jeemain.nta.nic.in/notice'),
 annotation('https://jeemain.nta.nic.in.attacker.example/'), annotation('https://attacker.example/nta.ac.in/'),
 annotation('http://nta.ac.in/'), annotation('https://user@nta.ac.in/'), annotation('https://nta.ac.in:8443/'),
 annotation('https://nta.ac.in/old', 'Official 2020 examination schedule and important notice.'),
 {type:'url_citation',url_citation:{url:'https://nta.ac.in/previous-cycle',title:`JEE Main ${year-1} bulletin`,content:`Old examination bulletin. Candidates graduating in ${year} may read this notice.`}},
 { type: 'url_citation', url_citation: { url: 'https://nta.ac.in/generated-link', title: 'No extractive content' } },
], ['jeemain.nta.nic.in', 'nta.ac.in'], year)
assert.equal(sources.length, 1)
assert.equal(sources[0].url, 'https://jeemain.nta.nic.in/notice')
const officialQuote=`JEE Main ${year} exam date: 20 January ${year}.`
const answerSources=[{url:'https://jeemain.nta.nic.in/notice',title:'Official schedule',excerpt:officialQuote}]
const answers=groundedResearchAnswers(JSON.stringify({answers:[
 {source_url:answerSources[0].url,quote:officialQuote},
 {source_url:answerSources[0].url,quote:`JEE Main ${year} exam date: 21 January ${year}.`},
 {source_url:'https://invented.example/date',quote:officialQuote},
 {source_url:answerSources[0].url,quote:officialQuote},
]}),answerSources)
assert.deepEqual(answers,[{quote:officialQuote,sourceUrl:answerSources[0].url}])
assert.deepEqual(groundedResearchAnswers('The date is probably 21 January.',answerSources),[])
assert.deepEqual(groundedResearchAnswers('{"answers":null}',answerSources),[])

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
  assert.ok(!JSON.stringify(body).includes('PRIVATE-QUESTION-MARKER'),'Original question text must not reach the search provider')
  calls++
  return new Response(JSON.stringify({ usage: { prompt_tokens: 1000, completion_tokens: 80, total_tokens: 1080, cost: 0.001 }, choices: [{ message: { content: JSON.stringify({answers:[{source_url:answerSources[0].url,quote:officialQuote},{source_url:answerSources[0].url,quote:'Untrusted generated prose must not appear'}]}), annotations: [annotation('https://jeemain.nta.nic.in/notice',officialQuote)] } }] }), { status: 200 })
 }
 const selection = { subject: 'jee', topic: 'dates', cycle: year }
 await assert.rejects(service.search({ ...auth, role: 'teacher' }, selection), error => error.statusCode === 403)
 const result = await service.search(auth, {question:`When is JEE Main ${year}? PRIVATE-QUESTION-MARKER`,cycle:year})
 assert.equal(result.status, 'sources_found'); assert.equal(result.cached, false); assert.equal(calls, 1)
 assert.equal(result.answers[0].quote,officialQuote); assert.equal(result.answerVersion,2)
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
 console.log('Official research passed: question routing, unsupported/ambiguous question handling, exact-source answers, invented-date rejection, private-text exclusion, official citation/year filtering, usage ledger, cache/cooldown, roles and school/RLS isolation. Rolled back; no paid provider call.')
} finally {
 globalThis.fetch = originalFetch
 await db.query('rollback').catch(() => {})
 await db.end()
}
