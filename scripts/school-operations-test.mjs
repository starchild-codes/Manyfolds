import { studentDocumentsApi } from '../server/school/documents.ts'
import { blankStudentProfile } from '../server/school/profileSchema.ts'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { createServer, loadEnv } from 'vite'
import { schoolOperationsApi } from '../server/school/operations.ts'
import { AuthenticationError } from '../server/ai/auth.ts'

const env={...loadEnv('development',process.cwd(),''),...process.env}
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
const org=randomUUID(),other=randomUUID(),user=randomUUID(),colleague=randomUUID()
let server
await db.connect()
try {
 for(const person of [user,colleague])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[person,`operations-${person}@example.invalid`])
 for(const id of [org,other])await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Temporary operations test',`operations-${id}`])
 await db.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner')",[org,user]);await db.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'counsellor')",[org,colleague])
 const authenticate=async req=>{
  const actor=req.headers.authorization
  if(!['owner','teacher','counsellor','outsider','colleague'].includes(actor))throw new AuthenticationError('Sign in required')
  return {userId:actor==='colleague'?colleague:user,organisationId:actor==='outsider'?other:org,role:actor==='outsider'?'owner':actor==='colleague'?'counsellor':actor}
 }
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[schoolOperationsApi(env,authenticate),studentDocumentsApi(env,authenticate)]})
 await server.listen()
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`
 const call=async(path,method='GET',actor='owner',body)=>{const response=await fetch(`${origin}/api/operations${path}`,{method,headers:{Authorization:actor,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
 assert.equal((await call('/configuration','GET','')).status,401)
 assert.equal((await call('/audit','GET','teacher')).status,403)
 const configuration={version:0,settings:{academicYear:'2026-27'},school:{name:'Test school',school_type:'Private',city:'Test city',state:'Test state',country:'India'},classes:[{class_name:'11',sections:['A']}]}
 assert.equal((await call('/configuration','PUT','counsellor',configuration)).status,403)
 const configured=await call('/configuration','PUT','owner',configuration);assert.equal(configured.status,200,JSON.stringify(configured.data));assert.equal(configured.data.configuration.version,1)
 assert.equal((await call('/configuration','PUT','owner',configuration)).status,409)
 const resource={id:randomUUID(),title:'Discussion worksheet',resourceType:'worksheet',body:'Original staff prompts'}
 assert.equal((await call('/resources','POST','teacher',resource)).status,403)
 assert.equal((await call('/resources','POST','counsellor',resource)).status,201)
 assert.equal((await call('/resources','POST','counsellor',resource)).status,201)
 assert.equal((await call('/resources','GET','outsider')).data.records.length,0)
 assert.equal((await call('/resources','PATCH','owner',{...resource,version:1,body:'Revised prompts'})).status,200)
 assert.equal((await call('/resources','PATCH','owner',{...resource,version:1})).status,409)
 const csv='ID,Name,Class\nfirst,First student,11 A\nsecond,Second student,11 A'
 const preview=await call('/imports/preview','POST','owner',{csv,mapping:{id:'ID',name:'Name',grade:'Class'}});assert.equal(preview.status,200,JSON.stringify(preview.data))
 const imported={id:randomUUID(),records:preview.data.records,previewHash:preview.data.previewHash}
 assert.equal((await call('/imports','POST','teacher',imported)).status,403)
 assert.equal((await call('/imports','POST','owner',{...imported,previewHash:'tampered'})).status,409)
 assert.equal((await call('/imports','POST','owner',imported)).data.batch.count,2)
 assert.equal((await call('/imports','POST','owner',imported)).status,200)
 const duplicate=await call('/imports/preview','POST','owner',{csv,mapping:{id:'ID',name:'Name',grade:'Class'}});assert.equal(duplicate.data.duplicateIds.length,2)
 await db.query("insert into school_student_assignments(organisation_id,student_key,staff_id,assigned_by,reason) values($1,'first',$2,$3,'Synthetic shared caseload fixture')",[org,colleague,user])
 const note={studentKey:'first',body:'Confidential test-only note',version:0}
 assert.equal((await call('/private-notes','PUT','teacher',note)).status,403)
 assert.equal((await call('/private-notes','PUT','owner',note)).status,200)
 assert.equal((await call('/private-notes','PUT','owner',note)).status,409)
 assert.equal((await call('/private-notes?student=first')).data.record.body,note.body)
 assert.equal((await call('/private-notes?student=first','GET','colleague')).data.record.body,'')
 assert.equal((await call('/private-notes?student=first','GET','outsider')).status,404)
 assert.equal((await call('/private-notes','PUT','colleague',{...note,body:'Colleague private note'})).status,200)
 const profile=blankStudentProfile();profile.overview.language='Hindi';profile.constraints.affordability_band='Sensitive fixture constraint';profile.academics=[{id:randomUUID(),subject:'Mathematics',result:'84',scale:'100',term:'Term 1',year:'2026-27',source:'Synthetic school assessment',resultType:'Reported result'}];profile.family=[{id:randomUUID(),guardian:'Fixture guardian',relationship:'Parent',date:'2026-10-16',concerns:'Private family concern',summary:'Agreed to review course options next month.',summaryStatus:'Draft',acknowledgement:'Not requested'}]
 const profileBody={studentKey:'first',version:0,details:profile}
 assert.equal((await call('/profile?student=first','GET','teacher')).status,403)
 assert.equal((await call('/profile?student=first','GET','outsider')).status,404)
 assert.equal((await call('/profile','PUT','teacher',profileBody)).status,403)
 assert.equal((await call('/profile','PUT','owner',{...profileBody,details:{...profile,family:[{...profile.family[0],date:'2026-02-31'}]}})).status,400)
 const firstProfile=await call('/profile','PUT','owner',profileBody);assert.equal(firstProfile.status,200,JSON.stringify(firstProfile.data))
 assert.equal((await call('/profile','PUT','owner',profileBody)).status,409)
 assert.equal((await call('/profile?student=first','GET','colleague')).data.record.details.overview.language,'Hindi')
 assert.equal((await call('/profile-summary','POST','owner',{studentKey:'first',meetingId:profile.family[0].id})).status,409)
 profile.family[0].summaryStatus='Approved for sharing'
 assert.equal((await call('/profile','PUT','owner',{...profileBody,version:1})).status,200)
 assert.equal((await call('/profile?student=first&revision=1')).data.record.details.family[0].summaryStatus,'Draft')
 const shareable=await call('/profile-summary','POST','owner',{studentKey:'first',meetingId:profile.family[0].id});assert.equal(shareable.status,200);assert.equal(shareable.data.summary,profile.family[0].summary);assert.ok(!JSON.stringify(shareable.data).includes('Private family concern'));assert.ok(!JSON.stringify(shareable.data).includes('Sensitive fixture constraint'))
 const academicCsv='subject,result,scale,term,year,source,resultType\nMathematics,84,100,Term 1,2026-27,Fixture,Reported result'
 assert.equal((await call('/profile-academics/preview','POST','owner',{csv:academicCsv})).data.records.length,1)
 assert.equal((await call('/profile-academics/preview','POST','owner',{csv:academicCsv+'\nMathematics,84,100,Term 1,2026-27,Fixture,Reported result'})).status,400)
 await db.query('begin');try{await db.query("update organisation_memberships set role='teacher' where organisation_id=$1 and user_id=$2",[org,colleague]);await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[colleague]);for(const table of ['student_guidance_profiles','student_guidance_profile_history'])assert.equal((await db.query(`select 1 from ${table} where organisation_id=$1`,[org])).rowCount,0)}finally{await db.query('rollback')}
 const checklist={studentKey:'first',direction:'Engineering',version:0,steps:[{id:'investigate',phase:'Now',title:'Compare course options',detail:'Counsellor discussion',done:false,mandatory:false}]}
 assert.equal((await call('/roadmap-checklist','PUT','teacher',checklist)).status,403)
 assert.equal((await call('/roadmap-checklist','PUT','owner',checklist)).status,200)
 assert.equal((await call('/roadmap-checklist','PUT','owner',checklist)).status,409)
 assert.equal((await call('/roadmap-checklist?student=first&direction=Engineering','GET','teacher')).status,403)
 assert.equal((await call('/roadmap-checklist?student=first&direction=Engineering','GET','outsider')).status,404)
 assert.equal((await call('/roadmap-checklist?student=first&direction=Design')).data.record.version,0)
 const docCall=async(path,method='GET',actor='owner',data)=>{const response=await fetch(origin+'/api/student-documents'+path,{method,headers:{Authorization:actor,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:response.status,data:await response.json()}}
 const file={id:randomUUID(),studentKey:'first',filename:'fixture.txt',category:'Academic record',visibility:'counselling_staff',content:Buffer.from('Synthetic document for permission checks.').toString('base64')}
 assert.equal((await docCall('/','POST','teacher',file)).status,403)
 assert.equal((await docCall('/','POST','outsider',file)).status,404)
 assert.equal((await docCall('/','POST','owner',{...file,filename:'fake.pdf'})).status,415)
 const uploaded=await docCall('/','POST','owner',file);assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));assert.ok(!('content' in uploaded.data.record))
 assert.equal((await docCall('/','POST','owner',file)).status,200)
 assert.equal((await docCall('/','POST','owner',{...file,filename:'changed.txt'})).status,409)
 assert.equal((await docCall('/?student=first','GET','teacher')).status,403)
 assert.equal((await docCall('/','POST','owner',{...file,id:randomUUID(),visibility:'school_staff'})).status,201)
 assert.equal((await docCall('/?student=first','GET','teacher')).status,403)
 assert.equal((await docCall('/link','POST','teacher',{id:file.id})).status,403)
 assert.equal((await docCall('/link','POST','outsider',{id:file.id})).status,404)
 const link=await docCall('/link','POST','owner',{id:file.id});assert.equal(link.status,200);const downloaded=await fetch(origin+link.data.downloadUrl);assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),'Synthetic document for permission checks.');assert.match(downloaded.headers.get('content-disposition'),/^attachment/)
 const tampered=new URL(origin+link.data.downloadUrl);tampered.searchParams.set('signature','0'.repeat(64));assert.equal((await fetch(tampered)).status,401)
 assert.equal((await docCall('/','PATCH','owner',{id:file.id,archived:true})).status,200)
 assert.equal((await fetch(origin+link.data.downloadUrl)).status,403)
 assert.equal((await docCall('/','PATCH','owner',{id:file.id,archived:false})).status,200)
 await db.query('update organisation_memberships set active=false where organisation_id=$1 and user_id=$2',[org,user]);assert.equal((await fetch(origin+link.data.downloadUrl)).status,403);await db.query('update organisation_memberships set active=true where organisation_id=$1 and user_id=$2',[org,user])
 await db.query('begin');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await assert.rejects(db.query('select content from school_student_documents where organisation_id=$1',[org]),error=>error.code==='42501')}finally{await db.query('rollback')}
 const rollover={id:randomUUID(),nextYear:'2027-28',configurationVersion:1,changes:[{studentKey:'first',version:1,grade:'12 A',archive:false},{studentKey:'second',version:1,grade:'12 A',archive:true}]}
 assert.equal((await call('/rollovers','POST','counsellor',rollover)).status,403)
 const rolled=await call('/rollovers','POST','owner',rollover);assert.equal(rolled.status,201,JSON.stringify(rolled.data))
 assert.equal((await call('/rollovers','POST','owner',rollover)).status,200)
 assert.equal((await db.query('select archived_at from student_registry_records where organisation_id=$1 and external_key=$2',[org,'second'])).rows[0].archived_at!==null,true)
 assert.equal((await call('/imports/rollback','POST','owner',{id:imported.id})).status,409)
 assert.equal((await call('/rollovers/rollback','POST','owner',{id:rollover.id})).status,200)
 assert.equal((await call('/rollovers/rollback','POST','owner',{id:rollover.id})).status,200)
 assert.equal((await call('/configuration')).data.configuration.settings.academicYear,'2026-27')
 const restored=(await db.query('select payload,version,archived_at from student_registry_records where organisation_id=$1',[org])).rows
 assert.ok(restored.every(row=>row.payload.grade==='11 A'&&Number(row.version)===3&&row.archived_at===null))
 assert.equal((await call('/history?student=first')).data.records.length,2)
 const next={...rollover,id:randomUUID(),configurationVersion:3,changes:rollover.changes.map(row=>({...row,version:3}))}
 assert.equal((await call('/rollovers','POST','owner',next)).status,201)
 await db.query("update student_registry_records set version=version+1 where organisation_id=$1 and external_key='first'",[org])
 assert.equal((await call('/rollovers/rollback','POST','owner',{id:next.id})).status,409)
 const one=await call('/imports/preview','POST','owner',{csv:'ID,Name,Class\nthird,Third student,11 A',mapping:{id:'ID',name:'Name',grade:'Class'}})
 const batch={id:randomUUID(),records:one.data.records,previewHash:one.data.previewHash}
 assert.equal((await call('/imports','POST','owner',batch)).status,201)
 assert.equal((await call('/imports/rollback','POST','owner',{id:batch.id})).status,200)
 assert.equal((await call('/imports/rollback','POST','owner',{id:batch.id})).status,200)
 assert.equal((await call('/imports/rollback','POST','outsider',{id:batch.id})).status,404)
 const events=(await call('/audit')).data.records;assert.ok(events.some(row=>row.event_type==='student.archived'));assert.ok(!JSON.stringify(events).includes('Original staff prompts'));assert.ok(!JSON.stringify(events).includes(note.body))
 await db.query('begin');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);assert.equal((await db.query('select * from school_audit_events where organisation_id=$1',[other])).rowCount,0);const visibleNotes=(await db.query('select body from student_private_notes where organisation_id=$1',[org])).rows;assert.equal(visibleNotes.length,1);assert.equal(visibleNotes[0].body,note.body);await assert.rejects(db.query("update school_resources set body='forbidden' where organisation_id=$1",[org]),error=>error.code==='42501')}finally{await db.query('rollback')}
 console.log('Operations HTTP tests passed: configuration conflicts, resources, imports, duplicate protection, rollback, rollover/history, archive preservation, school isolation, detailed profiles/history, academic CSV, approved-only guardian exports and audit privacy. Only temporary schools were modified.')
} finally {
 if(server)await server.close()
 for(const id of [org,other]){for(const table of ['school_student_assignments','school_student_documents','student_planning_checklists','student_guidance_profile_history','student_guidance_profiles','student_private_notes','school_audit_events','student_registry_history','school_resources','school_configuration','student_import_batches','school_annual_rollovers','student_registry_records'])await db.query(`delete from ${table} where organisation_id=$1`,[id]);await db.query('delete from organisations where id=$1',[id])}
 for(const person of [user,colleague])await db.query('delete from auth.users where id=$1',[person])
 await db.end()
}
