import { withAuthTimeout } from './authErrors'
import { supabase } from './supabaseClient'
export async function operationsRequest<T>(path:string,init?:RequestInit):Promise<T>{
 if(!supabase)throw new Error('Authentication is unavailable.')
 const {data:{session}}=await withAuthTimeout(supabase.auth.getSession());if(!session)throw new Error('Please sign in again.')
 const method=init?.method||'GET';let body:Record<string,unknown>={};try{if(typeof init?.body==='string')body=JSON.parse(init.body)}catch{/* Server validates the request. */}
 const safe=method==='GET'||(method==='POST'&&Boolean(body.id))
 const send=()=>fetch(`/api/operations${path}`,{...init,signal:init?.signal||AbortSignal.timeout(30_000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,...init?.headers}})
 let response:Response,retried=false;try{response=await send()}catch(error){if(!safe)throw error;retried=true;response=await send()}
 if(response.status===503&&safe&&!retried){await response.text();response=await send()}
 const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'School operation failed. Reload before retrying.');return result as T
}
export const refreshStudents=()=>window.dispatchEvent(new Event('manyfolds-students-changed'))
