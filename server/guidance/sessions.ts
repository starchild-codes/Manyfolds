import {assertStudentAccess,canGuide,canCounsel} from '../access.ts'
import type { IncomingMessage,ServerResponse } from 'node:http'
import type { Pool } from 'pg'
import type { AuthContext } from '../ai/types.ts'
import { checkedDatabaseClient,readDatabase } from '../database.ts'
import { blankSession,hasSessionOutcome,SessionError,validateSession } from './sessionSchema.ts'
import {checkAssignee} from './tasks.ts'
import {checkStaffBooking} from './calendar.ts'

const send=(res:ServerResponse,status:number,body:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
const version=(value:unknown)=>{if(!Number.isSafeInteger(value)||Number(value)<0)throw new SessionError('Reload the current record before saving.');return Number(value)}
const bodyOf=async(req:IncomingMessage)=>{let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>100_000)throw new SessionError('Session record is too large.',413)}try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value as Record<string,unknown>}catch{throw new SessionError('Provide a valid session record.')}}
export async function handleSessionRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL):Promise<boolean>{
 if(!['/session','/session-note','/briefing','/session-export'].includes(url.pathname))return false
 if(!canGuide(auth.role))throw new SessionError('Only counselling staff can open session records.',403)
 const org=auth.organisationId,id=url.searchParams.get('id')||''
 if(url.pathname==='/briefing'){
  if(req.method!=='GET')throw new SessionError('Method not allowed.',405)
  const key=url.searchParams.get('student')||''
  await assertStudentAccess(pool,auth,key)
  const student=await readDatabase(pool,'select payload,archived_at from student_registry_records where organisation_id=$1 and external_key=$2',[org,key]);if(!student.rowCount)throw new SessionError('Student is unavailable in your school.',404)
  const [profile,previous,actions,pathway,staff]=await Promise.all([
   readDatabase(pool,'select details,updated_at from student_guidance_profiles where organisation_id=$1 and student_key=$2',[org,key]),
   readDatabase(pool,`select a.title,a.scheduled_at,a.summary,r.details from guidance_activities a left join guidance_session_records r on r.organisation_id=a.organisation_id and r.activity_id=a.id where a.organisation_id=$1 and a.student_key=$2 and a.kind='session' and a.status='completed' and a.id::text<>$3 order by a.scheduled_at desc limit 1`,[org,key,id]),
   readDatabase(pool,`select id,title,scheduled_at,kind from guidance_activities where organisation_id=$1 and student_key=$2 and status not in('completed','cancelled') and id::text<>$3 order by scheduled_at limit 50`,[org,key,id]),
   readDatabase(pool,'select status,updated_at from roadmap_generations where organisation_id=$1 and student_external_id=$2 order by generated_at desc limit 1',[org,key]),
   readDatabase(pool,`select m.user_id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'full_name',''),u.email) name from organisation_memberships m join auth.users u on u.id=m.user_id where m.organisation_id=$1 and m.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(m.organisation_id,$2,m.user_id) order by name`,[org,key])
  ])
  send(res,200,{student:student.rows[0],profile:profile.rows[0]||null,previous:previous.rows[0]||null,actions:actions.rows,pathway:pathway.rows[0]||null,staff:staff.rows,generatedAt:new Date().toISOString()});return true
 }
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new SessionError('Choose a saved session.')
 const activity=await readDatabase(pool,`select a.*,s.archived_at,s.payload->>'name' student_name,o.name school_name from guidance_activities a join student_registry_records s on s.organisation_id=a.organisation_id and s.external_key=a.student_key join organisations o on o.id=a.organisation_id where a.organisation_id=$1 and a.id=$2 and a.kind='session'`,[org,id]);if(!activity.rowCount)throw new SessionError('Session is unavailable in your school.',404)
 await assertStudentAccess(pool,auth,activity.rows[0].student_key)
 if(!canCounsel(auth.role)&&(url.pathname==='/session-note'||url.searchParams.get('variant')==='internal'))throw new SessionError('Author-private notes are restricted to counselling staff.',403)
 if(req.method==='GET'){
  const result=await readDatabase(pool,'select details,version,updated_at from guidance_session_records where organisation_id=$1 and activity_id=$2',[org,id])
  if(url.pathname==='/session-export'){
   const variant=url.searchParams.get('variant'),record=result.rows[0];if(!record)throw new SessionError('Save the session record before exporting.',409)
   const details=record.details
   let document
   if(variant==='guardian'){if(!details.summaryApproved||!details.shareableSummary)throw new SessionError('Approve a separate shareable summary before exporting.',409);document={title:details.sessionType==='Parent meeting'?'Parent meeting summary':'Session summary',summary:details.shareableSummary}}
   else if(variant==='actions')document={title:'Student action sheet',studentActions:details.studentActions,followUpDate:details.followUpDate}
   else if(variant==='internal'){
    const ownNote=await readDatabase(pool,'select body from guidance_session_private_notes where organisation_id=$1 and activity_id=$2 and author_id=$3',[org,id,auth.userId]);document={title:'Internal case note - confidential',details,privateNote:ownNote.rows[0]?.body||''}
   }else throw new SessionError('Choose a supported document.')
   await readDatabase(pool,"insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'export.session',$2,$3,$4)",[org,auth.userId,activity.rows[0].student_key,JSON.stringify({variant})])
   send(res,200,{document,studentName:activity.rows[0].student_name,schoolName:activity.rows[0].school_name,sessionDate:activity.rows[0].scheduled_at,generatedAt:new Date().toISOString()});return true
  }
  const note=canCounsel(auth.role)?await readDatabase(pool,'select body,version,updated_at from guidance_session_private_notes where organisation_id=$1 and activity_id=$2 and author_id=$3',[org,id,auth.userId]):{rows:[]}
  send(res,200,{canPrivate:canCounsel(auth.role),activity:{...activity.rows[0],mine:activity.rows[0].assigned_to===auth.userId},record:result.rows[0]||{details:blankSession(),version:0},note:note.rows[0]||{body:'',version:0}});return true
 }
 if(req.method!=='PUT'||url.pathname==='/session-export')throw new SessionError('Method not allowed.',405)
 const input=await bodyOf(req),expected=version(input.version)
 const db=await checkedDatabaseClient(pool)
 try{
  await db.query('begin');await db.query("select set_config('manyfolds.actor',$1,true)",[auth.userId])
  const student=await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[org,activity.rows[0].student_key]);if(!student.rowCount)throw new SessionError('Restore the archived student before editing sessions.',409)
  let saved
  if(url.pathname==='/session-note'){
   if(typeof input.body!=='string'||input.body.length>20000)throw new SessionError('Private notes must be at most 20,000 characters.')
   saved=expected===0?await db.query('insert into guidance_session_private_notes(organisation_id,activity_id,author_id,body) values($1,$2,$3,$4) on conflict do nothing returning body,version,updated_at',[org,id,auth.userId,input.body]):await db.query('update guidance_session_private_notes set body=$4,version=version+1,updated_at=now() where organisation_id=$1 and activity_id=$2 and author_id=$3 and version=$5 returning body,version,updated_at',[org,id,auth.userId,input.body,expected])
  }else{
   const details=validateSession(input.details),activityVersion=version(input.activityVersion)
   if(input.status!=='scheduled'&&input.status!=='completed'&&input.status!=='cancelled')throw new SessionError('Choose a session status.')
   if(input.status==='completed'&&(!details.reason||!details.attendees||!hasSessionOutcome(details)))throw new SessionError('To complete this session, record attendees, a reason and at least one action, pathway update, resource, decision, referral or closure reason. A follow-up date alone does not schedule another session.')
   if(typeof input.assignedTo!=='string')throw new SessionError('Choose an active staff member.')
   await checkAssignee(db,auth,activity.rows[0].student_key,input.assignedTo)
   if(input.status==='scheduled')await checkStaffBooking(db,auth,input.assignedTo,activity.rows[0].scheduled_at.toISOString(),activity.rows[0].duration_minutes,id)
   const updated=await db.query('update guidance_activities set status=$4,assigned_to=$5,updated_by=$6,updated_at=now(),version=version+1 where organisation_id=$1 and id=$2 and version=$3 returning *',[org,id,activityVersion,input.status,input.assignedTo,auth.userId]);if(!updated.rowCount)throw new SessionError('The session changed elsewhere. Reload before saving.',409)
   saved=expected===0?await db.query('insert into guidance_session_records(organisation_id,activity_id,details,updated_by) values($1,$2,$3,$4) on conflict do nothing returning details,version,updated_at',[org,id,details,auth.userId]):await db.query('update guidance_session_records set details=$3,updated_by=$4,version=version+1,updated_at=now() where organisation_id=$1 and activity_id=$2 and version=$5 returning details,version,updated_at',[org,id,details,auth.userId,expected])
   if(!saved.rowCount)throw new SessionError('The session record changed elsewhere. Reload before saving.',409)
   await db.query('commit');send(res,200,{record:saved.rows[0],activity:{...updated.rows[0],mine:updated.rows[0].assigned_to===auth.userId}});return true
  }
  if(!saved.rowCount)throw new SessionError('Your private note changed elsewhere. Reload before saving.',409)
  await db.query('commit');send(res,200,{note:saved.rows[0]});return true
 }catch(error){await db.query('rollback');throw error}finally{db.release()}
}
