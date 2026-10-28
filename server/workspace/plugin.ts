import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { attachDatabasePool, getDatabasePool, readDatabase, checkedDatabaseClient } from '../database.ts'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { createAiConfig } from '../ai/config.ts'
import {validateSchoolSetup} from './onboarding.ts'
import {platformRequest} from './platform.ts'

const respond = (res: ServerResponse, status: number, body: unknown) => { res.statusCode=status; res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(body)) }
const read = async (req: IncomingMessage) => { let body=''; for await (const chunk of req) {body+=chunk;if(body.length>64_000)throw Object.assign(new Error('School setup is too large.'),{status:413})} try{return JSON.parse(body||'{}') as unknown}catch{throw Object.assign(new Error('School setup must be valid JSON.'),{status:400})} }

export function workspaceApi(env: Record<string, string | undefined>, authenticate?: (req:IncomingMessage)=>Promise<{id:string}>): Plugin {
  const config=createAiConfig(env)
  const curatorIds=new Set((env.MANYFOLDS_CATALOGUE_CURATOR_IDS||'').split(',').map(id=>id.trim()).filter(Boolean))
  const platformIds=new Set((env.MANYFOLDS_PLATFORM_ADMIN_IDS||'').split(',').map(id=>id.trim()).filter(Boolean))
  const pool=getDatabasePool(config.databaseUrl)
  const auth=async(req:IncomingMessage)=>{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'').trim()
    if(!token||!config.supabaseUrl||!config.supabaseAnonKey) throw Object.assign(new Error('Please sign in to continue.'),{status:401})
    const client=createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
    const {data,error}=await client.auth.getUser(token)
    if(error||!data.user) throw Object.assign(new Error('Your session has expired. Please sign in again.'),{status:401})
    return data.user
  }
  const context=async(userId:string)=>{
    const result=await readDatabase(pool,`select m.organisation_id::text,m.role,o.active,o.name,o.school_type,o.city,o.state,o.country,o.approximate_student_count from organisation_memberships m join organisations o on o.id=m.organisation_id where m.user_id=$1 and m.active order by m.created_at`,[userId])
    for (const workspace of result.rows) {
      workspace.canManageCatalogue=curatorIds.has(userId)&&['owner','admin'].includes(workspace.role)
      workspace.canManagePlatform=platformIds.has(userId)
      const classes=await readDatabase(pool,`select c.class_name,coalesce(array_agg(s.section_name order by s.section_name) filter(where s.id is not null),'{}') sections from school_classes c left join school_sections s on s.class_id=c.id where c.organisation_id=$1 group by c.id,c.class_name order by c.class_name`,[workspace.organisation_id])
      workspace.classes=classes.rows
    }
    return result.rows
  }
  const mount = (server: ViteDevServer | PreviewServer) => {server.middlewares.use('/api/workspace',async(req,res)=>{try{
    const user=await (authenticate||auth)(req)
    if(await platformRequest(req,res,pool,user.id,platformIds))return
    const memberships=await context(user.id)
    if(req.method==='GET'&&new URL(req.url||'/','http://localhost').pathname==='/') return respond(res,200,{memberships})
    if(req.method==='POST' && new URL(req.url||'/','http://localhost').pathname==='/onboarding') {
      if(memberships.some(m=>m.active===false))return respond(res,403,{error:'School access is suspended. Contact your platform operator.'})
      const {name,schoolType,city,state,country,estimate,classes,settings}=validateSchoolSetup(await read(req))
      const db=await checkedDatabaseClient(pool)
      try {
        await db.query('begin')
        await db.query('select pg_advisory_xact_lock(hashtext($1))',[user.id])
        const existing=await db.query('select m.organisation_id::text,m.role,o.active,o.school_type,o.city,o.state from organisation_memberships m join organisations o on o.id=m.organisation_id where m.user_id=$1 and m.active order by m.created_at for update of m,o',[user.id])
        let organisationId:string,created=false
        if(existing.rowCount){
          const current=existing.rows[0]
          if(!current.active){await db.query('rollback');return respond(res,403,{error:'School access is suspended.'})}
          const configured=await db.query('select 1 from school_classes where organisation_id=$1 limit 1',[current.organisation_id])
          if(current.school_type&&current.city&&current.state&&configured.rowCount){await db.query('commit');return respond(res,200,{workspace:(await context(user.id))[0],created:false})}
          if(!['owner','admin'].includes(current.role)){await db.query('rollback');return respond(res,403,{error:'Only a school owner or admin can complete organisation setup.'})}
          organisationId=current.organisation_id
          await db.query('update organisations set name=$1,school_type=$2,city=$3,state=$4,country=$5,approximate_student_count=$6,updated_at=now() where id=$7',[name,schoolType,city,state,country,estimate,organisationId])
        }else{
          const organisation=await db.query('insert into organisations(name,slug,school_type,city,state,country,approximate_student_count,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id::text',[name,'school-'+user.id.replaceAll('-',''),schoolType,city,state,country,estimate,user.id])
          organisationId=organisation.rows[0].id;created=true
          await db.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner')",[organisationId,user.id])
        }
        for(const entry of classes){
          const result=await db.query('insert into school_classes(organisation_id,class_name) values($1,$2) on conflict(organisation_id,class_name) do update set class_name=excluded.class_name returning id',[organisationId,entry.name])
          for(const section of entry.sections)await db.query('insert into school_sections(organisation_id,class_id,section_name) values($1,$2,$3) on conflict(class_id,section_name) do nothing',[organisationId,result.rows[0].id,section])
        }
        await db.query('insert into school_configuration(organisation_id,settings,updated_by) values($1,$2,$3) on conflict(organisation_id) do update set settings=school_configuration.settings||excluded.settings,version=school_configuration.version+1,updated_by=excluded.updated_by,updated_at=now()',[organisationId,settings,user.id])
        await db.query('commit')
        return respond(res,created?201:200,{workspace:(await context(user.id))[0],created})
      }catch(error){await db.query('rollback');throw error}finally{db.release()}
    }
    return respond(res,404,{error:'Workspace endpoint not found.'})
  }catch(error){const status=(error as {status?:number}).status||(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE'].includes((error as {code?:string}).code||'')?503:500);return respond(res,status,{error:status<500&&error instanceof Error?error.message:'Your school workspace could not be loaded. Please try again.'})}});attachDatabasePool(pool,server.httpServer)}
  return {name:'manyfolds-workspace-api',configureServer:mount,configurePreviewServer:mount}
}
