export type VerificationStatus =
  | 'verified'
  | 'pending_review'
  | 'stale'
  | 'conflicting'
  | 'unavailable'
  | 'archived'

export type CompactSourceRecord = {
  record_id: string
  entity_type: 'career' | 'course' | 'programme' | 'exam' | 'scholarship' | 'admission_cycle' | 'relationship'
  entity_id: string
  name: string
  source_url: string
  source_domain: string
  verification_status: VerificationStatus
  admission_cycle: string | null
  last_verified_at: string | null
}

export type RoadmapStudentSummary = {
  student_id: string
  grade_level: string
  board: string
  current_location?: { state: string; city: string }
  current_subjects: string[]
  subject_affinities: string[]
  subject_avoidances: string[]
  academic_band: string
  skills: string[]
  work_preferences: string[]
  values: string[]
  budget_band: string
  location_constraints: string[]
  relocation_preference: string
  exam_willingness: string
  course_duration_preference: string
  degree_route_preferences: string[]
  hard_constraints: string[]
  missing_profile_fields: string[]
}

export type EvidenceCareer = {
  career_id: string
  name: string
  fit_factors: string[]
  concerns: string[]
  source_record_ids: string[]
}

export type EvidenceCourse = {
  course_id: string
  name: string
  award_level: string
  duration: string
  entry_stage: string
  subject_requirements: string[]
  source_record_ids: string[]
}

export type EvidenceProgramme = {
  programme_id: string
  institution_name: string
  programme_name: string
  course_id: string | null
  eligibility_status: 'eligible' | 'conditionally_eligible' | 'currently_ineligible' | 'insufficient_data'
  required_subjects: string[]
  admission_route_summary: string
  admission_cycle: string | null
  last_verified_at: string | null
  source_record_ids: string[]
}

export type EvidenceExam = {
  exam_id: string
  name: string
  purpose: string
  source_record_ids: string[]
}

export type EvidenceScholarship = {
  scholarship_id: string
  name: string
  eligibility_summary: string
  source_record_ids: string[]
}

export type EvidenceRelationship = {
  relationship_id: string
  relationship_type: 'career_to_course' | 'course_to_programme' | 'course_to_exam' | 'programme_to_admission_cycle' | 'programme_to_scholarship'
  from_id: string
  to_id: string
  verification_status: 'verified'
  source_record_ids: string[]
}

export type RoadmapEvidencePackage = {
  student: RoadmapStudentSummary
  primary_career: EvidenceCareer
  alternative_careers: EvidenceCareer[]
  verified_courses: EvidenceCourse[]
  verified_programmes: EvidenceProgramme[]
  verified_exams: EvidenceExam[]
  verified_scholarships: EvidenceScholarship[]
  verified_relationships: EvidenceRelationship[]
  verified_admission_cycles: Array<{
    cycle_id: string
    programme_id: string
    cycle: string
    application_deadline?: string | null
    source_record_ids: string[]
  }>
  source_records: CompactSourceRecord[]
  deterministic_eligibility: {
    status: 'eligible' | 'conditionally_eligible' | 'currently_ineligible' | 'insufficient_data'
    missing_requirements: string[]
  }
  missing_data: string[]
  personalisation: { hard_constraints: string[]; high_priority_preferences: string[]; mixed_interest_combinations: string[]; eligibility_risks: string[]; financial_constraints: string[]; exam_constraints: string[]; route_preferences: string[]; required_personalisation_effects: Array<{ profile_factor: string; roadmap_sections_affected: string[] }> }
}

export type RoadmapOutput = {
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
    relationship_ids: string[]
  }>
  college_programmes: Array<{
    programme_id: string
    reason: string
    eligibility_status: string
    admission_route_summary: string
    source_record_ids: string[]
    relationship_ids: string[]
  }>
  exam_steps: Array<{
    exam_id: string
    reason: string
    status: string
    source_record_ids: string[]
    relationship_ids: string[]
  }>
  backup_routes: Array<{
    title: string
    description: string
    course_ids: string[]
    programme_ids: string[]
    relationship_ids: string[]
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
  decisive_constraints: Array<{ constraint_id: string; constraint_type: 'exam_willingness' | 'budget' | 'location' | 'subject_eligibility' | 'route_preference' | 'course_duration' | 'other'; student_preference: string; effect_on_roadmap: string; status: 'accommodated' | 'partially_accommodated' | 'conflicts_with_available_routes' | 'insufficient_verified_data'; affected_section_ids: string[]; source_record_ids: string[] }>
}

export type GenerationUsage = {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
  reportedCost: number | null
}

export type AuthContext = {
  userId: string
  organisationId: string
  role: 'owner' | 'admin' | 'lead_counsellor' | 'counsellor' | 'guidance_teacher' | 'teacher' | 'data_entry' | 'reviewer' | 'viewer'
}

export type GenerationRequest = {
  studentExternalId?: string
  profile: Record<string, unknown>
  primaryCareer: {
    name: string
    fitFactors?: string[]
    concerns?: string[]
  }
  alternativeCareers?: Array<{
    name: string
    fitFactors?: string[]
    concerns?: string[]
  }>
  force?: boolean
}
