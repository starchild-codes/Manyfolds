import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'
import { Client } from 'pg'

export function domesticSection(html) {
  const clean = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/?(?:p|div|h[1-6]|li|br|section|ul|ol)\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim()
  const start = clean.indexOf('NLSIU announces admission to its 3-year BA (Hons.) programme')
  const end = clean.indexOf('Intake and Reservation', start)
  if (start < 0 || end < start) throw Error('Domestic admission section missing')
  return clean.slice(start, end).trim()
}

export function checkDomesticSource(html, manifest, today) {
  if(manifest.sourceUrl!=='https://www.nls.ac.in/programme/b-a-hons/'||manifest.institutionId!=='official-nlsiu-bengaluru'||manifest.courseId!=='official-nlsiu-ba-hons'||manifest.examId!=='official-nlsat-ba'||manifest.programmeName!=='B.A. (Hons.)')throw Error('Reviewed programme identity does not match the official source')
  if (today > manifest.reviewAfter || today < manifest.reviewedOn) throw Error('Reviewed NLSIU manifest requires a fresh human source review')
  const domestic=domesticSection(html)
  if(!/^[a-f0-9]{64}$/.test(manifest.domesticTextHash||'')||createHash('sha256').update(domestic).digest('hex')!==manifest.domesticTextHash)throw Error('Reviewed domestic admission rule changed; publication refused')
  const phrases = [
    'additional 4th year in the research track', 'commence on 1 July 2027',
    'higher secondary qualification [10+2 or an equivalent examination or programme] from any recognized board or school of education',
    'Applicants in the general category should have graduated with an aggregate of not less than 55% of total marks.',
    'Applicants in the SC/ST category should have graduated with an aggregate of not less than 45% of total marks.',
    'Students in the final year of their higher-secondary education are also eligible to apply',
    'contingent upon the successful completion of their higher-secondary education with the minimum aggregate marks specified above',
    'Proof of completion of the qualifying degree has to be submitted no later than December 31, 2027.',
    'Academic Year 2027-28',
    'All candidates seeking admission to the programme shall appear for the National Law School Admission Test for Bachelors of Arts (NLSAT-BA).',
    'Applications shall be accepted till 11:59 PM on 23 March 2027.',
    'The NLSAT-BA will be held on 25 April 2027 (Sunday)',
    'provisional admission will become final only after verification of the original documents and payment of fees.',
  ]
  if (!phrases.every(phrase => domestic.includes(phrase))) throw Error('Reviewed domestic admission rule changed; publication refused')
  if (manifest.cycle !== '2027-28' || manifest.generalMinimumPercentage !== 55 || manifest.scStMinimumPercentage !== 45 || manifest.applicationDeadline !== '2027-03-23' || manifest.examDate !== '2027-04-25' || manifest.qualificationProofDeadline !== '2027-12-31') throw Error('Manifest values do not match reviewed rules')
  return { hash: createHash('sha256').update(html).digest('hex'), excerpt: domestic }
}

