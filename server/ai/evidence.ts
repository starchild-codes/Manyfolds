import type { Pool } from 'pg'
import type {
  AuthContext,
  CompactSourceRecord,
  EvidenceCareer,
  GenerationRequest,
  RoadmapEvidencePackage,
  RoadmapStudentSummary,
  VerificationStatus,
} from './types.ts'

export class MissingEvidenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingEvidenceError'
  }
}

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 20) : []
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const record = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const domain = (value: string) => {
  try {
    return new URL(value).hostname
  } catch {
    return ''
  }
}
const status = (value: string): VerificationStatus =>
  value === 'verified' || value === 'officially_verified' || value === 'official_taxonomy_title' ? 'verified' : 'pending_review'
const sourceId = (type: string, id: string) => `${type}:${id}`

export function summariseStudent(
  studentExternalId: string,
  profile: Record<string, unknown>,
): RoadmapStudentSummary {
  const subjectMap = record(profile.subjects)
  const skillMap = record(profile.skills)
  const currentSubjects = Object.keys(subjectMap).slice(0, 16)
  const affinities = Object.entries(subjectMap)
    .filter(([, value]) => value === 'love' || value === 'like')
    .map(([name]) => name)
  const avoidances = Object.entries(subjectMap)
    .filter(([, value]) => value === 'dislike')
    .map(([name]) => name)
  const skills = Object.entries(skillMap)
    .filter(([, value]) => value === 'enjoy' || value === 'good')
    .map(([name]) => name)
  // The diagnostic's legacy `country` field stores the school-board selection.
  // Stream names and international board names must not become geographic facts.
  const boardSelection = text(profile.country)
  const board = boardSelection === 'India' ? '' : boardSelection.replace(/^India\s*[\u00b7-]\s*/, '')
  const geography = text(profile.geography)
  const nearHome = profile.nearHome === true
  const missing: string[] = []
  if (!text(profile.grade)) missing.push('grade_level')
  if (!text(profile.stream)) missing.push('board_or_stream')
  if (!currentSubjects.length) missing.push('current_subjects')
  if (!text(profile.scoreBand)) missing.push('academic_band')
  if (!text(profile.budget)) missing.push('budget_band')
  if (!text(profile.examWillingness)) missing.push('exam_willingness')

  const hardConstraints = [...strings(profile.exclusions)]
  if (profile.nearHome === true) hardConstraints.push('Must study near home')
  if (text(profile.examWillingness) === 'Avoid if possible') {
    hardConstraints.push('Avoid competitive examinations where verified alternatives exist')
  }

  return {
    student_id: studentExternalId,
    grade_level: text(profile.grade),
    board,
    current_location: { state: text(profile.state), city: text(profile.city) },
    current_subjects: currentSubjects,
    subject_affinities: affinities,
    subject_avoidances: avoidances,
    academic_band: text(profile.scoreBand),
    skills,
    work_preferences: strings(profile.work),
    values: strings(profile.values),
    budget_band: text(profile.budget),
    location_constraints: [
      geography,
      geography === 'Same state' || nearHome ? text(profile.state) : '',
      geography === 'Same city' || nearHome ? text(profile.city) : '',
      nearHome ? 'Near home required' : '',
    ].filter(Boolean),
    relocation_preference: text(profile.relocate),
    exam_willingness: text(profile.examWillingness),
    course_duration_preference: text(profile.duration),
    degree_route_preferences: strings(profile.route),
    hard_constraints: [...new Set(hardConstraints)].slice(0, 10),
    missing_profile_fields: missing,
  }
}

