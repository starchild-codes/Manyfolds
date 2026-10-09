import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { createServer, loadEnv } from 'vite'
import { Client } from 'pg'
import { schoolApi } from '../server/school/plugin.ts'
import { AuthenticationError } from '../server/ai/auth.ts'

const env={...loadEnv('development',process.cwd(),''),...process.env}
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
const testUser=randomUUID(),studentKey=randomUUID(),secondKey=randomUUID(),email=`workflow-${testUser}@example.invalid`
const profile={grade:'Class 12',stream:'Humanities',country:'India',state:'',city:'',geography:'',relocate:'',mode:'',subjects:{History:'like'},bestSubjects:[],enjoyWeak:[],avoidSubjects:[],scoreBand:'',consistency:'',mathComfort:3,writingComfort:3,labComfort:3,examComfort:3,skills:{},activities:[],work:[],values:[],budget:'',scholarship:'',nearHome:false,examWillingness:'',duration:'',route:[],ideas:[],exclusions:[]}
let owner,outsider,server
await db.connect()
try{
 const {rows}=await db.query(`select m.user_id,m.organisation_id,m.role from organisation_memberships m where m.active and m.role='owner' and m.organisation_id=(select organisation_id from organisation_memberships where user_id=m.user_id and active order by created_at limit 1) order by m.created_at`)
 owner=rows[0];outsider=rows.find(row=>row.organisation_id!==owner?.organisation_id);assert.ok(owner&&outsider,'Two schools are required')
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[testUser,email])
 for(const key of [studentKey,secondKey])await db.query('insert into student_registry_records(organisation_id,external_key,payload) values($1,$2,$3)',[owner.organisation_id,key,{id:key,name:'School workflow fixture',grade:'12'}])
 const context=actor=>({userId:actor.user_id,organisationId:actor.organisation_id,role:actor.role})
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[schoolApi(env,async req=>{
  const actor=req.headers.authorization
  if(actor==='owner')return context(owner)
  if(actor==='outsider')return context(outsider)
  if(actor==='teacher'||actor==='admin')return {...context(owner),role:actor}
  throw new AuthenticationError('Sign in required')
 },async req=>{if(req.headers.authorization==='invitee')return {id:testUser,email};if(req.headers.authorization==='wrong')return {id:outsider.user_id,email:'wrong@example.invalid'};throw new AuthenticationError('Sign in required')})]})
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`
 const call=async(path,method='GET',actor='owner',body)=>{const send=()=>fetch(`${origin}/api/school${path}`,{method,headers:{Authorization:actor,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});let res=await send();if(res.status===503&&(method==='GET'||(method==='POST'&&(body?.requestId||body?.id||path==='/invitation'))||(method==='PUT'&&path==='/invitation'))){await res.text();console.log('Retrying a safe request after temporary database unavailability');res=await send()}return {status:res.status,data:await res.json()}}
 assert.equal((await call('/staff','GET','')).status,401)
 assert.equal((await call('/staff','GET','teacher')).status,403)
 assert.equal((await call('/staff','POST','admin',{email,role:'admin'})).status,403)
 assert.equal((await call('/staff','POST','owner',{email:'invalid',role:'teacher'})).status,400)
 const inviteBody={email,role:'teacher',requestId:randomUUID(),token:randomBytes(32).toString('hex')}
 const invitation=await call('/staff','POST','owner',inviteBody);assert.equal(invitation.status,201)
 assert.equal((await call('/staff','POST','owner',inviteBody)).status,200)
 assert.equal((await call('/staff','POST','owner',{...inviteBody,role:'counsellor'})).status,409)
 const token=invitation.data.token,id=invitation.data.invitation.id
 const stored=await db.query('select token_hash from school_staff_invitations where id=$1',[id]);assert.equal(stored.rows[0].token_hash,createHash('sha256').update(token).digest('hex'));assert.notEqual(stored.rows[0].token_hash,token)
 const listed=await call('/staff');assert.ok(!JSON.stringify(listed.data).includes(token));assert.ok(!('token_hash' in listed.data.invitations[0]))
 assert.equal((await call('/invitation','POST','wrong',{token})).status,403)
 assert.equal((await call('/invitation','POST','invitee',{token})).data.invitation.school,(await db.query('select name from organisations where id=$1',[owner.organisation_id])).rows[0].name)
 await db.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'teacher')",[outsider.organisation_id,testUser]);assert.equal((await call('/invitation','PUT','invitee',{token})).status,409);await db.query('delete from organisation_memberships where organisation_id=$1 and user_id=$2',[outsider.organisation_id,testUser])
 assert.equal((await call('/invitation','PUT','invitee',{token})).status,200)
 assert.equal((await call('/invitation','PUT','invitee',{token})).status,200)
 assert.equal((await db.query('select role from organisation_memberships where user_id=$1 and active',[testUser])).rows[0].role,'teacher')
 assert.equal((await call('/staff','PATCH','owner',{userId:owner.user_id})).status,400)
 assert.equal((await call('/staff','PATCH','owner',{userId:testUser})).status,200)
 assert.equal((await db.query('select active from organisation_memberships where user_id=$1',[testUser])).rows[0].active,false)
 assert.equal((await call('/invitation','PUT','invitee',{token})).status,410)
 const revoked=await call('/staff','POST','owner',{email,role:'counsellor',requestId:randomUUID(),token:randomBytes(32).toString('hex')});assert.equal((await call('/staff','PATCH','owner',{invitationId:revoked.data.invitation.id})).status,200);assert.equal((await call('/invitation','PUT','invitee',{token:revoked.data.token})).status,410)
 const expired=await call('/staff','POST','owner',{email,role:'counsellor',requestId:randomUUID(),token:randomBytes(32).toString('hex')});await db.query("update school_staff_invitations set expires_at=now()-interval '1 day' where id=$1",[expired.data.invitation.id]);assert.equal((await call('/invitation','PUT','invitee',{token:expired.data.token})).status,410)
 const path=`/diagnostics?student=${studentKey}`,draft={requestId:randomUUID(),expectedRevision:0,profile,step:2,status:'draft',pinned:[]}
 assert.equal((await call(path,'POST','teacher',draft)).status,403)
 assert.equal((await call(path,'POST','outsider',draft)).status,404)
 assert.equal((await call(path,'POST','owner',{...draft,profile:{}})).status,400)
 const saved=await call(path,'POST','owner',draft);assert.equal(saved.status,201);assert.equal(saved.data.record.revision,1)
 assert.equal((await call(path,'POST','owner',draft)).status,200)
 assert.equal((await call(path,'POST','owner',{...draft,status:'ready'})).status,409)
 assert.equal((await call(path,'POST','owner',{...draft,requestId:randomUUID()})).status,409)
 const ready=await call(path,'POST','owner',{...draft,requestId:randomUUID(),expectedRevision:1,step:6,status:'review_requested',pinned:['History']});assert.equal(ready.status,201);assert.equal(ready.data.record.revision,2)
 assert.equal((await call(path)).data.records.length,2)
 assert.equal((await call(`/diagnostics?student=${secondKey}`)).data.records.length,0)
 assert.equal((await call(path,'GET','outsider')).data.records.length,0)
 const intervention={id:randomUUID(),title:'School group conversation',scheduledAt:new Date().toISOString(),status:'scheduled',summary:'Shared next steps',studentKeys:[studentKey,secondKey]}
 assert.equal((await call('/interventions','POST','teacher',intervention)).status,403)
 assert.equal((await call('/interventions','POST','outsider',intervention)).status,404)
 assert.equal((await call('/interventions','POST','owner',{...intervention,studentKeys:[studentKey,'absent']})).status,404)
 const group=await call('/interventions','POST','owner',intervention);assert.equal(group.status,201)
 assert.equal((await call('/interventions','POST','owner',intervention)).status,200)
 assert.equal((await call('/interventions','PATCH','owner',{...intervention,version:1,status:'completed',studentKeys:[studentKey]})).status,200)
 assert.equal((await call('/interventions','PATCH','owner',{...intervention,version:1})).status,409)
 assert.ok(!(await call('/interventions','GET','outsider')).data.records.some(row=>row.id===intervention.id))
 const range=`/reports?from=${encodeURIComponent(new Date(Date.now()-60000).toISOString())}&to=${encodeURIComponent(new Date(Date.now()+60000).toISOString())}`
 const report=await call(range);assert.equal(report.status,200);const row=report.data.records.find(r=>r.student_key===studentKey);assert.equal(row.completed_interventions,1);assert.equal(row.diagnostic_saves,1);assert.equal(row.completed_sessions,0)
 assert.equal((await call(range,'GET','outsider')).data.records.some(r=>r.student_key===studentKey),false)
 await assert.rejects(db.query('delete from student_registry_records where organisation_id=$1 and external_key=$2',[owner.organisation_id,studentKey]),error=>error.code==='23503')
 await db.query('begin');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[outsider.user_id]);for(const table of ['student_diagnostic_history','school_interventions','school_intervention_students'])assert.equal((await db.query(`select 1 from ${table} where organisation_id=$1`,[owner.organisation_id])).rowCount,0);await assert.rejects(db.query('select token_hash from school_staff_invitations'),error=>error.code==='42501')}finally{await db.query('rollback')}
 console.log('School HTTP workflow passed: email-bound invitation acceptance/revocation/expiry, role restrictions, diagnostic history/idempotency/conflicts, cohort saves, report counts and school RLS isolation. Auth identities were injected; no emails or AI requests were sent.')
}finally{
 if(server)await server.close()
 if(owner){await db.query(`delete from school_audit_events where organisation_id=$1 and (subject_key=any($2::text[]) or subject_key=$3 or subject_key in(select id::text from school_staff_invitations where email=$4) or subject_key in(select id::text from school_interventions where title=$5) or subject_key in(select id::text from student_diagnostic_history where student_key=any($2::text[])))`,[owner.organisation_id,[studentKey,secondKey],testUser,email,'School group conversation']);await db.query('delete from student_registry_history where organisation_id=$1 and student_key=any($2::text[])',[owner.organisation_id,[studentKey,secondKey]]);await db.query('delete from school_intervention_students where organisation_id=$1 and student_key=any($2::text[])',[owner.organisation_id,[studentKey,secondKey]]);await db.query('delete from school_interventions where organisation_id=$1 and title=$2',[owner.organisation_id,'School group conversation']);await db.query('delete from student_diagnostic_history where organisation_id=$1 and student_key=any($2::text[])',[owner.organisation_id,[studentKey,secondKey]]);await db.query('delete from student_registry_records where organisation_id=$1 and external_key=any($2::text[])',[owner.organisation_id,[studentKey,secondKey]]);await db.query('delete from school_staff_invitations where created_by=$1 and email=$2',[owner.user_id,email])}
 await db.query('delete from school_audit_events where subject_key=$1',[testUser]);await db.query('delete from organisation_memberships where user_id=$1',[testUser]);await db.query('delete from auth.users where id=$1',[testUser]);await db.end()
}
