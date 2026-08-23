import { supabase } from './supabaseClient'

type PrivatePayload = { records?: any[]; record?: any; ok?: boolean; error?: string }

const request = async (path: string, init?: RequestInit): Promise<PrivatePayload> => {
  if (!supabase) throw new Error('Authentication is unavailable.')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Please sign in to access private counsellor records.')
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(init?.headers || {}) },
  })
  const payload = (await response.json().catch(() => ({}))) as PrivatePayload
  if (!response.ok) throw new Error(payload.error || 'Counsellor data service is unavailable.')
  return payload
}

// The server derives identity from the verified access token; this label is never used as an ID.
export const activeCounsellorId = () => 'your counsellor account'
export const listPrivate = (type: string) => request(`/api/counsellor-records?type=${encodeURIComponent(type)}`)
export const savePrivate = (type: string, key: string, payload: unknown) => request(`/api/counsellor-records?type=${encodeURIComponent(type)}`, { method: 'PUT', body: JSON.stringify({ type, key, payload }) })
export const deletePrivate = (type: string, key: string) => request(`/api/counsellor-records?type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`, { method: 'DELETE' })
