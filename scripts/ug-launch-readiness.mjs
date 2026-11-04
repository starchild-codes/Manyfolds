// Read-only operational report. Never print SMTP, auth, AI or database secrets.
import {loadEnv} from 'vite'
import {Client} from 'pg'
import {spawnSync} from 'node:child_process'
const e={...loadEnv('development',process.cwd(),''),...process.env},ref='apcorawxxgxyyemhptws',origin='https://www.manyfolds.in'
if(new URL(e.SUPABASE_URL).hostname!==ref+'.supabase.co')throw Error('Unexpected Manyfolds project')
const report={checkedAt:new Date().toISOString(),origin,checks:{},externalGates:[],commercialReady:false}
const db=new Client({connectionString:e.DATABASE_URL,ssl:{rejectUnauthorized:false}});await db.connect()
try{
 const names=['school_ug_applications','school_ug_application_history','school_ug_application_followups','ug_admission_sources']
 const r=await db.query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relname=any($1::text[])",[names]);report.checks.admissionsSchema=r.rows.length===4&&r.rows.every(t=>t.relrowsecurity)
 report.checks.sources=(await db.query("select count(*)::int checked_links from ug_admission_sources where enabled and review_after>=(now() at time zone 'Asia/Kolkata')::date and checked_at>now()-interval '14 days'")).rows[0]
 report.checks.catalogue=(await db.query("select count(*) filter(where verification_status='verified' and (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date))::int active_claims,count(*) filter(where verification_status='conflicting')::int withheld_conflicts from catalogue_claims")).rows[0]
}finally{await db.end()}
for(const path of ['/api/health','/api/operations/admissions']){try{const r=await fetch(origin+path,{signal:AbortSignal.timeout(20000)});report.checks[path]=path==='/api/health'?r.status===200&&(await r.json()).status==='ready':r.status===401}catch{report.checks[path]=false}}
if(e.SUPABASE_ACCESS_TOKEN){const headers={Authorization:`Bearer ${e.SUPABASE_ACCESS_TOKEN}`};try{const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const c=await r.json();report.checks.authDomain=c.site_url===origin&&(c.uri_allow_list||'').split(',').includes(origin+'/auth/callback');report.checks.smtpConfigured=Boolean(c.smtp_host&&c.smtp_user&&c.smtp_pass&&c.smtp_admin_email)}catch{report.checks.authConfiguration='not checked'}
 try{const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/backups`,{headers,signal:AbortSignal.timeout(20000)});if(r.ok){const b=await r.json();report.checks.managedBackupMetadata={accessible:true,backups:Array.isArray(b.backups)?b.backups.length:0,pitrEnabled:b.pitr_enabled===true}}else report.checks.managedBackupMetadata={accessible:false,httpStatus:r.status}}catch{report.checks.managedBackupMetadata={accessible:false}}
}
const cmd='vercel api /v2/teams/team_egcyNdeVivhoCi5x3UoOelNu --raw --scope anshima0003-8376s-projects',v=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c',cmd],{encoding:'utf8',windowsHide:true,timeout:20000}):spawnSync('vercel',cmd.split(' ').slice(1),{encoding:'utf8',timeout:20000})
try{const c=JSON.parse(v.stdout);report.checks.hostingPlan=c.billing?.plan||c.plan||'unknown'}catch{report.checks.hostingPlan='not checked'}
if(!report.checks.smtpConfigured)report.externalGates.push('Configure the sender/provider, then verify confirmation, recovery and invitation delivery in the designated inbox.')
if(!['pro','enterprise'].includes(report.checks.hostingPlan))report.externalGates.push('Confirm and activate a hosting plan that permits commercial use.')
report.externalGates.push('Complete a native managed-database restore to an isolated recovery target and assign backup/retention/incident ownership; the synthetic admissions restore drill is not a full disaster-recovery test.')
report.externalGates.push('Complete the real Google/account and first-school acceptance walkthrough on the domain; local synthetic UI/API tests do not establish provider sign-in.')
report.commercialReady=report.externalGates.length===0
console.log(JSON.stringify(report,null,2));if(process.argv.includes('--strict')&&!report.commercialReady)process.exitCode=1
