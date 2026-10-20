import {AccessError,assertStudentAccess,assertAreaAccess} from '../access.ts'
import {interventionsRequest} from './interventions.ts'
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type User } from '@supabase/supabase-js'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { getDatabasePool, attachDatabasePool, checkedDatabaseClient, readDatabase } from '../database.ts'
import { createAiConfig } from '../ai/config.ts'
import { authenticateRoadmapRequest, AuthenticationError } from '../ai/auth.ts'

class RequestError extends Error { readonly statusCode:number; constructor(message:string,statusCode=400){super(message);this.statusCode=statusCode} }
const reply=(res:ServerResponse,status:number,body:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
const read=async(req:IncomingMessage)=>{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>64000)throw new RequestError('Record is too large.',413)}try{const body:unknown=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body as Record<string,unknown>}catch{throw new RequestError('Provide a valid JSON record.')}}
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const hash=(token:string)=>createHash('sha256').update(token).digest('hex')
const writeRoles=['owner','admin','lead_counsellor','counsellor','guidance_teacher']

export function schoolApi(env:Record<string,string|undefined>,authenticate:typeof authenticateRoadmapRequest=authenticateRoadmapRequest,identify?:(req:IncomingMessage)=>Promise<Pick<User,'id'|'email'>>):Plugin {
 const config=createAiConfig(env),pool=getDatabasePool(config.databaseUrl)
 const user=identify|| (async(req:IncomingMessage)=>{const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!token)throw new AuthenticationError('Please sign in to accept this invitation.');const client=createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw new AuthenticationError('Please sign in again.');if(!data.user.email_confirmed_at)throw new AuthenticationError('Confirm your email before accepting a school invitation.',403);return data.user})
 const mount=(server:ViteDevServer|PreviewServer)=>{
 server.middlewares.use('/api/school',async(req,res)=>{try{
  const path=new URL(req.url||'/','http://localhost').pathname
  if(path==='/invitation'){
   if(req.method!=='POST'&&req.method!=='PUT')throw new RequestError('Method not allowed.',405)
   const actor=await user(req),body=await read(req),token=String(body.token||'')
   if(!/^[a-f0-9]{64}$/.test(token))throw new RequestError('This invitation link is invalid.',404)
   const db=await checkedDatabaseClient(pool);try{await db.query('begin');await db.query('select pg_advisory_xact_lock(hashtext($1))',[actor.id]);
    const result=await db.query(`select i.*,o.name,o.active school_active from school_staff_invitations i join organisations o on o.id=i.organisation_id where token_hash=$1 for update of i`,[hash(token)]);const invite=result.rows[0]
    if(invite?.school_active===false)throw new RequestError('School access is suspended. Contact your school administrator.',403)
    if(!invite||invite.revoked_at||new Date(invite.expires_at).getTime()<Date.now())throw new RequestError('This invitation is expired or revoked. Ask your school admin for a new link.',410)
    if(invite.email!==actor.email?.toLowerCase())throw new RequestError('Sign in with the email address this invitation was sent to.',403)
    if(invite.accepted_at&&invite.accepted_by!==actor.id)throw new RequestError('This invitation has already been accepted.',409)
    if(invite.accepted_at){const membership=await db.query('select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active',[invite.organisation_id,actor.id]);if(!membership.rowCount)throw new RequestError('Your access to this school was removed. Ask the school owner for a new invitation.',410)}
    if(req.method==='POST'){await db.query('commit');return reply(res,200,{invitation:{school:invite.name,role:invite.role,email:invite.email,accepted:Boolean(invite.accepted_at)}})}
    if(req.method!=='PUT')throw new RequestError('Method not allowed.',405)
    if(!invite.accepted_at){
     const inviter=await db.query("select role from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in ('owner','admin')",[invite.organisation_id,invite.created_by]);if(!inviter.rowCount||(invite.role==='admin'&&inviter.rows[0].role!=='owner'))throw new RequestError('This invitation is no longer authorised. Ask your school owner for a new link.',410)
     const other=await db.query('select 1 from organisation_memberships where user_id=$1 and active and organisation_id<>$2',[actor.id,invite.organisation_id]);if(other.rowCount)throw new RequestError('Your account already belongs to another school. Use your invited school email account, or ask your current school owner to remove your existing membership.',409)
     const existing=await db.query('select role,active from organisation_memberships where user_id=$1 and organisation_id=$2 for update',[actor.id,invite.organisation_id]);
     if(existing.rows[0]?.active)throw new RequestError('You already have access to this school. Open your dashboard.',409)
     await db.query(`insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,$3) on conflict(organisation_id,user_id) do update set role=excluded.role,active=true`,[invite.organisation_id,actor.id,invite.role]);
     await db.query('update school_staff_invitations set accepted_at=now(),accepted_by=$2 where id=$1',[invite.id,actor.id]);
    }await db.query('commit');return reply(res,200,{ok:true})
   }catch(error){await db.query('rollback');throw error}finally{db.release()}
  }
  const auth=await authenticate(req,pool,config,'school'),admin=['owner','admin'].includes(auth.role)
  assertAreaAccess(auth,'school',path,req.method||'GET')
  if(path==='/staff'){
   if(!admin)throw new RequestError('Only school owners and admins can manage staff.',403)
   if(req.method==='GET'){
    const staff=await readDatabase(pool,`select m.user_id::text,m.role,m.active,u.email from organisation_memberships m left join auth.users u on u.id::text=m.user_id::text where m.organisation_id=$1 order by m.created_at`,[auth.organisationId]);
    const invitations=await readDatabase(pool,'select id,email,role,expires_at,revoked_at,accepted_at,created_at from school_staff_invitations where organisation_id=$1 order by created_at desc',[auth.organisationId]);return reply(res,200,{staff:staff.rows,invitations:invitations.rows})
   }
   if(req.method==='POST'){
    const body=await read(req),email=String(body.email||'').trim().toLowerCase(),role=String(body.role||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!['admin','lead_counsellor','counsellor','guidance_teacher','teacher','data_entry','reviewer'].includes(role))throw new RequestError('Provide a valid email and staff role.');if(role==='admin'&&auth.role!=='owner')throw new RequestError('Only the school owner can invite admins.',403)
    if(!uuid(body.requestId)||typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw new RequestError('A valid invitation request is required.')
    const token=body.token,id=body.requestId,db=await checkedDatabaseClient(pool);try{const saved=await db.query(`insert into school_staff_invitations(id,organisation_id,email,role,token_hash,created_by,expires_at) values($1,$2,$3,$4,$5,$6,now()+interval '7 days') on conflict(id) do nothing returning id,email,role,expires_at`,[id,auth.organisationId,email,role,hash(token),auth.userId]);if(!saved.rowCount){const previous=await db.query('select id,email,role,expires_at from school_staff_invitations where id=$1 and organisation_id=$2 and email=$3 and role=$4 and token_hash=$5 and created_by=$6 and revoked_at is null and accepted_at is null and expires_at>now()',[id,auth.organisationId,email,role,hash(token),auth.userId]);if(!previous.rowCount)throw new RequestError('Invitation request already used. Create a new invitation.',409);return reply(res,200,{invitation:previous.rows[0],token})}return reply(res,201,{invitation:saved.rows[0],token})}finally{db.release()}

   }
   if(req.method==='PATCH'){
    const body=await read(req)
    const db=await checkedDatabaseClient(pool);try{await db.query('begin');await db.query("select set_config('manyfolds.actor',$1,true)",[auth.userId]);
    if(body.invitationId){if(!uuid(body.invitationId))throw new RequestError('Choose a valid invitation.');const updated=await db.query('update school_staff_invitations set revoked_at=now() where organisation_id=$1 and id=$2 and accepted_at is null and revoked_at is null returning id',[auth.organisationId,body.invitationId]);if(!updated.rowCount)throw new RequestError('Invitation is unavailable.',404);await db.query('commit');return reply(res,200,{ok:true})}
    if(!uuid(body.userId)||body.userId===auth.userId)throw new RequestError('Choose another staff member.');
    if(body.role!==undefined&&((typeof body.role!=='string'||!['admin','lead_counsellor','teacher','counsellor','guidance_teacher','data_entry','reviewer'].includes(body.role))||(body.role==='admin'&&auth.role!=='owner')))throw new RequestError('Only the school owner can assign an admin.',403)
    const result=await db.query(`update organisation_memberships set active=case when $4::text is null then false else true end,role=coalesce($4,role) where organisation_id=$1 and user_id=$2 and active and role<>'owner' and ($3='owner' or role<>'admin') returning user_id`,[auth.organisationId,body.userId,auth.role,body.role??null]);if(!result.rowCount)throw new RequestError('You cannot change this member.',403);await db.query('commit');return reply(res,200,{ok:true})
    }catch(error){await db.query('rollback');throw error}finally{db.release()}
   }
  }
  if(path==='/diagnostics'){
   const studentKey=new URL(req.url||'/','http://localhost').searchParams.get('student')||''
   if(!studentKey)throw new RequestError('Select a student.')
   await assertStudentAccess(pool,auth,studentKey)
   if(req.method==='GET'){const result=await readDatabase(pool,'select * from student_diagnostic_history where organisation_id=$1 and student_key=$2 order by revision desc',[auth.organisationId,studentKey]);return reply(res,200,{records:result.rows})}
   if(req.method==='POST'){
    if(!writeRoles.includes(auth.role))throw new RequestError('Your role cannot save diagnostics.',403)
    const body=await read(req),profile=body.profile as Record<string,unknown>
    if(!uuid(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0||!profile||typeof profile!=='object'||Array.isArray(profile)||!Number.isInteger(body.step)||Number(body.step)<0||Number(body.step)>6||!['draft','ready','review_requested'].includes(String(body.status))||!Array.isArray(body.pinned)||body.pinned.some(x=>typeof x!=='string'||x.length>200))throw new RequestError('Provide a valid diagnostic record.')
    // Reject malformed profiles before the client recommendation engine reads them.
    for(const field of ['bestSubjects','enjoyWeak','avoidSubjects','activities','work','values','route','ideas','exclusions'])if(!Array.isArray(profile[field])||(profile[field] as unknown[]).some(x=>typeof x!=='string'||x.length>200))throw new RequestError('Diagnostic answers are invalid.')
    for(const field of ['subjects','skills'])if(!profile[field]||typeof profile[field]!=='object'||Array.isArray(profile[field])||Object.values(profile[field] as object).some(x=>typeof x!=='string'))throw new RequestError('Diagnostic answers are invalid.')
    for(const field of ['grade','stream','country','state','city','geography','relocate','mode','scoreBand','consistency','budget','scholarship','examWillingness','duration'])if(typeof profile[field]!=='string'||String(profile[field]).length>500)throw new RequestError('Diagnostic answers are invalid.')
    for(const field of ['mathComfort','writingComfort','labComfort','examComfort'])if(!Number.isInteger(profile[field])||Number(profile[field])<1||Number(profile[field])>5)throw new RequestError('Diagnostic ratings are invalid.')
    if(typeof profile.nearHome!=='boolean')throw new RequestError('Diagnostic answers are invalid.')
    if(body.status!=='draft'&&(!profile.grade||!(Object.keys(profile.subjects as object).length||Object.keys(profile.skills as object).length||(profile.work as unknown[]).length)))throw new RequestError('Select the student’s grade and add at least one subject, skill or work preference before generating a report.')
    const db=await checkedDatabaseClient(pool);try{await db.query('begin');const student=await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for update',[auth.organisationId,studentKey]);if(!student.rowCount)throw new RequestError('Student is unavailable in your school.',404)
     const duplicate=await db.query('select id from student_diagnostic_history where id=$1',[body.requestId]);if(duplicate.rowCount){const same=await db.query('select * from student_diagnostic_history where id=$1 and organisation_id=$2 and student_key=$3 and created_by=$4 and revision=$5 and profile=$6::jsonb and step=$7 and status=$8 and pinned=$9::jsonb',[body.requestId,auth.organisationId,studentKey,auth.userId,Number(body.expectedRevision)+1,JSON.stringify(profile),body.step,body.status,JSON.stringify(body.pinned)]);if(!same.rowCount)throw new RequestError('Request already used. Reload before saving.',409);await db.query('commit');return reply(res,200,{record:same.rows[0]})}
     const latest=await db.query('select coalesce(max(revision),0)::int revision from student_diagnostic_history where organisation_id=$1 and student_key=$2',[auth.organisationId,studentKey]);if(latest.rows[0].revision!==body.expectedRevision)throw new RequestError('This diagnostic changed elsewhere. Reload before saving.',409)
     const saved=await db.query(`insert into student_diagnostic_history(id,organisation_id,student_key,revision,profile,step,status,pinned,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[body.requestId,auth.organisationId,studentKey,Number(body.expectedRevision)+1,profile,body.step,body.status,JSON.stringify(body.pinned),auth.userId]);await db.query('commit');return reply(res,201,{record:saved.rows[0]})
    }catch(error){await db.query('rollback');throw error}finally{db.release()}
   }
  }
  if(await interventionsRequest(req,res,pool,auth,new URL(req.url||'/','http://localhost')))return
  if(path==='/reports'&&req.method==='GET'){
   const params=new URL(req.url||'/','http://localhost').searchParams,from=new Date(params.get('from')||''),to=new Date(params.get('to')||'')
   if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to)throw new RequestError('Choose a valid report date range.')
   const result=await readDatabase(pool,`select s.external_key student_key,s.payload->>'name' name,s.payload->>'grade' grade,
    (select count(*)::int from guidance_activities a where a.organisation_id=s.organisation_id and a.student_key=s.external_key and a.kind='session' and a.status='completed' and a.scheduled_at>=$2 and a.scheduled_at<$3) completed_sessions,
    (select count(*)::int from guidance_activities a where a.organisation_id=s.organisation_id and a.student_key=s.external_key and a.kind='task' and a.status not in('completed','cancelled') and a.scheduled_at<now()) overdue_tasks,
    (select count(*)::int from guidance_activities a where a.organisation_id=s.organisation_id and a.student_key=s.external_key and a.kind='task' and a.status='completed' and a.scheduled_at>=$2 and a.scheduled_at<$3) completed_tasks,
    (select count(*)::int from student_diagnostic_history d where d.organisation_id=s.organisation_id and d.student_key=s.external_key and d.status<>'draft' and d.created_at>=$2 and d.created_at<$3) diagnostic_saves,
    (select count(*)::int from school_intervention_students p join school_interventions i on i.id=p.intervention_id where p.organisation_id=s.organisation_id and p.student_key=s.external_key and i.status='completed' and i.details->'attendance'->>s.external_key='Present' and i.scheduled_at>=$2 and i.scheduled_at<$3) completed_interventions
    from student_registry_records s where s.organisation_id=$1 and s.archived_at is null and public.school_can_access_student(s.organisation_id,s.external_key,$4) order by s.payload->>'name'`,[auth.organisationId,from.toISOString(),to.toISOString(),auth.userId]);return reply(res,200,{records:result.rows,generatedAt:new Date().toISOString()})
  }
  return reply(res,404,{error:'School endpoint not found.'})
 }catch(error){const known=error instanceof RequestError||error instanceof AccessError || error instanceof AuthenticationError;if(!known)console.error('School request failure code:',(error as {code?:string}).code||'unknown',error instanceof Error?error.stack?.split('\n').slice(1,4).join('\n'):'');return reply(res,known?error.statusCode:503,{error:known?error.message:'Could not confirm this request. Reload before retrying.'})}})
 attachDatabasePool(pool,server.httpServer)
 }
 return {name:'manyfolds-school-api',configureServer:mount,configurePreviewServer:mount}
}
