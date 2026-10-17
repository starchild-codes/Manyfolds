import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer, loadEnv } from 'vite'
import { Client } from 'pg'
import { guidanceApi } from '../server/guidance/plugin.ts'
import { AuthenticationError } from '../server/ai/auth.ts'
import { blankSession } from '../server/guidance/sessionSchema.ts'

const env={...loadEnv('development',process.cwd(),''),...process.env}
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
await db.connect()
let server
let owner
const studentKey=randomUUID()
try{
  const {rows}=await db.query(`select m.user_id,m.organisation_id,m.role from organisation_memberships m
    where m.active and m.role in ('owner','admin') and m.organisation_id=(select organisation_id from organisation_memberships where user_id=m.user_id and active order by created_at limit 1) order by m.created_at`)
  owner=rows[0]
  const outsider=rows.find(row=>row.organisation_id!==owner?.organisation_id)
  assert.ok(owner&&outsider,'Two separate schools are required')
  await db.query('insert into student_registry_records(organisation_id,external_key,payload) values($1,$2,$3)',[owner.organisation_id,studentKey,{id:studentKey,name:'Workflow test record',grade:'12'}])
  const context=actor=>({userId:actor.user_id,organisationId:actor.organisation_id,role:actor.role})
  server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[guidanceApi(env,async req=>{
    if(req.headers.authorization==='owner')return context(owner)
    if(req.headers.authorization==='outsider')return context(outsider)
    if(req.headers.authorization==='teacher')return {...context(owner),role:'teacher'}
    if(req.headers.authorization==='colleague')return {...context(owner),userId:outsider.user_id,role:'counsellor'}
    throw new AuthenticationError('Sign in is required to continue.')
  })]})
  await server.listen()
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`
  const call=async(method,actor,body,id)=>{
    const response=await fetch(`${origin}/api/guidance${id?`?id=${id}`:''}`,{method,headers:{Authorization:actor,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
    return {status:response.status,data:await response.json()}
  }
  const sessionCall=async(path,method='GET',body,actor='owner')=>{const response=await fetch(`${origin}/api/guidance${path}`,{method,headers:{Authorization:actor,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
  assert.equal((await call('GET','')).status,401)
  const input={requestId:randomUUID(),kind:'session',studentKey,title:'Pathway conversation',scheduledAt:new Date().toISOString(),status:'scheduled',summary:'Agreed next action'}
  assert.equal((await call('POST','teacher',input)).status,403)
  assert.equal((await call('POST','outsider',input)).status,404)
  assert.equal((await call('POST','owner',{...input,scheduledAt:'invalid'})).status,400)
  const created=await call('POST','owner',input)
  assert.equal(created.status,201)
  assert.equal(created.data.activity.version,1)
  assert.equal(created.data.activity.mine,true)
  const id=created.data.activity.id
  const retry=await call('POST','owner',input)
  assert.equal(retry.status,201)
  assert.equal(retry.data.activity.id,id,'A repeated creation must return the same activity')
  assert.equal((await call('PATCH','owner',{...input,status:'completed',version:1},id)).status,400,'Empty session cannot be completed')
  assert.equal((await sessionCall(`/session?id=${id}`,'GET',undefined,'teacher')).status,403)
  assert.equal((await sessionCall(`/session?id=${id}`,'GET',undefined,'outsider')).status,404)
  const loaded=await sessionCall(`/session?id=${id}`)
  assert.equal(loaded.status,200)
  assert.equal(loaded.data.record.version,0)
  const detailInput={version:0,activityVersion:1,status:'completed',assignedTo:owner.user_id,details:{...blankSession(),attendees:'Student and counsellor',reason:'Review choices',decisions:'Compare two verified routes',concerns:'TEAM ONLY CONCERN',shareableSummary:'Approved discussion summary',summaryApproved:true}}
  assert.equal((await sessionCall(`/session?id=${id}`,'PUT',{...detailInput,details:{...detailInput.details,followUpDate:'2026-02-30'}})).status,400)
  assert.equal((await sessionCall(`/session?id=${id}`,'PUT',{...detailInput,details:{...blankSession(),attendees:'Student',reason:'Review',followUpDate:'2026-11-01'}})).status,400,'An unlinked follow-up date alone is not a completed session outcome')
  assert.equal((await sessionCall(`/session?id=${id}`,'PUT',{...detailInput,assignedTo:outsider.user_id})).status,400)
  const recorded=await sessionCall(`/session?id=${id}`,'PUT',detailInput)
  assert.equal(recorded.status,200)
  assert.equal(recorded.data.activity.version,2)
  assert.equal(recorded.data.record.version,1)
  assert.equal((await sessionCall(`/session?id=${id}`,'PUT',detailInput)).status,409)
  const note=await sessionCall(`/session-note?id=${id}`,'PUT',{body:'AUTHOR PRIVATE NOTE',version:0})
  assert.equal(note.status,200)
  assert.equal((await sessionCall(`/session-note?id=${id}`,'PUT',{body:'stale',version:0})).status,409)
  assert.equal((await sessionCall(`/session?id=${id}`,'GET',undefined,'colleague')).data.note.body,'')
  const guardian=await sessionCall(`/session-export?id=${id}&variant=guardian`)
  assert.equal(guardian.status,200)
  assert.equal(guardian.data.document.summary,'Approved discussion summary')
  assert.ok(!JSON.stringify(guardian.data).includes('TEAM ONLY'))
  assert.ok(!JSON.stringify(guardian.data).includes('AUTHOR PRIVATE'))
  assert.ok(JSON.stringify((await sessionCall(`/session-export?id=${id}&variant=internal`)).data).includes('AUTHOR PRIVATE NOTE'))
  assert.ok(!JSON.stringify((await sessionCall(`/session-export?id=${id}&variant=internal`,'GET',undefined,'colleague')).data).includes('AUTHOR PRIVATE NOTE'))
  const briefing=await sessionCall(`/briefing?student=${studentKey}&id=${id}`)
  assert.equal(briefing.status,200)
  assert.equal(briefing.data.student.payload.name,'Workflow test record')
  assert.ok(!JSON.stringify(briefing.data).includes('AUTHOR PRIVATE'))
  const drafted=await sessionCall(`/session?id=${id}`,'PUT',{...detailInput,version:1,activityVersion:2,details:{...detailInput.details,summaryApproved:false}})
  assert.equal(drafted.status,200)
  assert.equal((await sessionCall(`/session-export?id=${id}&variant=guardian`)).status,409)
  const updated=await call('PATCH','owner',{...input,status:'completed',version:3},id)
  assert.equal(updated.status,200)
  assert.equal(updated.data.activity.version,4)
  assert.equal((await call('PATCH','owner',{...input,version:1},id)).status,409)
  assert.equal((await call('PATCH','outsider',{...input,version:2},id)).status,404)
  const task=await call('POST','owner',{...input,requestId:randomUUID(),kind:'task',status:'open'})
  assert.equal(task.status,201)
  const visible=await call('GET','owner')
  assert.ok(visible.data.activities.some(record=>record.id===id&&record.student_name==='Workflow test record'))
  const hidden=await call('GET','outsider')
  assert.ok(!hidden.data.activities.some(record=>record.id===id))
  await assert.rejects(db.query('delete from student_registry_records where organisation_id=$1 and external_key=$2',[owner.organisation_id,studentKey]),error=>error.code==='23503')
  await db.query('begin')
  try{
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[outsider.user_id])
    assert.equal((await db.query('select id from guidance_activities where id=$1',[id])).rowCount,0)
    assert.equal((await db.query('select * from guidance_session_records where activity_id=$1',[id])).rowCount,0)
    assert.equal((await db.query('select * from guidance_session_private_notes where activity_id=$1',[id])).rowCount,0)
    await assert.rejects(db.query("update guidance_activities set status='cancelled' where id=$1 returning id",[id]),error=>error.code==='42501')
  }finally{await db.query('rollback')}
  const audit=await db.query('select metadata from school_audit_events where organisation_id=$1 and subject_key=$2',[owner.organisation_id,id])
  assert.ok(!JSON.stringify(audit.rows).includes('AUTHOR PRIVATE'))
  assert.ok(!JSON.stringify(audit.rows).includes('TEAM ONLY'))
  console.log('Guidance and session workflows passed: completion gates, conflicts, assignment, briefing, private notes, approved exports, audit redaction and school isolation')
}finally{
  if(server)await server.close()
  if(owner){await db.query('delete from school_audit_events where organisation_id=$1 and (subject_key=$2 or subject_key in(select id::text from guidance_activities where organisation_id=$1 and student_key=$2))',[owner.organisation_id,studentKey]);await db.query('delete from student_registry_history where organisation_id=$1 and student_key=$2',[owner.organisation_id,studentKey]);await db.query('delete from guidance_activities where organisation_id=$1 and student_key=$2',[owner.organisation_id,studentKey]);await db.query('delete from student_registry_records where organisation_id=$1 and external_key=$2',[owner.organisation_id,studentKey])}
  await db.end()
}
