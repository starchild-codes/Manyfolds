import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createAiConfig } from '../server/ai/config.ts'
import { assessSourceFreshness } from '../server/ai/currentData.ts'
import { summariseStudent } from '../server/ai/evidence.ts'
import { compactEvidence, remainingOutputBudget, TokenBudgetError } from '../server/ai/tokens.ts'
import { parseAndValidateRoadmap, safelyParseRoadmapContent } from '../server/ai/validation.ts'
import { callOpenRouter, OpenRouterError } from '../server/ai/openrouter.ts'

const config = createAiConfig({
  OPENROUTER_MAX_INPUT_TOKENS: '2800',
  OPENROUTER_MAX_OUTPUT_TOKENS: '1700',
  OPENROUTER_MAX_TOTAL_TOKENS: '9000',
  MANYFOLDS_LIVE_DATA_ENABLED: 'false',
})
assert.equal(config.primaryModel, 'mistralai/mistral-small-3.2-24b-instruct')
assert.deepEqual(config.fallbackModels, ['openai/gpt-4.1-mini'])
assert.equal(config.apiKey, '')

const source = {
  record_id: 'career:c1',
  entity_type: 'career',
  entity_id: 'c1',
  name: 'Verified career',
  source_url: 'https://official.example/career',
  source_domain: 'official.example',
  verification_status: 'verified',
  admission_cycle: null,
  last_verified_at: '2026-08-01',
}
const evidence = {
  student: {
    student_id: 'student-test',
    grade_level: 'Class 12',
    board: 'CBSE',
    current_subjects: ['Psychology', 'Computer Science'],
    subject_affinities: ['Psychology', 'Computer Science'],
    subject_avoidances: [],
    academic_band: '70–85%',
    skills: ['Research', 'Coding'],
    work_preferences: ['Working with people'],
    values: ['Social impact'],
    budget_band: 'Under ₹50,000',
    location_constraints: ['Near home required'],
    relocation_preference: 'No',
    exam_willingness: 'Avoid if possible',
    course_duration_preference: '',
    degree_route_preferences: [],
    hard_constraints: ['Avoid competitive examinations'],
    missing_profile_fields: [],
  },
  primary_career: {
    career_id: 'c1',
    name: 'Verified career',
    fit_factors: ['Psychology', 'Research'],
    concerns: ['Exam constraint'],
    source_record_ids: ['career:c1'],
  },
  alternative_careers: [],
  verified_courses: [],
  verified_programmes: [],
  verified_exams: [],
  verified_scholarships: [],
  verified_relationships: [],
  verified_admission_cycles: [],
  source_records: [source],
  deterministic_eligibility: {
    status: 'insufficient_data',
    missing_requirements: ['Verified programme eligibility'],
  },
  missing_data: ['Programme data is incomplete'],
  personalisation: { hard_constraints: [], high_priority_preferences: [], mixed_interest_combinations: [], eligibility_risks: [], financial_constraints: [], exam_constraints: [], route_preferences: [], required_personalisation_effects: [] },
}
const valid = {
  roadmap_title: 'A sourced roadmap',
  career_id: 'c1',
  summary: 'Connect psychology, computing, and research without assuming admissions facts.',
  why_it_fits: [{ factor: 'Research', student_evidence: 'Research is a supplied skill.' }],
  important_tradeoffs: ['Programme eligibility is not yet verified.'],
  eligibility_summary: {
    status: 'insufficient_data',
    explanation: 'Programme-level evidence is missing.',
    missing_requirements: ['Verified programme eligibility'],
    source_record_ids: ['career:c1'],
  },
  stages: [
    {
      stage: 'now',
      title: 'Explore the work',
      description: 'Complete a small research activity.',
      mandatory: false,
      status: 'not_started',
      suggested_target_date: null,
      verified_deadline: null,
      date_type: 'unknown',
      source_record_ids: ['career:c1'],
      unverified: false,
    },
  ],
  course_options: [],
  college_programmes: [],
  exam_steps: [],
  backup_routes: [],
  next_actions: [
    {
      action: 'Discuss the missing programme evidence',
      priority: 'high',
      reason: 'Eligibility cannot be established.',
      source_record_ids: [],
    },
  ],
  questions_for_counsellor: ['Which verified local routes should be investigated?'],
  missing_or_unverified: [{ field: 'programmes', message: 'No verified records supplied.' }],
  decisive_constraints: [{ constraint_id: 'exam', constraint_type: 'exam_willingness', student_preference: 'Avoid competitive examinations', effect_on_roadmap: 'No exam-dependent route is presented.', status: 'insufficient_verified_data', affected_section_ids: ['next_actions'], source_record_ids: [] }],
}

