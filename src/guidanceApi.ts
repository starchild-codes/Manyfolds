import { withAuthTimeout } from './authErrors'
import { supabase } from './supabaseClient'
export type GuidanceActivity={id:string;student_key:string;kind:'session'|'task';title:string;scheduled_at:string;status:'scheduled'|'open'|'completed'|'cancelled';summary:string;version:number;mine:boolean;student_name?:string;student_grade?:string}
export type ActivityInput={studentKey:string;kind:'session'|'task';title:string;scheduledAt:string;status:GuidanceActivity['status'];summary:string;version?:number;requestId?:string}
export const guidanceRequest=async<T>(path:string,init?:RequestInit):Promise<T>=>{
  if(!supabase)throw new Error('Authentication is unavailable.')
  const {data:{session}}=await withAuthTimeout(supabase.auth.getSession())
  if(!session)throw new Error('Please sign in to access guidance activities.')
  const response=await fetch(`/api/guidance${path}`,{...init,signal:init?.signal||AbortSignal.timeout(30_000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data.error||'Guidance activities are unavailable.')
  return data as T
}
export const listActivities=async()=>(await guidanceRequest<{activities:GuidanceActivity[]}>('')).activities
export const saveActivity=async(record:ActivityInput,id?:string)=>(await guidanceRequest<{activity:GuidanceActivity}>(id?`?id=${encodeURIComponent(id)}`:'',{method:id?'PATCH':'POST',body:JSON.stringify(record)})).activity
export const activityInput=(record:GuidanceActivity):ActivityInput=>({studentKey:record.student_key,kind:record.kind,title:record.title,scheduledAt:record.scheduled_at,status:record.status,summary:record.summary,version:record.version})
