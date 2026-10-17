import type { IncomingMessage,ServerResponse } from 'node:http'
import type { Pool } from 'pg'
import type { AuthContext } from '../ai/types.ts'
import { checkedDatabaseClient,readDatabase } from '../database.ts'
export class SavedPathError extends Error {readonly statusCode:number;constructor(message:string,statusCode=400){super(message);this.statusCode=statusCode}}
const present='name,type,path,preferred'
export async function savedPathsRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext){
 const send=(value:unknown)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value))}
 if(req.method==='GET'){send({items:(await readDatabase(pool,`select ${present} from staff_saved_pathways where organisation_id=$1 and author_id=$2 order by created_at,path`,[auth.organisationId,auth.userId])).rows});return}
 if(!['POST','PATCH','DELETE'].includes(req.method||''))throw new SavedPathError('Method not allowed.',405)
 let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>8000)throw new SavedPathError('Saved option is too large.',413)}let input:Record<string,unknown>;try{input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))throw Error()}catch{throw new SavedPathError('Provide a saved option.')}
 if(typeof input.path!=='string'||input.path.length>1600||!input.path.startsWith('/')||input.path.startsWith('//')||input.path.includes('\\')||Array.from(input.path).some(char=>char.charCodeAt(0)<=32))throw new SavedPathError('Choose a valid internal Manyfolds page.')
 const url=new URL(input.path,'https://manyfolds.invalid');if(url.origin!=='https://manyfolds.invalid'||url.hash||!/^\/(careers|courses|colleges|programmes)\/[^/]+$/.test(url.pathname)&&url.pathname!=='/dashboard')throw new SavedPathError('Choose a supported Manyfolds page.')
 if(url.pathname==='/dashboard'&&!['careers','courses','institutions','exams','scholarships'].includes(url.searchParams.get('view')||''))throw new SavedPathError('Choose a verified catalogue view.')
 const path=url.pathname+url.search,db=await checkedDatabaseClient(pool)
 try{
  await db.query('begin');await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`saved-paths:${auth.organisationId}:${auth.userId}`])
  const values=[auth.organisationId,auth.userId,path]
  if(req.method==='POST'){
   if(typeof input.name!=='string'||!input.name.trim()||input.name.length>300||typeof input.type!=='string'||!input.type.trim()||input.type.length>80)throw new SavedPathError('The saved option needs a name and type.')
   const existing=await db.query('select 1 from staff_saved_pathways where organisation_id=$1 and author_id=$2 and path=$3',values)
   if(!existing.rowCount){const count=await db.query('select count(*)::int total from staff_saved_pathways where organisation_id=$1 and author_id=$2',values.slice(0,2));if(count.rows[0].total>=500)throw new SavedPathError('Keep at most 500 saved options. Remove an unused option first.',409);await db.query('insert into staff_saved_pathways(organisation_id,author_id,path,name,type) values($1,$2,$3,$4,$5)',[...values,input.name.trim(),input.type.trim()])}
  }else if(req.method==='DELETE')await db.query('delete from staff_saved_pathways where organisation_id=$1 and author_id=$2 and path=$3',values)
  else{
   const existing=await db.query('select 1 from staff_saved_pathways where organisation_id=$1 and author_id=$2 and path=$3',values);if(!existing.rowCount)throw new SavedPathError('This option is no longer saved. Reload My Plan.',404)
   await db.query('update staff_saved_pathways set preferred=false where organisation_id=$1 and author_id=$2 and preferred',values.slice(0,2));await db.query('update staff_saved_pathways set preferred=true where organisation_id=$1 and author_id=$2 and path=$3',values)
  }
  const result=await db.query(`select ${present} from staff_saved_pathways where organisation_id=$1 and author_id=$2 order by created_at,path`,values.slice(0,2));await db.query('commit');send({items:result.rows})
 }catch(error){await db.query('rollback');throw error}finally{db.release()}
}
