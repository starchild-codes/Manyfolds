import { extractNspListings, scholarshipIdForListing } from '../server/catalogue/nspListings.mjs'
export { extractNspListings, scholarshipIdForListing } from '../server/catalogue/nspListings.mjs'
import { loadEnv } from 'vite'
import { Client } from 'pg'

const SOURCE_URL = 'https://scholarships.gov.in/All-Scholarships'
const CYCLE = '2026-27'
const apply = process.argv.includes('--apply')
if (process.argv[1]?.endsWith('stage-nsp-scholarships.mjs')) {
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`NSP returned HTTP ${response.status}`)
  const listings = extractNspListings(await response.text())
  console.log(JSON.stringify({ cycle: CYCLE, found: listings.length, open: listings.filter((item) => item.applicationState === 'open').length, apply }))
  if (apply) {
    const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    await client.connect()
    try {
      await client.query('begin')
      for (const listing of listings) {
        const previous = await client.query(
          `select source_hash from catalogue_import_candidates where candidate_key=$1 for update`,
          [listing.candidateKey],
        )
        if (previous.rowCount && previous.rows[0].source_hash !== listing.cardHash) {
          const scholarshipId = scholarshipIdForListing(listing)
          await client.query(
            `update catalogue_claims set verification_status='stale',updated_at=now()
             where entity_type='scholarship' and entity_id=$1 and verification_status='verified'`,
            [scholarshipId],
          )
        }
        await client.query(
          `insert into catalogue_import_candidates
           (candidate_key,entity_type,source_url,source_cycle,source_hash,payload)
           values($1,'scholarship',$2,$3,$4,$5)
           on conflict(candidate_key) do update set
             source_hash=excluded.source_hash,payload=excluded.payload,
             status=case when catalogue_import_candidates.source_hash<>excluded.source_hash
                 or catalogue_import_candidates.status='conflicting'
               then 'pending_review' else catalogue_import_candidates.status end,
             detected_at=case when catalogue_import_candidates.source_hash<>excluded.source_hash
               then now() else catalogue_import_candidates.detected_at end,
             updated_at=now()`,
          [listing.candidateKey, SOURCE_URL, CYCLE, listing.cardHash, listing],
        )
      }
      const missing = await client.query(
        `update catalogue_import_candidates set status='conflicting',updated_at=now(),
           reviewer_notes='Listing no longer appears in the current NSP feed; review official source.'
         where entity_type='scholarship' and source_url=$1 and source_cycle=$2
           and status in ('pending_review','published') and not(candidate_key=any($3::text[]))
         returning candidate_key,payload`,
        [SOURCE_URL, CYCLE, listings.map((listing) => listing.candidateKey)],
      )
      for (const row of missing.rows) {
        const scholarshipId = scholarshipIdForListing(row.payload)
        await client.query(
          `update catalogue_claims set verification_status='stale',updated_at=now()
           where entity_type='scholarship' and entity_id=$1 and verification_status='verified'`,
          [scholarshipId],
        )
      }
      await client.query('commit')
      console.log(`Staged ${listings.length} NSP listings; ${missing.rowCount} missing cards require review`)
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      await client.end()
    }
  }
}
