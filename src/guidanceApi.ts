import { withAuthTimeout } from './authErrors'
import { supabase } from './supabaseClient'
import type {TaskDetails} from '../server/guidance/taskSchema'
export type GuidanceActivity={id:string;student_key:string;kind:'session'|'task';title:string;scheduled_at:string;status:'scheduled'|'open'|'in_progress'|'blocked'|'awaiting_evidence'|'completed'|'cancelled';summary:string;version:number;mine:boolean;student_name?:string;student_grade?:string;assigned_to?:string;task_details?:TaskDetails;duration_minutes?:number;completed_at?:string}
export type ActivityInput={studentKey:string;kind:'session'|'task';title:string;scheduledAt:string;status:GuidanceActivity['status'];summary:string;version?:number;requestId?:string;assignedTo?:string;taskDetails?:TaskDetails;durationMinutes?:number}
export const guidanceRequest=async<T>(path:string,init?:RequestInit):Promise<T>=>{
  if(!supabase)throw new Error('Authentication is unavailable.')
  const {data:{session}}=await withAuthTimeout(supabase.auth.getSession())
  if(!session)throw new Error('Please sign in to access guidance activities.')
  const send=()=>fetch(`/api/guidance${path}`,{...init,signal:init?.signal||AbortSignal.timeout(30_000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}})
  let input:Record<string,unknown>={};try{if(typeof init?.body==='string')input=JSON.parse(init.body)}catch{/* Server validates the request. */}
  const method=init?.method||'GET',safe=method==='GET'||method==='POST'&&(Boolean(input.requestId)&&(path===''||path.startsWith('/session-action')||path==='/calendar')||Boolean(input.id)&&path.startsWith('/task-comment'))
  let response:Response,retried=false
  try{response=await send()}catch(e){if(!safe)throw e;retried=true;response=await send()}
  let data=response.headers.get('Content-Type')?.includes('text/calendar')?await response.text():await response.json().catch(()=>({}))
  if(!retried&&safe&&response.status===503&&data.retryable===true){response=await send();data=await response.json().catch(()=>({}))}
  if(!response.ok)throw new Error(data.error||'Guidance activities are unavailable.')
  return data as T
}
export const listActivities=async()=>(await guidanceRequest<{activities:GuidanceActivity[]}>('')).activities
export const saveActivity=async(record:ActivityInput,id?:string)=>(await guidanceRequest<{activity:GuidanceActivity}>(id?`?id=${encodeURIComponent(id)}`:'',{method:id?'PATCH':'POST',body:JSON.stringify(record)})).activity
export const activityInput=(record:GuidanceActivity):ActivityInput=>({studentKey:record.student_key,kind:record.kind,title:record.title,scheduledAt:record.scheduled_at,status:record.status,summary:record.summary,version:record.version,assignedTo:record.assigned_to,taskDetails:record.task_details,durationMinutes:record.duration_minutes})
