import { readFile } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { Client } from 'pg'
import { extractNspListings, scholarshipIdForListing } from '../server/catalogue/nspListings.mjs'
import {reviewNspListings} from '../server/catalogue/nspReview.mjs'
const manifest = JSON.parse(await readFile(new URL('../data/verified/nsp-listings-2026.json', import.meta.url), 'utf8'))
const apply = process.argv.includes('--apply')
const response = await fetch(manifest.source, { signal: AbortSignal.timeout(20_000) })
if (!response.ok) throw new Error(`Official NSP source returned ${response.status}`)
if(new URL(response.url).hostname!=='scholarships.gov.in')throw Error('Unexpected official publisher redirect')
const listings = extractNspListings(await response.text())
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const reviewed = reviewNspListings(manifest,listings,today)
console.log(JSON.stringify({ reviewedListings: reviewed.length, scope: manifest.scope, apply }))
if (apply) {
 const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
 const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
 await client.connect()
 try {
  await client.query('begin')
  for (const item of reviewed) {
   const id = scholarshipIdForListing(item)
   const conflict = await client.query(`select 1 from catalogue_claims where entity_type='scholarship' and entity_id=$1 and verification_status in ('conflicting','archived') union all select 1 from scholarships where scholarship_id=$1 and verification_status in('conflicting','archived')`, [id])
   if (conflict.rowCount) throw new Error(`Resolve existing review state for ${id} before publishing`)
   const window = `Student applications open until ${item.deadline} (NSP ${manifest.cycle})`
   await client.query(`insert into scholarships(scholarship_id,scholarship_name,provider,geographic_scope,application_window,official_url,verification_status,date_policy,last_reviewed)
    values($1,$2,'National Scholarship Portal','India',$3,$4,'verified_listing','2026-27 cycle only',current_date::text)
    on conflict(scholarship_id) do update set scholarship_name=excluded.scholarship_name,application_window=excluded.application_window,verification_status='verified_listing',last_reviewed=excluded.last_reviewed`, [id, item.name, window, manifest.source])
   for (const [field, value] of [['name', item.name], ['application_window', window], ['scholarship_deadline', item.deadline]]) {
    await client.query(`insert into catalogue_claims(claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,document_title,checked_at,reviewer,review_method,academic_cycle,expires_at,evidence_locator,evidence_excerpt,source_hash,verification_status)
     values($1,'scholarship',$2,$3,to_jsonb($4::text),$5,'National Scholarship Portal','Schemes on NSP, academic year 2026-27',now(),$9,'source_audit','2026-27',$6,'Exact scheme card and general Student Application Open till line',$7,$8,'verified')
     on conflict(claim_key) do update set claim_value=excluded.claim_value,checked_at=excluded.checked_at,reviewer=excluded.reviewer,review_method=excluded.review_method,expires_at=excluded.expires_at,evidence_locator=excluded.evidence_locator,evidence_excerpt=excluded.evidence_excerpt,source_hash=excluded.source_hash,verification_status='verified',updated_at=now() where catalogue_claims.source_url=excluded.source_url and catalogue_claims.entity_id=excluded.entity_id and catalogue_claims.verification_status not in('archived','conflicting') returning claim_key`, [`scholarship:${id}:${field}`, id, field, value, manifest.source, item.deadline<manifest.reviewAfter?item.deadline:manifest.reviewAfter, `${item.name}. Student Application Open till: ${item.deadline}. ${manifest.scope}`, item.cardHash, `Manyfolds reviewed NSP manifest ${manifest.reviewedOn}`]).then(result=>{if(result.rowCount!==1)throw Error(`Claim identity/status changed: ${id}:${field}`)})
   }
   await client.query(`update catalogue_import_candidates set status='published',reviewed_at=now(),reviewed_by=null,reviewer_notes=$2,updated_at=now() where candidate_key=$1 and status in ('pending_review','published') and source_hash=$3`, [item.candidateKey, `Source audit against reviewed manifest ${manifest.reviewedOn}. ${manifest.scope}`, item.cardHash])
  }
  await client.query('commit')
  console.log(`Published ${reviewed.length} checked listings with identity and application-window claims only.`)
 } catch (error) { await client.query('rollback'); throw error } finally { await client.end() }
}
