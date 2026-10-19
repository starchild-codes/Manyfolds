import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { withAuthTimeout } from './authErrors'
import './OfficialResearch.css'

type Result = { subject: string; topic: string; cycle: number; checkedAt: string; cached: boolean; status: string; answers: Array<{ quote: string; sourceUrl: string }>; sources: Array<{ url: string; title: string; excerpt: string }> }
type Options = { enabled: boolean; subjects: Array<{ id: string; name: string; portal: string }>; results: Result[] }
async function request<T>(init?: RequestInit): Promise<T> {
 if (!supabase) throw new Error('Sign in to use official research.')
 const { data: { session } } = await withAuthTimeout(supabase.auth.getSession())
 if (!session) throw new Error('Your session expired. Please sign in again.')
 const response = await fetch('/api/ai-roadmaps/research', { ...init, signal: AbortSignal.timeout(init?.method === 'POST' ? 110_000 : 30_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } })
 const payload = await response.json().catch(() => ({}))
 if (!response.ok) throw new Error(payload.error || 'Official research could not complete.')
 return payload
}

export default function OfficialResearch({ canEdit }: { canEdit: boolean }) {
 const [options, setOptions] = useState<Options | null>(null), [subject, setSubject] = useState('jee'), [topic, setTopic] = useState('dates')
 const year = new Date().getFullYear()
 const [cycle, setCycle] = useState(year + 1), [result, setResult] = useState<Result | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
 const [question, setQuestion] = useState('')
 useEffect(() => { let active = true; setError(''); void request<Options>().then(data => { if (active) { setOptions(data); setResult(data.results[0] || null) } }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Research could not load.') }); return () => { active = false } }, [attempt])
 async function search(askQuestion = false) {
  setBusy(true); setError(''); setResult(null)
  try { const data = await request<{ result: Result }>({ method: 'POST', body: JSON.stringify(askQuestion ? { question, cycle } : { subject, topic, cycle }) }); setResult(data.result); setOptions(current => current ? { ...current, results: [data.result, ...current.results.filter(item => item.subject !== data.result.subject || item.topic !== data.result.topic || item.cycle !== data.result.cycle)].slice(0, 5) } : current) }
  catch (error) { setError(error instanceof Error && error.name === 'TimeoutError' ? 'Search took too long. Reload saved research before retrying.' : error instanceof Error ? error.message : 'Research could not complete.') }
  finally { setBusy(false) }
 }
 return <section className="panel official-research" aria-labelledby="official-research-title">
  <p className="eyebrow">AI web research</p>
  <h2 id="official-research-title">Ask AI for the latest official details</h2>
  <p>Ask about exam dates, deadlines, eligibility or application fees. AI searches official notices and links each answer to its source.</p>
  {!options && !error && <p role="status">Loading official research…</p>}
  {options && <>
   <form className="official-research-question" onSubmit={event => { event.preventDefault(); void search(true) }}>
    <label htmlFor="official-research-question">Your question<input id="official-research-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={300} disabled={busy} placeholder="When is JEE Main 2027?" /></label>
    <button className="new" disabled={busy || !canEdit || !options.enabled || question.trim().length < 8}>{busy ? 'Finding an answer…' : 'Ask AI'}</button>
   </form>
   <details className="official-research-choices"><summary>Or choose an exam, topic and year</summary>
   <div className="official-research-controls">
    <label>Exam or portal<select value={subject} disabled={busy} onChange={e => setSubject(e.target.value)}>{options.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Information<select value={topic} disabled={busy} onChange={e => setTopic(e.target.value)}><option value="dates">Dates and deadlines</option><option value="eligibility">Eligibility requirements</option><option value="fees">Application fees</option></select></label>
    <label>Admission / exam year<select value={cycle} disabled={busy} onChange={e => setCycle(Number(e.target.value))}>{[year - 1, year, year + 1].map(value => <option key={value}>{value}</option>)}</select></label>
    <button className="new" disabled={busy || !canEdit || !options.enabled} onClick={() => void search()}>{busy ? 'Finding an answer…' : 'Find answer'}</button>
   </div>
   {!options.enabled && <p>Web research is awaiting server configuration.</p>}
   {!canEdit && <p>Your school’s counsellor can run a new search. Saved research is available below.</p>}
   <a href={options.subjects.find(item => item.id === subject)?.portal} target="_blank" rel="noreferrer">Open official portal ↗</a>
   </details>
   {options.results.length > 0 && <details><summary>Recent school research</summary>{options.results.map(item => <p key={`${item.subject}-${item.topic}-${item.checkedAt}`}><button className="secondary" disabled={busy} onClick={() => { setResult(item); setError(''); setSubject(options.subjects.find(subject => subject.name === item.subject)?.id || 'jee'); setTopic(item.topic); setCycle(item.cycle) }}>{item.subject} · {item.cycle} · {item.topic === 'dates' ? 'Dates and deadlines' : item.topic === 'fees' ? 'Application fees' : 'Eligibility'}</button></p>)}</details>}
  </>}
  {busy && <p role="status">Looking for current-cycle official notices. This may take up to 90 seconds.</p>}
  {error && <p role="alert" className="guidance-error">{error} <button className="secondary" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Reload saved research</button></p>}
  {result && <div className="official-research-results" aria-live="polite">
   <h3>{result.subject} · {result.cycle} · {result.topic === 'dates' ? 'Dates and deadlines' : result.topic === 'fees' ? 'Application fees' : 'Eligibility requirements'}</h3>
   <small>Checked {new Date(result.checkedAt).toLocaleString()}{result.cached ? ' · Saved search (up to 6 hours old)' : ''}</small>
   {result.status === 'no_current_source' ? <p>I couldn’t find a matching official notice for {result.cycle}. This does not mean a date has not been announced. Check the authority’s portal for updates.</p> : <>
    {result.answers?.length > 0 ? <div className="official-research-answer"><h4>Answer from official notices</h4>{result.answers.map(answer => <article key={`${answer.sourceUrl}-${answer.quote}`}><p>{answer.quote}</p><a href={answer.sourceUrl} target="_blank" rel="noreferrer">Read official notice ↗</a></article>)}<small>AI selected these statements from the sources. Check the full notice and later amendments before applying.</small></div> : <p>I found official sources, but couldn’t confirm a concise answer from the available text. Open the notices below to check the details.</p>}
    <details><summary>Sources and supporting excerpts ({result.sources.length})</summary>{result.sources.map(source => <article key={source.url}><h4><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></h4><blockquote>{source.excerpt}</blockquote></article>)}</details>
   </>}
  </div>}
 </section>
}
