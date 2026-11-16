import type { RegistryDetails } from '../server/school/registryDetails.ts'
import type { StudentRecord } from './studentRegistryApi.ts'
export type RegistryFilter = Partial<Record<'academicYear'|'className'|'section'|'staff'|'stage'|'pathway'|'cluster'|'stream'|'profile'|'interaction'|'followUp'|'consent'|'priority'|'outcome'|'plan', string>>

export function registryMatches(student: StudentRecord, details: RegistryDetails | undefined, filters: RegistryFilter, now = Date.now()) {
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue
    if (key === 'staff') { if ((student.counsellor || 'Unassigned') !== value) return false; continue }
    if (key === 'stage') { if (student.stage !== value) return false; continue }
    if (key === 'priority') { if (Boolean(student.priority) !== (value === 'Flagged')) return false; continue }
    if (!details) return false
    if (['academicYear', 'className', 'section', 'stream'].includes(key) && details[key as 'stream'] !== value) return false
    if (key === 'pathway' && !details.pathways.includes(value)) return false
    if (key === 'cluster' && !details.clusters.includes(value)) return false
    if (key === 'outcome' && !details.outcomes.includes(value)) return false
    if (key === 'plan' && !details.plans.includes(value)) return false
    if (key === 'consent' && (value === 'Not recorded' ? details.consent.length > 0 : !details.consent.includes(value))) return false
    if (key === 'profile' && (value === 'None recorded' ? details.profileAreas !== 0 : value === 'All four areas recorded' ? details.profileAreas !== 4 : details.profileAreas === 0 || details.profileAreas === 4)) return false
    if (key === 'interaction') {
      const elapsed = details.lastSession ? now - Date.parse(details.lastSession) : null
      if (value === 'Never' ? elapsed !== null : value === 'Within 30 days' ? elapsed === null || elapsed < 0 || elapsed > 30 * 86400000 : elapsed === null || elapsed <= 30 * 86400000) return false
    }
    if (key === 'followUp') {
      const remaining = details.nextFollowUp ? Date.parse(details.nextFollowUp) - now : null
      if (value === 'No open follow-up' ? remaining !== null : value === 'Overdue' ? remaining === null || remaining >= 0 : remaining === null || remaining < 0 || remaining > 7 * 86400000) return false
    }
  }
  return true
}