async function findCareer(
  pool: Pool,
  requested: { name: string; fitFactors?: string[]; concerns?: string[] },
): Promise<{ career: EvidenceCareer; source: CompactSourceRecord } | null> {
  const lowerName = requested.name.toLowerCase()
  const rules: Array<[RegExp, string[]]> = [
    [/psychology|behaviour|ux/, ['psychologist', 'user experience']],
    [/software|data systems/, ['software engineer', 'computer programmer']],
    [/environmental|sustainability/, ['environmental']],
    [/design|visual communication/, ['graphic designer', 'visual designer', 'designer']],
    [/commerce|finance|entrepreneurship/, ['accountant', 'financial analyst']],
    [/health|community|allied care/, ['nurse, specialist', 'public health']],
    [/law|policy|public affairs/, ['lawyers', 'legal']],
    [/engineering|technical operations/, ['engineering technician', 'engineer']],
    [/media|writing|communication/, ['journalist', 'writer']],
  ]
  const mapped = rules.find(([pattern]) => pattern.test(lowerName))?.[1] || []
  const tokens = requested.name
    .split(/[^a-zA-Z]+/)
    .filter((part) => part.length >= 4 && !['with', 'systems'].includes(part.toLowerCase()))
  const searchTerms = [...new Set([requested.name, ...mapped, ...tokens])]
  let row:
    | {
        career_id: string
        title: string
        source_url: string | null
        verification_status: string
        last_reviewed: string | null
      }
    | undefined
  for (const term of searchTerms) {
    const result = await pool.query(
      `select career_id,title,source_url,verification_status,last_reviewed
       from careers
       where verification_status='official_taxonomy_title'
         and (lower(title)=lower($1) or title ilike $2)
       order by case when lower(title)=lower($1) then 0 else 1 end,
         length(title),title
       limit 1`,
      [term, `%${term}%`],
    )
    if (result.rowCount) {
      row = result.rows[0]
      break
    }
  }
  if (!row) return null
  const careerRow = row as {
    career_id: string
    title: string
    source_url: string | null
    verification_status: string
    last_reviewed: string | null
  }
  const recordId = sourceId('career', careerRow.career_id)
  return {
    career: {
      career_id: careerRow.career_id,
      name: careerRow.title,
      fit_factors: (requested.fitFactors || []).slice(0, 5),
      concerns: (requested.concerns || []).slice(0, 5),
      source_record_ids: [recordId],
    },
    source: {
      record_id: recordId,
      entity_type: 'career',
      entity_id: careerRow.career_id,
      name: careerRow.title,
      source_url: careerRow.source_url || '',
      source_domain: domain(careerRow.source_url || ''),
      verification_status: status(careerRow.verification_status),
      admission_cycle: null,
      last_verified_at: careerRow.last_reviewed,
    },
  }
}

