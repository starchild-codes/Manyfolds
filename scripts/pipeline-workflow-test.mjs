import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {createServer,loadEnv} from 'vite'
import {schoolOperationsApi} from '../server/school/operations.ts'
import {studentsApi} from '../server/students/plugin.ts'
import {pipelineStages,pipelineStage,suggestedPipelineStage} from '../server/school/pipelineModel.ts'
const env=loadEnv('development',process.cwd(),''),db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}}),org=randomUUID(),other=randomUUID(),a=randomUUID(),b=randomUUID(),foreign=randomUUID(),actors={}
let server
await db.connect()
try{
 for(const id of [org,other])await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Synthetic pipeline school',`pipeline-${id}`])
 for(const role of ['owner','counsellor','guidance_teacher','teacher','reviewer','data_entry']){const userId=randomUUID();actors[role]={userId,organisationId:org,role};await db.query('insert into auth.users(id,email) values($1,$2)',[userId,`${userId}@example.invalid`]);await db.query('insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[org,userId,role])}
 for(const [key,school] of [[a,org],[b,org],[foreign,other]])await db.query('insert into student_registry_records(organisation_id,external_key,payload,created_by,updated_by) values($1,$2,$3,$4,$4)',[school,key,{id:key,name:'Synthetic pipeline student',initials:'SP',grade:key===a?'10 A':'11 B',stage:'Not started',priority:'INTERNAL-REGISTRY-SENTINEL',counsellorId:key===a?actors.counsellor.userId:'',counsellor:'Synthetic staff',pathway:'Not yet set',followUp:'Not scheduled',completion:0},actors.owner.userId])
 await db.query('insert into school_student_assignments(organisation_id,student_key,staff_id,assigned_by,reason) values($1,$2,$3,$4,$5)',[org,a,actors.guidance_teacher.userId,actors.owner.userId,'Synthetic guidance assignment'])
 const authenticate=async req=>{const actor=actors[req.headers.authorization];if(!actor)throw Object.assign(Error('Sign-in required'),{statusCode:401});return actor}
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[schoolOperationsApi(env,authenticate),studentsApi(env,authenticate)]});await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`
 const call=async(path,method='GET',role='owner',body,area='operations')=>{const res=await fetch(`${base}/api/${area}${path}`,{method,headers:{Authorization:role,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:res.status,data:await res.json()}}
 const record=async key=>{const row=(await db.query('select payload,version,archived_at from student_registry_records where organisation_id=$1 and external_key=$2',[org,key])).rows[0];return{...row,version:Number(row.version)}}
 const move=(ids,stage='profile_incomplete',reason='Synthetic stage review',override=false)=>({records:ids,stage,reason,override})
 let result=await call('/pipeline','GET','counsellor');assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.records.length,1);assert.equal(result.data.records[0].currentStage,'basic_record_created');assert.equal(result.data.records[0].suggestion,'profile_incomplete');assert.equal((await record(a)).version,1,'Suggestions must never change stages')
 assert.equal((await call('/pipeline','GET','teacher')).status,403);assert.equal((await call('/pipeline-history?student='+b,'GET','counsellor')).status,404)
 assert.equal(pipelineStage({stage:'Exploring options'}),'exploring_pathways');assert.equal(pipelineStage({stage:'Old school label',pipelineStage:'action_plan_active'}),'action_plan_active');assert.equal(pipelineStage({stage:'Old label'},true),'archived');assert.equal(suggestedPipelineStage('alumni_follow_up',{outcome:true}),null)
 const labels=Object.fromEntries(pipelineStages),custom={...labels,basic_record_created:'Intake registered'}
 assert.equal((await call('/pipeline-labels','PUT','counsellor',{version:0,labels:custom})).status,403)
 assert.equal((await call('/pipeline-labels','PUT','owner',{version:0,labels:{...custom,ready_for_review:custom.basic_record_created}})).status,400)
 assert.equal((await call('/pipeline-labels','PUT','owner',{version:0,labels:custom})).status,200)
 assert.equal((await call('/pipeline-labels','PUT','owner',{version:0,labels:custom})).status,409)
 assert.equal((await call('/pipeline')).data.configuration.labels.basic_record_created,'Intake registered')
 assert.equal((await call('/pipeline','PUT','counsellor',move([{id:a,version:1}]))).status,200)
 assert.equal((await record(a)).version,2)
 assert.equal((await call('/pipeline','PUT','counsellor',move([{id:a,version:1}]))).status,409)
 assert.equal((await call('/pipeline','PUT','counsellor',move([{id:a,version:2}]))).data.changed,0)
 assert.equal((await call('/pipeline','PUT','owner',move([{id:a,version:2}],'ready_for_review',' '))).status,400)
 assert.equal((await call('/pipeline','PUT','owner',move([{id:a,version:2}],'archived'))).status,400)
 assert.equal((await call('/pipeline','PUT','owner',move([{id:a,version:2},{id:a,version:2}]))).status,400)
 assert.equal((await call('/pipeline','PUT','counsellor',move([{id:a,version:2}],'action_plan_active'))).status,409)
 assert.equal((await call('/pipeline','PUT','guidance_teacher',move([{id:a,version:2}],'action_plan_active','Reviewed exception for synthetic test',true))).status,403)
 assert.equal((await call('/pipeline','PUT','owner',move([{id:a,version:2}],'ready_for_review','Reviewed missing profile in synthetic exception',true))).status,200)
 let history=(await call('/pipeline-history?student='+a)).data.records;assert.equal(history[0].manual_override,true);assert.equal(history[0].registry_version,3);assert.match(history[0].reason,/synthetic exception/)
 assert.equal((await call('/pipeline','PUT','counsellor',move([{id:a,version:3},{id:b,version:1}]))).status,404);assert.equal((await record(a)).version,3)
 assert.equal((await call('/pipeline','PUT','owner',move([{id:a,version:3},{id:b,version:99}]))).status,409);assert.equal((await record(a)).version,3)
 assert.equal((await call('/pipeline','PUT','owner',move([{id:a,version:3},{id:foreign,version:1}]))).status,404);assert.equal((await record(a)).version,3)
 assert.equal((await call('/pipeline','PUT','owner',move([{id:a,version:3},{id:b,version:1}],'exploring_pathways'))).data.changed,2)
 const plan={title:'Synthetic active plan',status:'active',goal:'Discuss routes',ownerId:actors.counsellor.userId,startDate:'2026-10-21',targetDate:'2026-11-21',taskIds:[],reviewDates:[],milestones:[]}
 assert.equal((await call(`/planning?student=${a}`,'PUT','counsellor',{id:randomUUID(),kind:'plan',version:0,payload:plan})).status,200)
 assert.equal((await call('/pipeline','GET','counsellor')).data.records[0].suggestion,'action_plan_active')
 assert.equal((await call('/pipeline','PUT','counsellor',move([{id:a,version:4}],'action_plan_active'))).status,200)
 let row=await record(a)
 assert.equal((await call(`?key=${a}`,'PUT','owner',{record:{...row.payload,stage:'Outcome recorded'},expectedVersion:row.version},'students')).status,400,'Normal registry edits must not bypass transition validation')
 assert.equal((await call('','POST','owner',{record:{id:randomUUID(),name:'Synthetic bypass attempt',grade:'10',stage:'Outcome recorded'}},'students')).status,400)
 assert.equal((await call(`?key=${a}`,'PUT','owner',{record:{...row.payload,name:'Synthetic renamed pipeline student'},expectedVersion:row.version},'students')).status,200)
 const projected=(await call('','GET','data_entry',undefined,'students')).data.records.find(r=>r.id===a);assert.ok(!JSON.stringify(projected).includes('INTERNAL-REGISTRY-SENTINEL'));const demographics=await call(`?key=${a}`,'PUT','data_entry',{record:{...projected,name:'Synthetic demographic update'},expectedVersion:projected.version},'students');assert.equal(demographics.status,200,JSON.stringify(demographics.data));assert.ok(!JSON.stringify(demographics.data).includes('INTERNAL-REGISTRY-SENTINEL'));assert.equal((await record(a)).payload.pipelineStage,'action_plan_active');assert.equal((await record(a)).payload.priority,'INTERNAL-REGISTRY-SENTINEL');
 row=await record(a)
 assert.equal((await call(`?key=${a}&version=${row.version}`,'DELETE','owner',undefined,'students')).status,200)
 assert.equal((await call('/pipeline?archived=true')).data.records.find(r=>r.id===a).currentStage,'archived')
 assert.equal((await call('/pipeline','PUT','owner',move([{id:a,version:row.version+1}]))).status,409)
 history=(await call('/pipeline-history?student='+a)).data.records;assert.equal(history[0].to_stage,'Archived');assert.equal(history[0].reason,'Student archived')
 assert.equal((await call(`?key=${a}`,'PATCH','owner',{expectedVersion:row.version+1},'students')).status,200)
 assert.equal((await call('/pipeline-history?student='+a)).data.records[0].reason,'Student restored')
 for(const [role,key,count] of [['counsellor',a,1],['counsellor',b,0],['counsellor',foreign,0],['teacher',a,0]]){
  await db.query('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actors[role].userId]);await db.query('set local role authenticated');const visible=await db.query('select id from school_pipeline_history where organisation_id=$1 and student_key=$2',[key===foreign?other:org,key]);assert.equal(visible.rows.length>0?1:0,count);await assert.rejects(db.query("update school_pipeline_configuration set labels='{}' where organisation_id=$1",[org]),e=>e.code==='42501')}finally{await db.query('rollback')}
 }
 console.log('Pipeline workflow passed: fourteen stable stages, legacy mapping, suggestions without mutations, label CAS, caseload/RLS, prerequisite checks, explicit override, atomic bulk updates, stale versions, registry bypass prevention and archive/restore history. Only synthetic schools were changed.')
}finally{
 if(server)await server.close()
 for(const id of [org,other]){for(const table of ['school_pipeline_configuration','school_student_planning_history','school_student_planning','school_student_assignments','student_registry_history','school_audit_events','student_registry_records'])await db.query(`delete from ${table} where organisation_id=$1`,[id]);await db.query('delete from organisations where id=$1',[id])}
 for(const actor of Object.values(actors))await db.query('delete from auth.users where id=$1',[actor.userId])
 await db.end()
}
