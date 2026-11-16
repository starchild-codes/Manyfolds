import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Pool } from 'pg'
import type { AuthContext } from '../ai/types.ts'
import { AccessError, canGuide } from '../access.ts'
import { readDatabase } from '../database.ts'

export type RegistryDetails = {
  id: string; academicYear: string; stream: string; className: string; section: string
  profileAreas: number; lastSession: string | null; nextFollowUp: string | null
  pathways: string[]; clusters: string[]; plans: string[]; outcomes: string[]; consent: string[]
}

export async function registryDetailsRequest(req: IncomingMessage, res: ServerResponse, pool: Pool, auth: AuthContext, url: URL) {
  if (url.pathname !== '/registry-details') return false
  if (req.method !== 'GET' || !canGuide(auth.role)) throw new AccessError('Registry guidance details are restricted to guidance staff.', 403)
  const [students, activities, planning, classes] = await Promise.all([
    readDatabase(pool, `select s.external_key, s.payload->>'grade' grade, p.details
      from student_registry_records s left join student_guidance_profiles p
      on p.organisation_id=s.organisation_id and p.student_key=s.external_key
      where s.organisation_id=$1 and s.archived_at is null
      and public.school_can_access_student(s.organisation_id,s.external_key,$2)
      order by s.external_key limit 5001`, [auth.organisationId, auth.userId]),
    readDatabase(pool, `select student_key,kind,status,scheduled_at from guidance_activities
      where organisation_id=$1 and public.school_can_access_student(organisation_id,student_key,$2)`, [auth.organisationId, auth.userId]),
    readDatabase(pool, `select student_key,kind,payload from school_student_planning
      where organisation_id=$1 and public.school_can_access_student(organisation_id,student_key,$2)`, [auth.organisationId, auth.userId]),
    readDatabase(pool, 'select class_name from school_classes where organisation_id=$1 order by length(class_name) desc', [auth.organisationId]),
  ])
  if (students.rows.length > 5000) throw new AccessError('This registry is too large for one view. Contact support for a scoped export.', 413)
  const byStudent = <T extends {student_key: string}>(rows: T[]) => {
    const result = new Map<string, T[]>()
    for (const row of rows) result.set(row.student_key, [...(result.get(row.student_key) || []), row])
    return result
  }
  const activityMap = byStudent(activities.rows), planMap = byStudent(planning.rows)
  const records: RegistryDetails[] = students.rows.map(student => {
    const details = student.details || {}, all = activityMap.get(student.external_key) || [], plans = planMap.get(student.external_key) || []
    const pathways = plans.filter(p => p.kind === 'pathway' && p.payload.status === 'active')
    const grade = String(student.grade || ''), className = classes.rows.find(c => grade === c.class_name || grade.startsWith(c.class_name + ' '))?.class_name || grade
    const dates = (kind: string, completed: boolean) => all.filter(a => a.kind === kind && (completed ? a.status === 'completed' : !['completed', 'cancelled', 'archived'].includes(a.status))).map(a => new Date(a.scheduled_at).toISOString()).sort()
    const consents = new Map<string, {status: string; date: string}>()
    for (const row of details.consents || []) {
      const purpose = String(row.purpose || '').trim().toLowerCase(), previous = consents.get(purpose)
      if (!previous || row.date >= previous.date) consents.set(purpose, {status: row.status, date: row.date})
    }
    const present = (value: unknown) => Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === 'object' && Object.values(value).some(Boolean))
    return {
      id: student.external_key, academicYear: details.overview?.academicYear || '', stream: details.overview?.stream || '',
      className, section: grade.slice(className.length).trim(),
      profileAreas: [details.academics, details.interests, details.skills, details.constraints].filter(present).length,
      lastSession: dates('session', true).at(-1) || null, nextFollowUp: dates('task', false)[0] || null,
      pathways: pathways.map(p => String(p.payload.title)), clusters: [...new Set(pathways.map(p => String(p.payload.career || '')).filter(Boolean))],
      plans: [...new Set(plans.filter(p => p.kind === 'plan' && p.payload.status !== 'archived').map(p => String(p.payload.status)))],
      outcomes: [...new Set(plans.filter(p => p.kind === 'outcome' && p.payload.status !== 'archived').map(p => String(p.payload.type)))],
      consent: [...new Set([...consents.values()].map(row => row.status))],
    }
  })
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({records})); return true
}