const compacted = compactEvidence(evidence, config)
const boardSummary=summariseStudent('board-test',{country:'India \u00b7 CBSE',stream:'Humanities',subjects:{History:'love'},state:'Uttar Pradesh',geography:'Anywhere in India'})
assert.equal(boardSummary.board,'CBSE','School board must not be replaced with the subject stream')
assert.deepEqual(boardSummary.location_constraints,['Anywhere in India'],'The current state must not narrow a national study preference')
assert.equal(boardSummary.current_location.state,'Uttar Pradesh')
assert.ok(!summariseStudent('ib-test',{country:'IB',stream:'Humanities'}).location_constraints.includes('IB'),'An international school board is not a country')
assert.equal(parseAndValidateRoadmap(valid,evidence,true).schemaValid,false,'Sparse generation must not invent stages, even if a provider ignores the response schema')
await assert.rejects(
  () => callOpenRouter(config, config.primaryModel, evidence, 1700),
  /not configured/,
  'missing server API key must fail before any network request',
)
const originalFetch = globalThis.fetch
try {
  globalThis.fetch = async () => new Response('not-json', { status: 200 })
  await assert.rejects(
    () => callOpenRouter({ ...config, apiKey: 'test-key' }, config.primaryModel, evidence, 1700),
    (error) => error instanceof OpenRouterError && error.retryable,
    'malformed provider JSON must be retryable',
  )
  let boundedSignal
  globalThis.fetch = async (_url, init) => {
    boundedSignal = init.signal
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), {once:true}))
  }
  // Keep the test process alive while the AbortSignal's timer is unreferenced.
  const keepAlive = setTimeout(() => {}, 1000)
  try {
    await assert.rejects(() => callOpenRouter({ ...config, apiKey: 'test-key' }, config.primaryModel, evidence, 1700, false, false, 10), error => error instanceof OpenRouterError && error.retryable)
    assert.equal(boundedSignal.aborted, true, 'A model attempt must respect the remaining request time')
  } finally { clearTimeout(keepAlive) }
} finally {
  globalThis.fetch = originalFetch
}
assert.ok(compacted.estimatedInputTokens <= 2800, 'evidence must fit the input ceiling')
assert.equal(config.maxOutputTokens, 1700, 'OpenRouter output ceiling must be 1,700')
assert.equal(config.maxTotalTokens, 9000, 'session ceiling must cover typical bounded attempts')
assert.equal(remainingOutputBudget(config, 0, 2800), 1700)
assert.equal(remainingOutputBudget(config, 7500, 1300), 200, 'retry must share session budget')

const oversized = structuredClone(evidence)
oversized.student.current_subjects = Array.from({ length: 16 }, () => 'x'.repeat(2000))
assert.throws(() => compactEvidence(oversized, config), TokenBudgetError)

// Dropping admissions evidence must also drop the eligibility conclusion based on it.
const bulkyAdmissions = structuredClone(evidence)
bulkyAdmissions.verified_programmes = Array.from({length:8},(_,index)=>({programme_id:`p${index}`,name:'Programme '.repeat(150)}))
bulkyAdmissions.deterministic_eligibility.status = 'conditionally_eligible'
const reducedAdmissions = compactEvidence(bulkyAdmissions, config)
assert.equal(reducedAdmissions.evidence.verified_programmes.length, 0)
assert.equal(reducedAdmissions.evidence.deterministic_eligibility.status, 'insufficient_data')
assert.match(reducedAdmissions.evidence.missing_data[0], /cannot be established/)
assert.ok(reducedAdmissions.estimatedInputTokens <= config.maxInputTokens)

