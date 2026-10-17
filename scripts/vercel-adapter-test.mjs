import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { loadEnv } from 'vite'
Object.assign(process.env,loadEnv('development',process.cwd(),''))
const {default:handler}=await import('../api/index.ts')
const server=createServer(handler)
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
try{
 const base=`http://127.0.0.1:${server.address().port}`
 for(const path of ['students','operations/profile','student-documents','guidance','ai-roadmaps/latest']){const response=await fetch(`${base}/api?__manyfolds_route=${path}&student=fixture`);assert.equal(response.status,401,path);assert.match(response.headers.get('content-type'),/application\/json/)}
 assert.equal((await fetch(base+'/api?__manyfolds_route=health')).status,200)
 assert.equal((await fetch(base+'/api?__manyfolds_route=health&cacheBust=1')).status,200)
 assert.equal((await fetch(base+'/api?__manyfolds_route=not-a-route')).status,404)
 assert.equal((await fetch(base+'/api?__manyfolds_route=../.env.local')).status,400)
 assert.equal((await fetch(base+'/api?__manyfolds_route=school/interventions',{method:'POST',headers:{Origin:'https://unrelated.example'}})).status,403)
 console.log('Vercel adapter passed: rewritten API paths, auth, health, unknown paths, invalid paths and cross-origin rejection.')
}finally{await new Promise(resolve=>server.close(resolve))}
