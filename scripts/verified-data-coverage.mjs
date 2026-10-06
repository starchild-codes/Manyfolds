import { loadEnv } from 'vite'
import { Client } from 'pg'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const { rows } = await client.query(`select
    (select count(*)::int from catalogue_import_candidates where status='pending_review') staged_candidates,
    (select count(*)::int from catalogue_claims where verification_status='verified' and (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date)) active_claims,
    (select count(*)::int from scholarships where verification_status='verified_listing') verified_scholarship_listings,
    (select count(*)::int from catalogue_source_monitors where last_checked_at is not null) checked_sources`)
  console.log(JSON.stringify(rows[0], null, 2))
} finally {
  await client.end()
}
