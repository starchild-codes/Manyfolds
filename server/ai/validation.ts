import { Ajv } from 'ajv'
import { ROADMAP_JSON_SCHEMA, roadmapResponseSchema } from './schema.ts'
import type { RoadmapEvidencePackage, RoadmapOutput } from './types.ts'

const ajv = new Ajv({ allErrors: true, strict: true })
const validateSchema = ajv.compile(ROADMAP_JSON_SCHEMA)
const validateSparseGeneration = ajv.compile(roadmapResponseSchema(false))

export type ValidationResult = {
  roadmap: RoadmapOutput | null
  schemaValid: boolean
  factualValid: boolean
  repaired: boolean
  errors: string[]
  events: Array<{ fieldPath: string; originalValue: unknown; declaredDateType: string | null; originalSourceIds: string[]; rule: string; decision: 'accepted' | 'rejected' | 'sanitized'; sanitizedValue: unknown; issue: 'model_error' | 'validator_false_positive' | 'schema_ambiguity' | 'missing_evidence' | 'formatting_issue' }>
}

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value

export function safelyParseRoadmapContent(content: string): {
  value: unknown | null
  repaired: boolean
  error: string | null
} {
  try {
    return { value: JSON.parse(content), repaired: false, error: null }
  } catch {
    const fenced = content.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i)?.[1]
    const candidate = fenced || content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
    if (!candidate || candidate === content) {
      return { value: null, repaired: false, error: 'Response was not valid JSON.' }
    }
    try {
      return { value: JSON.parse(candidate), repaired: true, error: null }
    } catch {
      return { value: null, repaired: false, error: 'Response could not be safely repaired to JSON.' }
    }
  }
}