const accepted = parseAndValidateRoadmap(valid, evidence)
assert.equal(accepted.schemaValid, true)
assert.equal(accepted.factualValid, true)

const unsupportedEligibility = structuredClone(valid)
unsupportedEligibility.eligibility_summary.status = 'conditionally_eligible'
const inconsistentEvidence = structuredClone(evidence)
inconsistentEvidence.deterministic_eligibility.status = 'conditionally_eligible'
assert.equal(parseAndValidateRoadmap(unsupportedEligibility, inconsistentEvidence).factualValid, false, 'Eligibility cannot survive removal of all programme evidence, including in older snapshots')

const invalidSchema = parseAndValidateRoadmap({ summary: 'not a roadmap' }, evidence)
assert.equal(invalidSchema.schemaValid, false)

const unsupportedRequirement = structuredClone(valid)
unsupportedRequirement.summary = 'You need to complete a degree to enter this career.'
assert.equal(parseAndValidateRoadmap(unsupportedRequirement, evidence).factualValid, false, 'unsourced education requirements must fail')
const unsupportedShortRequirement = structuredClone(valid)
unsupportedShortRequirement.summary = 'To enter this career, you need a degree in Commerce.'
assert.equal(parseAndValidateRoadmap(unsupportedShortRequirement, evidence).factualValid, false, 'short unsourced degree requirements must fail')
const unsupportedSuggestedRoute = structuredClone(valid)
unsupportedSuggestedRoute.summary = 'Consider exploring undergraduate law degrees or related programmes in political science or legal studies that could lead to a career in law.'
assert.equal(parseAndValidateRoadmap(unsupportedSuggestedRoute, evidence).factualValid, false, 'Tentative wording must not bypass relationship evidence')
const unsupportedAdmissionAdvice = structuredClone(valid)
unsupportedAdmissionAdvice.important_tradeoffs = ['You may need higher percentages to secure admission to competitive law programmes.']
assert.equal(parseAndValidateRoadmap(unsupportedAdmissionAdvice, evidence).factualValid, false, 'Admission feasibility advice needs supplied evidence')
const unsupportedExamPreparation = structuredClone(valid)
unsupportedExamPreparation.next_actions[0].action = 'Prepare for entrance exams'
assert.equal(parseAndValidateRoadmap(unsupportedExamPreparation, evidence).factualValid, false, 'Exam preparation instructions need a verified route')
const unsupportedApplication = structuredClone(valid)
unsupportedApplication.next_actions[0].action = 'Apply to institutions offering Commerce degrees.'
assert.equal(parseAndValidateRoadmap(unsupportedApplication, evidence).factualValid, false, 'unverified institution routes must fail')

const targetPlanning = structuredClone(valid)
targetPlanning.stages[0].description = 'Research target programmes, target courses, and the target application cycle.'
assert.equal(parseAndValidateRoadmap(targetPlanning, evidence).factualValid, true, 'ordinary target planning language must pass')
const competitiveClaim = structuredClone(valid)
competitiveClaim.summary = 'This is a realistic option with a strong chance of admission.'
assert.equal(parseAndValidateRoadmap(competitiveClaim, evidence).factualValid, false, 'unsupported competitiveness claims must fail')

const planning = structuredClone(valid)
planning.stages[0].suggested_target_date = 'Shortlist courses by September'
planning.stages[0].date_type = 'planning_suggestion'
planning.stages[0].source_record_ids = []
const planningResult = parseAndValidateRoadmap(planning, evidence)
assert.equal(planningResult.factualValid, true, 'unsourced planning suggestions are allowed')
assert.equal(planningResult.roadmap?.stages[0].suggested_target_date, 'Shortlist courses by September')

