import {createHash,randomUUID} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool,PoolClient} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {assignmentRoles,canGuide} from '../access.ts'
import {checkedDatabaseClient,readDatabase} from '../database.ts'
import {TaskError} from './taskSchema.ts'
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const send=(res:ServerResponse,body:unknown)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
export type CalendarEntry={id:string;kind:string;title:string;startsAt:string;endsAt:string;staffId?:string;studentKey?:string;studentName?:string;status:string;version?:number;notes?:string;sourceUrl?:string;allDay?:boolean;editable?:boolean;recurrenceId?:string}
// The staff lock serialises bookings for different students as well as calendar
// availability edits. It must be acquired inside the caller's transaction.
export async function lockStaff(db:PoolClient,org:string,staff:string){await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${org}:${staff}:calendar`])}
export async function checkStaffBooking(db:PoolClient,auth:AuthContext,staff:string,start:string,duration:number,excludeId?:string){
 await lockStaff(db,auth.organisationId,staff)
 const result=await db.query(`select 1 from guidance_activities where organisation_id=$1 and assigned_to=$2::text and kind='session' and status='scheduled' and ($5::uuid is null or id<>$5) and scheduled_at<$3::timestamptz+make_interval(mins=>$4) and scheduled_at+make_interval(mins=>duration_minutes)>$3::timestamptz
 union all select 1 from school_calendar_events where organisation_id=$1 and staff_id=$2::uuid and kind in('unavailable','school_event') and status='scheduled' and ($5::uuid is null or id<>$5) and starts_at<$3::timestamptz+make_interval(mins=>$4) and ends_at>$3::timestamptz
 union all select 1 from school_interventions where organisation_id=$1 and details->>'staffId'=$2::text and status='scheduled' and ($5::uuid is null or id<>$5) and scheduled_at<$3::timestamptz+make_interval(mins=>$4) and scheduled_at+make_interval(mins=>duration_minutes)>$3::timestamptz limit 1`,[auth.organisationId,staff,start,duration,excludeId||null])
 if(result.rowCount)throw new TaskError('This staff member already has a session, school event or unavailable period at that time. Choose another time or staff member.',409)
}
const escapeIcs=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').split('').filter(c=>c.charCodeAt(0)>=32).join('')
const stamp=(value:string)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
export function calendarIcs(entries:CalendarEntry[]){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Manyfolds//School guidance//EN','CALSCALE:GREGORIAN'];for(const e of entries.filter(e=>e.status!=='cancelled')){lines.push('BEGIN:VEVENT',`UID:${escapeIcs(e.id)}@manyfolds`,`DTSTAMP:${stamp(new Date().toISOString())}`,e.allDay?`DTSTART;VALUE=DATE:${e.startsAt.slice(0,10).replaceAll('-','')}`:`DTSTART:${stamp(e.startsAt)}`,e.allDay?`DTEND;VALUE=DATE:${e.endsAt.slice(0,10).replaceAll('-','')}`:`DTEND:${stamp(e.endsAt)}`,`SUMMARY:${escapeIcs(e.title+(e.studentName?` — ${e.studentName}`:''))}`);if(e.sourceUrl)lines.push(`URL:${escapeIcs(e.sourceUrl)}`);lines.push('END:VEVENT')}lines.push('END:VCALENDAR');return lines.map(line=>{let part='',bytes=0,out='';for(const ch of line){const size=Buffer.byteLength(ch);if(bytes+size>74){out+=part+'\r\n ';part='';bytes=1}part+=ch;bytes+=size}return out+part}).join('\r\n')+'\r\n'}
async function entries(pool:Pool,auth:AuthContext,from:string,to:string){
 const org=auth.organisationId
 const [activities,events,interventions,deadlines,staff]=await Promise.all([
  readDatabase(pool,`select a.*,s.payload->>'name' student_name,public.school_can_access_student(a.organisation_id,a.student_key,$4) accessible from guidance_activities a join student_registry_records s on s.organisation_id=a.organisation_id and s.external_key=a.student_key where a.organisation_id=$1 and s.archived_at is null and a.scheduled_at>=$2 and a.scheduled_at<$3 and (a.kind='session' or public.school_can_access_student(a.organisation_id,a.student_key,$4))`,[org,from,to,auth.userId]),
  readDatabase(pool,'select * from school_calendar_events where organisation_id=$1 and starts_at<$3 and ends_at>$2',[org,from,to]),
  readDatabase(pool,`select i.*,public.school_can_access_intervention(i.organisation_id,i.id,$4) accessible from school_interventions i where i.organisation_id=$1 and i.scheduled_at>=$2 and i.scheduled_at<$3`,[org,from,to,auth.userId]),
  readDatabase(pool,`select claim_key,entity_id,field_name,claim_value#>>'{}' date,source_url,document_title,academic_cycle from catalogue_claims where verification_status='verified' and (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date) and field_name in('application_deadline','registration_deadline','registration_close','exam_date','scholarship_deadline') and jsonb_typeof(claim_value)='string' and claim_value#>>'{}' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' and claim_value#>>'{}'>=left($1,10) and claim_value#>>'{}'<left($2,10)`,[from,to]),
  readDatabase(pool,"select m.user_id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email) name from organisation_memberships m join auth.users u on u.id=m.user_id where m.organisation_id=$1 and m.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') order by name",[org])
 ])
 const result:CalendarEntry[]=activities.rows.filter(a=>a.accessible||a.kind==='session'&&a.status==='scheduled').map(a=>({id:a.accessible?a.id:`busy-${createHash('sha256').update(a.id+auth.userId).digest('hex').slice(0,20)}`,kind:a.accessible?a.kind:'busy',title:a.accessible?a.title:'Busy',startsAt:a.scheduled_at.toISOString(),endsAt:new Date(a.scheduled_at.getTime()+(a.kind==='task'?15:a.duration_minutes)*60000).toISOString(),staffId:a.assigned_to,...(a.accessible?{studentKey:a.student_key,studentName:a.student_name}:{}),status:a.status}))
 for(const e of events.rows)result.push({id:e.id,kind:e.kind,title:e.title,startsAt:e.starts_at.toISOString(),endsAt:e.ends_at.toISOString(),staffId:e.staff_id,status:e.status,version:e.version,notes:e.notes,editable:e.staff_id===auth.userId||assignmentRoles.includes(auth.role),recurrenceId:e.recurrence_id})
 for(const i of interventions.rows)if(i.accessible||i.status==='scheduled')result.push({id:i.accessible?i.id:`busy-${createHash('sha256').update(i.id+auth.userId).digest('hex').slice(0,20)}`,kind:i.accessible?'intervention':'busy',title:i.accessible?i.title:'Busy',startsAt:i.scheduled_at.toISOString(),endsAt:new Date(i.scheduled_at.getTime()+i.duration_minutes*60000).toISOString(),staffId:i.details?.staffId||undefined,status:i.status})
 for(const d of deadlines.rows){const date=new Date(`${d.date}T00:00:00Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==d.date||!/^https:\/\//i.test(d.source_url))continue;result.push({id:`claim-${d.claim_key}`,kind:'official_deadline',title:`${d.document_title} · ${d.field_name.replaceAll('_',' ')}${d.academic_cycle?` · ${d.academic_cycle}`:''}`,startsAt:date.toISOString(),endsAt:new Date(date.getTime()+86400000).toISOString(),status:'verified',sourceUrl:d.source_url,allDay:true})}
 return {entries:result.sort((a,b)=>a.startsAt.localeCompare(b.startsAt)),staff:staff.rows}
}
export async function calendarRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(!['/calendar','/calendar-export'].includes(url.pathname))return false
 if(!canGuide(auth.role))throw new TaskError('Calendar access is limited to guidance staff.',403)
 if(req.method==='GET'){
  const from=new Date(url.searchParams.get('from')||''),to=new Date(url.searchParams.get('to')||'');if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||to<=from||to.getTime()-from.getTime()>370*86400000)throw new TaskError('Choose a calendar range of up to one year.')
  const result=await entries(pool,auth,from.toISOString(),to.toISOString())
  if(url.pathname==='/calendar-export'){await pool.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'export.calendar',$2,$3)",[auth.organisationId,auth.userId,{from:from.toISOString(),to:to.toISOString(),count:result.entries.length}]);res.setHeader('Content-Type','text/calendar; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="manyfolds-calendar.ics"');res.setHeader('Cache-Control','no-store');res.end(calendarIcs(result.entries))}else send(res,result)
  return true
 }
 if(url.pathname!=='/calendar'||!['POST','PATCH'].includes(req.method||''))throw new TaskError('Method not allowed.',405)
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32000)throw new TaskError('Calendar request is too large.',413)}let body:Record<string,unknown>;try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{throw new TaskError('Provide a valid calendar event.')}
 const org=auth.organisationId,db=await checkedDatabaseClient(pool)
 try{await db.query('begin')
  if(req.method==='PATCH'){
   if(!uuid(body.id)||!Number.isInteger(body.version)||body.status!=='cancelled')throw new TaskError('Choose a current event to cancel.')
   const current=(await db.query('select * from school_calendar_events where organisation_id=$1 and id=$2 for update',[org,body.id])).rows[0];if(!current)throw new TaskError('Calendar event unavailable.',404)
   if(current.staff_id!==auth.userId&&!assignmentRoles.includes(auth.role))throw new TaskError('Only the assigned staff member or caseload manager can change availability.',403)
   await lockStaff(db,org,current.staff_id)
   if(current.version!==body.version)throw new TaskError('This event changed. Reload the calendar.',409)
   if(body.series===true&&current.recurrence_id)await db.query("update school_calendar_events set status='cancelled',version=version+1,updated_by=$3,updated_at=now() where organisation_id=$1 and recurrence_id=$2 and starts_at>=$4 and status='scheduled'",[org,current.recurrence_id,auth.userId,current.starts_at]);else await db.query("update school_calendar_events set status='cancelled',version=version+1,updated_by=$3,updated_at=now() where organisation_id=$1 and id=$2",[org,body.id,auth.userId])
   await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'calendar.cancelled',$2,$3)",[org,auth.userId,{id:body.id,series:body.series===true}]);await db.query('commit');send(res,{ok:true});return true
  }
  const staff=body.staffId||auth.userId,title=typeof body.title==='string'?body.title.trim():'',notes=typeof body.notes==='string'?body.notes.trim():''
  if(!uuid(body.requestId)||!uuid(staff)||!['school_event','available','unavailable'].includes(String(body.kind))||!title||title.length>200||notes.length>2000||!Array.isArray(body.occurrences)||!body.occurrences.length||body.occurrences.length>52)throw new TaskError('Provide a title, staff member and up to 52 event times.')
  if(staff!==auth.userId&&!assignmentRoles.includes(auth.role))throw new TaskError('Only caseload managers can set another staff member’s availability.',403)
  const member=await db.query("select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher')",[org,staff]);if(!member.rowCount)throw new TaskError('Choose active guidance staff.')
  const times=body.occurrences.map(v=>{if(!v||typeof v!=='object')throw new TaskError('Invalid event time.');const r=v as Record<string,unknown>,start=new Date(String(r.start)),end=new Date(String(r.end));if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()-start.getTime()>7*86400000)throw new TaskError('Events must last between one minute and seven days.');return{start:start.toISOString(),end:end.toISOString()}})
  if(times.some((t,i)=>i>0&&(t.start<times[i-1].end||Date.parse(t.start)-Date.parse(times[0].start)>370*86400000)))throw new TaskError('Recurring events must be ordered, separate and within one year.')
  const hash=createHash('sha256').update(JSON.stringify({staff,title,notes,kind:body.kind,times})).digest('hex');await lockStaff(db,org,staff)
  const old=(await db.query('select * from school_calendar_requests where id=$1',[body.requestId])).rows[0]
  if(old){if(old.organisation_id!==org||old.author_id!==auth.userId||old.request_hash!==hash)throw new TaskError('This calendar request was already used.',409);await db.query('commit');send(res,{ids:old.event_ids,reused:true});return true}
  const recurrence=times.length>1?randomUUID():null,ids=[]
  for(const t of times){if(body.kind!=='available')await checkStaffBooking(db,auth,staff,t.start,Math.ceil((Date.parse(t.end)-Date.parse(t.start))/60000));const id=randomUUID();ids.push(id);await db.query('insert into school_calendar_events(id,organisation_id,staff_id,kind,title,starts_at,ends_at,notes,recurrence_id,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)',[id,org,staff,body.kind,title,t.start,t.end,notes,recurrence,auth.userId])}
  await db.query('insert into school_calendar_requests(id,organisation_id,author_id,request_hash,event_ids) values($1,$2,$3,$4,$5)',[body.requestId,org,auth.userId,hash,ids]);await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'calendar.created',$2,$3)",[org,auth.userId,{kind:body.kind,count:ids.length,staffId:staff}]);await db.query('commit');send(res,{ids});return true
 }catch(e){await db.query('rollback');throw e}finally{db.release()}
}
