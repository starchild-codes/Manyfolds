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
  assert.ok(workspace.coverage.some((row) => row.category === 'Named programmes' && row.published >= 5))
  assert.ok(workspace.coverage.some((row) => row.category === 'Programmes with checked eligibility' && row.published >= 2))
  assert.ok(workspace.gapStats.programmes_missing_fees >= 5)
  assert.ok(workspace.gapStats.verified_relationship_claims >= 2)
  assert.ok(workspace.stateCoverage.some((row) => row.state === 'Delhi' && row.published >= 2))
  assert.ok(workspace.candidates.length >= 20, 'NSP staging queue should be visible to admins')
  assert.ok(workspace.sourceMonitors.some((row) => row.monitor_key === 'nlsiu-ballb'))
  const key = `nsp:2026-27:test-${randomUUID()}`
  const originalFetch = globalThis.fetch
  try {
    await pool.query(
      `insert into catalogue_import_candidates(candidate_key,entity_type,source_url,source_cycle,source_hash,payload)
       values($1,'scholarship','https://scholarships.gov.in/All-Scholarships','2026-27','test-hash',$2)`,
      [key, { name: 'Unsupported Test Scheme', deadline: '2026-10-31', applicationState: 'open', applicationMode: 'general', cardHash: 'test-hash' }],
    )
    const cards = Array.from({ length: 20 }, (_, i) => `<h6>Real Scheme ${i}</h6><br>Student Application Open till : 31-10-2026`).join('')
    globalThis.fetch = async () => new Response(`Academic Year 2026-27 ${cards}`, { status: 200 })
    await assert.rejects(
      service.reviewCandidate(auth, key, { action: 'publish', notes: 'Checked the current official feed.' }),
      (error) => error.statusCode === 409 && /listing changed/i.test(error.message),
    )
  } finally {
    globalThis.fetch = originalFetch
    await pool.query('delete from catalogue_import_candidates where candidate_key=$1', [key])
  }
  console.log('Verification workspace coverage and candidate queue passed')
} finally {
  await pool.end()
}