const unsourcedDeadline = structuredClone(valid)
unsourcedDeadline.stages[0].verified_deadline = '2026-09-01'
unsourcedDeadline.stages[0].date_type = 'verified_application_deadline'
unsourcedDeadline.stages[0].source_record_ids = []
const unsourcedDeadlineResult = parseAndValidateRoadmap(unsourcedDeadline, evidence)
assert.equal(unsourcedDeadlineResult.factualValid, false, 'unsourced factual deadline must fail')
assert.equal(unsourcedDeadlineResult.roadmap?.stages[0].verified_deadline, null)
assert.equal(unsourcedDeadlineResult.events[0]?.originalValue, '2026-09-01')

const deadlineEvidence = structuredClone(evidence)
deadlineEvidence.source_records.push({ ...source, record_id: 'cycle:p1', entity_type: 'admission_cycle', entity_id: 'p1', admission_cycle: '2026' })
deadlineEvidence.verified_admission_cycles.push({ cycle_id: 'cycle-1', programme_id: 'p1', cycle: '2026', application_deadline: '2026-09-01', source_record_ids: ['cycle:p1'] })
const sourcedDeadline = structuredClone(valid)
sourcedDeadline.stages[0].verified_deadline = '2026-09-01'
sourcedDeadline.stages[0].date_type = 'verified_application_deadline'
sourcedDeadline.stages[0].source_record_ids = ['cycle:p1']
const sourcedDeadlineResult = parseAndValidateRoadmap(sourcedDeadline, deadlineEvidence)
assert.equal(sourcedDeadlineResult.factualValid, true, 'sourced application deadline must pass')

const sourcedExamDate = structuredClone(sourcedDeadline)
sourcedExamDate.stages[0].date_type = 'verified_exam_date'
const sourcedExamDateResult = parseAndValidateRoadmap(sourcedExamDate, deadlineEvidence)
assert.equal(sourcedExamDateResult.factualValid, false, 'an application deadline must not support an exam date')

const misplacedDeadline = structuredClone(valid)
misplacedDeadline.stages[0].suggested_target_date = 'Application deadline 2026-09-01'
misplacedDeadline.stages[0].date_type = 'planning_suggestion'
const misplacedDeadlineResult = parseAndValidateRoadmap(misplacedDeadline, evidence)
assert.equal(misplacedDeadlineResult.factualValid, false, 'factual deadline cannot hide in planning field')
assert.equal(misplacedDeadlineResult.roadmap?.stages[0].suggested_target_date, null)

const safelyParsed = safelyParseRoadmapContent(JSON.stringify(valid))
assert.equal(safelyParsed.repaired, false)
assert.deepEqual(safelyParsed.value, valid)

const safelyRepaired = safelyParseRoadmapContent(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)
assert.equal(safelyRepaired.repaired, true)
assert.deepEqual(safelyRepaired.value, valid)

const unsafeRepair = safelyParseRoadmapContent('Here is a roadmap: definitely not JSON.')
assert.equal(unsafeRepair.value, null)

const fabricated = structuredClone(valid)
fabricated.college_programmes.push({
  programme_id: 'invented-programme',
  reason: 'Fabricated',
  eligibility_status: 'eligible',
  admission_route_summary: 'Invented',
  source_record_ids: ['invented-source'],
  relationship_ids: [],
})
const fabricatedResult = parseAndValidateRoadmap(fabricated, evidence)
assert.equal(fabricatedResult.roadmap.college_programmes.length, 0)
assert.equal(fabricatedResult.factualValid, false)

const contradictory = structuredClone(valid)
contradictory.eligibility_summary.status = 'eligible'
const contradictionResult = parseAndValidateRoadmap(contradictory, evidence)
assert.equal(contradictionResult.roadmap.eligibility_summary.status, 'insufficient_data')
assert.equal(contradictionResult.factualValid, false)