export async function buildEvidencePackage(
  pool: Pool,
  auth: AuthContext,
  request: GenerationRequest,
): Promise<RoadmapEvidencePackage> {
  const studentExternalId =
    text(request.studentExternalId) || `diagnostic-${auth.userId}`
  const student = summariseStudent(studentExternalId, request.profile)

  await pool.query(
    `insert into student_profiles
     (organisation_id,student_external_id,current_stage,board,stream,country,city,profile_confidence,missing_information,updated_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     on conflict(organisation_id,student_external_id) do update set
       current_stage=excluded.current_stage,board=excluded.board,stream=excluded.stream,
       country=excluded.country,city=excluded.city,
       profile_confidence=excluded.profile_confidence,
       missing_information=excluded.missing_information,updated_at=now()`,
    [
      auth.organisationId,
      studentExternalId,
      student.grade_level || 'unknown',
      student.board || null,
      student.board || null,
      text(request.profile.country) || null,
      text(request.profile.city) || null,
      Math.max(0, 100 - student.missing_profile_fields.length * 14),
      student.missing_profile_fields,
    ],
  )

  const primary = await findCareer(pool, request.primaryCareer)
  if (!primary) {
    throw new MissingEvidenceError(
      'No verified Manyfolds career record matches this deterministic recommendation.',
    )
  }
  const alternatives = []
  const sources: CompactSourceRecord[] = [primary.source]
  const relationships: RoadmapEvidencePackage['verified_relationships'] = []
  for (const item of (request.alternativeCareers || []).slice(0, 3)) {
    const found = await findCareer(pool, item)
    if (found && found.career.career_id !== primary.career.career_id) {
      alternatives.push(found.career)
      sources.push(found.source)
    }
  }

  const courseRows = await pool.query(
    `select distinct c.course_id,c.course_name,c.award_level,c.typical_duration,c.typical_entry_stage,
            c.typical_subject_requirements,c.source_url,c.verification_status,c.last_verified_at,
            (select relation.source_url from catalogue_claims relation
              where relation.entity_type='career_course_relationship'
                and relation.entity_id=l.career_id||':'||l.course_id
                and relation.field_name='possible_study_route'
                and relation.claim_value=to_jsonb('possible_study_route'::text)
                and relation.verification_status='verified'
                and (relation.expires_at is null or relation.expires_at>=(now() at time zone 'Asia/Kolkata')::date)
              order by relation.checked_at desc limit 1) relationship_source_url
     from career_course_links l join courses c on c.course_id=l.course_id
     where l.career_id=$1 and l.verification_status='verified'
       and c.verification_status in ('verified','officially_verified')
       and exists(select 1 from catalogue_claims claim
         where claim.entity_type='course' and claim.entity_id=c.course_id
           and claim.field_name='name' and claim.claim_value=to_jsonb(c.course_name)
           and claim.verification_status='verified'
           and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date))
     order by c.course_name limit 5`,
    [primary.career.career_id],
  )
  const verifiedCourses = courseRows.rows.map((row) => {
    const id = sourceId('course', row.course_id as string)
    sources.push({
      record_id: id,
      entity_type: 'course',
      entity_id: row.course_id,
      name: row.course_name,
      source_url: row.source_url || '',
      source_domain: domain(row.source_url || ''),
      verification_status: status(row.verification_status),
      admission_cycle: null,
      last_verified_at: row.last_verified_at || null,
    })
    const course = {
      course_id: row.course_id as string,
      name: row.course_name as string,
      award_level: '',
      duration: '',
      entry_stage: '',
      subject_requirements: [],
      source_record_ids: [id],
    }
    if (row.relationship_source_url) {
      const relationId = sourceId('relationship', `career-course:${primary.career.career_id}:${course.course_id}`)
      sources.push({ record_id: relationId, entity_type: 'relationship', entity_id: `${primary.career.career_id}:${course.course_id}`, name: 'Career to possible study route', source_url: row.relationship_source_url, source_domain: domain(row.relationship_source_url), verification_status: 'verified', admission_cycle: null, last_verified_at: null })
      relationships.push({ relationship_id: `rel:career_to_course:${primary.career.career_id}:${course.course_id}`, relationship_type: 'career_to_course', from_id: primary.career.career_id, to_id: course.course_id, verification_status: 'verified', source_record_ids: [relationId] })
    }
    return course
  })

  const programmeRows =
    verifiedCourses.length > 0
      ? await pool.query(
          `select p.id::text programme_id,p.course_id,p.programme_name,p.duration,p.last_verified_at,
                  i.institution_name,s.source_url,s.last_verified_at source_verified_at,
                  e.required_subjects,e.minimum_percentage,e.admission_cycle,
                  e.exam_id
           from institution_programmes p
           join institutions i on i.institution_id=p.institution_id
           join lateral (
             select source_url,last_verified_at from institution_programme_sources
             where institution_programme_id=p.id and status='verified'
             order by last_verified_at desc nulls last,id desc limit 1
           ) s on true
           left join institution_programme_eligibility e on e.institution_programme_id=p.id
             and e.verification_status='verified'
             and exists(select 1 from catalogue_claims claim
               where claim.entity_type='programme' and claim.entity_id=p.institution_id||':'||p.programme_name
                 and claim.field_name='eligibility' and claim.claim_value=to_jsonb(e.required_subjects)
                 and claim.verification_status='verified'
                 and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date))
           where p.course_id=any($1::text[]) and p.verification_status='verified'
             and p.data_sufficient=true
             and exists(select 1 from catalogue_claims claim
               where claim.entity_type='programme'
                 and claim.entity_id=p.institution_id||':'||p.programme_name
                 and claim.field_name='offering'
                 and claim.claim_value=to_jsonb(p.programme_name)
                 and claim.verification_status='verified'
                 and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date))
           order by p.last_verified_at desc nulls last limit 8`,
          [verifiedCourses.map((course) => course.course_id)],
        )
      : { rows: [] }
  const verifiedProgrammes = programmeRows.rows.map((row) => {
    const id = sourceId('programme', row.programme_id as string)
    sources.push({
      record_id: id,
      entity_type: 'programme',
      entity_id: row.programme_id,
      name: `${row.institution_name} — ${row.programme_name}`,
      source_url: row.source_url || '',
      source_domain: domain(row.source_url || ''),
      verification_status: 'verified',
      admission_cycle: row.admission_cycle || null,
      last_verified_at: row.source_verified_at || row.last_verified_at || null,
    })
    const required = Array.isArray(row.required_subjects) ? row.required_subjects : []
    const programme = {
      programme_id: row.programme_id as string,
      institution_name: row.institution_name as string,
      programme_name: row.programme_name as string,
      course_id: row.course_id as string | null,
      eligibility_status: row.admission_cycle
        ? ('conditionally_eligible' as const)
        : ('insufficient_data' as const),
      required_subjects: required,
      admission_route_summary: row.exam_id ? `Admission route includes ${row.exam_id.replace('exam-', '').replaceAll('-', ' ').toUpperCase()}; confirm the current cycle and all category rules.` : '',
      admission_cycle: row.admission_cycle || null,
      last_verified_at: row.source_verified_at || row.last_verified_at || null,
      source_record_ids: [id],
    }
    if (programme.course_id) relationships.push({ relationship_id: `rel:course_to_programme:${programme.course_id}:${programme.programme_id}`, relationship_type: 'course_to_programme', from_id: programme.course_id, to_id: programme.programme_id, verification_status: 'verified', source_record_ids: [id] })
    return programme
  })

  const examRows =
    verifiedCourses.length > 0
      ? await pool.query(
          `select e.exam_id,e.exam_name,e.typical_purpose,e.official_url,e.verification_status,e.last_reviewed,
                  array_agg(distinct l.course_id) linked_course_ids,
                  min(relation.source_url) relationship_source_url
           from exam_course_links l join exams e on e.exam_id=l.exam_id
           join catalogue_claims relation on relation.entity_type='course_exam_relationship'
             and relation.entity_id=l.course_id||':'||l.exam_id
             and relation.field_name='admission_route'
             and relation.claim_value=to_jsonb('admission_route'::text)
             and relation.verification_status='verified'
             and (relation.expires_at is null or relation.expires_at>=(now() at time zone 'Asia/Kolkata')::date)
           where l.course_id=any($1::text[]) and l.verification_status='verified'
             and e.verification_status='verified'
             and exists(select 1 from catalogue_claims claim
               where claim.entity_type='exam' and claim.entity_id=e.exam_id
                 and claim.field_name='name' and claim.claim_value=to_jsonb(e.exam_name)
                 and claim.verification_status='verified'
                 and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date))
           group by e.exam_id order by e.exam_name limit 8`,
          [verifiedCourses.map((course) => course.course_id)],
        )
      : { rows: [] }
  const verifiedExams = examRows.rows.map((row) => {
    const id = sourceId('exam', row.exam_id as string)
    sources.push({
      record_id: id,
      entity_type: 'exam',
      entity_id: row.exam_id,
      name: row.exam_name,
      source_url: row.official_url || '',
      source_domain: domain(row.official_url || ''),
      verification_status: status(row.verification_status),
      admission_cycle: null,
      last_verified_at: row.last_reviewed || null,
    })
    const exam = {
      exam_id: row.exam_id as string,
      name: row.exam_name as string,
      purpose: '',
      source_record_ids: [id],
    }
    for (const course of verifiedCourses.filter((item) => row.linked_course_ids.includes(item.course_id))) {
      const relationId = sourceId('relationship', `course-exam:${course.course_id}:${exam.exam_id}`)
      sources.push({ record_id: relationId, entity_type: 'relationship', entity_id: `${course.course_id}:${exam.exam_id}`, name: 'Course admission examination route', source_url: row.relationship_source_url, source_domain: domain(row.relationship_source_url), verification_status: 'verified', admission_cycle: null, last_verified_at: null })
      relationships.push({ relationship_id: `rel:course_to_exam:${course.course_id}:${exam.exam_id}`, relationship_type: 'course_to_exam', from_id: course.course_id, to_id: exam.exam_id, verification_status: 'verified', source_record_ids: [relationId] })
    }
    return exam
  })

  const cycleRows = verifiedProgrammes.length
    ? await pool.query(
        `select cycle.id::text cycle_id,cycle.cycle_year,cycle.registration_close::text application_deadline,
                cycle.official_url,p.id::text programme_id,p.programme_name,p.last_verified_at
         from college_program_application_cycles cycle
         join college_program_admission_routes route on route.id=cycle.admission_route_id
         join institution_programmes p on p.id=route.institution_programme_id
         where p.id=any($1::uuid[]) and cycle.verification_status='verified'
           and cycle.registration_close>=(now() at time zone 'Asia/Kolkata')::date
           and exists(select 1 from catalogue_claims claim
             where claim.entity_type='programme_cycle'
               and claim.entity_id=p.institution_id||':'||p.programme_name||':'||cycle.cycle_year
               and claim.field_name='application_deadline'
               and claim.claim_value=to_jsonb(cycle.registration_close::text)
               and claim.verification_status='verified'
               and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date))
         order by cycle.registration_close limit 6`,
        [verifiedProgrammes.map((programme) => programme.programme_id)],
      )
    : { rows: [] }
  const verifiedAdmissionCycles = cycleRows.rows.map((row) => {
    const id = sourceId('admission_cycle', row.cycle_id as string)
    sources.push({
      record_id: id,
      entity_type: 'admission_cycle',
      entity_id: row.cycle_id,
      name: `${row.programme_name} ${row.cycle_year} application cycle`,
      source_url: row.official_url,
      source_domain: domain(row.official_url),
      verification_status: 'verified',
      admission_cycle: row.cycle_year,
      last_verified_at: row.last_verified_at,
    })
    relationships.push({ relationship_id: `rel:programme_to_admission_cycle:${row.programme_id}:${row.cycle_id}`, relationship_type: 'programme_to_admission_cycle', from_id: row.programme_id, to_id: row.cycle_id, verification_status: 'verified', source_record_ids: [id] })
    return { cycle_id: row.cycle_id as string, programme_id: row.programme_id as string, cycle: row.cycle_year as string, application_deadline: row.application_deadline as string, source_record_ids: [id] }
  })

  const missingData = [...student.missing_profile_fields.map((field) => `Profile missing: ${field}`)]
  if (!verifiedCourses.length) missingData.push('No verified course records are linked to this career.')
  if (!verifiedProgrammes.length) {
    missingData.push('No verified institution-programme and eligibility records are available.')
  }
  if (!verifiedExams.length) missingData.push('No directly relevant examination record is currently verified.')
  missingData.push('Current scholarship relationships are not verified.')
  if (!verifiedAdmissionCycles.length) missingData.push('No upcoming programme application deadline is verified for this pathway.')

  const deterministicStatus = verifiedProgrammes.some((programme) => programme.eligibility_status === 'conditionally_eligible')
    ? ('conditionally_eligible' as const)
    : ('insufficient_data' as const)

  return {
    student,
    primary_career: primary.career,
    alternative_careers: alternatives,
    verified_courses: verifiedCourses,
    verified_programmes: verifiedProgrammes,
    verified_exams: verifiedExams,
    verified_scholarships: [],
    verified_relationships: relationships,
    verified_admission_cycles: verifiedAdmissionCycles,
    source_records: sources,
    deterministic_eligibility: {
      status: deterministicStatus,
      missing_requirements:
        deterministicStatus === 'insufficient_data'
          ? ['Verified programme-level eligibility records']
          : ['Individual marks, age and category rules, documents, examination results, and current seat allocation remain to be checked'],
    },
    missing_data: missingData,
    personalisation: { hard_constraints: student.hard_constraints, high_priority_preferences: [], mixed_interest_combinations: student.subject_affinities.length > 1 ? [student.subject_affinities.slice(0, 3).join(' + ')] : [], eligibility_risks: student.hard_constraints.filter((item) => /missing|required/i.test(item)), financial_constraints: student.hard_constraints.filter((item) => /budget|cost|fee|tuition/i.test(item)), exam_constraints: student.hard_constraints.filter((item) => /exam/i.test(item)), route_preferences: student.degree_route_preferences.slice(0, 2), required_personalisation_effects: [{ profile_factor: 'student_profile', roadmap_sections_affected: ['summary', 'next_actions'] }] },
  }
}
