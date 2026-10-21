import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {createServer,loadEnv} from 'vite'
import {schoolOperationsApi} from '../server/school/operations.ts'
import {studentsApi} from '../server/students/plugin.ts'
import {validatePlanning} from '../server/school/planningSchema.ts'
import {printableDocument} from '../src/printDocument.ts'
import {reportActivity} from '../src/reportMetrics.ts'
const env=loadEnv('development',process.cwd(),''),db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
const org=randomUUID(),other=randomUUID(),key=randomUUID(),second=randomUUID(),actors={}
let server
await db.connect()
try{
 for(const id of [org,other])await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Synthetic planning school',`planning-${id}`])
 for(const role of ['owner','lead_counsellor','counsellor','guidance_teacher','teacher','data_entry','reviewer']){const userId=randomUUID();actors[role]={userId,organisationId:org,role};await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[userId,`${userId}@example.invalid`]);await db.query('insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[org,userId,role])}
 for(const id of [key,second])await db.query('insert into student_registry_records(organisation_id,external_key,payload,created_by) values($1,$2,$3,$4)',[org,id,{id,name:'Synthetic planning fixture',grade:'10 A',counsellorId:id===key?actors.counsellor.userId:''},actors.owner.userId])
 const authenticate=async req=>{const actor=actors[req.headers.authorization];if(!actor)throw Object.assign(Error('Test sign-in required'),{statusCode:401});return actor}
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[schoolOperationsApi(env,authenticate),studentsApi(env,authenticate)]});await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`
 const call=async(path,method='GET',role='owner',body,area='operations')=>{const res=await fetch(`${base}/api/${area}${path}`,{method,headers:{Authorization:role,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:res.status,data:await res.json()}}
 assert.equal((await call('','GET','reviewer',undefined,'students')).status,403)
 assert.equal((await call('','GET','teacher',undefined,'students')).data.records.length,0)
 const assignment={staffId:actors.teacher.userId,studentKeys:[key],versions:{[key]:0},reason:'Synthetic class teacher assignment'}
 assert.equal((await call('/assignments','PUT','counsellor',assignment)).status,403)
 assert.equal((await call('/assignments','PUT','lead_counsellor',assignment)).status,200)
 assert.equal((await call('/assignments','PUT','lead_counsellor',assignment)).status,409)
 assert.equal((await call('','GET','teacher',undefined,'students')).data.records.length,1)
 assert.equal((await call(`/profile?student=${key}`,'GET','teacher')).status,403)
 assert.equal((await call(`/profile?student=${key}`,'GET','data_entry')).status,403)
 const obs={id:randomUUID(),observation:'Synthetic classroom observation',needsAttention:true}
 assert.equal((await call(`/observations?student=${second}`,'POST','teacher',obs)).status,404)
 assert.equal((await call(`/observations?student=${key}`,'POST','teacher',obs)).status,201)
 assert.equal((await call(`/observations?student=${key}`,'POST','teacher',obs)).status,201)
 assert.equal((await call(`/observations?student=${key}`,'GET','counsellor')).data.records.length,1)
 const analytics=await call('/analytics','GET','reviewer');assert.equal(analytics.status,200);assert.equal(analytics.data.totals.students,2);assert.ok(!JSON.stringify(analytics.data).includes('Synthetic planning fixture'))
 const academic={id:randomUUID(),subject:'Mathematics',result:'A',scale:'Letter grade',term:'Synthetic term',year:'2026-27',source:'Synthetic school report',resultType:'Reported result'}
 assert.equal((await call(`/academics?student=${key}`,'PUT','data_entry',{version:0,academics:[academic]})).status,200)
 const academicRead=await call(`/academics?student=${key}`,'GET','data_entry');assert.equal(academicRead.data.record.academics.length,1);assert.ok(!('details' in academicRead.data.record))
 const pathway={title:'Synthetic primary route',status:'active',category:'primary',career:'Exploration field',confidence:'Not assessed',interest:'Moderate'}
 assert.equal((await call(`/planning?student=${second}`,'GET','counsellor')).status,404)
 assert.equal((await call(`/planning?student=${key}`,'GET','teacher')).status,403)
 const routeId=randomUUID(),savedRoute=await call(`/planning?student=${key}`,'PUT','counsellor',{id:routeId,kind:'pathway',version:0,payload:pathway});assert.equal(savedRoute.status,200,JSON.stringify(savedRoute.data))
 assert.equal((await call(`/planning?student=${key}`,'PUT','owner',{id:randomUUID(),kind:'pathway',version:0,payload:pathway})).status,409,'A second active primary route must be rejected')
 assert.equal((await call(`/planning-export?student=${key}&id=${routeId}`)).status,409)
 const summaryPayload={...pathway,risks:'INTERNAL-PLAN-SENTINEL',shareableSummary:'Approved synthetic exploration summary',summaryApproved:true}
 assert.equal((await call(`/planning?student=${key}`,'PUT','owner',{id:routeId,kind:'pathway',version:1,payload:summaryPayload})).status,200)
 const exported=await call(`/planning-export?student=${key}&id=${routeId}`);assert.equal(exported.status,200);assert.ok(!JSON.stringify(exported.data).includes('INTERNAL-PLAN-SENTINEL'))
 assert.equal((await call(`/planning-history?student=${key}&id=${routeId}`)).data.records.length,2)
 const alternativeId=randomUUID(),alternative={...summaryPayload,title:'Synthetic alternative route',category:'alternative',shareableSummary:'Approved alternative exploration summary'}
 assert.equal((await call(`/planning?student=${key}`,'PUT','owner',{id:alternativeId,kind:'pathway',version:0,payload:alternative})).status,200)
 const comparisonBody={records:[{id:routeId,version:2},{id:alternativeId,version:1}]}
 const comparison=await call(`/planning-comparison?student=${key}`,'POST','counsellor',comparisonBody)
 assert.equal(comparison.status,200,JSON.stringify(comparison.data));assert.deepEqual(comparison.data.document.records.map(r=>r.id),[routeId,alternativeId]);assert.ok(!JSON.stringify(comparison.data).includes('INTERNAL-PLAN-SENTINEL'));assert.equal(comparison.data.document.records[1].summary,alternative.shareableSummary)
 assert.equal((await call(`/planning-comparison?student=${key}`,'POST','teacher',comparisonBody)).status,403)
 assert.equal((await call(`/planning-comparison?student=${second}`,'POST','counsellor',comparisonBody)).status,404)
 assert.equal((await call(`/planning-comparison?student=${second}`,'POST','owner',comparisonBody)).status,404)
 assert.equal((await call(`/planning-comparison?student=${key}`,'GET')).status,405)
 assert.equal((await call(`/planning-comparison?student=${key}`,'POST','owner',{records:[comparisonBody.records[0],comparisonBody.records[0]]})).status,400)
 assert.equal((await call(`/planning-comparison?student=${key}`,'POST','owner',{records:[{id:routeId,version:1},comparisonBody.records[1]]})).status,409)
 assert.equal((await call(`/planning?student=${key}`,'PUT','owner',{id:alternativeId,kind:'pathway',version:1,payload:{...alternative,summaryApproved:false}})).status,200)
 assert.equal((await call(`/planning-comparison?student=${key}`,'POST','owner',{records:[comparisonBody.records[0],{id:alternativeId,version:2}]})).status,409)
 assert.equal((await call(`/planning?student=${key}`,'PUT','owner',{id:alternativeId,kind:'pathway',version:2,payload:{...alternative,status:'archived'}})).status,200)
 assert.equal((await call(`/planning-comparison?student=${key}`,'POST','owner',{records:[comparisonBody.records[0],{id:alternativeId,version:3}]})).status,409)
 assert.equal((await db.query("select count(*)::int count from school_audit_events where organisation_id=$1 and event_type='export.pathway_comparison'",[org])).rows[0].count,1)
 const m1=randomUUID(),m2=randomUUID(),plan={title:'Synthetic action plan',status:'active',goal:'Discuss two routes',startDate:'2026-10-20',targetDate:'2026-11-20',ownerId:actors.counsellor.userId,taskIds:[],reviewDates:['2026-11-01'],milestones:[{id:m1,title:'First conversation',targetDate:'2026-10-21',status:'open',dependsOn:[],evidence:''},{id:m2,title:'Review alternatives',targetDate:'2026-11-02',status:'open',dependsOn:[m1],evidence:''}]}
 assert.throws(()=>validatePlanning('plan',{...plan,milestones:[{...plan.milestones[0],dependsOn:[m2]},plan.milestones[1]]}),/cycle/)
 assert.throws(()=>validatePlanning('plan',{...plan,milestones:[plan.milestones[0],{...plan.milestones[1],status:'completed',evidence:'Recorded before prerequisite'}]}),/prerequisites/)
 assert.throws(()=>validatePlanning('plan',{...plan,status:'completed',completionSummary:'Attempted premature completion'}),/milestones/)
 assert.equal((await call(`/planning?student=${key}`,'PUT','counsellor',{id:randomUUID(),kind:'plan',version:0,payload:plan})).status,200)
 const outcome={title:'Synthetic reported outcome',status:'reported',type:'Further exploration',date:'2026-10-20',reportedBy:'Synthetic school staff',confidence:'Reported only'}
 assert.equal((await call(`/planning?student=${key}`,'PUT','owner',{id:randomUUID(),kind:'outcome',version:0,payload:outcome})).status,200)
 assert.throws(()=>validatePlanning('outcome',{...outcome,status:'verified'}),/requires evidence/)
 const checked={...outcome,status:'verified',evidence:'Synthetic evidence reference checked',sourceUrl:'https://example.edu/synthetic-evidence',confidence:'Official source checked'}
 const checkedResult=await call(`/planning?student=${key}`,'PUT','owner',{id:randomUUID(),kind:'outcome',version:0,payload:checked});assert.equal(checkedResult.status,200);assert.equal(checkedResult.data.record.payload.verifiedBy,actors.owner.userId)
 assert.ok((await call(`/timeline?student=${key}`)).data.records.some(r=>r.type==='plan'))
 const reportActivities=[
  [key,'session','completed','2026-10-20T08:00:00Z',actors.counsellor.userId,30],
  [key,'session','completed','2026-10-20T09:00:00Z',actors.owner.userId,45],
  [key,'session','scheduled','2026-11-20T09:00:00Z',actors.counsellor.userId,60],
  [key,'session','completed','2025-01-01T09:00:00Z',actors.counsellor.userId,90],
  [key,'task','open','2025-01-01T09:00:00Z',actors.counsellor.userId,45],
  [second,'session','completed','2026-10-20T08:00:00Z',actors.owner.userId,120]
 ]
 for(const [student,kind,status,date,staff,duration] of reportActivities){const id=randomUUID();await db.query('insert into guidance_activities(id,organisation_id,student_key,kind,title,status,scheduled_at,assigned_to,created_by,updated_by,duration_minutes,summary) values($1,$2,$3,$4,$5,$6,$7,$8,$8,$8,$9,$10)',[id,org,student,kind,'Synthetic workload fixture',status,date,staff,duration,'INTERNAL-REPORT-SENTINEL']);if(kind==='session')await db.query('insert into guidance_session_records(organisation_id,activity_id,details,updated_by) values($1,$2,$3,$4)',[org,id,{sessionType:'Career exploration',concerns:'INTERNAL-REPORT-SENTINEL'},staff])}
 const report=await call('/reporting?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z','GET','counsellor');assert.equal(report.status,200,JSON.stringify(report.data));assert.equal(report.data.records.length,1);assert.equal(report.data.records[0].hasPrimary,true);assert.equal(report.data.records[0].hasVerifiedOutcome,true);assert.ok(!JSON.stringify(report.data).includes('INTERNAL-PLAN-SENTINEL'));assert.equal((await call('/reporting?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z','GET','teacher')).status,403)
 assert.ok(!JSON.stringify(report.data).includes('INTERNAL-REPORT-SENTINEL'))
 const activity=reportActivity(report.data.records),counsellorWork=activity.staff.find(r=>r.staffId===actors.counsellor.userId),ownerWork=activity.staff.find(r=>r.staffId===actors.owner.userId)
 assert.equal(counsellorWork.primaryCaseload,1);assert.equal(counsellorWork.completedSessions,1);assert.equal(counsellorWork.sessionMinutes,30);assert.equal(counsellorWork.scheduledSessions,1);assert.equal(counsellorWork.openTasks,1);assert.equal(counsellorWork.overdueTasks,1);assert.equal(ownerWork.sessionMinutes,45);assert.equal(ownerWork.primaryCaseload,0);assert.equal(activity.sessionTypes['Career exploration'],2)
 const schoolReport=await call('/reporting?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z');assert.equal(schoolReport.status,200)
 assert.equal(reportActivity(schoolReport.data.records).staff.find(r=>r.staffId===actors.owner.userId).sessionMinutes,165)
 assert.equal(reportActivity(schoolReport.data.records.filter(r=>r.id===key)).staff.find(r=>r.staffId===actors.owner.userId).sessionMinutes,45)
 const ownSearch=await call(`/search?q=${key}`,'GET','counsellor');assert.equal(ownSearch.status,200,JSON.stringify(ownSearch.data));assert.ok(ownSearch.data.records.some(r=>r.kind==='student'&&r.id===key));assert.ok(!(await call(`/search?q=${second}`,'GET','counsellor')).data.records.some(r=>r.id===second));assert.equal((await call('/search?q=INTERNAL-PLAN-SENTINEL','GET','counsellor')).data.records.length,0);assert.equal((await call('/search?q=Synthetic','GET','teacher')).status,403)
 assert.equal((await call('/assignments','PUT','lead_counsellor',{...assignment,versions:{[key]:1},revoke:true,reason:'Synthetic assignment revocation'})).status,200)
 assert.equal((await call(`/observations?student=${key}`,'GET','teacher')).status,404)
 const html=printableDocument({title:'<img src=x>',classification:'STUDENT / PARENT SHAREABLE',metadata:{School:'Synthetic'},sections:[{title:'Summary',body:exported.data.document.summary}]});assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('INTERNAL-PLAN-SENTINEL'))
 console.log('Staff and planning HTTP workflow passed: role/caseload boundaries, assignment CAS, teacher observations, data-entry projection, anonymous reports, primary-route uniqueness, dependency/completion validation, outcome provenance, history, private-summary export and timeline. Only synthetic schools were modified.')
}finally{
 if(server)await server.close()
 for(const id of [org,other]){
  for(const table of ['guidance_activities','school_student_planning_history','school_student_planning','school_teacher_observations','school_student_assignments','student_guidance_profile_history','student_guidance_profiles','student_registry_history','school_audit_events','student_registry_records'])await db.query(`delete from ${table} where organisation_id=$1`,[id])
  await db.query('delete from organisations where id=$1',[id])
 }
 for(const actor of Object.values(actors))await db.query('delete from auth.users where id=$1',[actor.userId])
 await db.end()
}
