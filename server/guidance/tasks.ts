import {createHash} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool,PoolClient} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {assertStudentAccess,canCounsel,canGuide} from '../access.ts'
import {checkedDatabaseClient,readDatabase} from '../database.ts'
import {blankTask,TaskError,validateTaskDetails,type TaskDetails} from './taskSchema.ts'
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const send=(res:ServerResponse,body:unknown,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
async function input(req:IncomingMessage){let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>32000)throw new TaskError('Request is too large.',413)}try{const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v as Record<string,unknown>}catch{throw new TaskError('Provide a valid task request.')}}
export async function checkTaskLinks(db:Pool|PoolClient,auth:AuthContext,studentKey:string,id:string,details:TaskDetails,status:string){
 const rows=(await db.query("select id,status,task_details from guidance_activities where organisation_id=$1 and student_key=$2 and kind='task'",[auth.organisationId,studentKey])).rows
 const tasks=new Map(rows.map(row=>[row.id,row]))
 if(details.dependencies.some(dep=>!tasks.has(dep)&&dep!==id))throw new TaskError('Dependencies must be tasks for this student.')
 const seen=new Set<string>(),queue=[...details.dependencies]
 while(queue.length){const current=queue.pop()!;if(current===id)throw new TaskError('Task dependencies cannot form a cycle.');if(seen.has(current))continue;seen.add(current);const deps=tasks.get(current)?.task_details?.dependencies;if(Array.isArray(deps))queue.push(...deps)}
 if(status==='completed'&&details.dependencies.some(dep=>!['completed','cancelled'].includes(tasks.get(dep)?.status)))throw new TaskError('Complete prerequisite tasks before finishing this task.',409)
 if(details.documentIds.length){const docs=await db.query("select id from school_student_documents where organisation_id=$1 and student_key=$2 and id=any($3::uuid[]) and archived_at is null and ($4 or visibility='school_staff')",[auth.organisationId,studentKey,details.documentIds,canCounsel(auth.role)]);if(docs.rowCount!==details.documentIds.length)throw new TaskError('Choose available evidence documents for this student.')}
}
export async function checkAssignee(db:Pool|PoolClient,auth:AuthContext,key:string,value:unknown){
 const id=value===undefined?auth.userId:value;if(!uuid(id))throw new TaskError('Choose an active assigned staff member.')
 const staff=await db.query("select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,$3,user_id)",[auth.organisationId,id,key]);if(!staff.rowCount)throw new TaskError('Assign this student to the staff member before assigning their task or session.');return id
}
export async function taskRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(!['/task-meta','/task-comment','/session-action'].includes(url.pathname))return false
 if(!canGuide(auth.role))throw new TaskError('Task records are limited to assigned guidance staff.',403)
 const org=auth.organisationId
 if(url.pathname==='/task-meta'){
  if(req.method!=='GET')throw new TaskError('Method not allowed.',405)
  const key=url.searchParams.get('student')||'';await assertStudentAccess(pool,auth,key)
  const [staff,tasks,documents,comments]=await Promise.all([readDatabase(pool,"select m.user_id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email) name from organisation_memberships m join auth.users u on u.id=m.user_id where m.organisation_id=$1 and m.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(m.organisation_id,$2,m.user_id)",[org,key]),readDatabase(pool,"select id,title,status from guidance_activities where organisation_id=$1 and student_key=$2 and kind='task'",[org,key]),readDatabase(pool,"select id,filename from school_student_documents where organisation_id=$1 and student_key=$2 and archived_at is null and ($3 or visibility='school_staff')",[org,key,canCounsel(auth.role)]),readDatabase(pool,"select c.id,c.activity_id,c.body,c.created_at,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),'School staff') author from guidance_task_comments c join guidance_activities a on a.id=c.activity_id and a.organisation_id=c.organisation_id join auth.users u on u.id=c.author_id where c.organisation_id=$1 and a.student_key=$2 order by c.created_at",[org,key])]);send(res,{staff:staff.rows,tasks:tasks.rows,documents:documents.rows,comments:comments.rows});return true
 }
 const id=url.searchParams.get('id');if(!uuid(id))throw new TaskError('Choose a saved activity.')
 const source=await readDatabase(pool,'select a.*,r.details session_details,r.version session_version from guidance_activities a left join guidance_session_records r on r.activity_id=a.id and r.organisation_id=a.organisation_id where a.organisation_id=$1 and a.id=$2',[org,id]);const activity=source.rows[0];if(!activity)throw new TaskError('Activity unavailable.',404)
 await assertStudentAccess(pool,auth,activity.student_key)
 if(req.method!=='POST')throw new TaskError('Method not allowed.',405)
 const body=await input(req)
 if(url.pathname==='/task-comment'){
  if(activity.kind!=='task'||!uuid(body.id)||typeof body.body!=='string'||!body.body.trim()||body.body.length>3000)throw new TaskError('Write a comment for a saved task.')
  const db=await checkedDatabaseClient(pool)
  try{await db.query('begin');if(!(await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[org,activity.student_key])).rowCount)throw new TaskError('Restore this student before commenting.',409);await assertStudentAccess(db,auth,activity.student_key)
   const saved=await db.query('insert into guidance_task_comments(id,organisation_id,activity_id,author_id,body) values($1,$2,$3,$4,$5) on conflict(id) do nothing returning id',[body.id,org,id,auth.userId,body.body.trim()]);if(!saved.rowCount){const old=await db.query('select 1 from guidance_task_comments where id=$1 and organisation_id=$2 and activity_id=$3 and author_id=$4 and body=$5',[body.id,org,id,auth.userId,body.body.trim()]);if(!old.rowCount)throw new TaskError('Comment request already used.',409)}await db.query('commit');send(res,{ok:true});return true
  }catch(e){await db.query('rollback');throw e}finally{db.release()}
 }
 if(activity.kind!=='session'||!activity.session_details||body.expectedSessionVersion!==activity.session_version||!['studentActions','counsellorActions'].includes(String(body.field))||!Number.isInteger(body.lineIndex)||!uuid(body.requestId))throw new TaskError('Save the current session record before creating a follow-up.',409)
 const lines=String(activity.session_details[String(body.field)]||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean),action=lines[Number(body.lineIndex)],date=new Date(String(body.scheduledAt||''))
 const title=typeof body.title==='string'?body.title.trim():'';if(!action||!title||title.length>200||!Number.isFinite(date.getTime()))throw new TaskError('Review the action title and choose a valid due date.')
 const hash=createHash('sha256').update(`${body.field}:${action}`).digest('hex'),db=await checkedDatabaseClient(pool)
 try{await db.query('begin');const student=await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[org,activity.student_key]);if(!student.rowCount)throw new TaskError('Restore this student before creating follow-ups.',409)
  const savedSource=await db.query('select version from guidance_session_records where organisation_id=$1 and activity_id=$2 for share',[org,id]);if(savedSource.rows[0]?.version!==body.expectedSessionVersion)throw new TaskError('The session changed. Reload it before creating follow-ups.',409)
  const assigned=await checkAssignee(db,auth,activity.student_key,body.assignedTo),details={...blankTask(),responsibleParty:body.field==='studentActions'?'Student (offline follow-up)':'Counsellor'}
  const result=await db.query("insert into guidance_activities(id,organisation_id,student_key,kind,title,scheduled_at,status,summary,assigned_to,created_by,updated_by,task_details,source_session_id,source_action_key) values($1,$2,$3,'task',$4,$5,'open',$6,$7,$8,$8,$9,$10,$11) on conflict do nothing returning id",[body.requestId,org,activity.student_key,title,date.toISOString(),action,assigned,auth.userId,validateTaskDetails(details),id,hash])
  const existing=result.rowCount?result:await db.query('select id from guidance_activities where organisation_id=$1 and source_session_id=$2 and source_action_key=$3',[org,id,hash]);if(!existing.rowCount)throw new TaskError('This request ID was already used.',409)
  if(result.rowCount)await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'session.action_followup_created',$2,$3,$4)",[org,auth.userId,activity.student_key,{sessionId:id,taskId:existing.rows[0].id}]);await db.query('commit');send(res,{id:existing.rows[0].id,reused:!result.rowCount});return true
 }catch(error){await db.query('rollback');throw error}finally{db.release()}
}
