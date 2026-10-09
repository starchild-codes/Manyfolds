import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import { Client } from 'pg'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const db = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
try {
  const { rows: members } = await db.query(
    `select user_id,organisation_id,role from organisation_memberships
     where active and role in ('owner','admin') order by created_at`,
  )
  const owner = members[0]
  const outsider = members.find(member => member.organisation_id !== owner?.organisation_id)
  assert.ok(owner && outsider, 'Two separate active organisations are required')
  const key = randomUUID()
  const payload = { id: key, name: 'Registry isolation test', grade: '12' }
  await db.query('begin')
  try {
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner.user_id])
    const inserted = await db.query(
      `insert into student_registry_records(organisation_id,external_key,payload,created_by,updated_by)
       values($1,$2,$3,$4,$4) returning version`,
      [owner.organisation_id, key, payload, owner.user_id],
    )
    assert.equal(Number(inserted.rows[0].version), 1)
    const visible = await db.query('select external_key from student_registry_records where organisation_id=$1 and external_key=$2', [owner.organisation_id, key])
    assert.equal(visible.rowCount, 1)
    const stale = await db.query('update student_registry_records set version=version+1 where organisation_id=$1 and external_key=$2 and version=2 returning version', [owner.organisation_id, key])
    assert.equal(stale.rowCount, 0, 'A stale version must not overwrite a record')
    const updated = await db.query('update student_registry_records set version=version+1 where organisation_id=$1 and external_key=$2 and version=1 returning version', [owner.organisation_id, key])
    assert.equal(Number(updated.rows[0].version), 2)
  } finally { await db.query('rollback') }

  const existing = await db.query(
    `select count(*)::int total from student_registry_records r
     join counsellor_private_records p on p.organisation_id=r.organisation_id
       and p.external_key=r.external_key and p.record_type='student'`,
  )
  assert.ok(existing.rows[0].total >= 2, 'Existing student records were not copied')

  await db.query('begin')
  try {
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [outsider.user_id])
    const hidden = await db.query('select count(*)::int total from student_registry_records where organisation_id=$1', [owner.organisation_id])
    assert.equal(hidden.rows[0].total, 0, 'Another school can read student records')
    const denied = await db.query('update student_registry_records set updated_at=now() where organisation_id=$1 returning external_key', [owner.organisation_id])
    assert.equal(denied.rowCount, 0, 'Another school can update student records')
  } finally { await db.query('rollback') }
  console.log('Shared student registry migration, version and cross-school isolation passed')
} finally { await db.end() }
