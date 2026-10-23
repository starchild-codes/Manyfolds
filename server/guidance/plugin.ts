import {AccessError,assertStudentAccess,canGuide,assertAreaAccess} from '../access.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { attachDatabasePool, getDatabasePool, checkedDatabaseClient } from '../database.ts'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { authenticateRoadmapRequest, AuthenticationError } from '../ai/auth.ts'
import { createAiConfig } from '../ai/config.ts'
import {leadershipNoteRequest} from './leadershipNotes.ts'
import { handleSessionRequest } from './sessions.ts'
import { hasSessionOutcome,SessionError } from './sessionSchema.ts'
import {taskRequest,checkAssignee,checkTaskLinks} from './tasks.ts'
import {TaskError,validateTaskDetails} from './taskSchema.ts'
import {calendarRequest,checkStaffBooking} from './calendar.ts'

class GuidanceError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode=400) { super(message); this.statusCode=statusCode }
}
const reply=(res:ServerResponse,status:number,body:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
const readBody=async(req:IncomingMessage)=>{
  let raw=''
  for await(const chunk of req){raw+=chunk;if(raw.length>32_000)throw new GuidanceError('Activity is too large.',413)}
  try{const body:unknown=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body as Record<string,unknown>}
  catch{throw new GuidanceError('Activity must be valid JSON.')}
}
const validate=(body:Record<string,unknown>)=>{
  const kind=body.kind
  if(kind!=='session'&&kind!=='task')throw new GuidanceError('Choose a session or follow-up.')
  const title=typeof body.title==='string'?body.title.trim():''
  const studentKey=typeof body.studentKey==='string'?body.studentKey:''
  const summary=typeof body.summary==='string'?body.summary.trim():''
  const scheduledAt=typeof body.scheduledAt==='string'?new Date(body.scheduledAt):new Date(NaN)
  const status=body.status
  const statuses=kind==='session'?['scheduled','completed','cancelled']:['open','in_progress','blocked','awaiting_evidence','completed','cancelled']
  if(!title||title.length>200||!studentKey||studentKey.length>120||summary.length>5000||!Number.isFinite(scheduledAt.getTime())||!statuses.includes(String(status)))throw new GuidanceError('Provide a student, title, valid date and status. Summary must be under 5,000 characters.')
  return {kind,title,studentKey,summary,scheduledAt:scheduledAt.toISOString(),status}
}

export function guidanceApi(env:Record<string,string|undefined>,authenticate:typeof authenticateRoadmapRequest=authenticateRoadmapRequest):Plugin{
  const config=createAiConfig(env)
  const pool=getDatabasePool(config.databaseUrl)
  const readQuery=async(sql:string,values:unknown[])=>{
    try{return await pool.query(sql,values)}catch(error){
      if(!['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE'].includes((error as {code?:string}).code||'')&&!/connection terminated|ECONNRESET|ECONNREFUSED|timeout/i.test(error instanceof Error?error.message:''))throw error
      try{return await pool.query(sql,values)}catch{throw new GuidanceError('Guidance data is temporarily unavailable. Try reloading.',503)}
    }
  }
  const mount=(server:ViteDevServer|PreviewServer)=>{
    server.middlewares.use('/api/guidance',async(req,res)=>{
      try{
        const auth=await authenticate(req,pool,config,'guidance')
        const url=new URL(req.url||'/','http://localhost')
        const id=url.searchParams.get('id')
        assertAreaAccess(auth,'guidance',url.pathname,req.method||'GET')
        if(await calendarRequest(req,res,pool,auth,url))return
        if(await taskRequest(req,res,pool,auth,url))return
        if(await leadershipNoteRequest(req,res,pool,auth,url))return
        if(await handleSessionRequest(req,res,pool,auth,url))return
        if(url.pathname!=='/')return reply(res,404,{error:'Guidance endpoint not found.'})
        const present=(row:Record<string,unknown>)=>({...row,mine:row.assigned_to===auth.userId})
        if(req.method==='GET'){
          const result=await readQuery(`select a.*,s.payload->>'name' student_name,s.payload->>'grade' student_grade
            from guidance_activities a join student_registry_records s on s.organisation_id=a.organisation_id and s.external_key=a.student_key
            where a.organisation_id=$1 and public.school_can_access_student(a.organisation_id,a.student_key,$2) order by a.scheduled_at,a.id`,[auth.organisationId,auth.userId])
          return reply(res,200,{activities:result.rows.filter(row=>auth.role!=='teacher'||row.kind==='task'&&row.task_details?.classroomVisible===true).map(row=>auth.role==='teacher'?{id:row.id,student_key:row.student_key,student_name:row.student_name,student_grade:row.student_grade,kind:row.kind,title:row.title,status:row.status,scheduled_at:row.scheduled_at,mine:row.assigned_to===auth.userId}:present(row))})
        }
        if(!canGuide(auth.role))throw new GuidanceError('Your role can view activities but cannot change them.',403)
        if(req.method!=='POST'&&req.method!=='PATCH')return reply(res,405,{error:'Method not allowed.'})
        const body=await readBody(req)
        if(req.method==='PATCH'&&(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!Number.isSafeInteger(body.version)||Number(body.version)<1))throw new GuidanceError('A matching activity version is required.')
        const record=validate(body)
        await assertStudentAccess(pool,auth,record.studentKey)
        const student=await readQuery('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null',[auth.organisationId,record.studentKey])
        if(!student.rowCount)throw new GuidanceError('This student is unavailable in your school.',404)
        const db=await checkedDatabaseClient(pool)
        try{
        await db.query('begin')
        await db.query("select set_config('manyfolds.actor',$1,true)",[auth.userId])
        const lockedStudent=await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[auth.organisationId,record.studentKey])
        if(!lockedStudent.rowCount)throw new GuidanceError('This student is unavailable or archived.',404)
        const old=id?(await db.query('select assigned_to,task_details,duration_minutes from guidance_activities where organisation_id=$1 and id=$2 and student_key=$3 for update',[auth.organisationId,id,record.studentKey])).rows[0]:null
        const assigned=await checkAssignee(db,auth,record.studentKey,body.assignedTo??old?.assigned_to)
        const taskDetails=record.kind==='task'?validateTaskDetails(body.taskDetails??old?.task_details):{}
        const duration=body.durationMinutes??old?.duration_minutes??45
        if(!Number.isInteger(duration)||Number(duration)<5||Number(duration)>480)throw new GuidanceError('Session duration must be between 5 and 480 minutes.')
        if(record.kind==='task')await checkTaskLinks(db,auth,record.studentKey,id||String(body.requestId),validateTaskDetails(taskDetails),String(record.status))
        if(record.kind==='session'&&record.status==='scheduled')await checkStaffBooking(db,auth,assigned,record.scheduledAt,Number(duration),id||String(body.requestId))
        if(record.kind==='session'&&record.status==='completed'){
          const session=id?await db.query('select details from guidance_session_records where organisation_id=$1 and activity_id=$2',[auth.organisationId,id]):null
          const details=session?.rows[0]?.details
          if(!details?.attendees||!details?.reason||!hasSessionOutcome(details))throw new GuidanceError('Open the session record and save attendees, a reason and a recorded outcome before completing this session.')
        }
        let result
        if(req.method==='POST'){
          if(typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))throw new GuidanceError('A valid activity request ID is required.')
          result=await db.query(`insert into guidance_activities(id,organisation_id,student_key,kind,title,scheduled_at,status,summary,assigned_to,created_by,updated_by,task_details,duration_minutes,completed_at)
            values($9,$1,$2,$3,$4,$5,$6,$7,$10,$8,$8,$11,$12,case when $6='completed' then now() end) on conflict(id) do nothing returning *`,[auth.organisationId,record.studentKey,record.kind,record.title,record.scheduledAt,record.status,record.summary,auth.userId,body.requestId,assigned,taskDetails,duration])
          if(!result.rowCount){
            result=await readQuery(`select * from guidance_activities where id=$1 and organisation_id=$2 and created_by=$3
              and student_key=$4 and kind=$5 and title=$6 and scheduled_at=$7 and status=$8 and summary=$9 and assigned_to=$10 and task_details=$11::jsonb and duration_minutes=$12`,[body.requestId,auth.organisationId,auth.userId,record.studentKey,record.kind,record.title,record.scheduledAt,record.status,record.summary,assigned,taskDetails,duration])
            if(!result.rowCount)throw new GuidanceError('This activity request was already used. Reload before scheduling again.',409)
          }
        }else{
          result=await db.query(`update guidance_activities set title=$4,scheduled_at=$5,status=$6,summary=$7,updated_by=$8,updated_at=now(),version=version+1,assigned_to=$11,task_details=$12,duration_minutes=$13,completed_at=case when $6='completed' then coalesce(completed_at,now()) else null end
            where organisation_id=$1 and id=$2 and version=$3 and student_key=$9 and kind=$10 returning *`,[auth.organisationId,id,body.version,record.title,record.scheduledAt,record.status,record.summary,auth.userId,record.studentKey,record.kind,assigned,taskDetails,duration])
          if(!result.rowCount)throw new GuidanceError('This activity changed elsewhere. Reload before saving again.',409)
        }
        await db.query('commit')
        return reply(res,req.method==='POST'?201:200,{activity:present(result.rows[0])})
        }catch(error){await db.query('rollback').catch(()=>{});throw error}finally{db.release()}
      }catch(error){const known=error instanceof TaskError||error instanceof GuidanceError||error instanceof AccessError || error instanceof AuthenticationError||error instanceof SessionError;const transient=['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE'].includes((error as {code?:string}).code||'')||/connection terminated|connection timeout/i.test(error instanceof Error?error.message:'');if(!known)console.error('Guidance request failure code:',(error as {code?:string}).code||'unknown');return reply(res,known?error.statusCode:transient?503:500,{error:known?error.message:'Could not confirm the save. Reload activities before retrying.',retryable:transient})}
    })
    attachDatabasePool(pool,server.httpServer)
  }
  return {name:'manyfolds-guidance-api',configureServer:mount,configurePreviewServer:mount}
}
