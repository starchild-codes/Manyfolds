import { supabase } from './supabaseClient'

export type VerificationTask = {
  id: string
  task_type: string
  entity_type: string
  entity_id: string | null
  missing_field: string
  official_domain: string | null
  narrow_query: string | null
  status: string
  priority: number
  claimed_by: string | null
  claimed_at: string | null
  reviewer_notes: string | null
  conflict_notes: string | null
  result_source_urls: string[]
  created_at: string
}

export type PendingProgramme = {
  id: string
  institution_id: string
  institution_name: string
  campus: string | null
  programme_name: string
  degree_level: string | null
  course_id: string | null
  duration: string | null
  mode: string | null
  verification_status: string
  data_sufficient: boolean
  official_programme_url: string | null
  official_admissions_url: string | null
  last_verified_at: string | null
  source_url: string | null
  source_status: string | null
}

export type VerificationWorkspace = {
  gapStats: { stale_claims: number; conflicting_claims: number; expired_claims: number; verified_relationship_claims: number; programmes_missing_fees: number; pending_candidates: number }
  stateCoverage: Array<{ state: string; total: number; published: number }>
  candidates: Array<{ candidate_key: string; entity_type: string; source_url: string; source_cycle: string; payload: { name?: string; deadline?: string; applicationState?: string; applicationMode?: string }; detected_at: string; status: string }>
  coverage: Array<{ category: string; total: number; published: number }>
  claimStats: Array<{ verification_status: string; total: number }>
  sourceMonitors: Array<{ monitor_key: string; source_url: string; source_kind: string; entity_scope: string; last_checked_at: string | null; last_http_status: number | null; changed_at: string | null; next_check_at: string | null }>
  tasks: VerificationTask[]
  programmes: PendingProgramme[]
  queueCounts: Array<{ task_type: string; count: number }>
  events: Array<{
    id: string
    record_type: string
    record_id: string
    action: string
    previous_status: string | null
    next_status: string | null
    source_url: string | null
    notes: string | null
    created_at: string
  }>
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  if (!supabase) throw new Error('Authentication is unavailable.')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Please sign in to access data verification.')
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers || {}),
    },
  })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || 'The verification request failed.')
  return payload
}

export const getVerificationWorkspace = () =>
  request<VerificationWorkspace>('/api/verification')

export const reviewImportCandidate = (key: string, action: 'publish' | 'reject', notes: string) =>
  request<{ candidateKey: string; status: string }>(`/api/verification/candidates/${encodeURIComponent(key)}`, {
    method: 'PATCH', body: JSON.stringify({ action, notes }),
  })

export const updateVerificationTask = (
  id: string,
  body: {
    action?: string
    status?: string
    reviewerNotes?: string
    conflictNotes?: string
    resultSourceUrls?: string[]
  },
) =>
  request<VerificationTask>(`/api/verification/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const saveProgrammeCandidate = (body: Record<string, string>) =>
  request<{ id: string }>('/api/verification/programmes', {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const reviewProgrammeCandidate = (
  id: string,
  body: {
    status?: string
    sourceStatus?: string
    dataSufficient?: boolean
    notes?: string
  },
) =>
  request<{ id: string }>(`/api/verification/programmes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
