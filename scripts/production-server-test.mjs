import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { createProductionServer } from '../server/production.ts'
const env={...loadEnv('development',process.cwd(),''),...process.env}
const server=createProductionServer(env)
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
try{
 const request=async(path,init)=>{const res=await fetch(origin+path,init);return {status:res.status,headers:res.headers,text:await res.text()}}
 for(const path of ['/','/dashboard','/auth/callback',`/invite/${'a'.repeat(64)}`]){const res=await request(path);assert.equal(res.status,200);assert.match(res.text,/<div id="root">/);assert.match(res.headers.get('content-type'),/text\/html/)}
 for(const path of ['/api/students','/api/workspace','/api/guidance','/api/school/reports','/api/operations/configuration','/api/operations/profile?student=test','/api/student-documents/?student=test','/api/ai-roadmaps/latest','/api/ai-roadmaps/research','/api/counsellor-records?type=course']){const res=await request(path);assert.equal(res.status,401,path);assert.match(res.headers.get('content-type'),/application\/json/)}
 const knowledge=await request('/api/knowledge?type=Course');assert.equal(knowledge.status,200);assert.ok(Array.isArray(JSON.parse(knowledge.text).records))
 assert.equal((await request('/api/not-a-route')).status,404)
 assert.equal((await request('/.env.local')).status,404)
 assert.equal((await request('/%2eenv.local')).status,404)
 assert.equal((await request('/server/ai/config.ts')).status,404)
 assert.equal((await request('/assets/missing.js')).status,404)
 assert.equal((await request('/api/school/interventions',{method:'POST',headers:{Origin:'https://another-site.example'}})).status,403)
 assert.equal((await request('/api/health')).status,200)
 const index=await readFile('dist/index.html','utf8'),asset=index.match(/src="([^"]+\.js)"/)[1];const script=await request(asset);assert.equal(script.status,200);assert.match(script.headers.get('cache-control'),/immutable/)
 for(const key of ['DATABASE_URL','OPENROUTER_API_KEY','DOCUMENT_SIGNING_SECRET'])if(env[key])assert.ok(!script.text.includes(env[key]),`${key} must not appear in public bundle`)
 console.log('Production HTTP smoke passed: SPA/auth/invite routes, all protected APIs, verified catalogue, database readiness, static assets, API 404s, cross-origin write rejection, private-file denial and secret-free public bundle.')
}finally{await new Promise(resolve=>server.close(resolve))}
