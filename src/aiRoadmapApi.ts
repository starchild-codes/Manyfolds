import { supabase } from './supabaseClient'
import { withAuthTimeout } from './authErrors'

export type AiRoadmap = {
  roadmap_title: string
  career_id: string
  summary: string
  why_it_fits: Array<{ factor: string; student_evidence: string }>
  important_tradeoffs: string[]
  eligibility_summary: {
    status: 'eligible' | 'conditionally_eligible' | 'currently_ineligible' | 'insufficient_data'
    explanation: string
    missing_requirements: string[]
    source_record_ids: string[]
  }
  stages: Array<{
    stage: 'now' | 'next_6_months' | 'before_applications' | 'admissions' | 'during_course' | 'early_career'
    title: string
    description: string
    mandatory: boolean
    status: 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'informational'
    suggested_target_date: string | null
    verified_deadline: string | null
    date_type: 'planning_suggestion' | 'verified_application_deadline' | 'verified_exam_date' | 'verified_counselling_date' | 'verified_scholarship_deadline' | 'informational' | 'unknown'
    source_record_ids: string[]
    unverified: boolean
  }>
  course_options: Array<{
    course_id: string
    reason: string
    concerns: string[]
    source_record_ids: string[]
  }>
  college_programmes: Array<{
    programme_id: string
    reason: string
    eligibility_status: string
    admission_route_summary: string
    source_record_ids: string[]
  }>
  exam_steps: Array<{
    exam_id: string
    reason: string
    status: string
    source_record_ids: string[]
  }>
  backup_routes: Array<{
    title: string
    description: string
    course_ids: string[]
    programme_ids: string[]
    source_record_ids: string[]
  }>
  next_actions: Array<{
    action: string
    priority: 'high' | 'medium' | 'low'
    reason: string
    source_record_ids: string[]
  }>
  questions_for_counsellor: string[]
  missing_or_unverified: Array<{ field: string; message: string }>
  decisive_constraints: Array<{ constraint_id: string; constraint_type: string; student_preference: string; effect_on_roadmap: string; status: string; affected_section_ids: string[]; source_record_ids: string[] }>
}

export type AiRoadmapSource = {
  record_id: string
  entity_type: string
  entity_id: string
  name: string
  source_url: string
  source_domain: string
  verification_status: string
  admission_cycle: string | null
  last_verified_at: string | null
}

export type AiRoadmapGeneration = {
  id: string
  version:number
  counsellorNotes?:string
  roadmap: AiRoadmap
  status: string
  generatedAt: string
  updatedAt: string
  notice: string
  validationWarnings: string[]
  sources: AiRoadmapSource[]
  verifiedDates: Array<{ deadline: string; cycle: string; programmeName: string; sourceUrl: string }>
  missingData: string[]
  cached: boolean
}

export class RoadmapRequestError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'RoadmapRequestError'
    this.statusCode = statusCode
  }
}

const request = async (path: string, init?: RequestInit) => {
  if (!supabase) throw new Error('Authentication is unavailable.')
  const {
    data: { session },
  } = await withAuthTimeout(supabase.auth.getSession())
  if (!session) throw new Error('Please sign in before generating a roadmap.')
  const response = await fetch(path, {
    ...init,
    signal:init?.signal||AbortSignal.timeout(init?.method==='POST'?130_000:30_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers || {}),
    },
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The roadmap request took too long. Reload to check for a saved draft before trying again.')
    }
    throw error
  })
  const payload = (await response.json().catch(() => ({}))) as {
    generation?: AiRoadmapGeneration | null
    error?: string
  }
  if (!response.ok) {
    throw new RoadmapRequestError(
      payload.error ||
        'We could not generate the roadmap right now. Your saved profile and recommendations are unchanged.',
      response.status,
    )
  }
  return payload.generation || null
}

export const getLatestAiRoadmap = (studentExternalId?:string) => request(`/api/ai-roadmaps/latest${studentExternalId?`?student_external_id=${encodeURIComponent(studentExternalId)}`:''}`)

export const generateAiRoadmap = (body: {
  studentExternalId?: string
  profile: Record<string, unknown>
  primaryCareer: { name: string; fitFactors: string[]; concerns: string[] }
  alternativeCareers: Array<{ name: string; fitFactors: string[]; concerns: string[] }>
  force?: boolean
}) =>
  request('/api/ai-roadmaps', {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const updateAiRoadmap = (
  id: string,
  body: { status?: string; counsellorNotes?: string; roadmap?: AiRoadmap; expectedVersion:number },
) =>
  request(`/api/ai-roadmaps/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
