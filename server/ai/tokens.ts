import { ROADMAP_JSON_SCHEMA } from './schema.ts'
import { ROADMAP_SYSTEM_PROMPT } from './prompt.ts'
import type { AiConfig } from './config.ts'
import type { RoadmapEvidencePackage } from './types.ts'

export class TokenBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenBudgetError'
  }
}

export const estimateTokens = (value: unknown) => {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return Math.ceil(serialized.length / 4)
}

const trim = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value

export function compactEvidence(
  evidence: RoadmapEvidencePackage,
  config: AiConfig,
): { evidence: RoadmapEvidencePackage; estimatedInputTokens: number } {
  const compact: RoadmapEvidencePackage = structuredClone(evidence)
  compact.alternative_careers = compact.alternative_careers.slice(0, 3)
  compact.verified_courses = compact.verified_courses.slice(0, 5)
  compact.verified_programmes = compact.verified_programmes.slice(0, 8)
  compact.verified_exams = compact.verified_exams.slice(0, 8)
  compact.verified_scholarships = compact.verified_scholarships.slice(0, 6)
  compact.source_records = compact.source_records.slice(0, 30)
  compact.missing_data = compact.missing_data.slice(0, 12).map((item) => trim(item, 140))
  compact.personalisation = { ...compact.personalisation, high_priority_preferences: compact.personalisation.high_priority_preferences.slice(0, 2), mixed_interest_combinations: compact.personalisation.mixed_interest_combinations.slice(0, 1), required_personalisation_effects: compact.personalisation.required_personalisation_effects.slice(0, 1) }
  compact.primary_career.fit_factors = compact.primary_career.fit_factors.slice(0, 5).map((item) => trim(item, 100))
  compact.primary_career.concerns = compact.primary_career.concerns.slice(0, 5).map((item) => trim(item, 100))
  compact.alternative_careers = compact.alternative_careers.map((career) => ({
    ...career,
    fit_factors: career.fit_factors.slice(0, 3).map((item) => trim(item, 80)),
    concerns: career.concerns.slice(0, 2).map((item) => trim(item, 80)),
  }))

  const fixedTokens = estimateTokens(ROADMAP_SYSTEM_PROMPT) + estimateTokens(ROADMAP_JSON_SCHEMA) + 80
  let evidenceTokens = estimateTokens(compact)
  let total = fixedTokens + evidenceTokens

  if (total > config.maxInputTokens) {
    compact.source_records = compact.source_records.map((source) => ({
      ...source,
      name: trim(source.name, 60),
      source_url: trim(source.source_url, 120),
    }))
    compact.student.skills = compact.student.skills.slice(0, 8)
    compact.student.work_preferences = compact.student.work_preferences.slice(0, 6)
    compact.student.values = compact.student.values.slice(0, 6)
    compact.missing_data = compact.missing_data.slice(0, 8)
    evidenceTokens = estimateTokens(compact)
    total = fixedTokens + evidenceTokens
  }

  // Last safe fallback: a relationship-free guidance draft. It retains only the student's
  // decisive context and primary verified career; no programme, fee, deadline, exam, or
  // institution fact can be generated because none is supplied.
  if (total > config.maxInputTokens) {
    compact.student = {
      ...compact.student,
      current_subjects: compact.student.current_subjects.slice(0, 4),
      subject_affinities: compact.student.subject_affinities.slice(0, 4),
      subject_avoidances: compact.student.subject_avoidances.slice(0, 2),
      skills: compact.student.skills.slice(0, 3),
      work_preferences: compact.student.work_preferences.slice(0, 3),
      values: compact.student.values.slice(0, 3),
      location_constraints: compact.student.location_constraints.slice(0, 2),
      degree_route_preferences: compact.student.degree_route_preferences.slice(0, 2),
      hard_constraints: compact.student.hard_constraints.slice(0, 4),
      missing_profile_fields: compact.student.missing_profile_fields.slice(0, 3),
    }
    compact.primary_career = { ...compact.primary_career, fit_factors: compact.primary_career.fit_factors.slice(0, 3), concerns: compact.primary_career.concerns.slice(0, 2), source_record_ids: compact.primary_career.source_record_ids.slice(0, 1) }
    compact.alternative_careers=[]; compact.verified_courses=[]; compact.verified_programmes=[]
    compact.verified_exams=[]; compact.verified_scholarships=[]; compact.verified_relationships=[]
    compact.verified_admission_cycles=[]; compact.source_records=[]; compact.missing_data=compact.missing_data.slice(0,3)
    compact.personalisation={...compact.personalisation,hard_constraints:compact.personalisation.hard_constraints.slice(0,4),high_priority_preferences:[],mixed_interest_combinations:compact.personalisation.mixed_interest_combinations.slice(0,1),eligibility_risks:[],financial_constraints:compact.personalisation.financial_constraints.slice(0,1),exam_constraints:compact.personalisation.exam_constraints.slice(0,1),route_preferences:compact.personalisation.route_preferences.slice(0,1),required_personalisation_effects:compact.personalisation.required_personalisation_effects.slice(0,1)}
    evidenceTokens = estimateTokens(compact)
    total = fixedTokens + evidenceTokens
  }

  if (total > config.maxInputTokens) {
    compact.alternative_careers = compact.alternative_careers.slice(0, 1)
    compact.verified_programmes = compact.verified_programmes.slice(0, 4)
    compact.verified_courses = compact.verified_courses.slice(0, 3)
    compact.source_records = compact.source_records.slice(0, 16)
    evidenceTokens = estimateTokens(compact)
    total = fixedTokens + evidenceTokens
  }

  // A roadmap may still be useful when catalogue evidence is sparse. Preserve the student's
  // decisive context and only the smallest verified identifiers rather than failing on verbose
  // catalogue/source text. Missing facts remain explicitly represented by missing_data.
  if (total > config.maxInputTokens) {
    compact.alternative_careers = []
    compact.verified_courses = compact.verified_courses.slice(0, 1).map((item) => ({ ...item, subject_requirements: item.subject_requirements.slice(0, 3) }))
    compact.verified_programmes = compact.verified_programmes.slice(0, 1)
    compact.verified_exams = compact.verified_exams.slice(0, 1)
    compact.verified_scholarships = compact.verified_scholarships.slice(0, 1)
    compact.verified_relationships = compact.verified_relationships.slice(0, 3)
    compact.verified_admission_cycles = compact.verified_admission_cycles.slice(0, 1)
    compact.source_records = compact.source_records.slice(0, 6)
    compact.student.subject_affinities = compact.student.subject_affinities.slice(0, 6)
    compact.student.skills = compact.student.skills.slice(0, 5)
    compact.student.work_preferences = compact.student.work_preferences.slice(0, 4)
    compact.student.values = compact.student.values.slice(0, 4)
    compact.missing_data = compact.missing_data.slice(0, 5)
    evidenceTokens = estimateTokens(compact)
    total = fixedTokens + evidenceTokens
  }

  if (total > config.maxInputTokens) {
    throw new TokenBudgetError(
      'This request would exceed the roadmap token limit. The evidence package must be reduced before generation.',
    )
  }

  return { evidence: compact, estimatedInputTokens: total }
}

export function remainingOutputBudget(config: AiConfig, usedTokens: number, nextInputEstimate: number) {
  const remaining = config.maxTotalTokens - usedTokens - nextInputEstimate
  return Math.max(0, Math.min(config.maxOutputTokens, remaining))
}
