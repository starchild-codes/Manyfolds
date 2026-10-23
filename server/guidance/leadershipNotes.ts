import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {assertStudentAccess} from '../access.ts'
import {checkedDatabaseClient,readDatabase} from '../database.ts'
import {SessionError} from './sessionSchema.ts'
export const canLeadershipNote=(role:string)=>['owner','admin','lead_counsellor'].includes(role)
const send=(res:ServerResponse,body:unknown)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
export async function leadershipNoteRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(url.pathname!=='/session-leadership-note')return false
 if(!canLeadershipNote(auth.role))throw new SessionError('Leadership notes are limited to school owners, administrators and lead counsellors.',403)
 if(!['GET','PUT'].includes(req.method||''))throw new SessionError('Method not allowed.',405)
 const id=url.searchParams.get('id')||'',org=auth.organisationId
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new SessionError('Choose a saved session.')
 const activity=(await readDatabase(pool,"select student_key from guidance_activities where organisation_id=$1 and id=$2 and kind='session'",[org,id])).rows[0]
 if(!activity)throw new SessionError('Session unavailable in your school.',404)
 await assertStudentAccess(pool,auth,activity.student_key)
 if(req.method==='GET'){
  const revision=url.searchParams.get('revision');if(revision!==null&&(!/^\d+$/.test(revision)||!Number.isSafeInteger(Number(revision))||Number(revision)<1))throw new SessionError('Choose a valid leadership note revision.')
  const result=revision?await readDatabase(pool,'select body,version,recorded_at updated_at from guidance_session_leadership_note_history where organisation_id=$1 and activity_id=$2 and version=$3',[org,id,Number(revision)]):await readDatabase(pool,'select body,version,updated_at from guidance_session_leadership_notes where organisation_id=$1 and activity_id=$2',[org,id])
  if(revision&&!result.rowCount)throw new SessionError('Leadership note revision unavailable.',404)
  const history=await readDatabase(pool,"select h.version,h.recorded_at,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'full_name',''),'School leadership') actor_name from guidance_session_leadership_note_history h left join auth.users u on u.id=h.updated_by where h.organisation_id=$1 and h.activity_id=$2 order by h.version desc limit 100",[org,id])
  await pool.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'session.leadership_note_read',$2,$3,$4)",[org,auth.userId,activity.student_key,{activityId:id,version:result.rows[0]?.version||0}])
  send(res,{note:result.rows[0]||{body:'',version:0},history:history.rows});return true
 }
 if(url.searchParams.has('revision'))throw new SessionError('Historical revisions are read-only.',400)
 let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>100000)throw new SessionError('Leadership note is too large.',413)}
 let input:Record<string,unknown>;try{input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))throw Error()}catch{throw new SessionError('Provide a valid leadership note.')}
 if(typeof input.body!=='string'||input.body.length>20000||!Number.isSafeInteger(input.version)||Number(input.version)<0)throw new SessionError('Use a note of at most 20,000 characters and its current saved version.')
 const db=await checkedDatabaseClient(pool)
 try{await db.query('begin')
  const student=await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[org,activity.student_key]);if(!student.rowCount)throw new SessionError('Restore this student before editing leadership notes.',409)
  await assertStudentAccess(db,auth,activity.student_key)
  const saved=input.version===0?await db.query('insert into guidance_session_leadership_notes(organisation_id,activity_id,body,updated_by) values($1,$2,$3,$4) on conflict do nothing returning body,version,updated_at',[org,id,input.body,auth.userId]):await db.query('update guidance_session_leadership_notes set body=$3,version=version+1,updated_by=$4,updated_at=now() where organisation_id=$1 and activity_id=$2 and version=$5 returning body,version,updated_at',[org,id,input.body,auth.userId,input.version])
  if(!saved.rowCount)throw new SessionError('The leadership note changed elsewhere. Reload and review before saving.',409)
  await db.query('commit');send(res,{note:saved.rows[0]});return true
 }catch(e){try{await db.query('rollback')}catch{/* Preserve the original error. */}throw e}finally{db.release()}
}
