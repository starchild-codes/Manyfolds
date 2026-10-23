import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {createServer,loadEnv} from 'vite'
import {guidanceApi} from '../server/guidance/plugin.ts'
import {schoolOperationsApi} from '../server/school/operations.ts'
import {blankSession} from '../server/guidance/sessionSchema.ts'
const env=loadEnv('development',process.cwd(),''),db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}}),org=randomUUID(),other=randomUUID(),student=randomUUID(),foreignStudent=randomUUID(),session=randomUUID(),foreignSession=randomUUID(),task=randomUUID(),actors={}
let server
await db.connect()
try{
 for(const id of [org,other])await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Synthetic leadership-note school',`leadership-${id}`])
 for(const name of ['owner','admin','lead_counsellor','counsellor','guidance_teacher','teacher','data_entry','reviewer','foreign']){const userId=randomUUID(),school=name==='foreign'?other:org,role=name==='foreign'?'owner':name;actors[name]={userId,organisationId:school,role};await db.query('insert into auth.users(id,email) values($1,$2)',[userId,`${userId}@example.invalid`]);await db.query('insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[school,userId,role])}
 for(const [key,school] of [[student,org],[foreignStudent,other]])await db.query('insert into student_registry_records(organisation_id,external_key,payload,created_by) values($1,$2,$3,$4)',[school,key,{id:key,name:'Synthetic leadership student',grade:'10 A',counsellorId:actors.counsellor.userId},actors.owner.userId])
 for(const role of ['guidance_teacher','teacher'])await db.query('insert into school_student_assignments(organisation_id,student_key,staff_id,assigned_by,reason) values($1,$2,$3,$4,$5)',[org,student,actors[role].userId,actors.owner.userId,'Synthetic note-access fixture'])
 for(const [id,key,school,kind,actor] of [[session,student,org,'session',actors.owner.userId],[task,student,org,'task',actors.owner.userId],[foreignSession,foreignStudent,other,'session',actors.foreign.userId]])await db.query('insert into guidance_activities(id,organisation_id,student_key,kind,title,scheduled_at,status,assigned_to,created_by,updated_by) values($1,$2,$3,$4,$5,now(),$6,$7,$7,$7)',[id,school,key,kind,'Synthetic note access session',kind==='session'?'scheduled':'open',actor])
 await db.query('insert into guidance_session_records(organisation_id,activity_id,details,updated_by) values($1,$2,$3,$4)',[org,session,{...blankSession(),shareableSummary:'Approved synthetic guardian summary',summaryApproved:true,studentActions:'Synthetic student next step'},actors.owner.userId])
 const authenticate=async req=>{const actor=actors[req.headers.authorization];if(!actor)throw Object.assign(Error('Sign-in required'),{statusCode:401});return actor}
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[guidanceApi(env,authenticate),schoolOperationsApi(env,authenticate)]});await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`
 const call=async(path,method='GET',role='owner',body,area='guidance')=>{const r=await fetch(`${base}/api/${area}${path}`,{method,headers:{Authorization:role,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()}}
 const path=`/session-leadership-note?id=${session}`,sentinel='LEADERSHIP-CONTENT-EXCLUSION-SENTINEL',privateSentinel='AUTHOR-PRIVATE-EXCLUSION-SENTINEL'
 assert.equal((await call(path)).data.note.version,0)
 for(const role of ['counsellor','guidance_teacher','teacher','data_entry','reviewer']){assert.equal((await call(path,'GET',role)).status,403);assert.equal((await call(path,'PUT',role,{version:0,body:sentinel})).status,403)}
 assert.equal((await call(path,'GET','foreign')).status,404)
 assert.equal((await call('/session-leadership-note?id='+foreignSession)).status,404)
 assert.equal((await call('/session-leadership-note?id='+task)).status,404)
 assert.equal((await call(path,'PUT','owner',{version:0,body:sentinel})).status,200)
 assert.equal((await call(path,'PUT','admin',{version:0,body:'Stale create attempt'})).status,409)
 assert.equal((await call(path,'GET','admin')).data.note.body,sentinel)
 assert.equal((await call(path,'PUT','lead_counsellor',{version:1,body:sentinel+' updated'})).status,200)
 assert.equal((await call(path,'PUT','owner',{version:1,body:'Stale overwrite attempt'})).status,409)
 const history=await call(path+'&revision=1','GET','admin');assert.equal(history.status,200);assert.equal(history.data.note.body,sentinel);assert.equal(history.data.history.length,2)
 assert.equal((await call(path+'&revision=1','PUT','owner',{version:2,body:'Attempt to alter history'})).status,400)
 assert.equal((await call(path+'&revision=100')).status,404)
 assert.equal((await call(path,'PUT','owner',{version:2,body:'x'.repeat(20001)})).status,400)
 assert.equal((await call(`/session-note?id=${session}`,'PUT','counsellor',{version:0,body:privateSentinel})).status,200)
 for(const role of ['owner','admin','lead_counsellor','counsellor','guidance_teacher']){
  const current=await call(`/session?id=${session}`,'GET',role);assert.equal(current.status,200);assert.equal(current.data.canLeadershipNote,['owner','admin','lead_counsellor'].includes(role));assert.ok(!JSON.stringify(current.data).includes(sentinel));if(role!=='counsellor')assert.ok(!JSON.stringify(current.data).includes(privateSentinel))
  const brief=await call(`/briefing?student=${student}`,'GET',role);assert.equal(brief.status,200);assert.ok(!JSON.stringify(brief.data).includes(sentinel))
  for(const variant of ['guardian','actions',...(['owner','admin','lead_counsellor','counsellor'].includes(role)?['internal']:[])]){const exported=await call(`/session-export?id=${session}&variant=${variant}`,'GET',role);assert.equal(exported.status,200);assert.ok(!JSON.stringify(exported.data).includes(sentinel));if(role!=='counsellor'||variant!=='internal')assert.ok(!JSON.stringify(exported.data).includes(privateSentinel))}
 }
 for(const query of [`/search?q=${sentinel}`,`/reporting?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z`,`/timeline?student=${student}`]){const r=await call(query,'GET','owner',undefined,'operations');assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(!JSON.stringify(r.data.records).includes(sentinel));if(query.startsWith('/search'))assert.equal(r.data.records.length,0)}
 const audit=(await db.query("select metadata from school_audit_events where organisation_id=$1 and event_type like 'session.leadership_note_%'",[org])).rows;assert.ok(audit.length>0);assert.ok(!JSON.stringify(audit).includes(sentinel))
 for(const role of Object.keys(actors)){
  await db.query('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actors[role].userId]);await db.query('set local role authenticated');for(const table of ['guidance_session_leadership_notes','guidance_session_leadership_note_history']){const rows=await db.query(`select body from ${table} where organisation_id=$1 and activity_id=$2`,[org,session]);assert.equal(rows.rowCount>0,['owner','admin','lead_counsellor'].includes(role))}await assert.rejects(db.query('update guidance_session_leadership_notes set body=$3 where organisation_id=$1 and activity_id=$2',[org,session,'Direct write must fail']),e=>e.code==='42501')}finally{await db.query('rollback')}
 }
 await db.query('update organisations set active=false where id=$1',[org]);await db.query('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actors.owner.userId]);await db.query('set local role authenticated');assert.equal((await db.query('select body from guidance_session_leadership_notes where organisation_id=$1',[org])).rowCount,0)}finally{await db.query('rollback')};await db.query('update organisations set active=true where id=$1',[org])
 await db.query('update student_registry_records set archived_at=now(),version=version+1 where organisation_id=$1 and external_key=$2',[org,student]);assert.equal((await call(path,'PUT','owner',{version:2,body:'Archived mutation'})).status,409)
 console.log('Leadership notes passed: role/caseload/school RLS, suspension, shared leadership editing, stale versions, read-only history, archive protection, author-private isolation, content-free audit and exclusion from briefings, session exports, search, reports and timeline. Only cleaned synthetic schools were changed.')
}finally{
 if(server)await server.close()
 for(const id of [org,other]){for(const table of ['guidance_activities','school_student_assignments','student_registry_history','school_audit_events','student_registry_records'])await db.query(`delete from ${table} where organisation_id=$1`,[id]);await db.query('delete from organisations where id=$1',[id])}
 for(const actor of Object.values(actors))await db.query('delete from auth.users where id=$1',[actor.userId]);await db.end()
}
