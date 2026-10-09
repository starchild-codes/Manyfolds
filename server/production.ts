import connect from 'connect'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { PreviewServer } from 'vite'
import { workspaceApi } from './workspace/plugin.ts'
import { studentsApi } from './students/plugin.ts'
import { guidanceApi } from './guidance/plugin.ts'
import { schoolOperationsApi } from './school/operations.ts'
import { schoolApi } from './school/plugin.ts'
import { aiRoadmapApi } from './ai/plugin.ts'
import { knowledgeApi, counsellorApi } from './catalogue.ts'
import { getDatabasePool } from './database.ts'

export function createProductionServer(env:Record<string,string|undefined>,root=resolve('dist')){
 for(const key of ['DATABASE_URL','SUPABASE_URL'])if(!env[key])throw new Error(`${key} is required to start Manyfolds.`)
 if(!env.SUPABASE_ANON_KEY&&!env.PUBLISHABLE_KEY)throw new Error('A Supabase public authentication key is required.')
 const app=connect(),httpServer=createServer(app)
 app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');if(req.method!=='GET'&&req.method!=='HEAD'){const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`){res.statusCode=403;res.end(JSON.stringify({error:'Cross-origin changes are not allowed.'}));return}}next()})
 app.use('/api/health',async(req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');if(req.url!=='/'||req.method!=='GET'){res.statusCode=404;res.end(JSON.stringify({error:'Endpoint not found.'}));return}try{await getDatabasePool(env.DATABASE_URL!).query('select 1');res.end(JSON.stringify({status:'ready'}))}catch{res.statusCode=503;res.end(JSON.stringify({status:'unavailable'}))}})
 // Reuse the API middleware mounted by development and preview. No Vite runtime is loaded.
 const surface={middlewares:app,httpServer} as unknown as PreviewServer
 for(const plugin of [workspaceApi(env),studentsApi(env),guidanceApi(env),schoolApi(env),schoolOperationsApi(env),aiRoadmapApi(env),knowledgeApi(env),counsellorApi(env)]){
  const hook=plugin.configurePreviewServer
  if(typeof hook==='function')void hook.call({} as never,surface)
 }
 app.use('/api',(_req,res)=>{res.statusCode=404;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'API endpoint not found.'}))})
 app.use(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.end('Method not allowed');return}
  try{
   const pathname=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname)
   if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(part=>part.startsWith('.'))){res.statusCode=404;res.end('Not found');return}
   let file=resolve(root,`.${pathname}`)
   if(file!==root&&!file.startsWith(root+sep)){res.statusCode=404;res.end('Not found');return}
   let info=await stat(file).catch(()=>null)
   if(!info?.isFile()){
    if(extname(pathname)){res.statusCode=404;res.end('Not found');return}
    file=resolve(root,'index.html');info=await stat(file)
   }
   const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2'}
   res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream')
   res.setHeader('Cache-Control',pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache')
   res.setHeader('Content-Length',info.size)
   res.end(req.method==='HEAD'?undefined:await readFile(file))
  }catch{res.statusCode=404;res.end('Not found')}
 })
 httpServer.requestTimeout=120000
 httpServer.headersTimeout=15000
 return httpServer
}
