import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer, loadEnv } from 'vite'
import { Client } from 'pg'
import { guidanceApi } from '../server/guidance/plugin.ts'
import { AuthenticationError } from '../server/ai/auth.ts'

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
    throw new AuthenticationError('Sign in is required to continue.')
  })]})
  await server.listen()
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`
  const call=async(method,actor,body,id)=>{
    const response=await fetch(`${origin}/api/guidance${id?`?id=${id}`:''}`,{method,headers:{Authorization:actor,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
    return {status:response.status,data:await response.json()}
  }
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
  const updated=await call('PATCH','owner',{...input,status:'completed',version:1},id)
  assert.equal(updated.status,200)
  assert.equal(updated.data.activity.version,2)
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
    assert.equal((await db.query("update guidance_activities set status='cancelled' where id=$1 returning id",[id])).rowCount,0)
  }finally{await db.query('rollback')}
  console.log('Guidance HTTP workflow, role checks, version conflict, linked history and school isolation passed')
}finally{
  if(server)await server.close()
  if(owner){await db.query('delete from school_audit_events where organisation_id=$1 and (subject_key=$2 or subject_key in(select id::text from guidance_activities where organisation_id=$1 and student_key=$2))',[owner.organisation_id,studentKey]);await db.query('delete from student_registry_history where organisation_id=$1 and student_key=$2',[owner.organisation_id,studentKey]);await db.query('delete from guidance_activities where organisation_id=$1 and student_key=$2',[owner.organisation_id,studentKey]);await db.query('delete from student_registry_records where organisation_id=$1 and external_key=$2',[owner.organisation_id,studentKey])}
  await db.end()
}
