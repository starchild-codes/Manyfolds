import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {AccessError,assignmentRoles,assertStudentAccess,canGuide,rosterRoles} from '../access.ts'
import {checkedDatabaseClient} from '../database.ts'
import {blankStudentProfile,validateStudentProfile} from './profileSchema.ts'
const send=(res:ServerResponse,data:unknown,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
async function body(req:IncomingMessage){let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>100000)throw new AccessError('Request is too large.',413)}try{const input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))throw Error();return input as Record<string,unknown>}catch{throw new AccessError('Provide a valid request.',400)}}
export async function staffAccessRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 const path=url.pathname,org=auth.organisationId
 if(!['/assignments','/access-policy','/observations','/academics','/analytics'].includes(path))return false
 if(path==='/analytics'){
  if(req.method!=='GET'||!['owner','admin','lead_counsellor','counsellor','guidance_teacher','reviewer','viewer'].includes(auth.role))throw new AccessError('Reports are not available for your role.',403)
  const result=await pool.query(`select count(*)::int students,count(*) filter(where exists(select 1 from student_diagnostic_history d where d.organisation_id=s.organisation_id and d.student_key=s.external_key and d.status<>'draft'))::int diagnostics,count(*) filter(where exists(select 1 from roadmap_generations g where g.organisation_id=s.organisation_id and g.student_external_id=s.external_key and g.status in('approved','published')))::int approved_roadmaps from student_registry_records s where s.organisation_id=$1 and s.archived_at is null and ($3 or public.school_can_access_student(s.organisation_id,s.external_key,$2))`,[org,auth.userId,['owner','admin','lead_counsellor','reviewer','viewer'].includes(auth.role)])
  send(res,{totals:result.rows[0],generatedAt:new Date().toISOString(),scope:['reviewer','viewer','owner','admin','lead_counsellor'].includes(auth.role)?'School totals':'Assigned caseload',definition:'Saved completed diagnostics and approved or published AI roadmaps. These counts do not measure student ability or admission readiness.'});return true
 }
 if(path==='/assignments'||path==='/access-policy'){
  if(!assignmentRoles.includes(auth.role))throw new AccessError('Assignments are managed by school admins and lead counsellors.',403)
  if(req.method==='GET'){
   const [assignments,staff,policy]=await Promise.all([pool.query('select * from school_student_assignments where organisation_id=$1 order by student_key,staff_id',[org]),pool.query("select m.user_id,m.role,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email) name,(select count(*)::int from school_student_assignments a where a.organisation_id=m.organisation_id and a.staff_id=m.user_id and a.revoked_at is null and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())) assignments from organisation_memberships m join auth.users u on u.id=m.user_id where m.organisation_id=$1 and m.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher','teacher') order by name",[org]),pool.query('select allow_unassigned_guidance from organisations where id=$1',[org])]);send(res,{records:assignments.rows,staff:staff.rows,allowUnassignedGuidance:policy.rows[0].allow_unassigned_guidance});return true
  }
  const input=await body(req),db=await checkedDatabaseClient(pool)
  try{await db.query('begin');await db.query('select id from organisations where id=$1 for update',[org]);
   if(path==='/access-policy'){
    if(!['owner','admin'].includes(auth.role)||req.method!=='PUT'||typeof input.allowUnassignedGuidance!=='boolean'||typeof input.reason!=='string'||input.reason.trim().length<3)throw new AccessError('A school admin and a reason are required to change this policy.',403)
    await db.query('update organisations set allow_unassigned_guidance=$2 where id=$1',[org,input.allowUnassignedGuidance]);await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'school.unassigned_policy_changed',$2,$3)",[org,auth.userId,{enabled:input.allowUnassignedGuidance,reason:input.reason.trim().slice(0,1000)}]);await db.query('commit');send(res,{ok:true});return true
   }
   if(req.method!=='PUT'||!uuid(input.staffId)||!Array.isArray(input.studentKeys)||!input.studentKeys.length||input.studentKeys.length>500||input.studentKeys.some(k=>typeof k!=='string'||!k||k.length>120)||typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.length>1000)throw new AccessError('Choose staff, students and a reason.',400)
   const starts=new Date(String(input.startsAt||new Date().toISOString())),ends=input.endsAt?new Date(String(input.endsAt)):null
   if(!Number.isFinite(starts.getTime())||ends&&(!Number.isFinite(ends.getTime())||ends<=starts))throw new AccessError('Assignment dates are invalid.',400)
   if(!input.revoke&&!(await db.query("select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher','teacher')",[org,input.staffId])).rowCount)throw new AccessError('Choose active staff from this school.',400)
   const versions=input.versions&&typeof input.versions==='object'?input.versions as Record<string,unknown>:{}
   for(const key of new Set(input.studentKeys as string[])){
    const student=await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and ($3 or archived_at is null) for update',[org,key,input.revoke===true]);if(!student.rowCount)throw new AccessError()
    const old=await db.query('select version from school_student_assignments where organisation_id=$1 and student_key=$2 and staff_id=$3 for update',[org,key,input.staffId]);if((old.rows[0]?.version||0)!==versions[key])throw new AccessError('An assignment changed elsewhere. Reload before saving.',409)
    if(input.revoke===true){if(!old.rowCount)throw new AccessError('Assignment not found.',404);await db.query('update school_student_assignments set revoked_at=now(),assigned_by=$4,reason=$5,version=version+1 where organisation_id=$1 and student_key=$2 and staff_id=$3',[org,key,input.staffId,auth.userId,input.reason.trim()])}else await db.query(`insert into school_student_assignments(organisation_id,student_key,staff_id,assigned_by,starts_at,ends_at,reason) values($1,$2,$3,$4,$5,$6,$7) on conflict(organisation_id,student_key,staff_id) do update set revoked_at=null,assigned_by=excluded.assigned_by,starts_at=excluded.starts_at,ends_at=excluded.ends_at,reason=excluded.reason,version=school_student_assignments.version+1`,[org,key,input.staffId,auth.userId,starts.toISOString(),ends?.toISOString()||null,input.reason.trim()])
    await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'student.assignment_changed',$2,$3,$4)",[org,auth.userId,key,{staffId:input.staffId,startsAt:starts.toISOString(),endsAt:ends?.toISOString()||null,reason:input.reason.trim(),revoked:input.revoke===true}])
   }await db.query('commit');send(res,{ok:true});return true
  }catch(error){await db.query('rollback');throw error}finally{db.release()}
 }
 const key=url.searchParams.get('student')||'';await assertStudentAccess(pool,auth,key)
 if(path==='/observations'){
  if(auth.role!=='teacher'&&!canGuide(auth.role))throw new AccessError('Observations are available to assigned school staff.',403)
  if(req.method==='GET'){send(res,{records:(await pool.query('select id,observation,needs_attention,created_at from school_teacher_observations where organisation_id=$1 and student_key=$2 and ($3 or author_id=$4) order by created_at desc',[org,key,canGuide(auth.role),auth.userId])).rows});return true}
  const input=await body(req);if(req.method!=='POST'||!uuid(input.id)||typeof input.observation!=='string'||!input.observation.trim()||input.observation.length>3000||typeof input.needsAttention!=='boolean')throw new AccessError('Write an observation and attention status.',400)
  const db=await checkedDatabaseClient(pool)
  try{await db.query('begin');if(!(await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[org,key])).rowCount)throw new AccessError('Restore this student before recording an observation.',409)
   await assertStudentAccess(db,auth,key)
   const saved=await db.query('insert into school_teacher_observations(id,organisation_id,student_key,author_id,observation,needs_attention) values($1,$2,$3,$4,$5,$6) on conflict(id) do nothing returning id',[input.id,org,key,auth.userId,input.observation.trim(),input.needsAttention]);if(!saved.rowCount&&!(await db.query('select 1 from school_teacher_observations where id=$1 and organisation_id=$2 and student_key=$3 and author_id=$4 and observation=$5 and needs_attention=$6',[input.id,org,key,auth.userId,input.observation.trim(),input.needsAttention])).rowCount)throw new AccessError('Observation request already used.',409);await db.query('commit');send(res,{ok:true},201);return true
  }catch(e){await db.query('rollback');throw e}finally{db.release()}
 }
 if(!rosterRoles.includes(auth.role))throw new AccessError('Academic entry is restricted to authorised staff.',403)
 if(req.method==='GET'){send(res,{record:(await pool.query("select details->'academics' academics,version from student_guidance_profiles where organisation_id=$1 and student_key=$2",[org,key])).rows[0]||{academics:[],version:0}});return true}
 const input=await body(req),profile=validateStudentProfile({...blankStudentProfile(),academics:input.academics})
 if(req.method!=='PUT'||!Number.isSafeInteger(input.version)||Number(input.version)<0)throw new AccessError('Reload the current academic records.',400)
 const db=await checkedDatabaseClient(pool)
 try{await db.query('begin');if(!(await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[org,key])).rowCount)throw new AccessError('Restore this student before changing academic records.',409);await assertStudentAccess(db,auth,key)
  const saved=Number(input.version)===0?await db.query('insert into student_guidance_profiles(organisation_id,student_key,details,updated_by) values($1,$2,$3,$4) on conflict do nothing returning version',[org,key,profile,auth.userId]):await db.query("update student_guidance_profiles set details=jsonb_set(details,'{academics}',$3::jsonb),version=version+1,updated_at=now(),updated_by=$4 where organisation_id=$1 and student_key=$2 and version=$5 returning version",[org,key,JSON.stringify(profile.academics),auth.userId,input.version]);if(!saved.rowCount)throw new AccessError('The profile changed elsewhere. Reload academic records.',409);await db.query('commit');send(res,{version:saved.rows[0].version});return true
 }catch(e){await db.query('rollback');throw e}finally{db.release()}
}
