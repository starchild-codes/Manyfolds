import {AccessError,assertStudentAccess,canGuide,canCounsel,assertAreaAccess} from '../access.ts'
import { createHash,createHmac,timingSafeEqual } from 'node:crypto'
import type { IncomingMessage,ServerResponse } from 'node:http'
import type { Plugin,PreviewServer,ViteDevServer } from 'vite'
import { getDatabasePool,checkedDatabaseClient,attachDatabasePool,readDatabase } from '../database.ts'
import { createAiConfig } from '../ai/config.ts'
import { authenticateRoadmapRequest,AuthenticationError } from '../ai/auth.ts'
class DocumentError extends Error{readonly statusCode:number;constructor(message:string,statusCode=400){super(message);this.statusCode=statusCode}}
const reply=(res:ServerResponse,status:number,body:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
const body=async(req:IncomingMessage)=>{let input='';for await(const chunk of req){input+=chunk;if(Buffer.byteLength(input)>7_100_000)throw new DocumentError('Documents must be 5 MB or smaller.',413)}try{const parsed:unknown=JSON.parse(input);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed as Record<string,unknown>}catch{throw new DocumentError('Provide a valid document request.')}}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const text=(value:unknown,max=200)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new DocumentError('A document field is missing or invalid.');return value.trim()}
const categories=['Consent','Academic record','Student work','Meeting record','Summary','Pathway comparison','Institution document']
const writer=(role:string)=>canGuide(role)
const metadata='id,student_key,filename,media_type,category,visibility,size_bytes,created_by,created_at,archived_at'
export function studentDocumentsApi(env:Record<string,string|undefined>,authenticate:typeof authenticateRoadmapRequest=authenticateRoadmapRequest):Plugin{
 const config=createAiConfig(env),pool=getDatabasePool(config.databaseUrl),secret=env.DOCUMENT_SIGNING_SECRET||'',maxFileBytes=env.VERCEL?3_145_728:5_242_880
 const signature=(payload:string)=>createHmac('sha256',secret).update(payload).digest('hex')
 const mount=(server:ViteDevServer|PreviewServer)=>{
  server.middlewares.use('/api/student-documents',async(req,res)=>{try{
   const url=new URL(req.url||'/','http://localhost'),path=url.pathname
   if(path==='/download'&&req.method==='GET'){
    if(secret.length<32)throw new DocumentError('Document downloads are not configured.',503)
    const token=url.searchParams.get('token')||'',mac=url.searchParams.get('signature')||''
    if(token.length>1000||!/^[a-f0-9]{64}$/.test(mac)||!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(signature(token),'hex')))throw new DocumentError('This download link is invalid or expired.',401)
    let grant:{id:string;org:string;user:string;exp:number};try{grant=JSON.parse(Buffer.from(token,'base64url').toString('utf8'))}catch{throw new DocumentError('Invalid download link.',401)}
    if(!uuid(grant.id)||!uuid(grant.org)||!uuid(grant.user)||!Number.isInteger(grant.exp)||grant.exp<Date.now()||grant.exp>Date.now()+125_000)throw new DocumentError('This download link has expired. Request a new one.',401)
    const result=await readDatabase(pool,`select d.filename,d.media_type,d.content from school_student_documents d join organisation_memberships m on m.organisation_id=d.organisation_id and m.user_id=$3 and m.active where d.id=$1 and d.organisation_id=$2 and d.archived_at is null and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(d.organisation_id,d.student_key,$3) and (d.visibility='school_staff' or m.role in('owner','admin','lead_counsellor','counsellor'))`,[grant.id,grant.org,grant.user]);const file=result.rows[0];if(!file)throw new DocumentError('Document access is no longer available.',403)
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type',file.media_type);res.setHeader('Content-Disposition',`attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.filename).replaceAll("'",'%27')}`);res.setHeader('Content-Length',String(file.content.length));res.end(file.content);return
   }
   const auth=await authenticate(req,pool,config,'documents')
   assertAreaAccess(auth,'documents',path,req.method||'GET')
   if(url.searchParams.get('student'))await assertStudentAccess(pool,auth,url.searchParams.get('student')!)
   if(req.method==='GET'&&path==='/'){
    const key=text(url.searchParams.get('student'),120),result=await readDatabase(pool,`select ${metadata} from school_student_documents where organisation_id=$1 and student_key=$2 and ($3 or visibility='school_staff') order by created_at desc`,[auth.organisationId,key,canCounsel(auth.role)]);return reply(res,200,{records:result.rows,uploadEnabled:secret.length>=32,maxFileBytes})
   }
   const input=await body(req)
   if(typeof input.studentKey==='string')await assertStudentAccess(pool,auth,input.studentKey)
   if(req.method==='PATCH'&&uuid(input.id)){
    const target=await pool.query('select student_key from school_student_documents where id=$1 and organisation_id=$2',[input.id,auth.organisationId])
    if(!target.rowCount)throw new DocumentError('Document is unavailable.',404)
    await assertStudentAccess(pool,auth,target.rows[0].student_key)
   }
   if(path==='/link'&&req.method==='POST'){
    if(secret.length<32)throw new DocumentError('Document downloads are not configured.',503)
    if(!uuid(input.id))throw new DocumentError('Choose a valid document.')
    const allowed=await readDatabase(pool,"select student_key from school_student_documents where id=$1 and organisation_id=$2 and archived_at is null and ($3 or visibility='school_staff')",[input.id,auth.organisationId,writer(auth.role)]);if(!allowed.rowCount)throw new DocumentError('Document is unavailable.',404);await assertStudentAccess(pool,auth,allowed.rows[0].student_key)
    const exp=Date.now()+120_000,token=Buffer.from(JSON.stringify({id:input.id,org:auth.organisationId,user:auth.userId,exp})).toString('base64url');await pool.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key) values($1,'document.download_requested',$2,$3)",[auth.organisationId,auth.userId,input.id]);return reply(res,200,{downloadUrl:`/api/student-documents/download?token=${token}&signature=${signature(token)}`,expiresAt:new Date(exp).toISOString()})
   }
   if(!writer(auth.role))throw new DocumentError('Your role can read shared documents but cannot upload or archive files.',403)
   const db=await checkedDatabaseClient(pool);try{await db.query('begin');await db.query("select set_config('manyfolds.actor',$1,true)",[auth.userId]);
    if(path==='/'&&req.method==='POST'){
     if(secret.length<32)throw new DocumentError('Document storage requires a configured signing secret.',503)
     const id=input.id,key=text(input.studentKey,120),filename=text(input.filename).replace(/[\r\n\\/]/g,'_'),category=text(input.category),visibility=text(input.visibility),encoded=text(input.content,7_000_000)
     if(visibility==='counselling_staff'&&!canCounsel(auth.role))throw new DocumentError('Choose school staff visibility for this role.',403);if(!uuid(id)||!categories.includes(category)||!['school_staff','counselling_staff'].includes(visibility)||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new DocumentError('Document metadata or file encoding is invalid.')
     const content=Buffer.from(encoded,'base64');if(!content.length||content.length>maxFileBytes)throw new DocumentError(`Use a document between 1 byte and ${maxFileBytes/1_048_576} MB.`,413)
     let media='';if(filename.toLowerCase().endsWith('.pdf')&&content.subarray(0,5).toString()==='%PDF-')media='application/pdf';if(filename.toLowerCase().endsWith('.png')&&content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))media='image/png';if(/\.jpe?g$/i.test(filename)&&content[0]===255&&content[1]===216&&content[2]===255)media='image/jpeg';if(/\.txt$/i.test(filename)&&!content.includes(0)&&Buffer.from(content.toString('utf8')).equals(content))media='text/plain';if(!media)throw new DocumentError('Upload a valid PDF, PNG, JPEG or UTF-8 text file.',415)
     await db.query('select id from organisations where id=$1 for update',[auth.organisationId]);const student=await db.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null for key share',[auth.organisationId,key]);if(!student.rowCount)throw new DocumentError('Student is unavailable or archived.',404)
     const hash=createHash('sha256').update(content).digest('hex'),previous=await db.query(`select ${metadata},sha256 from school_student_documents where id=$1`,[id]);if(previous.rowCount){const row=previous.rows[0];if(row.student_key!==key||row.created_by!==auth.userId||row.sha256!==hash||row.filename!==filename||row.visibility!==visibility||row.category!==category||row.archived_at)throw new DocumentError('This upload request was already used.',409);const owned=await db.query('select 1 from school_student_documents where id=$1 and organisation_id=$2',[id,auth.organisationId]);if(!owned.rowCount)throw new DocumentError('This upload request was already used.',409);await db.query('commit');const {sha256:_hash,...record}=row;return reply(res,200,{record})}
     const quota=await db.query('select coalesce(sum(size_bytes),0)::bigint total,count(*) filter(where student_key=$2)::int student_count from school_student_documents where organisation_id=$1',[auth.organisationId,key]);if(Number(quota.rows[0].total)+content.length>1_073_741_824||quota.rows[0].student_count>=100)throw new DocumentError('Document storage limit reached (1 GB per school, 100 files per student). Contact your school administrator.',409)
     const saved=await db.query(`insert into school_student_documents(id,organisation_id,student_key,filename,media_type,category,visibility,content,size_bytes,sha256,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${metadata}`,[id,auth.organisationId,key,filename,media,category,visibility,content,content.length,hash,auth.userId]);await db.query('commit');return reply(res,201,{record:saved.rows[0]})
    }
    if(path==='/'&&req.method==='PATCH'){
     if(!uuid(input.id)||typeof input.archived!=='boolean')throw new DocumentError('Choose a document and archive state.')
     const result=await db.query(`update school_student_documents set archived_at=case when $4 then now() else null end,archived_by=case when $4 then $2 else null end where id=$1 and organisation_id=$3 and ($5 or created_by=$2) returning ${metadata}`,[input.id,auth.userId,auth.organisationId,input.archived,['owner','admin'].includes(auth.role)]);if(!result.rowCount)throw new DocumentError('You cannot change this document.',403);await db.query('commit');return reply(res,200,{record:result.rows[0]})
    }
    throw new DocumentError('Document endpoint not found.',404)
   }catch(error){await db.query('rollback');throw error}finally{db.release()}
  }catch(error){const known=error instanceof DocumentError||error instanceof AccessError || error instanceof AuthenticationError;return reply(res,known?error.statusCode:503,{error:known?error.message:'The document operation could not be confirmed. Reload before retrying.'})}})
  attachDatabasePool(pool,server.httpServer)
 }
 return {name:'manyfolds-student-documents',configureServer:mount,configurePreviewServer:mount}
}
