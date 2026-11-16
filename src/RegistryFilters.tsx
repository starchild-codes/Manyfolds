import { useEffect, useMemo, useState } from 'react'
import { operationsRequest } from './operationsApi'
import type { StudentRecord } from './studentRegistryApi'
import type { RegistryDetails } from '../server/school/registryDetails'
import { registryMatches, type RegistryFilter } from './registryFiltering'
import './RegistryFilters.css'

export default function RegistryFilters({ records, onChange, onDetails }: {
  records: StudentRecord[]; onChange: (ids: string[] | null) => void
  onDetails: (details: RegistryDetails[]) => void
}) {
  const [details, setDetails] = useState<RegistryDetails[] | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  const [filters, setFilters] = useState<RegistryFilter>({})
  useEffect(() => {
    let active = true
    setError(''); setDetails(null); onDetails([])
    void operationsRequest<{ records: RegistryDetails[] }>('/registry-details').then(result => {
      if (active) { setDetails(result.records); onDetails(result.records) }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Registry details could not be loaded.') })
    return () => { active = false }
  }, [attempt, onDetails])
  const metadata = useMemo(() => new Map((details || []).map(row => [row.id, row])), [details])
  useEffect(() => {
    onChange(records.filter(row => registryMatches(row, metadata.get(row.id), filters)).map(row => row.id))
  }, [records, metadata, filters, onChange])
  const options = (field: keyof RegistryDetails) => [...new Set((details || []).flatMap(row => {
    const value = row[field]; return typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  }).filter(Boolean))].sort()
  const choices: Array<[keyof RegistryFilter, string, string[], boolean?]> = [
    ['academicYear', 'Academic year', options('academicYear'), true], ['className', 'Class', options('className'), true],
    ['section', 'Section', options('section'), true], ['staff', 'Assigned staff', [...new Set(records.map(row => row.counsellor || 'Unassigned'))].sort()],
    ['stage', 'Guidance stage', [...new Set(records.map(row => row.stage))].sort()],
    ['pathway', 'Pathway', options('pathways'), true], ['cluster', 'Career field', options('clusters'), true],
    ['stream', 'Stream', options('stream'), true], ['profile', 'Profile records', ['None recorded', 'Some areas recorded', 'All four areas recorded'], true],
    ['interaction', 'Last completed session', ['Never', 'Within 30 days', 'Over 30 days ago'], true],
    ['followUp', 'Follow-up', ['Overdue', 'Due within 7 days', 'No open follow-up'], true],
    ['consent', 'Latest consent responses by purpose', ['Not recorded', 'Awaiting response', 'Granted', 'Declined', 'Withdrawn'], true],
    ['priority', 'Attention flag', ['Flagged', 'No flag']], ['outcome', 'Outcome type', options('outcomes'), true],
    ['plan', 'Action-plan status', options('plans'), true],
  ]
  return <details className="registry-filters"><summary>More registry filters{Object.values(filters).filter(Boolean).length ? ` (${Object.values(filters).filter(Boolean).length} active)` : ''}</summary>
    <p>Filters use saved records. “All four areas” means an entry exists in academics, interests, skills and constraints; it is not a quality score. Consent responses apply to their recorded purposes.</p>
    {error ? <p role="alert">{error} <button className="text-button" type="button" onClick={() => setAttempt(value => value + 1)}>Retry details</button></p> : !details && <p role="status">Loading saved registry details...</p>}
    <div>{choices.map(([key, label, values, needsDetails]) => <label key={key}>{label}<select value={filters[key] || ''} disabled={needsDetails && !details} onChange={event => setFilters(old => ({...old, [key]: event.target.value}))}>
      <option value="">All</option>{values.map(value => <option key={value}>{value}</option>)}
    </select></label>)}</div>
    <button type="button" className="text-button" onClick={() => setFilters({})}>Clear detailed filters</button>
    <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Refresh saved details</button>
  </details>
}
