import assert from 'node:assert/strict'
import { loadEnv } from 'vite'
import { Client } from 'pg'
import { buildEvidencePackage } from '../server/ai/evidence.ts'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const member = (await client.query('select user_id,organisation_id,role from organisation_memberships where active limit 1')).rows[0]
  assert.ok(member, 'An active workspace is required for the evidence check')
  await client.query('begin')
  for (const [name, expectedCourse, expectedProgramme] of [
    ['Software & data systems', 'course-bachelor-of-technology-in-computer-science-and-engineering', 'B.Tech. in Computer Science and Engineering'],
    ['Law, policy and public affairs', 'course-bachelor-of-arts-and-bachelor-of-laws', 'B.A., LL.B. (Hons.)'],
    ['Psychology, behaviour and UX research', 'official-uod-ba-hons-psychology', null],
  ]) {
    const evidence = await buildEvidencePackage(client, {
      userId: member.user_id,
      organisationId: member.organisation_id,
      role: member.role,
    }, {
      studentExternalId: `official-pilot-test-${expectedCourse}`,
      profile: { grade: 'Class 12', stream: 'Science PCM', subjects: { Physics: 'like', Chemistry: 'like', Mathematics: 'like' }, scoreBand: '80–89%', budget: 'Prefer not to answer', examWillingness: 'Open' },
      primaryCareer: { name, fitFactors: [], concerns: [] },
      alternativeCareers: [],
    })
    assert.ok(evidence.verified_courses.some(course => course.course_id === expectedCourse), `${name} mapped to ${evidence.primary_career.name} (${evidence.primary_career.career_id}) without sourced course`)
    if (expectedProgramme) assert.ok(evidence.verified_programmes.some(programme => programme.programme_name === expectedProgramme), `${name} missing sourced programme`)
    assert.ok(evidence.source_records.some(source => source.source_url.startsWith('https://')), `${name} missing official source`)
    if (name.startsWith('Software')) assert.ok(!evidence.verified_relationships.some(link => link.relationship_type === 'career_to_course'), 'Seeded software career-to-course mapping was promoted without a relationship claim')
    if (name.startsWith('Law')) assert.ok(evidence.verified_relationships.some(link => link.relationship_type === 'career_to_course' && link.to_id === expectedCourse), 'Sourced law degree route missing')
    if (name.startsWith('Law')) assert.ok(evidence.verified_admission_cycles.some(cycle => cycle.application_deadline === '2026-10-31'), 'CLAT 2027 deadline missing')
  }
  await client.query("update catalogue_claims set verification_status='stale' where claim_key='course:iitd-cse:name'")
  const withheld = await buildEvidencePackage(client, {
    userId: member.user_id, organisationId: member.organisation_id, role: member.role,
  }, {
    studentExternalId: 'official-pilot-test-stale-source',
    profile: { grade: 'Class 12', stream: 'Science PCM', subjects: { Physics: 'like', Chemistry: 'like', Mathematics: 'like' } },
    primaryCareer: { name: 'Software & data systems', fitFactors: [], concerns: [] }, alternativeCareers: [],
  })
  assert.ok(!withheld.verified_courses.some(course => course.course_id === 'course-bachelor-of-technology-in-computer-science-and-engineering'), 'A stale name claim leaked into AI evidence')
  console.log('Official roadmap evidence pilot passed for engineering, law, and psychology')
} finally {
  await client.query('rollback').catch(() => undefined)
  await client.end()
}
