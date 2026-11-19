import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { checkDomesticSource, publishDomesticAdmission } from './import-nlsiu-ba.mjs'
import { loadEnv } from 'vite'
import { Client } from 'pg'

const manifest = JSON.parse(await readFile('data/verified/nlsiu-ba-2027.json', 'utf8'))
const html = await readFile('scripts/fixtures/nlsiu-domestic-ba-2026-11-19.html', 'utf8')
const valid = checkDomesticSource(html, manifest, '2026-11-19')
assert.equal(valid.hash.length, 64)
assert.throws(()=>checkDomesticSource(html,{...manifest,institutionId:'another-university'},'2026-11-19'),/programme identity/)
assert.throws(() => checkDomesticSource(html, manifest, '2026-12-20'), /fresh human source review/)
assert.throws(() => checkDomesticSource(html.replace('55%', '50%'), manifest, '2026-11-19'), /rule changed/)
assert.throws(() => checkDomesticSource(html.replace('45%', '40%'), manifest, '2026-11-19'), /rule changed/)
assert.throws(()=>checkDomesticSource(html.replace('Eligibility','Eligibility <p>Additional mandatory qualifying condition.</p>'),manifest,'2026-11-19'),/rule changed/,'Added criteria must trigger review even when all old sentences remain')
assert.throws(() => checkDomesticSource(html.replace('23 March 2027', '24 March 2027'), manifest, '2026-11-19'), /rule changed/)
assert.throws(() => checkDomesticSource(html.replace('25 April 2027', '26 April 2027'), manifest, '2026-11-19'), /rule changed/)
assert.throws(() => checkDomesticSource(html.replace('NLSIU announces', 'International Admission NLSIU announces').replace('Applicants in the general category', 'Intake and Reservation Applicants in the general category'), manifest, '2026-11-19'), /rule changed/)
assert.throws(() => checkDomesticSource(html, { ...manifest, scStMinimumPercentage: 55 }, '2026-11-19'), /Manifest values/)

const db = new Client({ connectionString: loadEnv('development', process.cwd(), '').DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
try {
  await db.query('begin')
  const first = await publishDomesticAdmission(db, manifest, valid)
  await publishDomesticAdmission(db, manifest, valid)
  const rows = (await db.query(`select * from institution_programme_eligibility where institution_programme_id=$1 and admission_cycle=$2`, [first.programmeId, manifest.cycle])).rows
  assert.equal(rows.length, 1, 'Refresh must not duplicate eligibility')
  assert.equal(Number(rows[0].minimum_percentage), 55)
  assert.equal(rows[0].category_specific_rules.SC_ST_minimum_percentage, 45)
  assert.equal(rows[0].board_rules.proof_deadline, '2027-12-31')
  const cycles = await db.query(`select c.registration_close::text deadline from college_program_application_cycles c join college_program_admission_routes r on r.id=c.admission_route_id where r.institution_programme_id=$1 and c.cycle_year=$2`, [first.programmeId, manifest.cycle])
  assert.deepEqual(cycles.rows, [{ deadline: '2027-03-23' }])
  await db.query("update catalogue_claims set verification_status='archived' where claim_key='relationship:nlsiu-ba:nlsat'")
  await assert.rejects(publishDomesticAdmission(db, manifest, valid), /archived records/)
  console.log('NLSIU source-change, category, expiry, idempotency and archived-record protections passed; DB fixture rolled back')
} finally { await db.query('rollback'); await db.end() }
