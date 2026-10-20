import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {Pool} from 'pg'
import {loadEnv} from 'vite'
import {platformRequest} from '../server/workspace/platform.ts'
const env=loadEnv('development',process.cwd(),''),pool=new Pool({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:2}),operator=randomUUID(),owner=randomUUID(),org=randomUUID(),created=[]
const server=createServer(async(req,res)=>{try{await platformRequest(req,res,pool,req.headers.authorization||'',new Set([operator]))}catch{res.statusCode=500;res.end('{}')}})
try{
 for(const id of [operator,owner])await pool.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@example.invalid`]);await pool.query('insert into organisations(id,name,slug) values($1,$2,$3)',[org,'Synthetic platform fixture',`platform-${org}`]);await pool.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner')",[org,operator])
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/platform`,call=async(method='GET',body,actor=operator)=>{const r=await fetch(base,{method,headers:{Authorization:actor,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()}}
 assert.equal((await call('GET',undefined,owner)).status,403)
 const list=await call();assert.equal(list.status,200);const row=list.data.schools.find(s=>s.id===org);assert.ok(row);assert.ok(!Object.keys(row).some(k=>/email|student_name|private|profile/.test(k)))
 assert.equal((await call('PATCH',{id:org,active:false,version:row.access_version,reason:'Synthetic suspension test'})).status,200);assert.equal((await pool.query('select active from organisations where id=$1',[org])).rows[0].active,false)
 assert.equal((await call('PATCH',{id:org,active:true,version:row.access_version,reason:'Stale synthetic version'})).status,409)
 const fresh=(await call()).data.schools.find(s=>s.id===org);assert.equal((await call('PATCH',{id:org,active:true,version:fresh.access_version,reason:'Synthetic restoration test'})).status,200)
 const school={name:'Synthetic created platform school',schoolType:'Test school',city:'Test city',state:'Test state',country:'India',ownerEmail:`${owner}@example.invalid`,reason:'Synthetic provisioning test'}
 const result=await call('POST',school);assert.equal(result.status,201,JSON.stringify(result.data));created.push(result.data.id);assert.equal((await call('POST',school)).status,409)
 assert.equal((await pool.query('select role from organisation_memberships where organisation_id=$1 and user_id=$2',[result.data.id,owner])).rows[0].role,'owner')
 console.log('Platform administration passed: explicit operator allowlist, metadata-only school totals, suspension/restoration, stale-update rejection, verified-owner provisioning and duplicate-school prevention. Synthetic schools only.')
}finally{
 await new Promise(r=>server.close(r));for(const id of [...created,org]){for(const table of ['school_audit_events','organisation_memberships'])await pool.query(`delete from ${table} where organisation_id=$1`,[id]);await pool.query('delete from organisations where id=$1',[id])}for(const id of [operator,owner])await pool.query('delete from auth.users where id=$1',[id]);await pool.end()
}
