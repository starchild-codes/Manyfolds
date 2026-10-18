import { withAuthTimeout } from './authErrors'
import { supabase } from './supabaseClient'

export type StudentRecord = {
  id: string
  name: string
  initials: string
  grade: string
  stage: string
  counsellor: string
  counsellorId?: string
  followUp: string
  pathway: string
  priority?: string
  completion: number
  version: number
  archivedAt?:string|null
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  if (!supabase) throw new Error('Authentication is unavailable.')
  const { data: { session } } = await withAuthTimeout(supabase.auth.getSession())
  if (!session) throw new Error('Please sign in to access students.')
  const response = await fetch(`/api/students${path}`, {
    ...init,
    signal: init?.signal || AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...init?.headers },
  })
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error || 'Student register is unavailable.')
  return result as T
}

export const listStudents = async () => (await request<{records:StudentRecord[]}>('')).records
export const listArchivedStudents = async () => (await request<{records:StudentRecord[]}>('?archived=only')).records
export const restoreStudentRecord = async (record:StudentRecord) => (await request<{record:StudentRecord}>(`?key=${encodeURIComponent(record.id)}`,{method:'PATCH',body:JSON.stringify({expectedVersion:record.version})})).record
export const createStudentRecord = async (record: StudentRecord) => (await request<{record:StudentRecord}>('', { method: 'POST', body: JSON.stringify({ record }) })).record
export const updateStudentRecord = async (record: StudentRecord) => (await request<{record:StudentRecord}>(`?key=${encodeURIComponent(record.id)}`, { method: 'PUT', body: JSON.stringify({ record, expectedVersion: record.version }) })).record
export const deleteStudentRecord = async (record: StudentRecord) => request<{ok:boolean}>(`?key=${encodeURIComponent(record.id)}&version=${record.version}`, { method: 'DELETE' })
