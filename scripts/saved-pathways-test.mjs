import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Client} from 'pg'
import {createServer,loadEnv} from 'vite'
import {schoolOperationsApi} from '../server/school/operations.ts'
import {AuthenticationError} from '../server/ai/auth.ts'
const env={...loadEnv('development',process.cwd(),''),...process.env},org=randomUUID(),other=randomUUID(),user=randomUUID(),colleague=randomUUID()
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await db.connect();let server
try{
 for(const id of [user,colleague])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`bookmarks-${id}@example.invalid`])
 for(const id of [org,other])await db.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Temporary saved paths test',`bookmarks-${id}`])
 await db.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner'),($1,$3,'teacher')",[org,user,colleague])
 server=await createServer({configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0},plugins:[schoolOperationsApi(env,async req=>{const actor=req.headers.authorization;if(!['owner','colleague','outsider'].includes(actor))throw new AuthenticationError('Sign in required');return {userId:actor==='colleague'?colleague:user,organisationId:actor==='outsider'?other:org,role:actor==='colleague'?'teacher':'owner'}})]});await server.listen()
 const base=`http://127.0.0.1:${server.httpServer.address().port}/api/operations/saved-paths`
 const call=async(method='GET',body,actor='owner')=>{const response=await fetch(base,{method,headers:{Authorization:actor,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
 assert.equal((await call('GET',undefined,'')).status,401)
 const first={name:'Synthetic saved career',type:'Career',path:'/careers/Synthetic%20saved%20career'},second={name:'Synthetic scholarship',type:'Scholarship',path:'/dashboard?view=scholarships&q=Synthetic'}
 assert.equal((await call('POST',{...first,path:'https://unrelated.example'})).status,400)
 assert.equal((await call('POST',{...first,path:'//unrelated.example'})).status,400)
 assert.equal((await call('POST',{...first,path:'/auth'})).status,400)
 assert.equal((await call('POST',first)).status,200)
 assert.equal((await call('POST',first)).data.items.length,1,'Repeated save must be idempotent')
 assert.equal((await call('GET')).data.items[0].path,first.path)
 assert.equal((await call('GET',undefined,'colleague')).data.items.length,0)
 assert.equal((await call('GET',undefined,'outsider')).data.items.length,0)
 assert.equal((await call('POST',first,'colleague')).status,200,'Teachers may save their own bookmarks')
 assert.equal((await call('POST',second)).status,200)
 await Promise.all([call('PATCH',{path:first.path}),call('PATCH',{path:second.path})])
 assert.equal((await call('GET')).data.items.filter(item=>item.preferred).length,1,'Concurrent preference changes must preserve one preferred option')
 assert.equal((await call('PATCH',{path:second.path},'outsider')).status,404)
 assert.equal((await call('DELETE',{path:first.path})).data.items.length,1)
 assert.equal((await call('DELETE',{path:first.path})).data.items.length,1)
 assert.equal((await call('GET',undefined,'colleague')).data.items.length,1,'Removing a bookmark must not affect a colleague')
 await db.query("insert into staff_saved_pathways(organisation_id,author_id,path,name,type) select $1,$2,'/careers/fixture-'||n,'Fixture '||n,'Career' from generate_series(1,499) n",[org,user])
 assert.equal((await call('POST',first)).status,409,'Quota must apply to new options')
 assert.equal((await call('POST',second)).status,200,'Already-saved retry remains valid at quota')
 await db.query('begin');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[colleague]);assert.equal((await db.query('select * from staff_saved_pathways where organisation_id=$1',[org])).rowCount,1);assert.equal((await db.query('select * from staff_saved_pathways where organisation_id=$1',[other])).rowCount,0);await assert.rejects(db.query("delete from staff_saved_pathways where organisation_id=$1",[org]),error=>error.code==='42501')}finally{await db.query('rollback')}
 console.log('Saved pathways passed: persistence, idempotency, private user/school scope, teacher bookmarks, concurrent preference, quota, invalid URLs and RLS.')
}finally{
 if(server)await server.close()
 for(const id of [org,other]){await db.query('delete from staff_saved_pathways where organisation_id=$1',[id]);await db.query('delete from school_audit_events where organisation_id=$1',[id]);await db.query('delete from organisations where id=$1',[id])}
 for(const id of [user,colleague])await db.query('delete from auth.users where id=$1',[id])
 await db.end()
}