const profileA = summariseStudent('a', {
  grade: 'Class 12',
  subjects: { Psychology: 'love', Biology: 'like' },
  skills: { Listening: 'good' },
  nearHome: false,
})
const profileB = summariseStudent('b', {
  grade: 'Class 10',
  subjects: { Mathematics: 'love', 'Vocational Subjects': 'like' },
  skills: { 'Fixing systems': 'enjoy' },
  nearHome: true,
  examWillingness: 'Avoid if possible',
})
assert.notDeepEqual(profileA, profileB, 'materially different profiles must produce different summaries')
assert.ok(profileB.hard_constraints.includes('Must study near home'))
assert.ok(profileB.hard_constraints.some((item) => item.includes('competitive examinations')))

assert.equal(config.liveDataEnabled, false, 'live retrieval must be disabled by default')
assert.equal(
  assessSourceFreshness(
    { verification_status: 'verified', last_verified_at: '2026-08-01' },
    new Date('2026-08-04'),
  ),
  'fresh',
)
assert.equal(
  assessSourceFreshness(
    { verification_status: 'verified', expires_at: '2025-12-31' },
    new Date('2026-08-04'),
  ),
  'stale',
)
assert.equal(
  assessSourceFreshness({ verification_status: 'pending_review' }),
  'review_required',
)

const clientSource = await readFile('src/aiRoadmapApi.ts', 'utf8')
const authSource = await readFile('server/ai/auth.ts', 'utf8')
const serviceSource = await readFile('server/ai/service.ts', 'utf8')
const providerSource = await readFile('server/ai/openrouter.ts', 'utf8')
const modelSource = await readFile('server/ai/models.ts', 'utf8')
const migration = await readFile(
  'supabase/migrations/20260804_ai_roadmap_architecture.sql',
  'utf8',
)
assert.ok(!clientSource.includes('OPENROUTER_API_KEY'), 'API key name must not enter client code')
assert.ok(authSource.includes("header.startsWith('Bearer ')"), 'generation must require bearer auth')
assert.ok(authSource.includes('organisation_memberships'), 'organisation access must be checked server-side')
assert.ok(serviceSource.includes('organisation_id=$1'), 'queries must filter by server-derived organisation')
assert.ok(serviceSource.includes('generationHash'), 'unchanged roadmap requests must use a cache hash')
assert.ok(serviceSource.includes('[models[0], models[0], models[1]]'), 'attempts must be bounded to a primary correction and one fallback')
assert.ok(serviceSource.includes('!validation.factualValid'), 'unsupported factual claims must not be persisted')
assert.ok(serviceSource.includes('remainingOutputBudget'), 'fallback must share the total session budget')
assert.ok(providerSource.includes('max_tokens: maxOutputTokens'), 'provider must receive the output ceiling')
assert.ok(providerSource.includes("type: 'json_schema'"), 'provider must receive the strict schema format')
assert.ok(providerSource.includes('require_parameters: true'), 'provider routing must require all parameters')
assert.ok(modelSource.includes('estimated_roadmap_cost'), 'model ranking must use total estimated cost')
assert.ok(modelSource.includes('config.allowedModels'), 'catalogue changes must not bypass the reviewed allowlist')
assert.ok(migration.includes('enable row level security'), 'new tables must enable RLS')
assert.ok(migration.includes('organisation generation isolation'), 'generation RLS policy must exist')
assert.ok(migration.includes('total_tokens <= 5000'), 'database must enforce the token ceiling')
const releaseMigration = await readFile('supabase/migrations/20261001_openrouter_roadmap_models.sql', 'utf8')
assert.ok(releaseMigration.includes('total_tokens <= 9000'), 'database ceiling must be migrated')
assert.ok(releaseMigration.includes('retry_count between 0 and 2'), 'session constraint must allow primary correction and fallback')
assert.ok(releaseMigration.includes('attempt between 1 and 3'), 'usage constraint must allow bounded third attempt')

console.log('AI roadmap architecture checks passed')
