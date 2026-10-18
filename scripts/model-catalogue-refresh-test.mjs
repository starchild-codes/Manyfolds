import assert from 'node:assert/strict'
import {Client} from 'pg'
import {loadEnv} from 'vite'
import {createAiConfig} from '../server/ai/config.ts'
import {rankAllowedModels} from '../server/ai/models.ts'
const env={...loadEnv('development',process.cwd(),''),...process.env},config=createAiConfig(env)
const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await db.connect()
const originalFetch=globalThis.fetch
try{
 await db.query('begin')
 const before=(await db.query('select model_id,enabled,review_status,notes from ai_model_allowlist where model_id=any($1::text[]) order by model_id',[config.allowedModels])).rows
 const records=(await db.query('select raw_metadata from ai_model_catalogue where model_id=any($1::text[])',[config.allowedModels])).rows.map(row=>row.raw_metadata)
 assert.ok(records.length>=2,'Reviewed production metadata must be present')
 await db.query("update ai_model_catalogue set fetched_at=now()-interval '2 days' where model_id=any($1::text[])",[config.allowedModels])
 let bulkWrites=0,fetches=0
 globalThis.fetch=async url=>{assert.equal(String(url),'https://openrouter.ai/api/v1/models');fetches++;return new Response(JSON.stringify({data:[...records,records[0]]}),{status:200,headers:{'Content-Type':'application/json'}})}
 const queryable={query:async(sql,values)=>{if(/insert into ai_model_catalogue/.test(sql))bulkWrites++;return db.query(sql,values)}}
 const ranked=await rankAllowedModels(queryable,config)
 assert.equal(bulkWrites,1,'A catalogue refresh must be one atomic database write, including duplicate provider IDs')
 assert.equal(fetches,1)
 assert.ok(ranked.length>0,'At least one reviewed model should remain usable')
 assert.ok(ranked.every(row=>config.allowedModels.includes(row.id)))
 assert.deepEqual(ranked.map(row=>row.id),config.allowedModels.filter(id=>ranked.some(row=>row.id===id)),'Configured priority must be preserved')
 assert.deepEqual((await db.query('select model_id,enabled,review_status,notes from ai_model_allowlist where model_id=any($1::text[]) order by model_id',[config.allowedModels])).rows,before,'Refresh must not alter reviewed model choices')
 const count=await db.query("select count(*)::int total from ai_model_catalogue where model_id=any($1::text[]) and fetched_at>now()-interval '1 minute'",[config.allowedModels]);assert.equal(count.rows[0].total,records.length)
 await rankAllowedModels(queryable,config);assert.equal(fetches,1,'Fresh metadata must not be refetched')
 const probe=ranked[0].id
 await db.query("insert into ai_model_health(model_id,healthy,updated_at) values($1,false,now()) on conflict(model_id) do update set healthy=false,updated_at=now()",[probe])
 assert.ok(!(await rankAllowedModels(queryable,config)).some(row=>row.id===probe),'Recently failed models must cool down')
 await db.query("update ai_model_health set updated_at=now()-interval '16 minutes' where model_id=$1",[probe])
 assert.ok((await rankAllowedModels(queryable,config)).some(row=>row.id===probe),'A transient provider failure must not disable an approved model permanently')
 console.log('Model catalogue refresh passed: atomic upsert, duplicate IDs, cache reuse, approved priority and bounded health cooldown. Transaction rolled back; no provider call or charge.')
}finally{globalThis.fetch=originalFetch;await db.query('rollback');await db.end()}
