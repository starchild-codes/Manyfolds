const text = { type: 'string' } as const
const texts = { type: 'array', items: text } as const

export const ROADMAP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'roadmap_title',
    'career_id',
    'summary',
    'why_it_fits',
    'important_tradeoffs',
    'eligibility_summary',
    'stages',
    'course_options',
    'college_programmes',
    'exam_steps',
    'backup_routes',
    'next_actions',
    'questions_for_counsellor',
    'missing_or_unverified',
    'decisive_constraints',
  ],
  properties: {
    roadmap_title: text,
    career_id: text,
    summary: text,
    why_it_fits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['factor', 'student_evidence'],
        properties: { factor: text, student_evidence: text },
      },
    },
    important_tradeoffs: texts,
    eligibility_summary: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'explanation', 'missing_requirements', 'source_record_ids'],
      properties: {
        status: {
          type: 'string',
          enum: ['eligible', 'conditionally_eligible', 'currently_ineligible', 'insufficient_data'],
        },
        explanation: text,
        missing_requirements: texts,
        source_record_ids: texts,
      },
    },
    stages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'stage',
          'title',
          'description',
          'mandatory',
          'status',
          'suggested_target_date',
          'verified_deadline',
          'date_type',
          'source_record_ids',
          'unverified',
        ],
        properties: {
          stage: {
            type: 'string',
            enum: ['now', 'next_6_months', 'before_applications', 'admissions', 'during_course', 'early_career'],
          },
          title: text,
          description: text,
          mandatory: { type: 'boolean' },
          status: {
            type: 'string',
            enum: ['not_started', 'in_progress', 'complete', 'blocked', 'informational'],
          },
          suggested_target_date: { anyOf: [text, { type: 'null' }] },
          verified_deadline: { anyOf: [text, { type: 'null' }] },
          date_type: { type: 'string', enum: ['planning_suggestion', 'verified_application_deadline', 'verified_exam_date', 'verified_counselling_date', 'verified_scholarship_deadline', 'informational', 'unknown'] },
          source_record_ids: texts,
          unverified: { type: 'boolean' },
        },
      },
    },
    course_options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['course_id', 'reason', 'concerns', 'source_record_ids', 'relationship_ids'],
        properties: { course_id: text, reason: text, concerns: texts, source_record_ids: texts, relationship_ids: texts },
      },
    },
    college_programmes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['programme_id', 'reason', 'eligibility_status', 'admission_route_summary', 'source_record_ids', 'relationship_ids'],
        properties: {
          programme_id: text,
          reason: text,
          eligibility_status: text,
          admission_route_summary: text,
          source_record_ids: texts,
          relationship_ids: texts,
        },
      },
    },
    exam_steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['exam_id', 'reason', 'status', 'source_record_ids', 'relationship_ids'],
        properties: { exam_id: text, reason: text, status: text, source_record_ids: texts, relationship_ids: texts },
      },
    },
    backup_routes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'course_ids', 'programme_ids', 'source_record_ids', 'relationship_ids'],
        properties: {
          title: text,
          description: text,
          course_ids: texts,
          programme_ids: texts,
          source_record_ids: texts,
          relationship_ids: texts,
        },
      },
    },
    next_actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'priority', 'reason', 'source_record_ids'],
        properties: {
          action: text,
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          reason: text,
          source_record_ids: texts,
        },
      },
    },
    questions_for_counsellor: texts,
    missing_or_unverified: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'message'],
        properties: { field: text, message: text },
      },
    },
    decisive_constraints: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['constraint_id','constraint_type','student_preference','effect_on_roadmap','status','affected_section_ids','source_record_ids'], properties: { constraint_id: text, constraint_type: { type: 'string', enum: ['exam_willingness','budget','location','subject_eligibility','route_preference','course_duration','other'] }, student_preference: text, effect_on_roadmap: text, status: { type: 'string', enum: ['accommodated','partially_accommodated','conflicts_with_available_routes','insufficient_verified_data'] }, affected_section_ids: texts, source_record_ids: texts } } },
  },
} as const

export const SPARSE_ROADMAP_EMPTY_SECTIONS = ['stages', 'important_tradeoffs', 'course_options', 'college_programmes', 'exam_steps', 'backup_routes'] as const

export function roadmapResponseSchema(hasVerifiedRelationships: boolean) {
  if (hasVerifiedRelationships) return ROADMAP_JSON_SCHEMA
  return {
    ...ROADMAP_JSON_SCHEMA,
    properties: {
      ...ROADMAP_JSON_SCHEMA.properties,
      ...Object.fromEntries(SPARSE_ROADMAP_EMPTY_SECTIONS.map(key => [key, { ...ROADMAP_JSON_SCHEMA.properties[key], maxItems: 0 }])),
    },
  }
}
