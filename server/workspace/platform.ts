import {randomUUID} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import {checkedDatabaseClient,readDatabase} from '../database.ts'
export async function platformRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,userId:string,allowed:Set<string>){
 const url=new URL(req.url||'/','http://localhost');if(url.pathname!=='/platform')return false
 const send=(status:number,value:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value))}
 if(!allowed.has(userId)){send(403,{error:'Platform administration is restricted to explicitly configured operators.'});return true}
 if(req.method==='GET'){const result=await readDatabase(pool,`select o.id,o.name,o.school_type,o.city,o.state,o.country,o.active,o.access_version,o.updated_at,(select count(*)::int from organisation_memberships m where m.organisation_id=o.id and m.active) active_staff,(select count(*)::int from student_registry_records s where s.organisation_id=o.id and s.archived_at is null) active_students from organisations o order by o.created_at desc`);send(200,{schools:result.rows});return true}
 if(!['POST','PATCH'].includes(req.method||'')){send(405,{error:'Method not allowed.'});return true}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000){send(413,{error:'School request is too large.'});return true}}let b:Record<string,unknown>;try{b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error()}catch{send(400,{error:'Provide a valid school request.'});return true}
 const reason=typeof b.reason==='string'?b.reason.trim():'';if(reason.length<3||reason.length>1000){send(400,{error:'A reason is required for platform changes.'});return true}
 const db=await checkedDatabaseClient(pool)
 try{await db.query('begin')
  if(req.method==='PATCH'){
   if(typeof b.id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.id)||typeof b.active!=='boolean'||!Number.isInteger(b.version)||Number(b.version)<1){await db.query('rollback');send(400,{error:'Choose a current school and access status.'});return true}
   const result=await db.query('update organisations set active=$2,access_version=access_version+1,updated_at=now() where id=$1 and access_version=$3 returning id',[b.id,b.active,b.version]);if(!result.rowCount){await db.query('rollback');send(409,{error:'School settings changed. Reload platform administration.'});return true}
   await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'platform.school_access_changed',$2,$3)",[b.id,userId,{active:b.active,reason}]);await db.query('commit');send(200,{ok:true});return true
  }
  const fields=Object.fromEntries(['name','schoolType','city','state','country','ownerEmail'].map(k=>[k,typeof b[k]==='string'?String(b[k]).trim():'']));if(['name','schoolType','city','state','ownerEmail'].some(k=>!fields[k]||fields[k].length>254)||!/^\S+@\S+\.\S+$/.test(fields.ownerEmail)){await db.query('rollback');send(400,{error:'Enter school details and its registered owner’s exact email.'});return true}
  const owner=await db.query('select id from auth.users where lower(email)=$1 and email_confirmed_at is not null',[fields.ownerEmail.toLowerCase()]);if(!owner.rowCount){await db.query('rollback');send(400,{error:'The owner must first register and verify their staff email.'});return true}
  const ownerId=owner.rows[0].id;await db.query('select pg_advisory_xact_lock(hashtext($1))',[ownerId]);if((await db.query('select 1 from organisation_memberships where user_id=$1 and active',[ownerId])).rowCount){await db.query('rollback');send(409,{error:'That staff account already belongs to a school.'});return true}
  const id=randomUUID();await db.query('insert into organisations(id,name,slug,school_type,city,state,country,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,fields.name,`school-${id}`,fields.schoolType,fields.city,fields.state,fields.country||'India',userId]);await db.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner')",[id,ownerId]);await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'platform.school_created',$2,$3)",[id,userId,{reason}]);await db.query('commit');send(201,{id});return true
 }catch(e){await db.query('rollback');throw e}finally{db.release()}
}
