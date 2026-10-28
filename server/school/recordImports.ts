import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool,PoolClient} from 'pg'
import {createHash,randomUUID} from 'node:crypto'
import {parse} from 'csv-parse/sync'
import type {AuthContext} from '../ai/types.ts'
import {AccessError,assertStudentAccess,canGuide} from '../access.ts'
import {checkedDatabaseClient} from '../database.ts'
import {blankStudentProfile,validateStudentProfile,type StudentProfile} from './profileSchema.ts'
import {blankSession,validateSession,hasSessionOutcome} from '../guidance/sessionSchema.ts'
import {recordImportFields,type RecordImportKind} from './recordImportSchema.ts'
type Row={studentId:string;entryId:string;version:number;values:Record<string,string>}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const hash=(kind:string,rows:Row[])=>createHash('sha256').update(JSON.stringify({kind,rows})).digest('hex')
const send=(res:ServerResponse,data:unknown)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}
function permission(auth:AuthContext,kind:RecordImportKind){if(!Object.hasOwn(recordImportFields,kind))throw new AccessError('Choose an import type.',400);if(kind==='staff'||kind==='sessions'){if(!['owner','admin','lead_counsellor'].includes(auth.role))throw new AccessError('These imports are managed by school administrators and lead counsellors.',403)}else if(!canGuide(auth.role)&&!(auth.role==='data_entry'&&['class','academics'].includes(kind)))throw new AccessError('Your role cannot import these records.',403)}
const profile=(value:unknown)=>({...blankStudentProfile(),...(value as StudentProfile||{})})
async function prepare(db:Pool|PoolClient,auth:AuthContext,kind:RecordImportKind,rows:Row[],checkVersions:boolean){
 const seen=new Set<string>(),prepared=[]
 for(const row of rows){
  if(!row||typeof row.studentId!=='string'||!row.studentId||row.studentId.length>120||!uuid(row.entryId)||!Number.isSafeInteger(row.version)||row.version<0||!row.values||typeof row.values!=='object'||Array.isArray(row.values))throw new AccessError('An import row is invalid. Preview the CSV again.',400)
  const fields=recordImportFields[kind] as readonly string[],values:Record<string,string>={}
  if(Object.keys(row.values).some(k=>!fields.includes(k)||k==='studentId'))throw new AccessError('Unexpected import fields. Preview again.',400)
  for(const field of fields.filter(f=>f!=='studentId')){const value=row.values[field]??'';if(typeof value!=='string'||value.length>3000)throw new AccessError('An import field is too long.',400);values[field]=value.trim()}
  await assertStudentAccess(db,auth,row.studentId)
  const current=(await db.query('select payload,version,archived_at from student_registry_records where organisation_id=$1 and external_key=$2',[auth.organisationId,row.studentId])).rows[0];if(!current||current.archived_at)throw new AccessError('Use active student IDs from this school.',409)
  const savedProfile=(kind==='guardians'||kind==='academics')?(await db.query('select details,version from student_guidance_profiles where organisation_id=$1 and student_key=$2',[auth.organisationId,row.studentId])).rows[0]:null
  const version=Number(savedProfile?.version||((kind==='guardians'||kind==='academics')?0:current.version));if(checkVersions&&row.version!==version)throw new AccessError('A student or profile changed since preview. Preview the whole batch again.',409)
  let target:unknown
  if(kind==='class'){
   const allowed=await db.query("select 1 from school_classes c left join school_sections s on s.class_id=c.id where c.organisation_id=$1 and ($2=c.class_name or $2=c.class_name||' '||s.section_name) limit 1",[auth.organisationId,values.grade]);if(!allowed.rowCount)throw new AccessError('A class/section is not configured for this school.',400);target=values.grade
  }else if(kind==='staff'){
   const person=(await db.query("select m.user_id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email) name from organisation_memberships m join auth.users u on u.id=m.user_id where m.organisation_id=$1 and m.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and lower(u.email)=lower($2)",[auth.organisationId,values.staffEmail])).rows;if(person.length!==1)throw new AccessError('Each staff email must identify one active guidance staff member in this school.',400);target=person[0]
  }else if(kind==='guardians'||kind==='academics'){
   const details=profile(savedProfile?.details),item={id:row.entryId,...values},signature=kind==='guardians'?JSON.stringify([values.name.toLowerCase(),values.relationship.toLowerCase(),values.phone,values.email.toLowerCase()]):JSON.stringify([values.subject.toLowerCase(),values.term.toLowerCase(),values.year,values.resultType]);
   const duplicate=details[kind].some(r=>kind==='guardians'?JSON.stringify([r.name.toLowerCase(),r.relationship.toLowerCase(),r.phone||'',(r.email||'').toLowerCase()])===signature:JSON.stringify([r.subject.toLowerCase(),r.term.toLowerCase(),r.year,r.resultType])===signature);if(duplicate)throw new AccessError('A matching guardian or academic record already exists. No automatic merge is performed.',409)
   validateStudentProfile({...details,[kind]:[...details[kind],item]});target=item
  }else{
   if(!values.title||values.title.length>200||!values.source||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(values.scheduledAt)||!Number.isFinite(Date.parse(values.scheduledAt))||Date.parse(values.scheduledAt)>Date.now())throw new AccessError('Historical sessions need a title, source and past ISO date/time with timezone.',400)
   const details=validateSession({...blankSession(),sessionType:values.sessionType,attendees:values.attendees,reason:values.reason,decisions:values.decisions,studentActions:values.studentActions,counsellorActions:values.counsellorActions,information:'Imported historical record. Source: '+values.source});if(!details.attendees||!details.reason||!hasSessionOutcome(details))throw new AccessError('Historical sessions need attendees, a reason and an action or decision.',400)
   if((await db.query("select 1 from guidance_activities where organisation_id=$1 and student_key=$2 and kind='session' and title=$3 and scheduled_at=$4",[auth.organisationId,row.studentId,values.title,values.scheduledAt])).rowCount)throw new AccessError('A session with this student, title and time already exists.',409);target=details
  }
  const signature=row.studentId+':'+(kind==='class'||kind==='staff'?'single':JSON.stringify(values));if(seen.has(signature))throw new AccessError('Duplicate rows are present in the CSV.',400);seen.add(signature)
  prepared.push({row:{...row,values,version},target,current,details:profile(savedProfile?.details)})
 }
 return prepared
}
export async function recordImportsRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(!['/imports/records','/imports/records/preview','/imports/records/rollback'].includes(url.pathname))return false
 if(!canGuide(auth.role)&&auth.role!=='data_entry')throw new AccessError('Your role cannot import records.',403)
 const org=auth.organisationId
 if(req.method==='GET'&&url.pathname==='/imports/records'){const r=await pool.query("select id,kind,status,created_at,rolled_back_at,cardinality(student_keys) students from school_record_imports where organisation_id=$1 and (created_by=$2 or $3) order by created_at desc limit 40",[org,auth.userId,['owner','admin'].includes(auth.role)]);send(res,{records:r.rows});return true}
 if(req.method!=='POST')throw new AccessError('Method not allowed.',405)
 let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>1000000)throw new AccessError('Use a smaller CSV batch.',413)}let body:Record<string,unknown>;try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{throw new AccessError('Provide a valid import request.',400)}
 if(url.pathname==='/imports/records/preview'){
  const kind=body.kind as RecordImportKind;permission(auth,kind);if(typeof body.csv!=='string'||!body.mapping||typeof body.mapping!=='object')throw new AccessError('Choose a CSV and map its fields.',400)
  let parsed:Record<string,string>[];try{parsed=parse(body.csv,{columns:true,skip_empty_lines:true,trim:true,max_record_size:32000})}catch{throw new AccessError('The CSV could not be parsed.',400)}if(!parsed.length||parsed.length>100)throw new AccessError('Preview 1 to 100 CSV rows at a time.',400)
  const mapping=body.mapping as Record<string,string>,rows=parsed.map(r=>({studentId:r[mapping.studentId]||'',entryId:randomUUID(),version:0,values:Object.fromEntries(recordImportFields[kind].filter(f=>f!=='studentId').map(f=>[f,r[mapping[f]]||'']))}));const prepared=await prepare(pool,auth,kind,rows,false),result=prepared.map(p=>p.row);send(res,{rows:result,previewHash:hash(kind,result),students:new Set(rows.map(r=>r.studentId)).size});return true
 }
 if(!uuid(body.id))throw new AccessError('Choose an import batch.',400)
 const db=await checkedDatabaseClient(pool)
 try{await db.query('begin');await db.query('select id from organisations where id=$1 for update',[org]);await db.query("select set_config('manyfolds.actor',$1,true)",[auth.userId])
  const existing=(await db.query('select * from school_record_imports where id=$1 for update',[body.id])).rows[0]
  if(url.pathname==='/imports/records/rollback'){
   if(!['owner','admin'].includes(auth.role))throw new AccessError('Only owners and administrators can roll back imports.',403)
   if(!existing||existing.organisation_id!==org)throw new AccessError('Import unavailable.',404)
   if(existing.status==='rolled_back'){await db.query('commit');send(res,{ok:true,reused:true});return true}
   for(const after of existing.after_records){await assertStudentAccess(db,auth,after.key);const table=after.target==='registry'?'student_registry_records':after.target==='profile'?'student_guidance_profiles':'guidance_activities',field=after.target==='registry'?'external_key':after.target==='profile'?'student_key':'id';const current=(await db.query(`select version from ${table} where organisation_id=$1 and ${field}=$2 for update`,[org,after.id||after.key])).rows[0];if(Number(current?.version)!==after.version)throw new AccessError('Imported records changed after import. Automatic rollback is unavailable.',409)
    if(after.target==='session'){const session=(await db.query('select version from guidance_session_records where organisation_id=$1 and activity_id=$2 for update',[org,after.id])).rows[0];if(session?.version!==1||(await db.query('select 1 from guidance_session_private_notes where organisation_id=$1 and activity_id=$2 union all select 1 from guidance_session_leadership_notes where organisation_id=$1 and activity_id=$2 union all select 1 from guidance_activities where organisation_id=$1 and source_session_id=$2 limit 1',[org,after.id])).rowCount)throw new AccessError('Imported sessions now have edits, notes or linked tasks. Preserve their history.',409)}
   }
   for(const before of existing.before_records){if(before.target==='registry'){
    if(before.payload.counsellorId&&!(await db.query("select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher')",[org,before.payload.counsellorId])).rowCount)throw new AccessError('An earlier staff assignment is no longer active. Review manually.',409)
    await db.query('update student_registry_records set payload=$3,version=version+1,updated_by=$4,updated_at=now() where organisation_id=$1 and external_key=$2',[org,before.key,before.payload,auth.userId])
   }else if(before.target==='profile')await db.query('update student_guidance_profiles set details=$3,version=version+1,updated_by=$4,updated_at=now() where organisation_id=$1 and student_key=$2',[org,before.key,before.payload,auth.userId]);else await db.query('delete from guidance_activities where organisation_id=$1 and id=$2',[org,before.id])}
   await db.query("update school_record_imports set status='rolled_back',rolled_back_at=now() where id=$1",[body.id]);await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'import.records_rolled_back',$2,$3)",[org,auth.userId,{id:body.id}]);await db.query('commit');send(res,{ok:true});return true
  }
  const kind=body.kind as RecordImportKind;permission(auth,kind);const rows=body.rows as Row[];if(!Array.isArray(rows)||!rows.length||rows.length>100||hash(kind,rows)!==body.previewHash)throw new AccessError('The preview changed. Preview the CSV again.',409)
  if(existing){if(existing.organisation_id!==org||existing.created_by!==auth.userId||existing.request_hash!==body.previewHash||existing.status!=='completed')throw new AccessError('This import ID was already used.',409);await db.query('commit');send(res,{id:body.id,students:existing.student_keys.length,reused:true});return true}
  const keys=[...new Set(rows.map(r=>r.studentId))].sort();await db.query('select external_key from student_registry_records where organisation_id=$1 and external_key=any($2::text[]) order by external_key for update',[org,keys]);const prepared=await prepare(db,auth,kind,rows,true),before=[],after=[]
  for(const key of keys){const group=prepared.filter(p=>p.row.studentId===key),first=group[0]
   if(kind==='class'||kind==='staff'){before.push({key,target:'registry',payload:first.current.payload});const changes=kind==='class'?{grade:first.target}:{counsellorId:(first.target as {user_id:string}).user_id,counsellor:(first.target as {name:string}).name};const r=await db.query('update student_registry_records set payload=payload||$3::jsonb,version=version+1,updated_by=$4,updated_at=now() where organisation_id=$1 and external_key=$2 returning version',[org,key,changes,auth.userId]);after.push({key,target:'registry',version:Number(r.rows[0].version)})
   }else if(kind==='guardians'||kind==='academics'){before.push({key,target:'profile',payload:first.details});const details=validateStudentProfile({...first.details,[kind]:[...first.details[kind],...group.map(p=>p.target)]});const r=await db.query('insert into student_guidance_profiles(organisation_id,student_key,details,updated_by) values($1,$2,$3,$4) on conflict(organisation_id,student_key) do update set details=excluded.details,version=student_guidance_profiles.version+1,updated_by=excluded.updated_by,updated_at=now() returning version',[org,key,details,auth.userId]);after.push({key,target:'profile',version:Number(r.rows[0].version)})
   }else for(const p of group){await db.query("insert into guidance_activities(id,organisation_id,student_key,kind,title,scheduled_at,status,assigned_to,created_by,updated_by) values($1,$2,$3,'session',$4,$5,'completed',$6,$6,$6)",[p.row.entryId,org,key,p.row.values.title,p.row.values.scheduledAt,auth.userId]);await db.query('insert into guidance_session_records(organisation_id,activity_id,details,updated_by) values($1,$2,$3,$4)',[org,p.row.entryId,p.target,auth.userId]);before.push({key,target:'session',id:p.row.entryId});after.push({key,target:'session',id:p.row.entryId,version:1})}
  }
  await db.query('insert into school_record_imports(id,organisation_id,kind,request_hash,student_keys,before_records,after_records,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[body.id,org,kind,body.previewHash,keys,JSON.stringify(before),JSON.stringify(after),auth.userId]);await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'import.records_completed',$2,$3)",[org,auth.userId,{id:body.id,kind,students:keys.length,rows:rows.length}]);await db.query('commit');send(res,{id:body.id,students:keys.length,rows:rows.length});return true
 }catch(e){try{await db.query('rollback')}catch{/* Preserve original failure. */}throw e}finally{db.release()}
}
