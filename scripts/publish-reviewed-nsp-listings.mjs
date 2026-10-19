import { readFile } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { Client } from 'pg'
import { extractNspListings, scholarshipIdForListing } from '../server/catalogue/nspListings.mjs'
const manifest = JSON.parse(await readFile(new URL('../data/verified/nsp-listings-2026.json', import.meta.url), 'utf8'))
const apply = process.argv.includes('--apply')
const response = await fetch(manifest.source, { signal: AbortSignal.timeout(20_000) })
if (!response.ok) throw new Error(`Official NSP source returned ${response.status}`)
const listings = extractNspListings(await response.text())
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const reviewed = manifest.listings.map(expected => {
 const matches = listings.filter(item => item.name === expected.name)
 if (matches.length !== 1 || matches[0].cardHash !== expected.hash || matches[0].applicationState !== 'open' || matches[0].applicationMode !== 'general' || matches[0].deadline < today) throw new Error(`Source changed or expired: ${expected.name}. Publication refused; review the exact card.`)
 return matches[0]
})
console.log(JSON.stringify({ reviewedListings: reviewed.length, scope: manifest.scope, apply }))
if (apply) {
 const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
 const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
 await client.connect()
 try {
  await client.query('begin')
  for (const item of reviewed) {
   const id = scholarshipIdForListing(item)
   const conflict = await client.query(`select 1 from catalogue_claims where entity_type='scholarship' and entity_id=$1 and verification_status in ('conflicting','archived')`, [id])
   if (conflict.rowCount) throw new Error(`Resolve existing review state for ${id} before publishing`)
   const window = `Student applications open till 31 October 2026`
   if (item.deadline !== '2026-10-31') throw new Error('Reviewed window changed')
   await client.query(`insert into scholarships(scholarship_id,scholarship_name,provider,geographic_scope,application_window,official_url,verification_status,date_policy,last_reviewed)
    values($1,$2,'National Scholarship Portal','India',$3,$4,'verified_listing','2026-27 cycle only',current_date::text)
    on conflict(scholarship_id) do update set scholarship_name=excluded.scholarship_name,application_window=excluded.application_window,verification_status='verified_listing',last_reviewed=excluded.last_reviewed`, [id, item.name, window, manifest.source])
   for (const [field, value] of [['name', item.name], ['application_window', window]]) {
    await client.query(`insert into catalogue_claims(claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,document_title,checked_at,reviewer,review_method,academic_cycle,expires_at,evidence_locator,evidence_excerpt,source_hash,verification_status)
     values($1,'scholarship',$2,$3,to_jsonb($4::text),$5,'National Scholarship Portal','Schemes on NSP, academic year 2026-27',now(),'Manyfolds reviewed NSP manifest 2026-10-19','source_audit','2026-27',$6,'Exact scheme card and general Student Application Open till line',$7,$8,'verified')
     on conflict(claim_key) do update set claim_value=excluded.claim_value,checked_at=excluded.checked_at,reviewer=excluded.reviewer,review_method=excluded.review_method,expires_at=excluded.expires_at,evidence_locator=excluded.evidence_locator,evidence_excerpt=excluded.evidence_excerpt,source_hash=excluded.source_hash,verification_status='verified',updated_at=now()`, [`scholarship:${id}:${field}`, id, field, value, manifest.source, item.deadline, `${item.name}. Student Application Open till: 31-10-2026. ${manifest.scope}`, item.cardHash])
   }
   await client.query(`update catalogue_import_candidates set status='published',reviewed_at=now(),reviewed_by=null,reviewer_notes=$2,updated_at=now() where candidate_key=$1 and status in ('pending_review','published') and source_hash=$3`, [item.candidateKey, `Source audit against reviewed manifest 2026-10-19. ${manifest.scope}`, item.cardHash])
  }
  await client.query('commit')
  console.log(`Published ${reviewed.length} checked listings with identity and application-window claims only.`)
 } catch (error) { await client.query('rollback'); throw error } finally { await client.end() }
}
