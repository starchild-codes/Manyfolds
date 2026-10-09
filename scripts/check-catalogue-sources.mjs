import { createHash } from 'node:crypto'
import { loadEnv } from 'vite'
import { Client } from 'pg'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const apply = process.argv.includes('--apply')
const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 20)
const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const monitors = await client.query(
    `select monitor_key,source_url,check_interval_hours,last_content_hash
     from catalogue_source_monitors where active and (next_check_at is null or next_check_at<=now())
     order by next_check_at nulls first,monitor_key limit $1`,
    [Math.max(1, Math.min(100, limit))],
  )
  for (const monitor of monitors.rows) {
    let status = 0
    let hash = null
    let error = null
    try {
      const response = await fetch(monitor.source_url, {
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'Manyfolds source freshness checker (contact: repository maintainer)' },
      })
      status = response.status
      if (response.ok) hash = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
    } catch (failure) {
      error = failure instanceof Error ? failure.message : 'Source request failed'
    }
    const changed = Boolean(hash && monitor.last_content_hash && hash !== monitor.last_content_hash)
    console.log(JSON.stringify({ key: monitor.monitor_key, status, changed, error, applied: apply }))
    if (!apply) continue
    await client.query('begin')
    try {
      await client.query(
        `update catalogue_source_monitors set last_checked_at=now(),last_http_status=$2,
           last_content_hash=coalesce($3,last_content_hash),
           changed_at=case when $4 then now() else changed_at end,
           next_check_at=now()+make_interval(hours=>case when $2=200 then $5 else least($5,24) end)
         where monitor_key=$1`,
        [monitor.monitor_key, status || null, hash, changed, monitor.check_interval_hours],
      )
      if (changed) {
        const stale = await client.query(
          `update catalogue_claims set verification_status='stale',updated_at=now()
           where source_url=$1 and verification_status='verified' returning claim_key`,
          [monitor.source_url],
        )
        console.log(JSON.stringify({ key: monitor.monitor_key, claimsRequiringReview: stale.rows.map((row) => row.claim_key) }))
      }
      await client.query('commit')
    } catch (failure) {
      await client.query('rollback')
      throw failure
    }
  }
} finally {
  await client.end()
}
