import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {Client} from 'pg'
import {createServer,loadEnv} from 'vite'
import {schoolOperationsApi} from '../server/school/operations.ts'
import {AuthenticationError} from '../server/ai/auth.ts'
const env={...loadEnv('development',process.cwd(),''),...process.env}
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
const org=randomUUID(),other=randomUUID(),users={owner:randomUUID(),counsellor:randomUUID(),data_entry:randomUUID(),teacher:randomUUID(),lead_counsellor:randomUUID()}
let server
const digest=(kind,rows)=>createHash('sha256').update(JSON.stringify({kind,rows})).digest('hex')
await db.connect()
try{
 for(const id of [org,other])await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Synthetic record import test',`record-import-${id}`])
 for(const [role,id]of Object.entries(users)){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@example.invalid`]);await db.query('delete from organisation_memberships where user_id=$1',[id]);await db.query('insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[org,id,role])}
 await db.query('insert into school_classes(organisation_id,class_name) values($1,$2)',[org,'11'])
 for(const key of ['first','second'])await db.query('insert into student_registry_records(organisation_id,external_key,payload,updated_by) values($1,$2,$3,$4)',[org,key,{id:key,name:`Synthetic ${key}`,grade:'10',initials:'ST',stage:'Not started',counsellorId:users.owner,counsellor:'Test owner',followUp:'Not scheduled',pathway:'Not yet set',completion:0},users.owner])
 const authenticate=async req=>{const role=req.headers.authorization;if(role==='outsider')return{userId:users.owner,organisationId:other,role:'owner'};if(!Object.hasOwn(users,role))throw new AuthenticationError('Sign in required');return{userId:users[role],organisationId:org,role}}
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0,watch:null},plugins:[schoolOperationsApi(env,authenticate)]});await server.listen()
 const root=`http://127.0.0.1:${server.httpServer.address().port}/api/operations/imports/records`
 const call=async(path='',body,actor='owner',method='POST')=>{const r=await fetch(root+path,{method,signal:AbortSignal.timeout(30000),headers:{Authorization:actor,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()}}
 const preview=async(kind,csv,actor='owner')=>{const fields=csv.split('\n')[0].split(',');return call('/preview',{kind,csv,mapping:Object.fromEntries(fields.map(f=>[f,f]))},actor)}
 const apply=async(kind,p,actor='owner')=>{const body={id:randomUUID(),kind,...p.data};return{body,...await call('',body,actor)}}
 const rollback=async id=>call('/rollback',{id})
 assert.equal((await call('',undefined,'teacher','GET')).status,403)
 assert.equal((await call('/preview',{kind:'class',csv:'studentId,grade\nfirst,11',mapping:[]})).status,400)
 assert.equal((await call('/preview',{kind:'class',csv:'studentId,studentId\nfirst,11'})).status,400)
 assert.equal((await call('/preview',{kind:'class',csv:'studentId,grade\nfirst,11',mapping:{studentId:'missing',grade:'grade'}})).status,400)
 assert.equal((await preview('class','studentId,grade\nfirst,11','outsider')).status,404)
 assert.equal((await preview('class','studentId,grade\nfirst,11','counsellor')).status,404)
 const classPreview=await preview('class','studentId,grade\nfirst,11\nsecond,11');assert.equal(classPreview.status,200,JSON.stringify(classPreview.data))
 assert.equal((await preview('class','studentId,grade\nfirst,11\nfirst,10')).status,400)
 const malformed={id:randomUUID(),kind:'class',rows:[null]};malformed.previewHash=digest('class',malformed.rows);assert.equal((await call('',malformed)).status,400)
 const duplicateIds=structuredClone(classPreview.data.rows);duplicateIds[1].entryId=duplicateIds[0].entryId;assert.equal((await call('',{id:randomUUID(),kind:'class',rows:duplicateIds,previewHash:digest('class',duplicateIds)})).status,400)
 const classBatch=await apply('class',classPreview);assert.equal(classBatch.status,200,JSON.stringify(classBatch.data));assert.equal((await call('',classBatch.body)).data.reused,true)
 const classReport=await call(`/report?id=${classBatch.body.id}`,undefined,'owner','GET');assert.equal(classReport.status,200);assert.equal(classReport.data.report.row_count,2);assert.deepEqual(classReport.data.report.student_keys,['first','second']);assert.ok(!JSON.stringify(classReport.data).includes('before_records'));assert.ok(!JSON.stringify(classReport.data).includes('request_hash'))
 assert.equal((await call(`/report?id=${classBatch.body.id}`,undefined,'outsider','GET')).status,404)
 assert.equal((await call(`/report?id=${classBatch.body.id}`,undefined,'counsellor','GET')).status,404)
 assert.equal((await rollback(classBatch.body.id)).status,200);assert.equal((await rollback(classBatch.body.id)).data.reused,true)
 assert.equal((await call('',classBatch.body)).status,409)
 const stale=await preview('class','studentId,grade\nfirst,11\nsecond,11')
 await db.query("update student_registry_records set version=version+1 where organisation_id=$1 and external_key='second'",[org])
 assert.equal((await apply('class',stale)).status,409)
 assert.equal((await db.query("select payload->>'grade' grade from student_registry_records where organisation_id=$1 and external_key='first'",[org])).rows[0].grade,'10','A stale batch cannot partially update')
 const guardianCsv='studentId,name,relationship,phone,email,source\nfirst,Fixture guardian,Parent,12345,fixture@example.invalid,School record'
 assert.equal((await preview('guardians',guardianCsv,'data_entry')).status,403)
 const guardian=await apply('guardians',await preview('guardians',guardianCsv));assert.equal(guardian.status,200,JSON.stringify(guardian.data))
 assert.equal((await preview('guardians',guardianCsv)).status,409)
 assert.equal((await rollback(guardian.body.id)).status,200)
 const academicCsv='studentId,subject,result,scale,term,year,source,resultType\nfirst,Math,80,100,Term 1,2026-27,School,Reported result'
 assert.equal((await preview('academics',academicCsv+'\nfirst,math,90,100,term 1,2026-27,Other source,Reported result')).status,400)
 const academic=await apply('academics',await preview('academics',academicCsv,'data_entry'),'data_entry');assert.equal(academic.status,200,JSON.stringify(academic.data))
 await db.query("update student_guidance_profiles set version=version+1 where organisation_id=$1 and student_key='first'",[org])
 assert.equal((await rollback(academic.body.id)).status,409,'Later edits must block rollback')
 const profile=(await db.query("select details from student_guidance_profiles where organisation_id=$1 and student_key='first'",[org])).rows[0].details
 assert.equal(profile.academics[0].result,'80');assert.equal(profile.guardians.length,0)
 const staffCsv=`studentId,staffEmail\nfirst,${users.counsellor}@example.invalid`
 assert.equal((await preview('staff',staffCsv,'data_entry')).status,403)
 const staff=await apply('staff',await preview('staff',staffCsv,'lead_counsellor'),'lead_counsellor');assert.equal(staff.status,200,JSON.stringify(staff.data))
 assert.equal((await preview('class','studentId,grade\nfirst,11','counsellor')).status,200,'New primary staff receives scope')
 assert.equal((await rollback(staff.body.id)).status,200)
 const sessionCsv='studentId,title,scheduledAt,sessionType,attendees,reason,decisions,source\nfirst,Fixture intake,2026-10-01T10:00:00+05:30,Initial intake,Student and counsellor,Explore interests,Discuss options,School log'
 assert.equal((await preview('sessions',sessionCsv.replace('Initial intake','Invalid type'))).status,400)
 assert.equal((await preview('sessions',sessionCsv.replace('Discuss options',''))).status,400)
 assert.equal((await preview('sessions',sessionCsv.replace('2026-10-01','2026-02-31'))).status,400)
 assert.equal((await preview('sessions',sessionCsv+'\nfirst,fixture intake,2026-10-01T04:30:00Z,Initial intake,Student,Explore interests,Discuss options,Another log')).status,400)
 const session=await apply('sessions',await preview('sessions',sessionCsv));assert.equal(session.status,200,JSON.stringify(session.data))
 assert.equal((await preview('sessions',sessionCsv)).status,409)
 assert.equal((await call('/rollback',{id:session.body.id},'outsider')).status,404)
 assert.equal((await call('/rollback',{id:session.body.id},'lead_counsellor')).status,403)
 assert.equal((await rollback(session.body.id)).status,200)
 assert.equal((await db.query("select status from guidance_activities where organisation_id=$1 and kind='session'",[org])).rows[0].status,'cancelled','Rollback retains historical sessions')
 const editedSession=await apply('sessions',await preview('sessions',sessionCsv.replace('2026-10-01','2026-10-02')));assert.equal(editedSession.status,200)
 await db.query('update guidance_session_records set version=version+1 where organisation_id=$1 and activity_id=$2',[org,editedSession.body.rows[0].entryId])
 assert.equal((await rollback(editedSession.body.id)).status,409,'Edited imported session records must be preserved')
 assert.ok((await db.query('select 1 from student_guidance_profile_history where organisation_id=$1',[org])).rowCount>0)
 assert.ok((await db.query('select 1 from student_registry_history where organisation_id=$1',[org])).rowCount>0)
 await db.query('begin');try{await db.query('set local role authenticated');await assert.rejects(db.query('select * from school_record_imports'),e=>e.code==='42501')}finally{await db.query('rollback')}
 assert.equal((await call('',undefined,'outsider','GET')).data.records.length,0)
 console.log('Record import integration passed: all five types, mapping, malformed rows, semantic duplicates, atomicity, stale versions, scoped roles, idempotency, history and guarded rollback.')
}finally{
 if(server)await server.close()
 for(const id of[org,other]){for(const table of['school_record_imports','guidance_session_records','guidance_activities','student_guidance_profile_history','student_guidance_profiles','school_audit_events','student_registry_history','student_registry_records'])await db.query(`delete from ${table} where organisation_id=$1`,[id]);await db.query('delete from organisations where id=$1',[id])}
 for(const id of Object.values(users))await db.query('delete from auth.users where id=$1',[id])
 await db.end()
}
