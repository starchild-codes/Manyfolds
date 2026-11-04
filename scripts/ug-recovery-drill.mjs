// An in-memory encrypted snapshot/restore drill for synthetic admissions records.
// Everything, including fixture creation, is rolled back. This is NOT a native
// managed-database backup, production restore or off-site backup service.
import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto'
import {loadEnv} from 'vite'
import {Client} from 'pg'
import {blankAdmission} from '../server/school/admissionsSchema.ts'
const env={...loadEnv('development',process.cwd(),''),...process.env},db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}}),org=randomUUID(),user=randomUUID(),outsider=randomUUID(),student=randomUUID(),application=randomUUID(),task=randomUUID()
const tables=['guidance_activities','school_ug_applications','school_ug_application_history','school_ug_application_followups']
await db.connect()
try{
 await db.query('begin')
 for(const id of [user,outsider])await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@example.invalid`])
 await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[org,'Synthetic restore drill','restore-'+org]);await db.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner')",[org,user])
 await db.query('insert into student_registry_records(organisation_id,external_key,payload) values($1,$2,$3)',[org,student,{id:student,name:'Synthetic restore student',grade:'12 A'}])
 await db.query('insert into school_ug_applications(id,organisation_id,student_key,payload,created_by,updated_by) values($1,$2,$3,$4,$5,$5)',[application,org,student,{...blankAdmission(user),institution:'Synthetic restore institution',programme:'Synthetic BA'},user])
 await db.query("update school_ug_applications set payload=payload||'{\"status\":\"preparing\"}'::jsonb,version=2 where id=$1",[application])
 await db.query("insert into guidance_activities(id,organisation_id,student_key,kind,title,scheduled_at,status,assigned_to,created_by,updated_by) values($1,$2,$3,'task','Synthetic admissions recovery action',now(),'open',$4,$4,$4)",[task,org,student,user])
 await db.query('insert into school_ug_application_followups(organisation_id,application_id,application_version,task_id,created_by) values($1,$2,2,$3,$4)',[org,application,task,user])
 const snapshot=async()=>{const result={};for(const table of tables)result[table]=(await db.query(`select * from ${table} where organisation_id=$1 order by ${table==='school_ug_application_followups'?'application_id,application_version':'id'}`,[org])).rows;return JSON.stringify(result)}
 const original=await snapshot(),key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(original,'utf8'),cipher.final()]),tag=cipher.getAuthTag()
 const decrypt=buffer=>{const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(buffer),decipher.final()]).toString('utf8')}
 const corrupted=Buffer.from(encrypted);corrupted[0]^=1;assert.throws(()=>decrypt(corrupted),'Corrupted encrypted snapshots must fail authentication')
 const restored=JSON.parse(decrypt(encrypted))
 for(const table of [...tables].reverse())await db.query(`delete from ${table} where organisation_id=$1`,[org])
 assert.equal((await db.query('select 1 from school_ug_applications where organisation_id=$1',[org])).rowCount,0)
 for(const table of tables)await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(restored[table])])
 assert.equal(createHash('sha256').update(await snapshot()).digest('hex'),createHash('sha256').update(original).digest('hex'),'Restored application, history and follow-up links must match exactly')
 await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);assert.equal((await db.query('select 1 from school_ug_applications where id=$1',[application])).rowCount,1)
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[outsider]);assert.equal((await db.query('select 1 from school_ug_applications where id=$1',[application])).rowCount,0)
 console.log('Synthetic admissions restore drill passed: authenticated encrypted snapshot, tamper rejection, exact records/history/task links and preserved RLS. All changes rolled back; native/off-site production recovery remains a separate operational gate.')
}finally{await db.query('rollback');await db.end()}
