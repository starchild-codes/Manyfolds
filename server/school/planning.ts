import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {assertStudentAccess,canGuide,canCounsel} from '../access.ts'
import {checkedDatabaseClient} from '../database.ts'
import {PlanningError,validatePlanning,type PlanningKind} from './planningSchema.ts'
const send=(res:ServerResponse,data:unknown,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
async function input(req:IncomingMessage){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>180000)throw new PlanningError('Use a smaller planning record.',413)}try{const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed as Record<string,unknown>}catch{throw new PlanningError('Provide a valid planning request.')}}
export async function planningRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(!['/planning','/planning-history','/planning-export','/planning-comparison','/timeline'].includes(url.pathname))return false
 if(!canGuide(auth.role))throw new PlanningError('Planning records are limited to assigned guidance staff.',403)
 const key=url.searchParams.get('student')||'';await assertStudentAccess(pool,auth,key)
 const org=auth.organisationId
 if(url.pathname==='/planning-comparison'){
  if(req.method!=='POST')throw new PlanningError('Method not allowed.',405)
  const body=await input(req),selections=body.records
  if(!Array.isArray(selections)||selections.length<2||selections.length>4||selections.some(r=>!r||typeof r!=='object'||!uuid(r.id)||!Number.isSafeInteger(r.version)||r.version<1)||new Set(selections.map(r=>r.id)).size!==selections.length)throw new PlanningError('Choose two to four different saved pathways and their current versions.')
  const result=await pool.query("select p.id,p.version,p.payload->>'title' title,p.payload->>'category' category,p.payload->>'shareableSummary' summary,p.payload->>'summaryApproved' approved,p.payload->>'status' status,s.payload->>'name' student,o.name school from school_student_planning p join student_registry_records s on s.organisation_id=p.organisation_id and s.external_key=p.student_key and s.archived_at is null join organisations o on o.id=p.organisation_id where p.organisation_id=$1 and p.student_key=$2 and p.kind='pathway' and p.id=any($3::uuid[])",[org,key,selections.map(r=>r.id)])
  if(result.rows.length!==selections.length)throw new PlanningError('A selected pathway is unavailable for this student.',404)
  const records=selections.map(selection=>result.rows.find(r=>r.id===selection.id)!)
  if(records.some((row,i)=>row.version!==selections[i].version))throw new PlanningError('A selected pathway changed. Reload and review the latest summaries before downloading.',409)
  if(records.some(row=>row.approved!=='true'||!row.summary||row.status==='archived'))throw new PlanningError('Every selected pathway needs a current approved summary and must not be archived.',409)
  await pool.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'export.pathway_comparison',$2,$3,$4)",[org,auth.userId,key,{records:selections}])
  send(res,{document:{student:records[0].student,school:records[0].school,generatedAt:new Date().toISOString(),records:records.map(({id,version,title,category,summary,status})=>({id,version,title,category,summary,status}))}});return true
 }
 if(url.pathname==='/planning-export'){
  if(req.method!=='GET'||!uuid(url.searchParams.get('id')))throw new PlanningError('Choose a saved planning record.')
  const result=await pool.query("select p.id,p.kind,p.version,p.payload->>'title' title,p.payload->>'shareableSummary' summary,p.payload->>'summaryApproved' approved,s.payload->>'name' student,o.name school from school_student_planning p join student_registry_records s on s.organisation_id=p.organisation_id and s.external_key=p.student_key and s.archived_at is null join organisations o on o.id=p.organisation_id where p.organisation_id=$1 and p.student_key=$2 and p.id=$3",[org,key,url.searchParams.get('id')])
  const row=result.rows[0];if(!row)throw new PlanningError('Planning record is unavailable.',404)
  if(row.approved!=='true'||!row.summary)throw new PlanningError('Approve a separate student or guardian summary before sharing.',409)
  await pool.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'export.planning_summary',$2,$3,$4)",[org,auth.userId,key,{recordId:row.id,kind:row.kind,version:row.version}]);const {approved:_approved,...document}=row;send(res,{document:{...document,generatedAt:new Date().toISOString()}});return true
 }
 if(url.pathname==='/timeline'){
  if(req.method!=='GET')throw new PlanningError('Method not allowed.',405)
  const result=await pool.query(`select * from (
   select id::text id,kind type,title,scheduled_at happened_at,status from guidance_activities where organisation_id=$1 and student_key=$2
   union all select id::text,'diagnostic','Career diagnostic saved',created_at,status from student_diagnostic_history where organisation_id=$1 and student_key=$2
   union all select id::text,'ai_roadmap',roadmap->>'roadmap_title',updated_at,status from roadmap_generations where organisation_id=$1 and student_external_id=$2
   union all select id::text,kind,payload->>'title',updated_at,payload->>'status' from school_student_planning where organisation_id=$1 and student_key=$2
   union all select i.id::text,'intervention',i.title,i.scheduled_at,i.status from school_interventions i join school_intervention_students s on s.intervention_id=i.id where s.organisation_id=$1 and s.student_key=$2 and public.school_can_access_intervention(i.organisation_id,i.id,$3)
   union all select id::text,'teacher_observation','Teacher observation recorded',created_at,case when needs_attention then 'Attention requested' else 'Recorded' end from school_teacher_observations where organisation_id=$1 and student_key=$2
  ) history order by happened_at desc limit 250`,[org,key,auth.userId]);send(res,{records:result.rows});return true
 }
 if(url.pathname==='/planning-history'){
  if(req.method!=='GET'||!uuid(url.searchParams.get('id')))throw new PlanningError('Choose a saved planning record.')
  send(res,{records:(await pool.query('select version,payload,recorded_at from school_student_planning_history where organisation_id=$1 and student_key=$2 and record_id=$3 order by version desc limit 100',[org,key,url.searchParams.get('id')])).rows});return true
 }
 if(req.method==='GET'){
  const [records,tasks,staff,documents]=await Promise.all([pool.query('select id,kind,payload,version,updated_at from school_student_planning where organisation_id=$1 and student_key=$2 order by updated_at desc',[org,key]),pool.query("select id,title,status,scheduled_at from guidance_activities where organisation_id=$1 and student_key=$2 and kind='task' order by scheduled_at",[org,key]),pool.query("select m.user_id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email) name from organisation_memberships m join auth.users u on u.id=m.user_id where m.organisation_id=$1 and m.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(m.organisation_id,$2,m.user_id)",[org,key]),pool.query("select id,filename from school_student_documents where organisation_id=$1 and student_key=$2 and archived_at is null and (visibility='school_staff' or $3)",[org,key,canCounsel(auth.role)])]);send(res,{records:records.rows,tasks:tasks.rows,staff:staff.rows,documents:documents.rows,canVerify:canCounsel(auth.role)});return true
 }
 if(req.method!=='PUT')throw new PlanningError('Method not allowed.',405)
 const body=await input(req),kind=body.kind as PlanningKind
 if(!uuid(body.id)||!['pathway','plan','outcome'].includes(kind)||!Number.isSafeInteger(body.version)||Number(body.version)<0)throw new PlanningError('Choose a record type and its current saved version.')
 const payload=validatePlanning(kind,body.payload)
 if(payload.summaryApproved&&!canCounsel(auth.role))throw new PlanningError('A counsellor must approve the shareable summary.',403)
 if(kind==='outcome'&&payload.status==='verified'&&!canCounsel(auth.role))throw new PlanningError('A counsellor must check the evidence before verifying an outcome.',403)
 const db=await checkedDatabaseClient(pool)
 try{await db.query('begin');
  if(!(await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[org,key])).rowCount)throw new PlanningError('Restore this student before changing plans.',409)
  await assertStudentAccess(db,auth,key)
  if(kind==='plan'){
   if(!(await db.query("select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,$3,user_id)",[org,payload.ownerId,key])).rowCount)throw new PlanningError('Choose a staff owner assigned to this student.')
   const tasks=await db.query("select id,status from guidance_activities where organisation_id=$1 and student_key=$2 and kind='task' and id=any($3::uuid[]) for share",[org,key,payload.taskIds]);if(tasks.rowCount!==(payload.taskIds as string[]).length)throw new PlanningError('Every task must belong to this student.')
   if(payload.status==='completed'&&tasks.rows.some(t=>!['completed','cancelled'].includes(t.status)))throw new PlanningError('Complete or cancel linked tasks before closing the plan.')
  }
  if(kind==='outcome'){
   if(payload.documentId&&!(await db.query('select 1 from school_student_documents where organisation_id=$1 and student_key=$2 and id=$3 and archived_at is null',[org,key,payload.documentId])).rowCount)throw new PlanningError('Choose an available document belonging to this student.')
   if(payload.status==='verified'){payload.verifiedBy=auth.userId;payload.verifiedAt=new Date().toISOString()}
  }
  let result
  if(body.version===0){result=await db.query('insert into school_student_planning(id,organisation_id,student_key,kind,payload,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6) on conflict(id) do nothing returning id,kind,payload,version,updated_at',[body.id,org,key,kind,payload,auth.userId])}
  else result=await db.query('update school_student_planning set payload=$5,version=version+1,updated_by=$6,updated_at=now() where id=$1 and organisation_id=$2 and student_key=$3 and kind=$4 and version=$7 returning id,kind,payload,version,updated_at',[body.id,org,key,kind,payload,auth.userId,body.version])
  if(!result.rowCount)throw new PlanningError('This planning record changed elsewhere. Reload before saving.',409)
  await db.query('commit');send(res,{record:result.rows[0]});return true
 }catch(error){await db.query('rollback');if((error as {code?:string}).code==='23505')throw new PlanningError('Only one active primary pathway is allowed. Archive or change the existing primary pathway first.',409);throw error}finally{db.release()}
}
