// Reviewed pilot identities and facts only. This is not a generic publication tool.
// Run without --apply to inspect; failure leaves all claims untouched.
import { createHash } from 'node:crypto'
import { loadEnv } from 'vite'
import { Client } from 'pg'
import { extractNspListings, scholarshipIdForListing } from '../server/catalogue/nspListings.mjs'
const env={...loadEnv('development',process.cwd(),''),...process.env},apply=process.argv.includes('--apply')
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
const reviewed=[]
const fetchPage=async(url)=>{const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Official source returned ${response.status}`);const html=await response.text();return {url,html,hash:createHash('sha256').update(html).digest('hex'),text:html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()}}
const add=(page,keys,locator)=>{for(const key of keys)reviewed.push({key,page,locator})}
const law=await fetchPage('https://www.nls.ac.in/programme/ba-llb-hons/')
const bharati=await fetchPage('https://www.bharaticollege.du.ac.in/academics/program')
if(!bharati.text.includes('Bharati College')||!bharati.text.includes('Department of Commerce')||!bharati.text.includes('B.Com (Hons.) aims')||!bharati.text.includes('Department of Psychology')||!bharati.text.includes('students of B.A. (Hons) Psychology'))throw new Error('Bharati programme identity or offering needs manual review')
add(bharati,['course:bharati-bcom:name','institution:bharati:name','programme:bharati-bcom:offering','programme:bharati-psychology:offering'],'College masthead and current Department of Commerce / Psychology programme outcomes. Names and offering only; cycle-specific eligibility, fees and recognition are not inferred.')
if(!law.text.includes('B.A., LL.B. (Hons.)')||!law.text.includes('National Law School of India University'))throw new Error('NLSIU identity or offering changed')
const eligibility=law.text.slice(law.text.indexOf('A Pass in 10+2'),law.text.indexOf('Intake and Reservation'))
if(!eligibility.includes('Forty Five percent (45%)')||!eligibility.includes('Forty percent (40%)')||!eligibility.includes('Common Law Admission Test (CLAT)')||!eligibility.includes('no upper age limit'))throw new Error('NLSIU eligibility needs manual review')
add(law,['course:nlsiu-ballb:name','institution:nlsiu:name','programme:nlsiu-ballb:offering','programme:nlsiu-ballb:eligibility','relationship:ballb:clat'],'Programme overview; domestic Admission / Eligibility section. Current source confirms the degree, CLAT route and 10+2/category marks rules; historical seats and fees are excluded.')
const design=await fetchPage('https://admissions.nid.edu/NIDA2027/Default.aspx')
if(!design.text.includes('5.5 Year Professional Education Master of Design (Integrated Pathway)')||!design.text.includes('National Institute of Design')||!design.text.includes('30 November 2026'))throw new Error('NID offering or deadline needs manual review')
add(design,['course:nid-integrated-2027:name','programme:nid-integrated-2027:offering','institution:nid:name','cycle:nid2027:deadline'],'Important Updates item 1 and Programme of Study: integrated design offering and 30 November 2026 online application deadline. No fee or personal eligibility inference.')
const scholarships=await fetchPage('https://scholarships.gov.in/All-Scholarships'),cards=extractNspListings(scholarships.html)
for(const id of ['official-nsp-2026-swanath-degree','official-nsp-2026-pragati-degree','official-nsp-2026-saksham-degree','official-nsp-2026-top-class-sc']){
 const matches=cards.filter(card=>scholarshipIdForListing(card)===id)
 if(matches.length!==1||matches[0].applicationState!=='open'||matches[0].applicationMode!=='general'||matches[0].deadline!=='2026-10-31')throw new Error(`${id}: current listing changed; use the review queue`)
 add(scholarships,[`scholarship:${id}:name`,`scholarship:${id}:application_window`],`Academic Year 2026-27; exact scheme card: ${matches[0].name}. Student Application Open till: 31-10-2026. Listing/window only; benefit amount and personal eligibility are not verified.`)
}
console.log(JSON.stringify({reviewedClaims:reviewed.map(row=>row.key),apply},null,2))
if(apply){await db.connect();try{await db.query('begin');for(const {key,page,locator} of reviewed){const saved=await db.query(`update catalogue_claims set verification_status='verified',checked_at=now(),updated_at=now(),reviewer='Manyfolds automated pilot source audit',review_method='source_audit',source_hash=$3,evidence_locator=$4 where claim_key=$1 and source_url=$2 and verification_status in('stale','verified') and (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date) returning claim_key`,[key,page.url,page.hash,locator]);if(!saved.rowCount)throw new Error(`Claim ${key} is unavailable or expired`)}await db.query('commit');console.log(`Reverified ${reviewed.length} existing pilot claims from current official sources.`)}catch(error){await db.query('rollback');throw error}finally{await db.end()}}
