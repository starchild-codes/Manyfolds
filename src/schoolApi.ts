import { supabase } from './supabaseClient'
import type { Profile } from './recommendationEngine'
export async function schoolRequest<T>(path:string,init?:RequestInit):Promise<T>{
 if(!supabase)throw new Error('Authentication is unavailable.')
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Please sign in again.')
 const method=init?.method||'GET'
 let input:Record<string,unknown>={}
 try{if(typeof init?.body==='string')input=JSON.parse(init.body)}catch{/* Server validation handles malformed requests. */}
 const retrySafe=method==='GET'||(method==='POST'&&Boolean(input.requestId||input.id||path==='/invitation'))||(method==='PUT'&&path==='/invitation')
 const send=()=>fetch(`/api/school${path}`,{...init,signal:init?.signal||AbortSignal.timeout(30_000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,...init?.headers}})
 let retried=false
 let response:Response
 try{response=await send()}catch(error){if(!retrySafe)throw error;retried=true;response=await send()}
 if(response.status===503&&retrySafe&&!retried)response=await send()
 const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'School records are unavailable.');return body as T
}
export type DiagnosticSnapshot={id:string;revision:number;profile:Profile;step:number;status:'draft'|'ready'|'review_requested';pinned:string[];created_at:string}
export type Intervention={id:string;title:string;scheduled_at:string;status:'scheduled'|'completed'|'cancelled';summary:string;version:number;student_keys:string[]}
export const getDiagnostics=async(student:string)=>(await schoolRequest<{records:DiagnosticSnapshot[]}>(`/diagnostics?student=${encodeURIComponent(student)}`)).records
