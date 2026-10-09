import { loadEnv } from 'vite'
import { Client } from 'pg'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const database = new URL(env.DATABASE_URL)
const supabase = new URL(env.SUPABASE_URL)
const projectFromApi = supabase.hostname.split('.')[0]
const projectFromDb = database.hostname.startsWith('db.')
  ? database.hostname.split('.')[1]
  : database.username.split('.')[1]
console.log(JSON.stringify({
  apiProject: projectFromApi,
  databaseProject: projectFromDb || 'unknown',
  sameProject: projectFromApi === projectFromDb,
}, null, 2))

const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const { rows } = await client.query(`select c.relname as table_name, c.relrowsecurity as rls_enabled,
    count(p.polname)::int as policy_count
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    left join pg_policy p on p.polrelid=c.oid
    where n.nspname='public' and c.relkind in ('r','p')
    group by c.oid order by c.relname`)
  if (process.argv.includes('--all')) console.table(rows)
  const missing = rows.filter(row => !row.rls_enabled)
  console.log(`Public tables: ${rows.length}; RLS enabled: ${rows.length - missing.length}; disabled: ${missing.length}`)
  if (missing.length) throw new Error(`RLS disabled on: ${missing.map(row => row.table_name).join(', ')}`)
  const access = await client.query(`select
    has_table_privilege('anon','public.careers','SELECT') as catalogue_read,
    has_table_privilege('anon','public.ai_evaluation_calls','SELECT') as internal_read,
    has_table_privilege('authenticated','public.student_financial_profiles','SELECT') as personal_read`)
  if (!access.rows[0].catalogue_read || access.rows[0].internal_read || access.rows[0].personal_read) {
    throw new Error('Public, internal, or personal table grants do not match the RLS design')
  }
  console.log('Catalogue read remains available; internal and personal tables are closed to direct access')
} finally {
  await client.end()
}
