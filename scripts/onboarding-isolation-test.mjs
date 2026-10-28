import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer,loadEnv} from 'vite'
import {Client} from 'pg'
import {workspaceApi} from '../server/workspace/plugin.ts'
import {schoolOperationsApi} from '../server/school/operations.ts'
import {studentsApi} from '../server/students/plugin.ts'
import {validateSchoolSetup} from '../server/workspace/onboarding.ts'

const env={...loadEnv('development',process.cwd(),''),...process.env}
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
const users=[randomUUID(),randomUUID()],orgs=[]
const body={name:'Onboarding isolation fixture',schoolType:'Private',city:'Test city',state:'Test state',country:'India',approximateStudentCount:300,board:'CBSE',academicYear:'2026-27',classes:[{name:'11',sections:['A','B','C']},{name:'12',sections:['A','B','C']}]}
for(const invalid of [{...body,classes:[{name:'',sections:[]}]},{...body,classes:[body.classes[0],body.classes[0]]},{...body,classes:[{name:'11',sections:['A','a']}]},{...body,approximateStudentCount:-1},{...body,approximateStudentCount:1.5}])assert.throws(()=>validateSchoolSetup(invalid))
await db.connect();let server
try{
 for(const id of users)await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`onboarding-${id}@example.invalid`])
 const identity=async req=>{const id=req.headers.authorization;if(!users.includes(id))throw Object.assign(new Error('Sign in required'),{status:401,statusCode:401});return {id}}
 const schoolAuth=async req=>{const user=await identity(req);const {rows}=await db.query('select organisation_id,role from organisation_memberships where user_id=$1 and active',[user.id]);if(!rows.length)throw Object.assign(new Error('No workspace'),{statusCode:403});return {userId:user.id,organisationId:rows[0].organisation_id,role:rows[0].role}}
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[workspaceApi(env,identity),studentsApi(env,schoolAuth),schoolOperationsApi(env,schoolAuth)]})
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`
 const call=async(path,user=users[0],method='GET',payload)=>{const send=()=>fetch(origin+path,{method,headers:{Authorization:user,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});let res=await send();if(res.status===503&&method==='GET'){await res.text();console.log('Retrying an interrupted read after a temporary database connection reset');res=await send()}const data=await res.json();assert.ok(res.status<500,JSON.stringify({path,status:res.status,data}));return {status:res.status,data}}
 assert.equal((await call('/api/workspace','invalid')).status,401)
 for(const user of users)assert.deepEqual((await call('/api/workspace',user)).data.memberships,[],'New emails must not inherit any school')
 await db.query('begin')
 try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[users[0]]);for(const table of ['organisations','organisation_memberships','student_registry_records','school_classes','school_sections'])assert.equal((await db.query(`select 1 from ${table}`)).rowCount,0,`Unassigned account can see ${table}`)}finally{await db.query('rollback')}
 assert.equal((await call('/api/workspace/onboarding',users[0],'POST',{...body,classes:[{name:'',sections:[]}]})).status,400)
 assert.equal((await db.query('select 1 from organisation_memberships where user_id=any($1::uuid[])',[users])).rowCount,0)
 for(const user of users){const result=await call('/api/workspace/onboarding',user,'POST',body);assert.equal(result.status,201,JSON.stringify(result.data));orgs.push(result.data.workspace.organisation_id);assert.deepEqual(result.data.workspace.classes,body.classes.map(c=>({class_name:c.name,sections:c.sections})));assert.deepEqual((await call('/api/students',user)).data.records,[])}
 assert.notEqual(orgs[0],orgs[1],'Even identical school names must create separate workspaces')
 const replay=await Promise.all([call('/api/workspace/onboarding',users[0],'POST',body),call('/api/workspace/onboarding',users[0],'POST',body)])
 assert.ok(replay.every(r=>r.status===200&&r.data.workspace.organisation_id===orgs[0]))
 assert.equal((await db.query('select 1 from organisation_memberships where user_id=$1',[users[0]])).rowCount,1)
 const settings=await db.query('select settings from school_configuration where organisation_id=$1',[orgs[0]]);assert.equal(settings.rows[0].settings.board,'CBSE')
 const configuration=await call('/api/operations/configuration')
 const added=await call('/api/operations/configuration',users[0],'PUT',{version:configuration.data.configuration.version,settings:configuration.data.configuration.settings,school:configuration.data.school,classes:[...configuration.data.classes,{class_name:'10',sections:['D']}]})
 assert.equal(added.status,200,JSON.stringify(added.data))
 assert.ok((await call('/api/workspace')).data.memberships[0].classes.some(c=>c.class_name==='10'&&c.sections[0]==='D'))
 assert.equal((await call('/api/workspace',users[1])).data.memberships[0].classes.length,2,'Adding a class must affect only this school')
 const student=randomUUID();await db.query('insert into student_registry_records(organisation_id,external_key,payload) values($1,$2,$3)',[orgs[0],student,{id:student,name:'Private fixture',grade:'11 A'}])
 const a=await call('/api/students',users[0]),b=await call('/api/students',users[1]);assert.ok(a.data.records.some(s=>s.id===student));assert.deepEqual(b.data.records,[])
 assert.equal((await call('/api/students?key='+student,users[1],'PUT',{record:{id:student,name:'Foreign edit',grade:'12 B'},expectedVersion:1})).status,404)
 await db.query('begin')
 try{
  await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[users[1]])
  for(const table of ['organisations','organisation_memberships','school_classes','school_sections','school_configuration','student_registry_records']){const key=table==='organisations'?'id':'organisation_id';assert.equal((await db.query(`select 1 from ${table} where ${key}=$1`,[orgs[0]])).rowCount,0,`${table} leaked across accounts`)}
 }finally{await db.query('rollback')}
 console.log('Onboarding isolation passed: two fresh emails, empty separate dashboards, exact 11/12 A/B/C structure, saved school details, repeat safety, later class additions, API and database RLS cross-school denial. Synthetic identities injected; no real account or email modified.')
}finally{
 if(server)await server.close()
 const found=await db.query('select id from organisations where created_by=any($1::uuid[])',[users]);const ids=found.rows.map(r=>r.id)
 if(ids.length){for(const table of ['student_registry_history','student_registry_records','school_configuration','school_audit_events','school_sections','school_classes','organisation_memberships'])await db.query(`delete from ${table} where organisation_id=any($1::uuid[])`,[ids]);await db.query('delete from organisations where id=any($1::uuid[])',[ids])}
 await db.query('delete from auth.users where id=any($1::uuid[])',[users]);await db.end()
}
