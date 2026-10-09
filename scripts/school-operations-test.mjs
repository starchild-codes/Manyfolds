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
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[schoolOperationsApi(env,async req=>{
  const actor=req.headers.authorization
  if(!['owner','teacher','counsellor','outsider','colleague'].includes(actor))throw new AuthenticationError('Sign in required')
  return {userId:actor==='colleague'?colleague:user,organisationId:actor==='outsider'?other:org,role:actor==='outsider'?'owner':actor==='colleague'?'counsellor':actor}
 })]})
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
 const preview=await call('/imports/preview','POST','counsellor',{csv,mapping:{id:'ID',name:'Name',grade:'Class'}});assert.equal(preview.status,200,JSON.stringify(preview.data))
 const imported={id:randomUUID(),records:preview.data.records,previewHash:preview.data.previewHash}
 assert.equal((await call('/imports','POST','teacher',imported)).status,403)
 assert.equal((await call('/imports','POST','counsellor',{...imported,previewHash:'tampered'})).status,409)
 assert.equal((await call('/imports','POST','counsellor',imported)).data.batch.count,2)
 assert.equal((await call('/imports','POST','counsellor',imported)).status,200)
 const duplicate=await call('/imports/preview','POST','owner',{csv,mapping:{id:'ID',name:'Name',grade:'Class'}});assert.equal(duplicate.data.duplicateIds.length,2)
 const note={studentKey:'first',body:'Confidential test-only note',version:0}
 assert.equal((await call('/private-notes','PUT','teacher',note)).status,403)
 assert.equal((await call('/private-notes','PUT','owner',note)).status,200)
 assert.equal((await call('/private-notes','PUT','owner',note)).status,409)
 assert.equal((await call('/private-notes?student=first')).data.record.body,note.body)
 assert.equal((await call('/private-notes?student=first','GET','colleague')).data.record.body,'')
 assert.equal((await call('/private-notes?student=first','GET','outsider')).data.record.body,'')
 assert.equal((await call('/private-notes','PUT','colleague',{...note,body:'Colleague private note'})).status,200)
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
 console.log('Operations HTTP tests passed: configuration conflicts, resources, imports, duplicate protection, rollback, rollover/history, archive preservation, school isolation and audit privacy. Only temporary schools were modified.')
} finally {
 if(server)await server.close()
 for(const id of [org,other]){for(const table of ['student_private_notes','school_audit_events','student_registry_history','school_resources','school_configuration','student_import_batches','school_annual_rollovers','student_registry_records'])await db.query(`delete from ${table} where organisation_id=$1`,[id]);await db.query('delete from organisations where id=$1',[id])}
 for(const person of [user,colleague])await db.query('delete from auth.users where id=$1',[person])
 await db.end()
}
