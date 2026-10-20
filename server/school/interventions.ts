import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {AccessError,assertStudentAccess,canGuide} from '../access.ts'
import {checkedDatabaseClient,readDatabase} from '../database.ts'
import {TaskError} from '../guidance/taskSchema.ts'
import {checkStaffBooking} from '../guidance/calendar.ts'
import {validateIntervention} from './interventionSchema.ts'
export async function interventionsRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(url.pathname!=='/interventions')return false
 if(!canGuide(auth.role))throw new AccessError('Interventions are limited to guidance staff.',403)
 const org=auth.organisationId,send=(data:unknown,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}
 if(req.method==='GET'){const result=await readDatabase(pool,`select i.*,coalesce(jsonb_agg(s.student_key order by s.student_key) filter(where s.student_key is not null),'[]') student_keys from school_interventions i left join school_intervention_students s on s.intervention_id=i.id where i.organisation_id=$1 and public.school_can_access_intervention(i.organisation_id,i.id,$2) group by i.id order by scheduled_at desc`,[org,auth.userId]);send({records:result.rows});return true}
 if(!['POST','PATCH'].includes(req.method||''))throw new AccessError('Method not allowed.',405)
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>500000)throw new AccessError('Intervention is too large.',413)}let b:Record<string,unknown>;try{b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error()}catch{throw new AccessError('Provide a valid intervention.',400)}
 const keys=b.studentKeys,date=new Date(String(b.scheduledAt)),duration=b.durationMinutes??60,title=typeof b.title==='string'?b.title.trim():'',summary=typeof b.summary==='string'?b.summary.trim():''
 if(typeof b.id!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id))||!Array.isArray(keys)||!keys.length||keys.length>1000||keys.some(k=>typeof k!=='string'||!k||k.length>120)||new Set(keys).size!==keys.length||!title||title.length>200||summary.length>5000||!Number.isFinite(date.getTime())||!['scheduled','completed','cancelled'].includes(String(b.status))||!Number.isInteger(duration)||Number(duration)<5||Number(duration)>480)throw new AccessError('Provide a title, date, duration, status and student cohort.',400)
 const studentKeys=keys as string[],db=await checkedDatabaseClient(pool)
 try{await db.query('begin');await db.query("select set_config('manyfolds.actor',$1,true)",[auth.userId]);const students=await db.query('select external_key from student_registry_records where organisation_id=$1 and external_key=any($2::text[]) and archived_at is null order by external_key for update',[org,studentKeys]);if(students.rowCount!==keys.length)throw new AccessError('Restore archived students or remove them from the cohort.',404)
  for(const k of studentKeys)await assertStudentAccess(db,auth,k)
  const old=(await db.query('select * from school_interventions where organisation_id=$1 and id=$2 for update',[org,b.id])).rows[0]
  if(old&&!(await db.query('select school_can_access_intervention($1,$2,$3) allowed',[org,b.id,auth.userId])).rows[0].allowed)throw new AccessError()
  let details;try{details=validateIntervention(b.details??old?.details,studentKeys,b.status==='completed')}catch(e){throw new AccessError(e instanceof Error?e.message:'Invalid intervention details.',400)}
  if(details.resourceIds.length&&(await db.query('select id from school_resources where organisation_id=$1 and id=any($2::uuid[])',[org,details.resourceIds])).rowCount!==details.resourceIds.length)throw new AccessError('Choose current school resources.',400)
  if(details.taskIds.length&&(await db.query("select id from guidance_activities where organisation_id=$1 and id=any($2::uuid[]) and student_key=any($3::text[]) and kind='task'",[org,details.taskIds,studentKeys])).rowCount!==details.taskIds.length)throw new AccessError('Link tasks belonging to participating students.',400)
  if(details.staffId){if(!(await db.query("select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher')",[org,details.staffId])).rowCount)throw new AccessError('Choose an active guidance organiser.',400);if(b.status==='scheduled')await checkStaffBooking(db,auth,details.staffId,date.toISOString(),Number(duration),b.id)}
  let saved
  if(req.method==='POST'){
   saved=await db.query('insert into school_interventions(id,organisation_id,title,scheduled_at,status,summary,created_by,updated_by,details,duration_minutes) values($1,$2,$3,$4,$5,$6,$7,$7,$8,$9) on conflict(id) do nothing returning *',[b.id,org,title,date.toISOString(),b.status,summary,auth.userId,details,duration])
   if(!saved.rowCount){const duplicate=await db.query('select i.* from school_interventions i where i.id=$1 and i.organisation_id=$2 and i.created_by=$3 and title=$4 and scheduled_at=$5 and status=$6 and summary=$7 and details=$8::jsonb and duration_minutes=$9 and (select array_agg(student_key order by student_key) from school_intervention_students where intervention_id=i.id)=$10::text[]',[b.id,org,auth.userId,title,date.toISOString(),b.status,summary,details,duration,[...studentKeys].sort()]);if(!duplicate.rowCount)throw new AccessError('This intervention request was already used.',409);await db.query('commit');send({record:{...duplicate.rows[0],student_keys:studentKeys}});return true}
  }else{if(!old||old.version!==b.version)throw new AccessError('The intervention changed. Reload before saving.',409);saved=await db.query('update school_interventions set title=$3,scheduled_at=$4,status=$5,summary=$6,details=$7,duration_minutes=$8,updated_by=$9,updated_at=now(),version=version+1 where organisation_id=$1 and id=$2 returning *',[org,b.id,title,date.toISOString(),b.status,summary,details,duration,auth.userId]);await db.query('delete from school_intervention_students where organisation_id=$1 and intervention_id=$2',[org,b.id])}
  for(const k of studentKeys)await db.query('insert into school_intervention_students(organisation_id,intervention_id,student_key) values($1,$2,$3)',[org,b.id,k]);await db.query('commit');send({record:{...saved.rows[0],student_keys:studentKeys}},req.method==='POST'?201:200);return true
 }catch(e){await db.query('rollback');if(e instanceof TaskError)throw new AccessError(e.message,e.statusCode);throw e}finally{db.release()}
}
