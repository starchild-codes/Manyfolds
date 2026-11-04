import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {createServer,loadEnv} from 'vite'
import {guidanceApi} from '../server/guidance/plugin.ts'
import {schoolOperationsApi} from '../server/school/operations.ts'
import {blankAdmission,indiaToday,validateAdmission} from '../server/school/admissionsSchema.ts'
import {AuthenticationError} from '../server/ai/auth.ts'
const env={...loadEnv('development',process.cwd(),''),...process.env},db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}}),org=randomUUID(),other=randomUUID(),student=randomUUID(),second=randomUUID(),actors={};let server
await db.connect()
try{
 for(const id of [org,other])await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Synthetic UG school','ug-test-'+id])
 for(const role of ['owner','counsellor','guidance_teacher','teacher','foreign']){const userId=randomUUID();actors[role]={userId,organisationId:role==='foreign'?other:org,role:role==='foreign'?'owner':role};await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[userId,`${userId}@example.invalid`]);await db.query('insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[actors[role].organisationId,userId,actors[role].role])}
 for(const id of [student,second])await db.query('insert into student_registry_records(organisation_id,external_key,payload) values($1,$2,$3)',[org,id,{id,name:'Synthetic UG student',grade:'12 A',counsellorId:id===student?actors.counsellor.userId:actors.owner.userId}])
 await db.query('insert into school_student_assignments(organisation_id,student_key,staff_id,assigned_by,reason) values($1,$2,$3,$4,$5)',[org,student,actors.guidance_teacher.userId,actors.owner.userId,'Synthetic guidance assignment'])
 const auth=async req=>{const a=actors[req.headers.authorization];if(!a)throw new AuthenticationError('Sign in required');return a}
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[schoolOperationsApi(env,auth),guidanceApi(env,auth)]});await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}/api/operations`
 const call=async(path='/admissions',method='GET',body,role='owner',key=student)=>{const send=()=>fetch(base+path+(key?'?student='+key:''),{method,headers:{Authorization:role,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});let r=await send();if(r.status===503&&method==='GET'){await r.text();console.log('Retrying interrupted UG read');r=await send()}return{status:r.status,data:await r.json()}}
 assert.equal((await call('/admissions','GET',undefined,'invalid')).status,401)
 assert.equal((await call('/admissions','GET',undefined,'teacher')).status,403)
 assert.equal((await call('/admissions','GET',undefined,'foreign')).status,404)
 assert.equal((await call('/admissions','GET',undefined,'counsellor',second)).status,404)
 assert.deepEqual((await call()).data.records,[])
 const id=randomUUID(),payload={...blankAdmission(actors.counsellor.userId),institution:'Synthetic University',programme:'Synthetic BSc',nextAction:'Review required documents',nextActionDate:indiaToday(),notes:'PRIVATE-APPLICATION-NOTES-SENTINEL',shareableSummary:'Reviewed student next steps',summaryApproved:true}
 for(const invalid of [{...payload,deadline:'2027-03-01'},{...payload,officialUrl:'javascript:alert(1)'},{...payload,deadline:'2027-02-30'},{...payload,cycle:'2027-27'},{...payload,eligibilityStatus:'Reviewed against official source'}])assert.throws(()=>validateAdmission(invalid))
 const first=await call('/admissions','PUT',{id,version:0,payload});assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.record.version,1)
 assert.equal((await call('/admissions','PUT',{id,version:0,payload})).status,409)
 assert.equal((await call('/admissions','PUT',{id:randomUUID(),version:0,payload:{...payload,ownerId:actors.foreign.userId}})).status,400)
 assert.equal((await call('/admissions','PUT',{id:randomUUID(),version:0,payload:{...payload,summaryApproved:false,checklist:[{id:'foreign',title:'Foreign evidence',required:false,status:'Ready',documentId:randomUUID()}]}})).status,400)
 const exportDoc=await call('/admissions-export','POST',{id,version:1,audience:'student'},'counsellor');assert.equal(exportDoc.status,200);assert.ok(!JSON.stringify(exportDoc.data).includes('PRIVATE-'));assert.ok(!JSON.stringify(exportDoc.data).includes('submissionReference'))
 assert.equal((await call('/admissions-export','POST',{id,version:2,audience:'student'})).status,409)
 const tasks=await Promise.all([call('/admissions-followup','POST',{id,version:1}),call('/admissions-followup','POST',{id,version:1})]);assert.ok(tasks.every(r=>r.status===200),JSON.stringify(tasks));assert.equal(tasks[0].data.taskId,tasks[1].data.taskId);assert.equal(tasks.filter(r=>r.data.reused).length,1)
 const savedTask=(await db.query('select student_key,assigned_to,task_details from guidance_activities where id=$1',[tasks[0].data.taskId])).rows[0];assert.equal(savedTask.student_key,student);assert.equal(savedTask.assigned_to,actors.counsellor.userId);assert.equal(savedTask.task_details.classroomVisible,false)
 const preparing={...payload,status:'preparing',summaryApproved:false};const updated=await call('/admissions','PUT',{id,version:1,payload:preparing});assert.equal(updated.status,200)
 assert.equal((await call('/admissions-export','POST',{id,version:2,audience:'student'})).status,409)
 assert.equal((await call('/admissions','PUT',{id,version:1,payload:preparing})).status,409)
 assert.equal((await call('/admissions-followup','POST',{id,version:2})).status,409,'One open task per application')
 assert.equal((await call('/admissions','PUT',{id,version:2,payload:{...preparing,status:'submitted'}})).status,400)
 const reviewed={...preparing,officialUrl:'https://example.edu/ug',eligibilityStatus:'Reviewed against official source',eligibilityNotes:'Reviewed qualifying subjects against the exact programme bulletin.',eligibilityCycle:payload.cycle,eligibilitySourceUrl:'https://example.edu/ug/eligibility',eligibilityCheckedOn:indiaToday(),deadline:new Date(Date.parse(indiaToday())+7*86400000).toISOString().slice(0,10),deadlineCycle:payload.cycle,deadlineSourceUrl:'https://example.edu/ug/dates',deadlineCheckedOn:indiaToday(),submissionDate:indiaToday(),submissionReference:'Synthetic acknowledgement',checklist:payload.checklist.map(i=>({...i,status:'Ready'})),status:'submitted'}
 assert.equal((await call('/admissions','PUT',{id,version:2,payload:{...reviewed,deadlineCycle:'2026-27'}})).status,400)
 assert.equal((await call('/admissions','PUT',{id,version:2,payload:{...reviewed,eligibilityCheckedOn:'2025-01-01'}})).status,400)
 assert.equal((await call('/admissions','PUT',{id,version:2,payload:reviewed})).status,200)
 const search=await fetch(base+'/search?q=Synthetic%20University',{headers:{Authorization:'owner'}});assert.equal(search.status,200);const hits=await search.json();assert.ok(hits.records.some(r=>r.kind==='ug_application'&&r.href.includes('view=admissions')));assert.ok(!JSON.stringify(hits).includes('PRIVATE-'))
 const notices=await call('/notifications');assert.equal(notices.status,200);assert.ok(notices.data.records.some(r=>r.type==='application_deadline'&&r.href.includes(student)))
 const from=reviewed.deadline+'T00:00:00Z',to=new Date(Date.parse(from)+86400000).toISOString(),calendarUrl=base.replace('/api/operations','/api/guidance')+'/calendar?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)
 const cal=await fetch(calendarUrl,{headers:{Authorization:'counsellor'}});assert.equal(cal.status,200);const entries=await cal.json();assert.ok(entries.entries.some(e=>e.kind==='application_deadline'&&e.studentKey===student));assert.ok(!JSON.stringify(entries).includes('PRIVATE-'))
 const foreignCal=await fetch(calendarUrl,{headers:{Authorization:'foreign'}});assert.ok(!(await foreignCal.json()).entries.some(e=>e.kind==='application_deadline'&&e.studentKey===student))
 const pipeline=await call('/pipeline');assert.equal(pipeline.status,200);assert.ok(JSON.stringify(pipeline.data).includes('applications_in_progress'))
 assert.equal((await call('/admissions','PUT',{id,version:3,payload:{...reviewed,status:'offer'}})).status,400)
 const offered={...reviewed,status:'offer',decisionDate:indiaToday(),decisionBasis:'Student reported',decisionEvidence:'Student reported an offer; school should inspect the offer letter.'}
 assert.equal((await call('/admissions','PUT',{id,version:3,payload:offered})).status,200)
 assert.equal((await call('/admissions','PUT',{id,version:4,payload:{...offered,status:'preparing'}})).status,409)
 assert.equal((await call('/admissions','PUT',{id,version:4,payload:{...offered,status:'preparing'},reason:'Correction after reviewing the official decision record.'},'guidance_teacher')).status,409)
 assert.equal((await call('/admissions','PUT',{id,version:4,payload:{...offered,status:'accepted'}})).status,200)
 assert.equal((await call('/admissions-followup','POST',{id,version:5})).status,409)
 const historical=await call('/admissions-history&id='+id);assert.ok([400,404].includes(historical.status),'Malformed route must not bypass routing')
 const h=await fetch(base+'/admissions-history?student='+student+'&id='+id,{headers:{Authorization:'owner'}});const history=await h.json();assert.equal(h.status,200);assert.equal(history.records.length,4)
 const foreignList=await call('/admissions','GET',undefined,'foreign','');assert.deepEqual(foreignList.data.records,[])
 await db.query('begin');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actors.foreign.userId]);for(const table of ['school_ug_applications','school_ug_application_history','school_ug_application_followups'])assert.equal((await db.query(`select 1 from ${table} where organisation_id=$1`,[org])).rowCount,0);await assert.rejects(db.query('update school_ug_applications set version=999 where id=$1',[id]),e=>e.code==='42501')}finally{await db.query('rollback')}
 await db.query('update student_registry_records set archived_at=now() where organisation_id=$1 and external_key=$2',[org,student]);assert.equal((await call('/admissions-export','POST',{id,version:5,audience:'staff'})).status,409)
 const audit=(await db.query('select metadata from school_audit_events where organisation_id=$1',[org])).rows;assert.ok(!JSON.stringify(audit).includes('PRIVATE-'))
 console.log('UG admissions passed: exact student/school/role scope, current-cycle source/date gates, checklist and submission requirements, evidence-labelled decisions, CAS/history, concurrent follow-up deduplication, approved-only exports, archived protection and direct RLS/write denial. Synthetic fixtures cleaned.')
}finally{
 if(server)await server.close()
 for(const table of ['school_ug_application_followups','school_ug_application_history','school_ug_applications','guidance_activities','school_student_assignments','school_audit_events','student_registry_history','student_registry_records'])await db.query(`delete from ${table} where organisation_id=any($1::uuid[])`,[[org,other]])
 await db.query('delete from organisations where id=any($1::uuid[])',[[org,other]]);for(const a of Object.values(actors))await db.query('delete from auth.users where id=$1',[a.userId]);await db.end()
}
