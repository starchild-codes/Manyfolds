import { useEffect, useMemo, useState } from 'react'
import {
  getVerificationWorkspace,
  reviewImportCandidate,
  reviewProgrammeCandidate,
  saveProgrammeCandidate,
  updateVerificationTask,
  type VerificationWorkspace,
} from './verificationApi'

const queueLabels: Record<string, string> = {
  missing_programme_relationship: 'Programme relationships',
  missing_eligibility: 'Eligibility',
  missing_exam: 'Examinations',
  missing_admission_cycle: 'Admission cycles',
  missing_fee: 'Fees',
  missing_scholarship: 'Scholarships',
  stale_record: 'Stale records',
  conflicting_source: 'Source conflicts',
}

export default function VerificationAdmin({ notify }: { notify: (message: string) => void }) {
  const [workspace, setWorkspace] = useState<VerificationWorkspace | null>(null)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const refresh = async () => {
    try {
      setError('')
      setWorkspace(await getVerificationWorkspace())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load verification data.')
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  const tasks = useMemo(
    () =>
      (workspace?.tasks || []).filter(
        (task) => filter === 'all' || task.task_type === filter,
      ),
    [workspace, filter],
  )

  const taskAction = async (
    id: string,
    body: Parameters<typeof updateVerificationTask>[1],
  ) => {
    setBusy(id)
    try {
      await updateVerificationTask(id, body)
      await refresh()
      notify('Verification task updated')
    } catch (nextError) {
      notify(nextError instanceof Error ? nextError.message : 'Could not update task')
    } finally {
      setBusy('')
    }
  }

  const reviewProgramme = async (
    id: string,
    status: 'verified' | 'stale' | 'conflicting',
  ) => {
    const notes = window.prompt('Reviewer note (retained in source history)') || ''
    setBusy(id)
    try {
      await reviewProgrammeCandidate(id, {
        status,
        sourceStatus: status,
        dataSufficient: status === 'verified',
        notes,
      })
      await refresh()
      notify(`Programme marked ${status}`)
    } catch (nextError) {
      notify(nextError instanceof Error ? nextError.message : 'Could not review programme')
    } finally {
      setBusy('')
    }
  }

  const addProgramme = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
    setBusy('new-programme')
    try {
      await saveProgrammeCandidate(values)
      form.reset()
      await refresh()
      notify('Programme saved as pending review')
    } catch (nextError) {
      notify(nextError instanceof Error ? nextError.message : 'Could not save programme')
    } finally {
      setBusy('')
    }
  }

  const reviewListing = async (key: string, action: 'publish' | 'reject') => {
    const notes = window.prompt('Review the official listing, then record what you checked (required)')?.trim()
    if (!notes) return
    setBusy(key)
    try {
      await reviewImportCandidate(key, action, notes)
      await refresh()
      notify(action === 'publish' ? 'Listing published with its verified window' : 'Listing rejected')
    } catch (nextError) {
      notify(nextError instanceof Error ? nextError.message : 'Could not review listing')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="content verification-admin">
      <section className="verification-hero">
        <div>
          <p className="eyebrow">Official-source verification</p>
          <h1>Programme data pilot</h1>
          <p>
            Imports stay out of AI evidence until an owner or admin verifies the exact
            relationship, official source, freshness and completeness.
          </p>
        </div>
        <div className="verification-guard">
          <b>Publication gate</b>
          <span>Pending, stale and conflicting records are never supplied to the model.</span>
        </div>
      </section>

      {error && <div className="ai-roadmap-error" role="alert">{error}</div>}

      <section className="panel verification-coverage" aria-label="Verified catalogue coverage">
        <div className="panel-heading"><div><p className="eyebrow">Publication coverage</p><h2>Verified data available to students</h2></div></div>
        <div className="verification-coverage-grid">
          {(workspace?.coverage || []).map((item) => <div key={item.category}><b>{item.published.toLocaleString()}</b><span>{item.category}</span><small>of {item.total.toLocaleString()} catalogue records</small></div>)}
        </div>
        <p className="review">Career counts cover occupation titles only. Scholarship counts cover verified scheme listings and stated windows, not personal eligibility.</p>
        <p className="verification-claim-stats">Claims: {(workspace?.claimStats || []).map((item) => `${item.total} ${item.verification_status.replaceAll('_', ' ')}`).join(' · ') || 'No reviewed claims yet'}</p>
      </section>

      <section className="panel verification-coverage" aria-label="Verification gaps">
        <div className="panel-heading"><div><p className="eyebrow">What still needs evidence</p><h2>Gaps and review pressure</h2></div></div>
        <div className="verification-coverage-grid">
          <div><b>{workspace?.gapStats.programmes_missing_fees ?? '—'}</b><span>Programme fees missing</span><small>No current verified fee claim</small></div>
          <div><b>{workspace?.gapStats.pending_candidates ?? '—'}</b><span>Imports awaiting review</span><small>Unpublished source cards</small></div>
          <div><b>{workspace?.gapStats.verified_relationship_claims ?? '—'}</b><span>Verified relationship claims</span><small>Career and admission links</small></div>
          <div><b>{workspace?.gapStats.stale_claims ?? '—'}</b><span>Stale claims</span><small>Withheld until rechecked</small></div>
          <div><b>{workspace?.gapStats.conflicting_claims ?? '—'}</b><span>Conflicting claims</span><small>Withheld pending resolution</small></div>
          <div><b>{workspace?.gapStats.expired_claims ?? '—'}</b><span>Expired claims</span><small>Outside their verified cycle</small></div>
        </div>
        <p className="review">Verified institution names by state: {(workspace?.stateCoverage || []).map((item) => `${item.state} ${item.published}/${item.total}`).join(' · ') || 'No state coverage yet'}.</p>
      </section>

      <section className="panel verification-coverage" aria-label="Official source monitoring">
        <div className="panel-heading"><div><p className="eyebrow">Source freshness</p><h2>Official pages being checked</h2></div></div>
        <div className="verification-source-list">{(workspace?.sourceMonitors || []).map((source) => <div key={source.monitor_key}><a href={source.source_url} target="_blank" rel="noreferrer">{source.monitor_key}</a><span>{source.last_http_status === 200 ? 'Reachable' : source.last_http_status ? `HTTP ${source.last_http_status}` : 'Check pending or failed'}</span><small>{source.last_checked_at ? `Checked ${new Date(source.last_checked_at).toLocaleString()}` : 'Not checked yet'}{source.changed_at ? ` · Changed ${new Date(source.changed_at).toLocaleString()}` : ''}</small></div>)}</div>
      </section>

      <section className="panel verification-programmes" aria-label="Imported scholarship listing review">
        <div className="panel-heading"><div><p className="eyebrow">Imported from NSP</p><h2>Scholarship listings awaiting review</h2></div><span className="count">{workspace?.candidates.length || 0} pending</span></div>
        <p className="review">Check each name, application mode, and deadline on the official portal. Publishing verifies only the listing and stated window; it does not verify award amount or personal eligibility.</p>
        {(workspace?.candidates || []).map((candidate) => <article key={candidate.candidate_key}>
          <div><b>{candidate.payload.name}</b><small>{candidate.source_cycle} · {candidate.payload.applicationMode === 'renewal' ? 'Renewal only' : 'General applications'} · closes {candidate.payload.deadline} · staged {new Date(candidate.detected_at).toLocaleString()}</small></div>
          <div className="verification-actions"><a href={candidate.source_url} target="_blank" rel="noreferrer">Official listing ↗</a><button disabled={busy === candidate.candidate_key} onClick={() => void reviewListing(candidate.candidate_key, 'publish')}>Publish listing</button><button disabled={busy === candidate.candidate_key} onClick={() => void reviewListing(candidate.candidate_key, 'reject')}>Reject</button></div>
        </article>)}
      </section>

      <section className="verification-queues" aria-label="Verification queues">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          <b>{workspace?.tasks.length || 0}</b><span>All tasks</span>
        </button>
        {Object.entries(queueLabels).map(([key, label]) => {
          const count = workspace?.queueCounts.find((item) => item.task_type === key)?.count || 0
          return (
            <button className={filter === key ? 'active' : ''} onClick={() => setFilter(key)} key={key}>
              <b>{count}</b><span>{label}</span>
            </button>
          )
        })}
      </section>

      <section className="verification-layout">
        <div className="panel verification-list">
          <div className="panel-heading">
            <div><p className="eyebrow">Review queue</p><h2>{filter === 'all' ? 'All verification tasks' : queueLabels[filter]}</h2></div>
            <span className="count">{tasks.length} shown</span>
          </div>
          {!tasks.length && <p className="review">No tasks in this queue yet.</p>}
          {tasks.map((task) => {
            const source = task.result_source_urls?.[0] ||
              (task.official_domain ? `https://${task.official_domain}` : '')
            return (
              <article className="verification-task" key={task.id}>
                <div>
                  <small>{queueLabels[task.task_type] || task.task_type} · priority {task.priority}</small>
                  <b>{task.missing_field}</b>
                  <p>{task.narrow_query || `${task.entity_type} ${task.entity_id || ''}`}</p>
                </div>
                <span className={`verification-status ${task.status}`}>{task.status.replaceAll('_', ' ')}</span>
                <div className="verification-actions">
                  {source && <a href={source} target="_blank" rel="noreferrer">Open official source ↗</a>}
                  <button disabled={busy === task.id} onClick={() => void taskAction(task.id, { action: 'claim' })}>Claim</button>
                  <button
                    disabled={busy === task.id}
                    onClick={() => {
                      const reviewerNotes = window.prompt('Reviewer notes') || ''
                      const sourceUrl = window.prompt('Official source URL', source) || ''
                      void taskAction(task.id, {
                        status: 'verified',
                        reviewerNotes,
                        resultSourceUrls: sourceUrl ? [sourceUrl] : [],
                      })
                    }}
                  >Resolve</button>
                  <button
                    disabled={busy === task.id}
                    onClick={() => void taskAction(task.id, {
                      status: 'in_progress',
                      conflictNotes: window.prompt('Describe the source conflict') || '',
                    })}
                  >Record conflict</button>
                </div>
              </article>
            )
          })}
        </div>

        <form className="panel verification-form" onSubmit={addProgramme}>
          <p className="eyebrow">Pending-review import</p>
          <h2>Add or correct a programme</h2>
          <p className="review">Nothing entered here becomes verified automatically.</p>
          <label>Institution ID<input name="institutionId" required /></label>
          <label>Campus<input name="campus" /></label>
          <label>Exact programme name<input name="programmeName" required /></label>
          <div className="verification-field-pair">
            <label>Degree type<input name="degreeType" /></label>
            <label>Course ID<input name="courseId" /></label>
          </div>
          <div className="verification-field-pair">
            <label>Duration<input name="duration" /></label>
            <label>Study mode<input name="studyMode" /></label>
          </div>
          <label>Official programme URL<input name="officialProgrammeUrl" type="url" required /></label>
          <label>Official admissions URL<input name="officialAdmissionsUrl" type="url" /></label>
          <label>Reviewer note<textarea name="notes" /></label>
          <button className="new" disabled={busy === 'new-programme'}>Save pending record</button>
        </form>
      </section>

      <section className="panel verification-programmes">
        <div className="panel-heading">
          <div><p className="eyebrow">Programme records</p><h2>Awaiting complete verification</h2></div>
          <span className="count">{workspace?.programmes.length || 0} records</span>
        </div>
        {(workspace?.programmes || []).map((programme) => (
          <article key={programme.id}>
            <div>
              <b>{programme.institution_name} · {programme.programme_name}</b>
              <small>
                {programme.course_id || 'Course link missing'} · source {programme.source_status || 'missing'} ·
                record {programme.verification_status}
              </small>
            </div>
            <div className="verification-actions">
              {programme.source_url && <a href={programme.source_url} target="_blank" rel="noreferrer">Official source ↗</a>}
              <button disabled={busy === programme.id} onClick={() => void reviewProgramme(programme.id, 'verified')}>Verify complete record</button>
              <button disabled={busy === programme.id} onClick={() => void reviewProgramme(programme.id, 'stale')}>Mark stale</button>
              <button disabled={busy === programme.id} onClick={() => void reviewProgramme(programme.id, 'conflicting')}>Mark conflict</button>
            </div>
          </article>
        ))}
      </section>

      <section className="panel verification-history">
        <p className="eyebrow">Change history</p>
        <h2>Who reviewed what and when</h2>
        {(workspace?.events || []).map((event) => (
          <div key={event.id}>
            <b>{event.record_type} · {event.action}</b>
            <span>{event.previous_status || 'new'} → {event.next_status || 'unchanged'}</span>
            <small>{new Date(event.created_at).toLocaleString()}{event.notes ? ` · ${event.notes}` : ''}</small>
          </div>
        ))}
      </section>
    </div>
  )
}
