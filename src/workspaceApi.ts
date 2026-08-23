import { supabase } from './supabaseClient'

export type Workspace = { organisation_id: string; role: string; name: string; school_type?: string; city?: string; state?: string; country?: string; approximate_student_count?: number }
const request = async (path: string, init?: RequestInit) => {
  if (!supabase) throw new Error('Authentication is unavailable.')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Please sign in to continue.')
  const response = await fetch(path, { ...init, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}`, ...(init?.headers||{}) } })
  const body = await response.json().catch(()=>({})) as { memberships?:Workspace[]; workspace?:Workspace; error?:string }
  if (!response.ok) throw new Error(body.error||'Workspace information could not be loaded.')
  return body
}
export const getWorkspaces = async () => (await request('/api/workspace')).memberships||[]
export const createWorkspace = (payload: unknown) => request('/api/workspace/onboarding',{method:'POST',body:JSON.stringify(payload)})
