import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {createServer,loadEnv} from 'vite'
import {guidanceApi} from '../server/guidance/plugin.ts'
import {blankTask} from '../server/guidance/taskSchema.ts'
import {blankSession} from '../server/guidance/sessionSchema.ts'
import {calendarIcs} from '../server/guidance/calendar.ts'
import {schoolApi} from '../server/school/plugin.ts'
import {schoolOperationsApi} from '../server/school/operations.ts'
const env=loadEnv('development',process.cwd(),''),db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
const org=randomUUID(),other=randomUUID(),key=randomUUID(),second=randomUUID(),actors={};let server
await db.connect()
try{
 for(const id of [org,other])await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Synthetic task/calendar school',`calendar-${id}`])
 for(const role of ['owner','counsellor','guidance_teacher','teacher']){const id=randomUUID();actors[role]={userId:id,organisationId:org,role};await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@example.invalid`]);await db.query('insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[org,id,role])}
 const outsider=randomUUID();actors.outsider={userId:outsider,organisationId:other,role:'owner'};await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[outsider,`${outsider}@example.invalid`]);await db.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner')",[other,outsider])
 for(const id of [key,second])await db.query('insert into student_registry_records(organisation_id,external_key,payload,created_by) values($1,$2,$3,$4)',[org,id,{id,name:id===second?'PRIVATE-CASE-SENTINEL':'Synthetic calendar student',grade:'11 A',counsellorId:id===key?actors.counsellor.userId:actors.owner.userId},actors.owner.userId])
 for(const role of ['teacher','guidance_teacher'])await db.query('insert into school_student_assignments(organisation_id,student_key,staff_id,assigned_by,reason) values($1,$2,$3,$4,$5)',[org,key,actors[role].userId,actors.owner.userId,'Synthetic test access'])
 const auth=async req=>actors[req.headers.authorization]
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[guidanceApi(env,auth),schoolApi(env,auth),schoolOperationsApi(env,auth)]});await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}/api/guidance`
 const call=async(path='',method='GET',body,role='owner')=>{const send=async()=>{const r=await fetch(base+path,{method,headers:{Authorization:role,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:r.headers.get('content-type')?.includes('text/calendar')?await r.text():await r.json()}};let result=await send();if(result.status===503&&result.data.retryable&&(method==='GET'||method==='POST'&&(body?.requestId||body?.id)))result=await send();return result}
 const task={kind:'task',studentKey:key,title:'Synthetic prerequisite',scheduledAt:'2026-12-01T09:00:00Z',status:'open',summary:'GUIDANCE-ONLY-SUMMARY',taskDetails:blankTask(),requestId:randomUUID()}
 const first=await call('','POST',task,'counsellor');assert.equal(first.status,201,JSON.stringify(first.data));const tid=first.data.activity.id
 const dep={...task,title:'Synthetic dependent',requestId:randomUUID(),taskDetails:{...blankTask(),dependencies:[tid],priority:'High'}}
 const dependent=await call('','POST',dep,'counsellor');assert.equal(dependent.status,201,JSON.stringify(dependent.data));const did=dependent.data.activity.id
 assert.equal((await call(`?id=${did}`,'PATCH',{...dep,version:1,status:'completed'},'counsellor')).status,409)
 assert.equal((await call(`?id=${tid}`,'PATCH',{...task,version:1,taskDetails:{...blankTask(),dependencies:[did]}},'counsellor')).status,400)
 assert.equal((await call(`?id=${tid}`,'PATCH',{...task,version:1,status:'completed',taskDetails:{...blankTask(),verification:'Checked'}},'counsellor')).status,400)
 const complete=await call(`?id=${tid}`,'PATCH',{...task,version:1,status:'completed',taskDetails:{...blankTask(),evidence:'Recorded synthetic result',verification:'Checked'}},'counsellor');assert.equal(complete.status,200);assert.ok(complete.data.activity.completed_at)
 assert.equal((await call(`?id=${did}`,'PATCH',{...dep,version:1,status:'awaiting_evidence',taskDetails:{...dep.taskDetails,classroomVisible:true}},'counsellor')).status,200)
 const teacher=await call('','GET',undefined,'teacher');assert.equal(teacher.status,200);assert.equal(teacher.data.activities.length,1);assert.equal(teacher.data.activities[0].id,did);assert.ok(!JSON.stringify(teacher.data).includes('GUIDANCE-ONLY'))
 assert.equal((await call(`/task-meta?student=${key}`,'GET',undefined,'teacher')).status,403)
 const comment={id:randomUUID(),body:'Synthetic evidence discussion'};assert.equal((await call(`/task-comment?id=${did}`,'POST',comment,'counsellor')).status,200);assert.equal((await call(`/task-comment?id=${did}`,'POST',comment,'counsellor')).status,200);assert.equal((await call(`/task-comment?id=${did}`,'POST',{...comment,body:'Changed replay'},'counsellor')).status,409)
 assert.equal((await call(`/task-comment?id=${did}`,'POST',{id:randomUUID(),body:'Cross school'},'outsider')).status,404)
 const session={kind:'session',studentKey:key,title:'Synthetic review',scheduledAt:'2026-12-02T09:00:00Z',durationMinutes:60,status:'scheduled',summary:'',requestId:randomUUID()}
 const created=await call('','POST',session,'counsellor');assert.equal(created.status,201,JSON.stringify(created.data));const sid=created.data.activity.id
 assert.equal((await call('','POST',{...session,requestId:randomUUID(),scheduledAt:'2026-12-02T09:30:00Z'},'counsellor')).status,409)
 const concurrent=await Promise.all([0,1].map(()=>call('','POST',{...session,requestId:randomUUID(),scheduledAt:'2026-12-03T09:00:00Z'},'counsellor')));assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409])
 const saved=await call(`/session?id=${sid}`,'PUT',{version:0,activityVersion:1,status:'scheduled',assignedTo:actors.counsellor.userId,details:{...blankSession(),reason:'Synthetic review',attendees:'Synthetic student',studentActions:'Compare two official programmes\nCollect school document',counsellorActions:'Review evidence'}},'counsellor');assert.equal(saved.status,200,JSON.stringify(saved.data))
 const conversion={expectedSessionVersion:1,field:'studentActions',lineIndex:0,title:'Compare two programmes',scheduledAt:'2026-12-05T09:00:00Z',assignedTo:actors.counsellor.userId,requestId:randomUUID()}
 const converted=await call(`/session-action?id=${sid}`,'POST',conversion,'counsellor');assert.equal(converted.status,200,JSON.stringify(converted.data));const again=await call(`/session-action?id=${sid}`,'POST',{...conversion,requestId:randomUUID()},'counsellor');assert.equal(again.data.id,converted.data.id);assert.equal(again.data.reused,true)
 assert.equal((await call(`/session-action?id=${sid}`,'POST',{...conversion,expectedSessionVersion:0},'counsellor')).status,409)
 assert.equal((await call(`/session?id=${sid}`,'GET',undefined,'guidance_teacher')).data.canPrivate,false)
 assert.equal((await call(`/session-note?id=${sid}`,'PUT',{version:0,body:'Should not save'},'guidance_teacher')).status,403)
 const availability={requestId:randomUUID(),title:'Synthetic unavailable',kind:'unavailable',staffId:actors.counsellor.userId,notes:'Team availability',occurrences:[{start:'2026-12-04T09:00:00Z',end:'2026-12-04T10:00:00Z'},{start:'2026-12-11T09:00:00Z',end:'2026-12-11T10:00:00Z'}]}
 const available=await call('/calendar','POST',availability,'counsellor');assert.equal(available.status,200,JSON.stringify(available.data));assert.equal(available.data.ids.length,2)
 assert.equal((await call('/calendar','POST',availability,'counsellor')).data.reused,true)
 assert.equal((await call('/calendar','POST',{...availability,title:'Changed retry'},'counsellor')).status,409)
 assert.equal((await call('/calendar','POST',{...availability,requestId:randomUUID(),staffId:actors.owner.userId},'counsellor')).status,403)
 assert.equal((await call('','POST',{...session,requestId:randomUUID(),scheduledAt:'2026-12-04T09:00:00Z'},'counsellor')).status,409)
 const privateSession=await call('','POST',{...session,studentKey:second,title:'PRIVATE-SESSION-SENTINEL',requestId:randomUUID(),scheduledAt:'2026-12-08T09:00:00Z'});assert.equal(privateSession.status,201)
 const range='?from=2026-12-01T00:00:00Z&to=2027-01-01T00:00:00Z',calendar=await call('/calendar'+range,'GET',undefined,'counsellor');assert.equal(calendar.status,200,JSON.stringify(calendar.data));assert.ok(calendar.data.entries.some(e=>e.kind==='busy'));assert.ok(!JSON.stringify(calendar.data).includes('PRIVATE-CASE-SENTINEL'));assert.ok(!JSON.stringify(calendar.data).includes('PRIVATE-SESSION-SENTINEL'));assert.ok(!calendar.data.entries.find(e=>e.kind==='busy').studentKey)
 const ics=await call('/calendar-export'+range,'GET',undefined,'counsellor');assert.equal(ics.status,200);assert.ok(ics.data.includes('BEGIN:VCALENDAR'));assert.ok(!ics.data.includes('GUIDANCE-ONLY'));assert.ok(!ics.data.includes('PRIVATE-SESSION-SENTINEL'))
 const escaping=calendarIcs([{id:'synthetic',kind:'task',title:'Name\nBEGIN:VEVENT,broken',startsAt:'2026-12-01T00:00:00Z',endsAt:'2026-12-01T01:00:00Z',status:'open'}]);assert.equal(escaping.split('\r\n').filter(s=>s==='BEGIN:VEVENT').length,1)
 const areaCall=async(area,path,method='GET',body,role='owner')=>{const r=await fetch(base.replace('/guidance',`/${area}`)+path,{method,headers:{Authorization:role,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()}}
 const group={id:randomUUID(),title:'Synthetic vocational exposure',scheduledAt:'2026-12-09T09:00:00Z',status:'scheduled',summary:'Synthetic programme outcomes',studentKeys:[key],details:{type:'Vocational-pathway session',objective:'Explore two training options',attendance:{[key]:'Not recorded'},pre:{[key]:'One route known'},post:{[key]:'Two routes compared'},staffId:actors.counsellor.userId}}
 const intervention=await areaCall('school','/interventions','POST',group,'counsellor');assert.equal(intervention.status,201,JSON.stringify(intervention.data))
 assert.equal((await areaCall('school','/interventions','PATCH',{...group,status:'completed',version:1},'counsellor')).status,400)
 const finished=await areaCall('school','/interventions','PATCH',{...group,status:'completed',version:1,details:{...group.details,attendance:{[key]:'Present'}}},'counsellor');assert.equal(finished.status,200,JSON.stringify(finished.data));assert.equal(finished.data.record.details.post[key],'Two routes compared')
 assert.equal((await areaCall('school','/interventions','POST',{...group,id:randomUUID(),studentKeys:[second]},'counsellor')).status,404)
 const dueTask=await call('','POST',{...task,requestId:randomUUID(),title:'Synthetic overdue notification',scheduledAt:new Date(Date.now()-86400000).toISOString()},'counsellor');assert.equal(dueTask.status,201)
 const inbox=await areaCall('operations','/notifications','GET',undefined,'counsellor');assert.equal(inbox.status,200,JSON.stringify(inbox.data));const reminder=inbox.data.records.find(r=>r.title==='Synthetic overdue notification');assert.ok(reminder);assert.equal(reminder.read,false);assert.ok(!JSON.stringify(inbox.data).includes('PRIVATE-CASE-SENTINEL'))
 assert.equal((await areaCall('operations','/notifications','PUT',{keys:[reminder.key]},'counsellor')).status,200)
 assert.equal((await areaCall('operations','/notifications','GET',undefined,'counsellor')).data.records.find(r=>r.key===reminder.key).read,true)
 assert.equal((await areaCall('operations','/notifications','GET',undefined,'teacher')).status,403)
 assert.equal((await areaCall('operations','/notification-preferences','PUT',{disabledTypes:['overdue_followup'],inactiveDays:60},'counsellor')).status,200)
 assert.ok(!(await areaCall('operations','/notifications','GET',undefined,'counsellor')).data.records.some(r=>r.type==='overdue_followup'))
 assert.equal((await call('/calendar','PATCH',{id:available.data.ids[0],version:1,status:'cancelled',series:true},'counsellor')).status,200)
 assert.equal((await call('','POST',{...session,requestId:randomUUID(),scheduledAt:'2026-12-04T09:00:00Z'},'counsellor')).status,201)
 await db.query('update student_registry_records set archived_at=now() where organisation_id=$1 and external_key=$2',[org,key]);assert.equal((await call(`/task-comment?id=${did}`,'POST',{id:randomUUID(),body:'Archived write'},'counsellor')).status,409)
 console.log('Tasks and calendar passed: prerequisites, cycles, evidence, comments/replay, classroom projection, session-action deduplication, restricted notes, concurrent booking conflicts, recurring availability, cancellation, busy-only private cases, scoped ICS export and archived writes. Synthetic schools only.')
}finally{
 if(server)await server.close()
 for(const id of [org,other]){for(const table of ['school_notification_state','school_notification_preferences','school_intervention_students','school_interventions','guidance_task_comments','guidance_session_private_notes','guidance_session_records','school_calendar_requests','school_calendar_events'])await db.query(`delete from ${table} where organisation_id=$1`,[id]);await db.query("delete from guidance_activities where organisation_id=$1 and kind='task'",[id]);await db.query('delete from guidance_activities where organisation_id=$1',[id]);for(const table of ['school_student_assignments','student_registry_history','school_audit_events','student_registry_records'])await db.query(`delete from ${table} where organisation_id=$1`,[id]);await db.query('delete from organisations where id=$1',[id])}
 for(const a of Object.values(actors))await db.query('delete from auth.users where id=$1',[a.userId]);await db.end()
}
