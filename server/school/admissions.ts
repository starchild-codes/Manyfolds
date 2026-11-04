import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import {randomUUID} from 'node:crypto'
import type {AuthContext} from '../ai/types.ts'
import {AccessError,assertStudentAccess,canGuide,canCounsel} from '../access.ts'
import {checkedDatabaseClient,readDatabase} from '../database.ts'
import {blankTask} from '../guidance/taskSchema.ts'
import {AdmissionsError,admissionUuid,validateAdmission,validateAdmissionTransition,admissionStatusLabels,type AdmissionPayload} from './admissionsSchema.ts'
const send=(res:ServerResponse,data:unknown)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}
async function input(req:IncomingMessage){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>60000)throw new AdmissionsError('Use a smaller application record.',413)}try{const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b as Record<string,unknown>}catch{throw new AdmissionsError('Provide a valid application request.')}}
export async function admissionsRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(!['/admissions','/admissions-history','/admissions-followup','/admissions-export','/admissions-sources'].includes(url.pathname))return false
 if(!canGuide(auth.role))throw new AccessError('Admissions are limited to authorised guidance staff.',403)
 const org=auth.organisationId,user=auth.userId,key=url.searchParams.get('student')||''
 if(url.pathname==='/admissions-sources'){
  if(req.method!=='GET')throw new AdmissionsError('Method not allowed.',405)
  send(res,{records:(await readDatabase(pool,"select id,title,publisher,category,source_url,checked_at from ug_admission_sources where enabled and review_after>=(now() at time zone 'Asia/Kolkata')::date and checked_at>now()-interval '14 days' order by category,title")).rows});return true
 }
 if(key)await assertStudentAccess(pool,auth,key)
 if(url.pathname==='/admissions'&&req.method==='GET'){
  const records=await readDatabase(pool,`select a.id,a.student_key,a.payload,a.version,a.updated_at,s.payload->>'name' student_name,s.payload->>'grade' grade from school_ug_applications a join student_registry_records s on s.organisation_id=a.organisation_id and s.external_key=a.student_key where a.organisation_id=$1 and ($3='' or a.student_key=$3) and s.archived_at is null and public.school_can_access_student(a.organisation_id,a.student_key,$2) order by a.updated_at desc limit 2001`,[org,user,key])
  if(records.rows.length>2000)throw new AdmissionsError('Choose a student to load a smaller admissions list.',413)
  const staff=key?(await readDatabase(pool,"select m.user_id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email) name from organisation_memberships m join auth.users u on u.id=m.user_id where m.organisation_id=$1 and m.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(m.organisation_id,$2,m.user_id) order by name",[org,key])).rows:[]
  const documents=key?(await readDatabase(pool,"select id,filename from school_student_documents where organisation_id=$1 and student_key=$2 and archived_at is null and ($3 or visibility='school_staff')",[org,key,canCounsel(auth.role)])).rows:[]
  send(res,{records:records.rows,staff,documents,currentUserId:user,canApprove:canCounsel(auth.role)});return true
 }
 if(!key)throw new AdmissionsError('Choose a student.')
 if(url.pathname==='/admissions-history'){
  if(req.method!=='GET'||!admissionUuid(url.searchParams.get('id')))throw new AdmissionsError('Choose a saved application.')
  send(res,{records:(await readDatabase(pool,'select version,payload,recorded_at from school_ug_application_history where organisation_id=$1 and student_key=$2 and application_id=$3 order by version desc limit 100',[org,key,url.searchParams.get('id')])).rows});return true
 }
 if(!['PUT','POST'].includes(req.method||''))throw new AdmissionsError('Method not allowed.',405)
 const body=await input(req)
 if(!admissionUuid(body.id)||!Number.isSafeInteger(body.version)||Number(body.version)<0)throw new AdmissionsError('Choose an application and its current version.')
 const db=await checkedDatabaseClient(pool)
 try{
  await db.query('begin')
  if(!(await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[org,key])).rowCount)throw new AdmissionsError('Restore this student before changing or exporting applications.',409)
  await assertStudentAccess(db,auth,key)
  const prior=(await db.query('select * from school_ug_applications where organisation_id=$1 and student_key=$2 and id=$3 for update',[org,key,body.id])).rows[0]
  if(url.pathname==='/admissions-export'){
   if(req.method!=='POST'||!prior)throw new AdmissionsError('Application unavailable.',404)
   if(prior.version!==body.version)throw new AdmissionsError('Reload the current application before exporting.',409)
   const p=prior.payload as AdmissionPayload,shared=body.audience==='student'
   if(!shared&&body.audience!=='staff')throw new AdmissionsError('Choose the document audience.')
   if(shared&&(!p.summaryApproved||!p.shareableSummary||p.status==='archived'))throw new AdmissionsError('Approve a separate current summary before sharing.',409)
   const identity=(await db.query("select s.payload->>'name' student,o.name school from student_registry_records s join organisations o on o.id=s.organisation_id where s.organisation_id=$1 and s.external_key=$2",[org,key])).rows[0]
   const document={title:shared?'UG application summary':'UG application checklist',classification:shared?'STUDENT / PARENT SHAREABLE':'CONFIDENTIAL - AUTHORISED GUIDANCE STAFF',metadata:{Student:identity.student,School:identity.school,Institution:p.institution,Programme:p.programme,Cycle:p.cycle,Version:prior.version,Generated:new Date().toISOString()},sections:shared?[{title:'Approved summary',body:p.shareableSummary}]:[{title:'Application progress',body:admissionStatusLabels[p.status]},{title:'Checklist',body:p.checklist.map(i=>`${i.title}: ${i.status}${i.required?' (required by school checklist)':''}`).join('\n')},{title:'School-reviewed deadline',body:p.deadline?`${p.deadline}\nCycle: ${p.deadlineCycle}\nChecked: ${p.deadlineCheckedOn}`:'Consult the official admission notice before planning a deadline.',links:p.deadline?[{title:'Deadline source',url:p.deadlineSourceUrl}]:[]},{title:'Next step',body:p.nextAction?`${p.nextAction}\nStaff target date: ${p.nextActionDate}`:'Agree the next step with the student.'}]}
   await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'export.admissions',$2,$3,$4)",[org,user,key,{id:body.id,version:body.version,audience:body.audience}]);await db.query('commit');send(res,{document});return true
  }
  if(url.pathname==='/admissions-followup'){
   if(req.method!=='POST'||!prior)throw new AdmissionsError('Application unavailable.',404)
   if(prior.version!==body.version)throw new AdmissionsError('The application changed. Reload before creating its follow-up.',409)
   const p=prior.payload as AdmissionPayload
   if(['accepted','declined','unsuccessful','withdrawn','archived'].includes(p.status)||!p.nextAction||!p.nextActionDate)throw new AdmissionsError('Save a next action and target date on an active application first.',409)
   if(!(await db.query("select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,$3,user_id)",[org,p.ownerId,key])).rowCount)throw new AdmissionsError('Choose an active staff owner with access to this student.',409)
   const existing=(await db.query('select task_id from school_ug_application_followups where organisation_id=$1 and application_id=$2 and application_version=$3',[org,body.id,body.version])).rows[0]
   if(existing){await db.query('commit');send(res,{taskId:existing.task_id,reused:true});return true}
   const open=(await db.query("select f.task_id from school_ug_application_followups f join guidance_activities a on a.id=f.task_id and a.organisation_id=f.organisation_id where f.organisation_id=$1 and f.application_id=$2 and a.status not in('completed','cancelled') limit 1",[org,body.id])).rows[0]
   if(open)throw new AdmissionsError('This application already has an open follow-up. Complete or cancel it in Tasks before creating another.',409)
   const id=randomUUID()
   await db.query("insert into guidance_activities(id,organisation_id,student_key,kind,title,scheduled_at,status,summary,assigned_to,created_by,updated_by,task_details) values($1,$2,$3,'task',$4,$5,'open',$6,$7,$8,$8,$9)",[id,org,key,`${p.institution}: ${p.nextAction}`.slice(0,200),p.nextActionDate+'T17:00:00+05:30',`UG admissions / ${p.cycle}. Staff-planned follow-up; this is not an official application deadline.`,p.ownerId,user,blankTask()])
   await db.query('insert into school_ug_application_followups(organisation_id,application_id,application_version,task_id,created_by) values($1,$2,$3,$4,$5)',[org,body.id,body.version,id,user]);await db.query('commit');send(res,{taskId:id,reused:false});return true
  }
  if(req.method!=='PUT'||url.pathname!=='/admissions')throw new AdmissionsError('Method not allowed.',405)
  if(body.version===0&&prior||Number(body.version)>0&&(!prior||prior.version!==body.version))throw new AdmissionsError('This application changed elsewhere. Reload before saving.',409)
  const payload=validateAdmission(body.payload),reason=validateAdmissionTransition(prior?.payload.status,payload.status,body.reason,canCounsel(auth.role))
  if(payload.summaryApproved&&!canCounsel(auth.role))throw new AdmissionsError('A counsellor must approve the student summary.',403)
  if(prior?.payload.summaryApproved&&JSON.stringify(prior.payload)!==JSON.stringify(payload)&&!canCounsel(auth.role))payload.summaryApproved=false
  if(!(await db.query("select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,$3,user_id)",[org,payload.ownerId,key])).rowCount)throw new AdmissionsError('Choose an active staff owner assigned to this student.')
  const documents=[...new Set(payload.checklist.map(i=>i.documentId).filter(Boolean))]
  if(documents.length&&(await db.query("select id from school_student_documents where organisation_id=$1 and student_key=$2 and archived_at is null and id=any($3::uuid[]) and ($4 or visibility='school_staff')",[org,key,documents,canCounsel(auth.role)])).rowCount!==documents.length)throw new AdmissionsError('Every linked document must be available to you and belong to this student.')
  if(reason)await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'admissions.status_override',$2,$3,$4)",[org,user,key,{applicationId:body.id,from:prior?.payload.status||'new',to:payload.status,reason}])
  const result=body.version===0?await db.query('insert into school_ug_applications(id,organisation_id,student_key,payload,created_by,updated_by) values($1,$2,$3,$4,$5,$5) on conflict(id) do nothing returning id,student_key,payload,version,updated_at',[body.id,org,key,payload,user]):await db.query('update school_ug_applications set payload=$4,version=version+1,updated_by=$5,updated_at=now() where organisation_id=$1 and student_key=$2 and id=$3 and version=$6 returning id,student_key,payload,version,updated_at',[org,key,body.id,payload,user,body.version])
  if(!result.rowCount)throw new AdmissionsError('This application ID was already used. Reload before saving.',409)
  await db.query('commit');send(res,{record:result.rows[0]});return true
 }catch(e){await db.query('rollback');throw e}finally{db.release()}
}
