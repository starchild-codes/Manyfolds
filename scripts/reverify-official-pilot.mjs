// Exact, reviewed facts only. Each publisher is checked independently.
// Expired admissions windows are never renewed by this script.
import {createHash} from 'node:crypto'
import {loadEnv} from 'vite'
import {Client} from 'pg'
const env={...loadEnv('development',process.cwd(),''),...process.env},apply=process.argv.includes('--apply')
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
const jobs=[
 {url:'https://curriculum.iitd.ac.in/view_program.php?program_code=CS1',phrases:['B.Tech. in Computer Science and Engineering','Programme Code: CS1'],keys:['course:iitd-cse:name','programme:iitd-cse:offering'],locator:'Programme title and CS1 code. Offering only; no admission eligibility, fee, seat or cycle claim.'},
 {url:'https://www.bharaticollege.du.ac.in/academics/program',phrases:['Bharati College','Department of Commerce','B.Com (Hons.) aims','Department of Psychology','students of B.A. (Hons) Psychology'],keys:['course:bharati-bcom:name','institution:bharati:name','programme:bharati-bcom:offering','programme:bharati-psychology:offering'],locator:'College masthead and Commerce/Psychology programme outcomes. Identity and offering only.'},
 {url:'https://www.nls.ac.in/programme/ba-llb-hons/',phrases:['B.A., LL.B. (Hons.)','National Law School of India University','five-year integrated undergraduate'],keys:['course:nlsiu-ballb:name','institution:nlsiu:name','programme:nlsiu-ballb:offering'],locator:'Programme overview. Identity and offering only; expired cycle-specific rules remain withheld.'},
 {url:'https://www.nls.ac.in/programme/b-a-hons/',phrases:['NLS BA (Hons)','3-year BA (Hons.) programme','additional 4th year in the research track','July 2027'],keys:['course:official-nlsiu-ba-hons:name','course:official-nlsiu-ba-hons:duration','programme:nlsiu-ba:offering'],locator:'Domestic BA introduction and three-year/fourth research-year description. No fee or reservation inference.'},
]
let failures=0
if(apply)await db.connect()
try{
 for(const job of jobs){try{
  const response=await fetch(job.url,{signal:AbortSignal.timeout(20000)})
  if(!response.ok)throw Error(`HTTP ${response.status}`)
  if(new URL(response.url).hostname!==new URL(job.url).hostname)throw Error('Unexpected publisher redirect')
  const html=await response.text(),text=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
  if(!job.phrases.every(phrase=>text.includes(phrase)))throw Error('Reviewed identity or offering changed; manual review required')
  const hash=createHash('sha256').update(html).digest('hex')
  if(apply){await db.query('begin');try{
   for(const key of job.keys){const r=await db.query(`update catalogue_claims set verification_status='verified',checked_at=now(),updated_at=now(),reviewer='Manyfolds exact source audit 2026-11-04',review_method='source_audit',source_hash=$3,evidence_locator=$4 where claim_key=$1 and source_url=$2 and verification_status in('stale','verified') and (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date) returning claim_key`,[key,job.url,hash,job.locator]);if(!r.rowCount)throw Error(`Claim unavailable or expired: ${key}`)}
   await db.query('commit')
  }catch(error){await db.query('rollback');throw error}}
  console.log(JSON.stringify({source:job.url,reviewedClaims:job.keys,applied:apply}))
 }catch(error){failures++;console.error(JSON.stringify({source:job.url,error:error.message,published:false}))}}
}finally{if(apply)await db.end()}
if(failures)process.exitCode=1
