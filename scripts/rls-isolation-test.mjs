import { loadEnv } from 'vite'
import pg from 'pg'

const { Client } = pg
const env = loadEnv('development', process.cwd(), '')
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for the RLS test')
const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  const memberships = await client.query(
    `select user_id,organisation_id from organisation_memberships
     where active order by created_at limit 2`,
  )
  if (memberships.rowCount < 2) throw new Error('Two organisations are required for isolation testing')
  const [first, second] = memberships.rows
  if (first.organisation_id === second.organisation_id) throw new Error('Two distinct organisations are required')
  const unassigned = await client.query(
    `select u.id from auth.users u where not exists
     (select 1 from organisation_memberships m where m.user_id=u.id and m.active) limit 1`,
  )
  const privateRecordCounts = await client.query(
    'select organisation_id,count(*)::int count from counsellor_private_records group by organisation_id',
  )
  const totalPrivateRecords = privateRecordCounts.rows.reduce((sum, row) => sum + row.count, 0)
  if (totalPrivateRecords < 1) throw new Error('At least one existing private record is required for this check')
  const owner = await client.query(
    `select m.user_id,m.organisation_id,count(r.id)::int count
     from organisation_memberships m
     join counsellor_private_records r on r.organisation_id=m.organisation_id and r.counsellor_external_id=m.user_id::text
     where m.active group by m.user_id,m.organisation_id having count(r.id)>0 limit 1`,
  )
  if (!owner.rowCount) throw new Error('Private record owner has no active membership')
  const privateOwner = owner.rows[0]
  const otherMember = memberships.rows.find(row => row.organisation_id !== privateOwner.organisation_id)
    || (await client.query('select user_id,organisation_id from organisation_memberships where active and organisation_id<>$1 limit 1', [privateOwner.organisation_id])).rows[0]
  if (!otherMember) throw new Error('A second organisation is required for private record testing')
  await client.query('begin')
  await client.query('set local role authenticated')
  await client.query(`select set_config('request.jwt.claim.sub',$1,true)`, [first.user_id])
  const otherTasks = await client.query(
    'select count(*)::int count from source_verification_tasks where organisation_id=$1',
    [second.organisation_id],
  )
  const otherRoadmaps = await client.query(
    'select count(*)::int count from roadmap_generations where organisation_id=$1',
    [second.organisation_id],
  )
  const otherNotes = await client.query(
    'select count(*)::int count from catalogue_record_notes where organisation_id=$1',
    [second.organisation_id],
  )
  await client.query('rollback')
  if (otherTasks.rows[0].count || otherRoadmaps.rows[0].count || otherNotes.rows[0].count) {
    throw new Error('Cross-organisation rows were visible under the authenticated role')
  }
  const visiblePrivateCount = async (userId, organisationId) => {
    await client.query('begin')
    try {
      await client.query('set local role authenticated')
      await client.query(`select set_config('request.jwt.claim.sub',$1,true)`, [userId])
      const result = await client.query(
        'select count(*)::int count from counsellor_private_records where organisation_id=$1',
        [organisationId],
      )
      return result.rows[0].count
    } finally {
      await client.query('rollback')
    }
  }
  if (await visiblePrivateCount(privateOwner.user_id, privateOwner.organisation_id) !== privateOwner.count) {
    throw new Error('A private record owner cannot see their own records')
  }
  if (await visiblePrivateCount(otherMember.user_id, privateOwner.organisation_id) !== 0) {
    throw new Error('Private records are visible across organisations')
  }
  await client.query('begin')
  try {
    await client.query('set local role authenticated')
    await client.query(`select set_config('request.jwt.claim.sub',$1,true)`, [privateOwner.user_id])
    const key = `rls-check-${Date.now()}`
    await client.query(
      `insert into counsellor_private_records
       (organisation_id,counsellor_external_id,record_type,external_key,payload)
       values ($1,$2,'student',$3,'{}'::jsonb)`,
      [privateOwner.organisation_id, privateOwner.user_id, key],
    )
    await client.query('savepoint foreign_record')
    let rejected = false
    try {
      await client.query(
        `insert into counsellor_private_records
         (organisation_id,counsellor_external_id,record_type,external_key,payload)
         values ($1,$2,'student',$3,'{}'::jsonb)`,
        [otherMember.organisation_id, privateOwner.user_id, key],
      )
    } catch (error) {
      rejected = error.code === '42501'
      await client.query('rollback to savepoint foreign_record')
    }
    if (!rejected) throw new Error('A counsellor could write into another organisation')
  } finally {
    await client.query('rollback')
  }
  if (unassigned.rowCount && await visiblePrivateCount(unassigned.rows[0].id, privateOwner.organisation_id) !== 0) {
    throw new Error('A new account can see an existing organisation’s private records')
  }
  if (unassigned.rowCount) {
    await client.query('begin')
    try {
      await client.query('set local role authenticated')
      await client.query(`select set_config('request.jwt.claim.sub',$1,true)`, [unassigned.rows[0].id])
      for (const table of ['organisations', 'organisation_memberships', 'school_classes', 'school_sections', 'student_profiles']) {
        const result = await client.query(`select count(*)::int count from public.${table}`)
        if (result.rows[0].count !== 0) throw new Error(`A new account can see ${table}`)
      }
    } finally {
      await client.query('rollback')
    }
  }
  if ((await client.query("select has_table_privilege('anon','public.counsellor_private_records','SELECT') allowed")).rows[0].allowed) {
    throw new Error('Anonymous access to private records is still granted')
  }
  const legacy = await client.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('diagnostic_answers','student_financial_profiles','recommendation_runs','counsellor_overrides')
      and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'))`)
  if (legacy.rowCount) throw new Error('Legacy personal tables are directly readable')
  console.log('RLS isolation passed for private records, roadmaps, verification tasks, and catalogue notes')
} finally {
  await client.end()
}
