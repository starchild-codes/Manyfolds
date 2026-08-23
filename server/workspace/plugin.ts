import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import type { Plugin } from 'vite'
import { createAiConfig } from '../ai/config.ts'

const respond = (res: ServerResponse, status: number, body: unknown) => { res.statusCode=status; res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(body)) }
const read = async (req: IncomingMessage) => { let body=''; for await (const chunk of req) body+=chunk; return JSON.parse(body||'{}') as Record<string, unknown> }

export function workspaceApi(env: Record<string, string | undefined>): Plugin {
  const config=createAiConfig(env)
  const pool=new Pool({connectionString:config.databaseUrl,ssl:{rejectUnauthorized:false},max:2,allowExitOnIdle:true})
  const auth=async(req:IncomingMessage)=>{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'').trim()
    if(!token||!config.supabaseUrl||!config.supabaseAnonKey) throw Object.assign(new Error('Please sign in to continue.'),{status:401})
    const client=createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
    const {data,error}=await client.auth.getUser(token)
    if(error||!data.user) throw Object.assign(new Error('Your session has expired. Please sign in again.'),{status:401})
    return data.user
  }
  const context=async(userId:string)=>{
    const result=await pool.query(`select m.organisation_id::text,m.role,o.name,o.school_type,o.city,o.state,o.country,o.approximate_student_count from organisation_memberships m join organisations o on o.id=m.organisation_id where m.user_id=$1 and m.active order by m.created_at`,[userId])
    return result.rows
  }
  return {name:'manyfolds-workspace-api',configureServer(server){server.middlewares.use('/api/workspace',async(req,res)=>{try{
    const user=await auth(req); const memberships=await context(user.id)
    if(req.method==='GET') return respond(res,200,{memberships})
    if(req.method==='POST' && (req.url||'').startsWith('/onboarding')) {
      if(memberships.length) {
        const current=memberships[0]
        if(current.school_type&&current.city&&current.state) return respond(res,200,{workspace:current,created:false})
        await pool.query('update organisations set name=$1,school_type=$2,city=$3,state=$4,country=$5,approximate_student_count=$6,updated_at=now() where id=$7',[name,schoolType,city,state,country,estimate,current.organisation_id])
        return respond(res,200,{workspace:(await context(user.id))[0],created:false})
      }
      const body=await read(req); const name=String(body.name||'').trim(), schoolType=String(body.schoolType||'').trim(), city=String(body.city||'').trim(), state=String(body.state||'').trim(), country=String(body.country||'India').trim(); const estimate=Number(body.approximateStudentCount)||null
      const classes=Array.isArray(body.classes)?body.classes:[]
      if(!name||!schoolType||!city||!state||!classes.length) return respond(res,400,{error:'Complete your school details and add at least one class.'})
      const db=await pool.connect(); try { await db.query('begin'); const existing=await db.query('select organisation_id::text,role from organisation_memberships where user_id=$1 and active limit 1',[user.id]); if(existing.rowCount){await db.query('commit');return respond(res,200,{workspace:(await context(user.id))[0],created:false})}
        const slug=`school-${user.id.replaceAll('-','')}`; const organisation=await db.query(`insert into organisations(name,slug,school_type,city,state,country,approximate_student_count,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id::text,name,school_type,city,state,country,approximate_student_count`,[name,slug,schoolType,city,state,country,estimate,user.id]); const workspace=organisation.rows[0]
        await db.query(`insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner')`,[workspace.id,user.id])
        for(const entry of classes as Array<{name?:unknown;sections?:unknown}>){const className=String(entry.name||'').trim();if(!className)continue;const created=await db.query('insert into school_classes(organisation_id,class_name) values($1,$2) returning id',[workspace.id,className]);for(const section of Array.isArray(entry.sections)?entry.sections:[]){const label=String(section).trim();if(label)await db.query('insert into school_sections(organisation_id,class_id,section_name) values($1,$2,$3)',[workspace.id,created.rows[0].id,label])}}
        await db.query('commit');return respond(res,201,{workspace:{organisation_id:workspace.id,role:'owner',...workspace},created:true})
      } catch(error){await db.query('rollback');throw error} finally {db.release()}
    }
    return respond(res,404,{error:'Workspace endpoint not found.'})
  }catch(error){return respond(res,(error as {status?:number}).status||500,{error:error instanceof Error?error.message:'Workspace request failed.'})}});server.httpServer?.once('close',()=>void pool.end())}}
}