export async function publishDomesticAdmission(db, m, evidence) {
  const entity = `${m.institutionId}:${m.programmeName}`
  const blocked = await db.query(`select 1 from catalogue_claims where (entity_id=any($1::text[]) or claim_key like 'programme:nlsiu-ba:%') and verification_status in('conflicting','archived') union all select 1 from institution_programmes where institution_id=$2 and programme_name=$3 and verification_status in('conflicting','archived') union all select 1 from exams where exam_id=$4 and verification_status in('conflicting','archived') union all select 1 from courses where course_id=$5 and verification_status in('conflicting','archived') union all select 1 from institution_programme_eligibility where institution_programme_id in(select id from institution_programmes where institution_id=$2 and programme_name=$3) and verification_status in('conflicting','archived') limit 1`, [[entity, m.courseId, m.examId, `${m.courseId}:${m.examId}`, `${entity}:${m.cycle}`], m.institutionId, m.programmeName, m.examId, m.courseId])
  if (blocked.rowCount) throw Error('Conflicting or archived records require curator review')
  // Bootstrap reviewed identities too; no dependency on an unreleased draft seed.
  if(!(await db.query(`insert into courses(course_id,course_name,typical_duration,typical_entry_stage,source_url,verification_status,last_verified_at) values($1,$2,'3 years; optional fourth research year','Recognised 10+2 or equivalent',$3,'verified',now()) on conflict(course_id) do update set typical_duration=excluded.typical_duration,typical_entry_stage=excluded.typical_entry_stage,verification_status='verified',last_verified_at=now() where courses.course_name=excluded.course_name and courses.source_url=excluded.source_url returning course_id`,[m.courseId,m.programmeName,m.sourceUrl])).rowCount)throw Error('Course identity requires curator review')
  if(!(await db.query(`insert into exams(exam_id,exam_name,conducting_body,official_url,verification_status,last_reviewed) values($1,'NLSAT-BA',$2,$3,'verified',$4) on conflict(exam_id) do update set verification_status='verified',last_reviewed=excluded.last_reviewed where exams.exam_name=excluded.exam_name and exams.official_url=excluded.official_url returning exam_id`,[m.examId,m.publisher,m.sourceUrl,m.reviewedOn])).rowCount)throw Error('Exam identity requires curator review')
  await db.query(`insert into institution_programmes(institution_id,course_id,programme_name,duration,official_programme_url,official_admissions_url,verification_status,data_sufficient,last_verified_at) values($1,$2,$3,'3 years; optional fourth research year',$4,$4,'verified',false,now()) on conflict(institution_id,programme_name) do nothing`,[m.institutionId,m.courseId,m.programmeName,m.sourceUrl])
  const p = (await db.query(`select id from institution_programmes where institution_id=$1 and programme_name=$2 and course_id=$3 for update`, [m.institutionId, m.programmeName, m.courseId])).rows[0]
  if (!p) throw Error('Expected reviewed programme identity missing')
  const sourceRows = await db.query(`select id from institution_programme_sources where institution_programme_id=$1 and source_url=$2 order by id`, [p.id, m.sourceUrl])
  let sourceId = sourceRows.rows[0]?.id
  if (!sourceId) sourceId = (await db.query(`insert into institution_programme_sources(institution_programme_id,source_name,source_url,source_year,last_verified_at,status) values($1,$2,$3,'2027-28',now(),'verified') returning id`, [p.id, 'NLSIU domestic BA admission 2027-28', m.sourceUrl])).rows[0].id
  else if (!(await db.query(`update institution_programme_sources set last_verified_at=now(),status='verified',source_year='2027-28' where id=$1 and status not in('conflicting','archived')`, [sourceId])).rowCount) throw Error('Source requires curator review')
  const rules = {
    general_minimum_percentage: m.generalMinimumPercentage,
    SC_ST_minimum_percentage: m.scStMinimumPercentage,
    scope: 'Domestic admission; confirm applicable category with NLSIU',
  }
  const board = { qualification: 'Recognised 10+2 or equivalent', appearing_students: 'Provisional, subject to completion with the applicable minimum aggregate', proof_deadline: m.qualificationProofDeadline }
  const existing = await db.query(`select id from institution_programme_eligibility where institution_programme_id=$1 and admission_cycle=$2 for update`, [p.id, m.cycle])
  if (existing.rowCount > 1) throw Error('Ambiguous eligibility rows require review')
  if (!existing.rowCount) await db.query(`insert into institution_programme_eligibility(institution_programme_id,required_subjects,minimum_percentage,exam_id,source_id,verification_status,admission_cycle,board_rules,category_specific_rules,official_source,last_verified_at) values($1,'{}',55,$2,$3,'verified',$4,$5,$6,$7,now())`, [p.id, m.examId, sourceId, m.cycle, board, rules, m.sourceUrl])
  else await db.query(`update institution_programme_eligibility set required_subjects='{}',minimum_percentage=55,exam_id=$2,source_id=$3,verification_status='verified',board_rules=$4,category_specific_rules=$5,official_source=$6,last_verified_at=now() where id=$1`, [existing.rows[0].id, m.examId, sourceId, board, rules, m.sourceUrl])
  await db.query(`update institution_programmes set data_sufficient=true,verification_status='verified',last_verified_at=now() where id=$1`, [p.id])
  await db.query(`update exams set exam_name='NLSAT-BA',conducting_body=$2,official_url=$3,verification_status='verified',last_reviewed=$4 where exam_id=$1`, [m.examId, m.publisher, m.sourceUrl, m.reviewedOn])
  if (!(await db.query('select 1 from exams where exam_id=$1', [m.examId])).rowCount) throw Error('Expected reviewed exam identity missing')
  if (!(await db.query(`insert into exam_course_links(exam_id,course_id,relationship_type,verification_status) values($1,$2,'admission_route','verified') on conflict(exam_id,course_id,relationship_type) do update set verification_status='verified' where exam_course_links.verification_status not in('archived','conflicting') returning exam_id`, [m.examId, m.courseId])).rowCount) throw Error('Exam relationship requires curator review')
  const routes = await db.query(`select id,verification_status from college_program_admission_routes where institution_programme_id=$1 and admission_cycle=$2 for update`, [p.id, m.cycle])
  if (routes.rowCount > 1 || routes.rows.some(row => ['archived','conflicting'].includes(row.verification_status))) throw Error('Admission route requires curator review')
  let routeId = routes.rows[0]?.id
  if (!routeId) routeId = (await db.query(`insert into college_program_admission_routes(institution_programme_id,route_type,application_method,official_url,verification_status,direct_application_required,admission_cycle,last_verified_at) values($1,'NLSAT-BA','Direct application through the NLSIU admission portal',$2,'verified',true,$3,now()) returning id`, [p.id, m.sourceUrl, m.cycle])).rows[0].id
  const cycles = await db.query(`select id,verification_status from college_program_application_cycles where admission_route_id=$1 and cycle_year=$2 for update`, [routeId, m.cycle])
  if (cycles.rowCount > 1 || cycles.rows.some(row => ['archived','conflicting'].includes(row.verification_status))) throw Error('Admission cycle requires curator review')
  if (!cycles.rowCount) await db.query(`insert into college_program_application_cycles(admission_route_id,cycle_year,registration_close,official_url,verification_status) values($1,$2,$3,$4,'verified')`, [routeId, m.cycle, m.applicationDeadline, m.sourceUrl])
  else await db.query(`update college_program_application_cycles set registration_close=$2,official_url=$3,verification_status='verified' where id=$1`, [cycles.rows[0].id, m.applicationDeadline, m.sourceUrl])
  const claims = [
    ['course:official-nlsiu-ba-hons:name','course',m.courseId,'name',m.programmeName],
    ['course:official-nlsiu-ba-hons:duration','course',m.courseId,'duration','3 years; optional fourth research year'],
    ['course:official-nlsiu-ba-hons:entry_qualification','course',m.courseId,'entry_qualification','Recognised 10+2 or equivalent'],
    ['programme:nlsiu-ba:offering','programme',entity,'offering',m.programmeName],
    ['programme:nlsiu-ba:eligibility', 'programme', entity, 'eligibility', []],
    ['programme:nlsiu-ba:eligibility-rules', 'programme', entity, 'eligibility_rules', { required_subjects: [], board_rules: board, category_specific_rules: rules, exam_id: m.examId, admission_cycle: m.cycle }],
    ['exam:nlsat-ba:name', 'exam', m.examId, 'name', 'NLSAT-BA'],
    ['relationship:nlsiu-ba:nlsat', 'course_exam_relationship', `${m.courseId}:${m.examId}`, 'admission_route', 'admission_route'],
    ['programme-cycle:nlsiu-ba-2027:deadline', 'programme_cycle', `${entity}:${m.cycle}`, 'application_deadline', m.applicationDeadline],
    ['exam-cycle:nlsat-ba-2027:date', 'exam_cycle', `${m.examId}:${m.cycle}`, 'exam_date', m.examDate],
  ]
  for (const [key, type, id, field, value] of claims) await db.query(`insert into catalogue_claims(claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,document_title,checked_at,reviewer,review_method,academic_cycle,expires_at,evidence_locator,evidence_excerpt,source_hash,verification_status) values($1,$2,$3,$4,$5::jsonb,$6,$7,'NLSIU domestic BA admission 2027-28',now(),'Manyfolds reviewed domestic admission audit','source_audit',$8,$9,$10,$11,$12,'verified') on conflict(claim_key) do update set claim_value=excluded.claim_value,checked_at=now(),reviewer=excluded.reviewer,academic_cycle=excluded.academic_cycle,expires_at=excluded.expires_at,evidence_locator=excluded.evidence_locator,evidence_excerpt=excluded.evidence_excerpt,source_hash=excluded.source_hash,verification_status='verified',updated_at=now() where catalogue_claims.source_url=excluded.source_url and catalogue_claims.entity_id=excluded.entity_id and catalogue_claims.verification_status not in('conflicting','archived') returning claim_key`, [key, type, id, field, JSON.stringify(value), m.sourceUrl, m.publisher, m.cycle, m.reviewAfter, `Domestic admission: Eligibility, Admission Test and Important Dates, before Intake and Reservation. ${m.scope}`, evidence.excerpt, evidence.hash]).then(result => { if (result.rowCount !== 1) throw Error(`Claim identity/status mismatch: ${key}`) })
  const monitor=await db.query('select monitor_key from catalogue_source_monitors where source_url=$1',[m.sourceUrl])
  if(!monitor.rowCount)await db.query(`insert into catalogue_source_monitors(monitor_key,source_url,source_kind,entity_scope,check_interval_hours,last_checked_at,last_http_status,last_content_hash,next_check_at,active) values('nlsiu-ba-domestic-2027',$1,'official_programme','Domestic BA admission rules',24,now(),200,$2,now()+interval '1 day',true)`,[m.sourceUrl,evidence.hash])
  else await db.query(`update catalogue_source_monitors set last_checked_at=now(),last_http_status=200,last_content_hash=$2,next_check_at=now()+interval '1 day' where source_url=$1 and active`,[m.sourceUrl,evidence.hash])
  return { programmeId: p.id, claims: claims.length, cycle: m.cycle }
}

async function main() {
  const manifest = JSON.parse(await readFile('data/verified/nlsiu-ba-2027.json', 'utf8'))
  const response = await fetch(manifest.sourceUrl, { signal: AbortSignal.timeout(25000) })
  if (!response.ok || new URL(response.url).hostname !== 'www.nls.ac.in') throw Error('Official NLSIU source unavailable or redirected')
  const evidence = checkDomesticSource(await response.text(), manifest, new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
  const db = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  try {
    await db.query('begin')
    // Serialize refreshes; dry runs exercise all writes but roll back.
    await db.query("select pg_advisory_xact_lock(hashtext('manyfolds-nlsiu-ba-2027'))")
    const result = await publishDomesticAdmission(db, manifest, evidence)
    const applied = process.argv.includes('--apply')
    await db.query(applied ? 'commit' : 'rollback')
    console.log(JSON.stringify({ ...result, applied, source: manifest.sourceUrl, reviewAfter: manifest.reviewAfter, scope: manifest.scope }))
  } catch (error) { await db.query('rollback'); throw error } finally { await db.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