export function parseAndValidateRoadmap(
  raw: unknown,
  evidence: RoadmapEvidencePackage,
  forGeneration = false,
): ValidationResult {
  const errors: string[] = []
  const events: ValidationResult['events'] = []
  const validate = forGeneration && !evidence.verified_relationships.length ? validateSparseGeneration : validateSchema
  if (!validate(raw)) {
    const details = (validate.errors || [])
      .slice(0, 12)
      .map((error: { instancePath?: string; message?: string }) =>
        `${error.instancePath || '/'} ${error.message || 'is invalid'}`,
      )
    return {
      roadmap: null,
      schemaValid: false,
      factualValid: false,
      repaired: false,
      errors: details, events: [],
    }
  }

  const roadmap = structuredClone(raw) as RoadmapOutput
  let repaired = false
  const careerIds = new Set([
    evidence.primary_career.career_id,
    ...evidence.alternative_careers.map((career) => career.career_id),
  ])
  const courseIds = new Set(evidence.verified_courses.map((course) => course.course_id))
  const programmeIds = new Set(evidence.verified_programmes.map((programme) => programme.programme_id))
  const examIds = new Set(evidence.verified_exams.map((exam) => exam.exam_id))
  const sourceIds = new Set(evidence.source_records.map((source) => source.record_id))
  const relationships = new Map(evidence.verified_relationships.map((relationship) => [relationship.relationship_id, relationship]))

  if (!careerIds.has(roadmap.career_id)) {
    errors.push(`Unsupported career ID: ${roadmap.career_id}`)
    return { roadmap: null, schemaValid: true, factualValid: false, repaired: false, errors, events }
  }

  const filterSourceIds = (ids: string[], context: string) => {
    const invalid = ids.filter((id) => !sourceIds.has(id))
    if (invalid.length) {
      repaired = true
      errors.push(`${context} referenced unsupported source IDs: ${invalid.join(', ')}`)
    }
    return ids.filter((id) => sourceIds.has(id))
  }
  const filterRelationshipIds = (ids: string[], context: string) => {
    const invalid = ids.filter((id) => !relationships.has(id))
    if (invalid.length) {
      repaired = true
      errors.push(`${context} referenced unsupported relationship IDs: ${invalid.join(', ')}`)
    }
    return ids.filter((id) => relationships.has(id))
  }
  const hasRelationship = (ids: string[], type: string, toId?: string) =>
    ids.some((id) => {
      const relationship = relationships.get(id)
      return relationship?.relationship_type === type && (!toId || relationship.to_id === toId)
    })

  roadmap.eligibility_summary.source_record_ids = filterSourceIds(
    roadmap.eligibility_summary.source_record_ids,
    'Eligibility summary',
  )
  roadmap.stages = roadmap.stages.slice(0, 8).map((stage, index) => {
    const source_record_ids = filterSourceIds(stage.source_record_ids, `Stage "${stage.title}"`)
    const hasVerifiedCycle = source_record_ids.some((id) =>
      evidence.verified_admission_cycles.some((cycle) =>
        stage.date_type === 'verified_application_deadline'
          && cycle.source_record_ids.includes(id)
          && cycle.application_deadline === stage.verified_deadline,
      ),
    )
    const factualDate = stage.date_type.startsWith('verified_')
    const planningLooksFactual = stage.date_type === 'planning_suggestion' && /\b(?:application|exam|counselling|scholarship)\s+(?:deadline|date)\b/i.test(`${stage.title} ${stage.description} ${stage.suggested_target_date || ''}`)
    if (factualDate && (!stage.verified_deadline || !hasVerifiedCycle)) {
      errors.push(`Stage "${stage.title}" supplied an unsupported verified deadline`)
      repaired = true
      events.push({ fieldPath: `/stages/${index}/verified_deadline`, originalValue: stage.verified_deadline, declaredDateType: stage.date_type, originalSourceIds: stage.source_record_ids, rule: 'verified_date_requires_matching_admission_cycle_source', decision: 'sanitized', sanitizedValue: null, issue: hasVerifiedCycle ? 'model_error' : 'missing_evidence' })
    } else if (planningLooksFactual) {
      errors.push(`Stage "${stage.title}" placed a factual deadline in a planning field`)
      repaired = true
      events.push({ fieldPath: `/stages/${index}/suggested_target_date`, originalValue: stage.suggested_target_date, declaredDateType: stage.date_type, originalSourceIds: stage.source_record_ids, rule: 'planning_field_must_not_contain_factual_deadline', decision: 'sanitized', sanitizedValue: null, issue: 'schema_ambiguity' })
    } else if (stage.suggested_target_date && stage.date_type === 'planning_suggestion') {
      events.push({ fieldPath: `/stages/${index}/suggested_target_date`, originalValue: stage.suggested_target_date, declaredDateType: stage.date_type, originalSourceIds: stage.source_record_ids, rule: 'date_grounded_by_declared_type', decision: 'accepted', sanitizedValue: stage.suggested_target_date, issue: 'formatting_issue' })
    }
    return {
      ...stage,
      title: truncate(stage.title, 100),
      description: truncate(stage.description, 420),
      suggested_target_date: stage.date_type === 'planning_suggestion' && !planningLooksFactual ? stage.suggested_target_date : null,
      verified_deadline: factualDate && hasVerifiedCycle ? stage.verified_deadline : null,
      source_record_ids,
      unverified: stage.unverified || source_record_ids.length === 0,
    }
  })

  roadmap.course_options = roadmap.course_options
    .filter((course) => {
      if (courseIds.has(course.course_id)) return true
      errors.push(`Removed unsupported course ID: ${course.course_id}`)
      repaired = true
      return false
    })
    .slice(0, 5)
    .map((course) => {
      const relationship_ids = filterRelationshipIds(course.relationship_ids, `Course ${course.course_id}`)
      if (!hasRelationship(relationship_ids, 'career_to_course', course.course_id)) {
        errors.push(`Course ${course.course_id} lacks a verified career-to-course relationship`)
      }
      return {
      ...course,
      reason: truncate(course.reason, 300),
      concerns: course.concerns.slice(0, 5).map((item) => truncate(item, 180)),
      source_record_ids: filterSourceIds(course.source_record_ids, `Course ${course.course_id}`),
      relationship_ids,
    }} )

  roadmap.college_programmes = roadmap.college_programmes
    .filter((programme) => {
      if (programmeIds.has(programme.programme_id)) return true
      errors.push(`Removed fabricated or unsupported programme ID: ${programme.programme_id}`)
      repaired = true
      return false
    })
    .slice(0, 8)
    .map((programme) => {
      const relationship_ids = filterRelationshipIds(programme.relationship_ids, `Programme ${programme.programme_id}`)
      if (!hasRelationship(relationship_ids, 'course_to_programme', programme.programme_id)) {
        errors.push(`Programme ${programme.programme_id} lacks a verified course-to-programme relationship`)
      }
      return {
      ...programme,
      reason: truncate(programme.reason, 300),
      admission_route_summary: truncate(programme.admission_route_summary, 280),
      source_record_ids: filterSourceIds(
        programme.source_record_ids,
        `Programme ${programme.programme_id}`,
      ),
      relationship_ids,
    }})

  roadmap.exam_steps = roadmap.exam_steps
    .filter((exam) => {
      if (examIds.has(exam.exam_id)) return true
      errors.push(`Removed unsupported examination ID: ${exam.exam_id}`)
      repaired = true
      return false
    })
    .slice(0, 8)
    .map((exam) => {
      const relationship_ids = filterRelationshipIds(exam.relationship_ids, `Exam ${exam.exam_id}`)
      if (!hasRelationship(relationship_ids, 'course_to_exam', exam.exam_id)) {
        errors.push(`Exam ${exam.exam_id} lacks a verified course-to-exam relationship`)
      }
      return {
      ...exam,
      reason: truncate(exam.reason, 260),
      source_record_ids: filterSourceIds(exam.source_record_ids, `Exam ${exam.exam_id}`),
      relationship_ids,
    }})

  roadmap.backup_routes = roadmap.backup_routes.slice(0, 4).map((route) => {
    const invalidCourses = route.course_ids.filter((id) => !courseIds.has(id))
    const invalidProgrammes = route.programme_ids.filter((id) => !programmeIds.has(id))
    if (invalidCourses.length || invalidProgrammes.length) {
      repaired = true
      errors.push(`Backup route "${route.title}" contained unsupported record IDs`)
    }
    const relationship_ids = filterRelationshipIds(route.relationship_ids, `Backup route "${route.title}"`)
    if ((route.course_ids.length || route.programme_ids.length) && !relationship_ids.length) {
      errors.push(`Backup route "${route.title}" lacks verified relationship IDs`)
    }
    return {
      ...route,
      title: truncate(route.title, 100),
      description: truncate(route.description, 360),
      course_ids: route.course_ids.filter((id) => courseIds.has(id)),
      programme_ids: route.programme_ids.filter((id) => programmeIds.has(id)),
      source_record_ids: filterSourceIds(route.source_record_ids, `Backup route "${route.title}"`),
      relationship_ids,
    }
  })

  roadmap.next_actions = roadmap.next_actions.slice(0, 8).map((action) => ({
    ...action,
    action: truncate(action.action, 180),
    reason: truncate(action.reason, 260),
    source_record_ids: filterSourceIds(action.source_record_ids, `Action "${action.action}"`),
  }))
  const expectedConstraints = evidence.personalisation.hard_constraints
  for (const constraint of expectedConstraints) {
    const match = roadmap.decisive_constraints.find((item) => item.student_preference.toLowerCase().includes(constraint.toLowerCase()) || constraint.toLowerCase().includes(item.student_preference.toLowerCase()))
    if (!match) errors.push(`Missing decisive constraint reflection: ${constraint}`)
    else if (!match.effect_on_roadmap || !match.affected_section_ids.length) errors.push(`Decisive constraint lacks visible roadmap effect: ${constraint}`)
  }
  roadmap.decisive_constraints = roadmap.decisive_constraints.map((item) => ({ ...item, source_record_ids: filterSourceIds(item.source_record_ids, `Decisive constraint ${item.constraint_id}`) }))
  roadmap.summary = truncate(roadmap.summary, 700)
  roadmap.important_tradeoffs = roadmap.important_tradeoffs.slice(0, 8).map((item) => truncate(item, 220))
  roadmap.questions_for_counsellor = roadmap.questions_for_counsellor.slice(0, 8).map((item) => truncate(item, 220))
  roadmap.missing_or_unverified = roadmap.missing_or_unverified.slice(0, 12).map((item) => ({
    field: truncate(item.field, 100),
    message: truncate(item.message, 260),
  }))

  if (
    (!evidence.verified_programmes.length || evidence.deterministic_eligibility.status === 'insufficient_data') &&
    roadmap.eligibility_summary.status !== 'insufficient_data'
  ) {
    errors.push('Eligibility status contradicted deterministic insufficient-data result')
    roadmap.eligibility_summary.status = 'insufficient_data'
    roadmap.eligibility_summary.missing_requirements = [
      ...new Set([
        ...roadmap.eligibility_summary.missing_requirements,
        ...evidence.deterministic_eligibility.missing_requirements,
      ]),
    ]
    repaired = true
  }

  const classificationText = JSON.stringify(roadmap)
  if (!evidence.verified_relationships.length) {
    const statements = [roadmap.summary, ...roadmap.important_tradeoffs, ...roadmap.stages.flatMap((stage) => [stage.title, stage.description]), ...roadmap.next_actions.map((action) => `${action.action} ${action.reason}`)]
    if (statements.some((statement) => /\b(?:need|must|have to|require(?:s|d)?|necessary|essential)\b[^.!?]{0,70}\b(?:degree|course|programme|exam)\b/i.test(statement))) {
      errors.push('Roadmap asserted an unsupported education or examination requirement')
    }
    if (statements.some((statement) => /\b(?:degrees?|courses?|programmes?)\b[^.!?]{0,140}\b(?:leads?|leading)\s+to\s+(?:a\s+)?career\b/i.test(statement))) {
      errors.push('Roadmap asserted an unsupported education-to-career relationship')
    }
    const educationTerms = /\b(?:degrees?|courses?|programmes?|programs?|bachelors?|masters?|llb|llm|btech|mtech|diplomas?|certifications?|exams?|examinations?|admissions?|entrance|universities|university|colleges?|institutions?|scholarships?|tuition|fees?|cutoffs?|eligibility)\b/i
    const instructionTerms = /\b(?:prepare|apply|must|should|explore|pursue|consider|need|require|required|higher|secure|guarantee|leads?|leading|qualify|qualifies|offers?|offering)\b/i
    const safeResearch = (statement: string) => /^\s*(?:research|verify|check|ask|discuss|consult|identify|find out|confirm)\b/i.test(statement) && !instructionTerms.test(statement)
    const missingEvidence = (statement: string) => /\b(?:no verified|not yet verified|not verified|without assuming|not assuming|unavailable|not available|missing|insufficient|lack|unclear)\b/i.test(statement) && /\b(?:verified|evidence|data|records|facts)\b/i.test(statement) && !/\b(?:prepare|apply|must|should|explore|pursue|consider|higher|secure|guarantee|leads?|leading|qualify|qualifies|offers?|offering)\b/i.test(statement)
    if (statements.some(statement => educationTerms.test(statement) && !safeResearch(statement) && !missingEvidence(statement))) {
      errors.push('Roadmap included education or admissions advice without verified pathway evidence')
    }
    if (statements.some((statement) => /\b(?:institutions?|colleges?|universities?)\s+(?:in\s+[^.!?]{1,45}\s+)?(?:offering|that offer)\b|\bapply\s+to\s+(?:institutions?|colleges?|universities?|degree|programmes?)\b/i.test(statement))) {
      errors.push('Roadmap asserted an unsupported institution or application route')
    }
  }
  if (/\b(aspirational|safer|realistic|reach option|match (?:school|college|university)|attainable programme|competitive applicant|highly competitive|selective programme|strong (?:admission )?chance|good chance of admission|likely admission|unlikely admission|admission probability)\b/i.test(classificationText)) {
    errors.push('Roadmap added an unsupported competitiveness classification')
  }

  return {
    roadmap,
    schemaValid: true,
    factualValid: errors.length === 0,
    repaired,
    errors, events,
  }
}
