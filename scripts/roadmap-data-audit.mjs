import { loadEnv } from 'vite'
import { Client } from 'pg'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
console.log('AI provider configured:', Boolean(env.OPENROUTER_API_KEY))
await client.connect()
try {
  const configuredModels=[env.OPENROUTER_PRIMARY_MODEL||'mistralai/mistral-small-3.2-24b-instruct',...(env.OPENROUTER_FALLBACK_MODELS||env.OPENROUTER_FALLBACK_MODEL||'openai/gpt-4.1-mini').split(',').map(item=>item.trim())]
  const models=await client.query('select model_id,enabled,review_status from ai_model_allowlist where model_id=any($1::text[]) order by model_id',[configuredModels])
  console.log('Reviewed AI models:',models.rows)
  for (const table of ['careers','courses','career_course_links','institutions','institution_programmes','institution_programme_sources','institution_programme_eligibility','exams','exam_course_links','examination_cycles','scholarships']) {
    const result = await client.query(`select count(*)::int total from public.${table}`)
    console.log(`${table}: ${result.rows[0].total}`)
  }
  for (const table of ['courses','institution_programmes','institution_programme_eligibility','exams','examination_cycles']) {
    const result = await client.query(`select verification_status,count(*)::int total from public.${table} group by verification_status order by verification_status`)
    console.log(`${table} status:`, result.rows)
  }
  const programmes = await client.query(`select p.programme_name,p.verification_status,p.data_sufficient,c.course_name,i.institution_name
    from institution_programmes p join courses c on c.course_id=p.course_id join institutions i on i.institution_id=p.institution_id limit 12`)
  console.log('Programmes:', programmes.rows)
  const candidateCourses = await client.query(`select course_id,course_name,verification_status,source_url from courses where course_name ilike any($1::text[]) limit 12`, [['%computer science%','%psychology%','%engineering%']])
  console.log('Candidate courses:', candidateCourses.rows)
  const candidateInstitutions = await client.query(`select institution_id,institution_name,source_url from institutions where institution_name ilike any($1::text[]) limit 12`, [['%Delhi%','%Roorkee%','%Jawaharlal%']])
  console.log('Candidate institutions:', candidateInstitutions.rows)
  const relevantCourses = await client.query(`select course_id,course_name from courses
    where course_name ilike any($1::text[]) order by course_name limit 25`, [['%law%','%design%','%psychology%']])
  console.log('Law/design/psychology courses:', relevantCourses.rows)
  const relevantCareers = await client.query(`select career_id,title from careers
    where title ilike any($1::text[]) and verification_status='official_taxonomy_title'
    order by title limit 30`, [['%psychologist%','%software engineer%','%lawyer%','%designer%']])
  console.log('Relevant careers:', relevantCareers.rows)
  const targetLinks=await client.query(`select l.career_id,l.course_id from career_course_links l
    where l.career_id in ('nco-2512-0100','nco-2611-9900','nco-2634-0100')
      and l.course_id in ('course-bachelor-of-technology-in-computer-science-and-engineering','course-bachelor-of-arts-and-bachelor-of-laws','course-bachelor-of-arts-in-psychology')`)
  console.log('Target links:',targetLinks.rows)
  const programmeCycles=await client.query(`select current_date today,p.programme_name,route.admission_cycle,cycle.cycle_year,cycle.registration_close,cycle.verification_status
    from institution_programmes p join college_program_admission_routes route on route.institution_programme_id=p.id
    left join college_program_application_cycles cycle on cycle.admission_route_id=route.id`)
  console.log('Programme cycles:',programmeCycles.rows)
  if (process.argv.includes('--schema')) {
    for (const table of ['courses','institutions','exams','institution_programmes','institution_programme_sources','institution_programme_eligibility','examination_cycles']) {
      const columns=await client.query(`select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,[table])
      console.log(`${table} columns:`,columns.rows)
    }
  }
} finally {await client.end()}
