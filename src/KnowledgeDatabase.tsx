import { useEffect, useState } from 'react'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from './UiPrimitives'
import { savePath } from './savedPathways'

type RecordType = 'Career' | 'Course' | 'College' | 'Exam' | 'Scholarship'
type DatabaseRecord = {
  id: string
  name: string
  summary: string | null
  field: string | null
  source_name: string | null
  source_url: string
  last_reviewed: string
  verification_status: 'verified' | 'verified_listing' | 'official_taxonomy_title'
}
type Response = { total: number; records: DatabaseRecord[] }
const categories: RecordType[] = ['Career', 'Course', 'College', 'Exam', 'Scholarship']

export default function KnowledgeDatabase({ notify, initialType = 'Career', title = 'Explore verified pathways' }: {
  notify: (message: string) => void
  initialType?: RecordType
  title?: string
}) {
  const [type, setType] = useState<RecordType>(initialType)
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [data, setData] = useState<Response>({ total: 0, records: [] })
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selected, setSelected] = useState<DatabaseRecord | null>(null)

  useEffect(() => { setType(initialType); setPage(1); setTerm(''); setSelected(null) }, [initialType])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setState('loading')
      try {
        const response = await fetch(`/api/knowledge?type=${type}&page=${page}&q=${encodeURIComponent(term)}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Search unavailable')
        setData(await response.json())
        setState('ready')
      } catch {
        if (!controller.signal.aborted) setState('error')
      }
    }, 220)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [type, term, page, reload])

  const choose = (next: RecordType) => { setType(next); setPage(1); setSelected(null) }
  return <div className="content knowledge-live">
    <PageHeader eyebrow="Verified knowledge database" title={type === initialType ? title : `${type}s`} description={type === 'Career' ? 'Occupation titles are checked against the official classification. Career requirements appear only when separately verified.' : 'Only records with a verified status, source link and review date appear here. Missing categories stay empty until checked.'} action={<div className="live-count"><b>{state === 'ready' ? data.total.toLocaleString() : '—'}</b><small>{type === 'Career' ? 'verified occupation titles' : `verified ${type.toLowerCase()} records`}</small></div>} />
    <div className="kb-toolbar">
      <label className="search"><span aria-hidden="true">⌕</span><input aria-label={`Search ${type.toLowerCase()}s`} value={term} onChange={event => { setTerm(event.target.value); setPage(1); setSelected(null) }} placeholder={`Search ${type.toLowerCase()}s`} /></label>
      <div className="filters" aria-label="Knowledge categories">{categories.map(item => <button key={item} onClick={() => choose(item)} className={'filter ' + (type === item ? 'active' : '')} aria-pressed={type === item}>{item}s</button>)}</div>
    </div>
    <section className="panel kb-table">
      {state === 'loading' ? <div className="kb-loading"><LoadingSkeleton label={`Loading ${type.toLowerCase()} records`} rows={5} /></div> : state === 'error' ? <EmptyState title="Records could not load" description="The verified knowledge database is unavailable right now." action={<button className="secondary" onClick={() => setReload(value => value + 1)}>Retry search</button>} /> : data.records.length ? <table>
        <thead><tr><th>Record</th><th>Field / category</th><th>Verification</th><th>Source</th></tr></thead>
        <tbody>{data.records.map(record => <tr key={record.id} onClick={() => setSelected(record)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(record) } }} tabIndex={0} aria-label={`Open ${record.name}`}>
          <td data-label="Record"><b>{record.name}</b>{record.summary && <small>{record.summary.slice(0, 115)}</small>}</td>
          <td data-label="Field">{record.field || 'No verified category'}</td>
          <td data-label="Verification"><StatusBadge tone="success">{record.verification_status === 'official_taxonomy_title' ? 'Verified title' : record.verification_status === 'verified_listing' ? 'Verified listing' : 'Verified'}</StatusBadge></td>
          <td data-label="Source"><a href={record.source_url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>{record.source_name || 'Official source'}</a></td>
        </tr>)}</tbody>
      </table> : <EmptyState title="No verified data available" description={term ? 'No verified records match this search. Try a broader title or another category.' : `No ${type.toLowerCase()} records have complete verification yet.`} />}
    </section>
    <div className="pagination"><button className="secondary" disabled={page === 1 || state !== 'ready'} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} · {state === 'ready' ? data.total.toLocaleString() : '—'} total</span><button className="secondary" disabled={page * 30 >= data.total || state !== 'ready'} onClick={() => setPage(value => value + 1)}>Next</button></div>
    {selected && <div className="overlay"><aside className="drawer kb-detail" aria-label="Knowledge record details"><button className="drawer-close" aria-label="Close record" onClick={() => setSelected(null)}>×</button><p className="eyebrow">{type} · Manyfolds database</p><h2>{selected.name}</h2><StatusBadge tone="success">{selected.verification_status === 'official_taxonomy_title' ? 'Verified title' : selected.verification_status === 'verified_listing' ? 'Verified listing' : 'Verified'}</StatusBadge>{selected.summary && <p className="detail-copy">{selected.summary}</p>}{selected.verification_status === 'official_taxonomy_title' && <p className="detail-copy">Only the occupation title is verified. No career requirements or programme details are available for this record.</p>}{selected.verification_status === 'verified_listing' && <p className="detail-copy">The scheme listing and application window are verified. Benefit amount and individual eligibility are not available here.</p>}<div className="drawer-section"><h3>Source & freshness</h3><dl><div><dt>Source</dt><dd><a href={selected.source_url} target="_blank" rel="noreferrer">{selected.source_name || 'Official source'}</a></dd></div><div><dt>Last reviewed</dt><dd>{new Date(selected.last_reviewed).toLocaleDateString()}</dd></div></dl></div><div className="drawer-actions"><button className="new" onClick={() => { savePath({ name: selected.name, type, path: '/' + type.toLowerCase() + 's/' + encodeURIComponent(selected.name) }); notify('Saved to My Plan on this device') }}>Save to My Plan</button></div></aside></div>}
  </div>
}
