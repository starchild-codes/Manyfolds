import { useEffect, useMemo, useState } from 'react'
import {
  generateAiRoadmap,
  getLatestAiRoadmap,
  updateAiRoadmap,
  RoadmapRequestError,
  type AiRoadmap,
  type AiRoadmapGeneration,
} from './aiRoadmapApi'
import { buildMatches, type Profile } from './recommendationEngine'
import { EmptyState, LoadingSkeleton, StatusBadge } from './UiPrimitives'
import { operationsRequest } from './operationsApi'
import OfficialResearch from './OfficialResearch'

type Step = {
  id: string
  phase: 'Now' | 'Next 6–12 months' | 'After current qualification' | 'Long-term'
  title: string
  detail: string
  mandatory: boolean
  done: boolean
}

const phaseLabels: Record<AiRoadmap['stages'][number]['stage'], string> = {
  now: 'Now',
  next_6_months: 'Next 6 months',
  before_applications: 'Before applications',
  admissions: 'Admissions',
  during_course: 'During the course',
  early_career: 'Early career',
}

const stage = (grade: string) =>
  grade.includes('8') || grade.includes('9') || grade.includes('10')
    ? 'school'
    : grade.includes('11') || grade.includes('12')
      ? 'applications'
      : 'undergraduate'

function defaultSteps(profile: Profile, career: string): Step[] {
  const current = stage(profile.grade)
  return [
    {
      id: 'subjects',
      phase: 'Now',
      title: current === 'school' ? 'Keep relevant subject options open' : 'Confirm subject eligibility',
      detail: `Review your current ${Object.keys(profile.subjects).join(', ') || 'subjects'} against the selected course before committing.`,
      mandatory: false,
      done: false,
    },
    {
      id: 'explore',
      phase: 'Now',
      title: 'Test the work in a small way',
      detail: `Complete one low-cost project, conversation, or short course connected to ${career}.`,
      mandatory: false,
      done: false,
    },
    {
      id: 'courses',
      phase: 'Next 6–12 months',
      title: current === 'school' ? 'Choose a flexible subject combination' : 'Shortlist course routes',
      detail: 'Compare degree, diploma, vocational and local options; do not treat one route as the only route.',
      mandatory: false,
      done: false,
    },
    {
      id: 'exam',
      phase: 'Next 6–12 months',
      title: 'Research entrance and application routes',
      detail:
        profile.examWillingness === 'Avoid if possible'
          ? 'Prioritise verified exam-light routes, while recording any required exam as a constraint.'
          : 'Check each programme’s official admissions page before registering for an exam.',
      mandatory: false,
      done: false,
    },
    {
      id: 'admission',
      phase: 'After current qualification',
      title: 'Apply only when programme facts are verified',
      detail: 'Confirm exact programme, eligibility, current cycle, fees, documents and official application route.',
      mandatory: true,
      done: false,
    },
    {
      id: 'experience',
      phase: 'Long-term',
      title: 'Build experience and choose a next specialisation',
      detail: 'Seek internships, projects, certification or postgraduate study only after checking requirements for the chosen role.',
      mandatory: false,
      done: false,
    },
  ]
}

export default function Roadmap({ notify,profile,studentKey,canEdit }: { notify: (message: string) => void;profile:Profile|null;studentKey:string;canEdit:boolean }) {
  const matches = useMemo(() => (profile ? buildMatches(profile) : []), [profile])
  const [selected, setSelected] = useState(0)
  const career = matches[selected]
  const [steps,setSteps]=useState<Step[]>([])
  const [checklist,setChecklist]=useState<{version:number;updated_at?:string}>({version:0})
  const [checklistLoading,setChecklistLoading]=useState(true),[checklistSaving,setChecklistSaving]=useState(false),[checklistError,setChecklistError]=useState(''),[checklistAttempt,setChecklistAttempt]=useState(0)
  const direction=career?.name||''
  useEffect(()=>{let active=true;setChecklistLoading(true);setChecklistError('');setSteps([]);setChecklist({version:0});if(!profile||!direction){setChecklistLoading(false);return()=>{active=false}}
   void operationsRequest<{record:{steps:Step[];version:number;updated_at?:string}}>(`/roadmap-checklist?student=${encodeURIComponent(studentKey)}&direction=${encodeURIComponent(direction)}`).then(({record})=>{if(active){setChecklist(record);setSteps(record.version?record.steps:defaultSteps(profile,direction))}}).catch(error=>{if(active)setChecklistError(error instanceof Error?error.message:'The shared checklist is unavailable.')}).finally(()=>{if(active)setChecklistLoading(false)});return()=>{active=false}
  },[studentKey,direction,profile,checklistAttempt])
  const saveChecklist=async(next:Step[])=>{if(!canEdit||checklistLoading||checklistSaving||checklistError)return;setChecklistSaving(true);try{const {record}=await operationsRequest<{record:{steps:Step[];version:number;updated_at:string}}>('/roadmap-checklist',{method:'PUT',body:JSON.stringify({studentKey,direction,version:checklist.version,steps:next})});setSteps(record.steps);setChecklist(record);notify('Checklist saved to the school workspace')}catch(error){setChecklistError(error instanceof Error?error.message:'The checklist could not be saved. Reload before retrying.')}finally{setChecklistSaving(false)}}
  const [generation, setGeneration] = useState<AiRoadmapGeneration | null>(null)
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [generationState, setGenerationState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [generationError, setGenerationError] = useState('')
  const [savedDraftInvalid, setSavedDraftInvalid] = useState(false)
  const [errorSource, setErrorSource] = useState<'load' | 'generate' | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [notes, setNotes] = useState('')
  const [reviewSaving,setReviewSaving]=useState(false)

  useEffect(() => {
    setLoadingSaved(true)
    void getLatestAiRoadmap(studentKey)
      .then((latest) => {
        setGeneration(latest)
        setSavedDraftInvalid(false)
        setNotes(latest?.counsellorNotes||'')
        setGenerationState('idle')
        setGenerationError('')
        setErrorSource(null)
      })
      .catch((error) => {
        setSavedDraftInvalid(error instanceof RoadmapRequestError && error.statusCode === 422)
        setGenerationState('error')
        setGenerationError(error instanceof Error ? error.message : 'Could not load the saved roadmap.')
        setErrorSource('load')
      })
      .finally(() => setLoadingSaved(false))
  }, [loadAttempt,studentKey])

  if (!profile) {
    return (
      <div className="content diagnostic">
        <p className="eyebrow">Pathway planner</p>
        <div className="panel"><EmptyState title="Start with a diagnostic profile" description="Complete the Career Diagnostic first so the roadmap can reflect subjects, priorities, and practical constraints." action={<a className="new" href="/dashboard?view=diagnostic">Open Career Diagnostic</a>} /></div>
        <OfficialResearch canEdit={canEdit} />
      </div>
    )
  }

  const verifiedSources =
    generation?.sources.filter((source) => source.verification_status === 'verified') || []
  const verifiedSourceIds = new Set(verifiedSources.map((source) => source.record_id))
  const verifiedStages = generation?.roadmap.stages.map((item, index) => ({ item, index })).filter(({ item }) =>
    !item.unverified && item.source_record_ids.some((id) => verifiedSourceIds.has(id))) || []
  const verifiedCourseOptions = generation?.roadmap.course_options.filter((item) =>
    item.source_record_ids.some((id) => verifiedSourceIds.has(id))) || []
  const lastVerifiedTimestamp = verifiedSources.reduce((latest, source) => {
    const timestamp = source.last_verified_at ? new Date(source.last_verified_at).getTime() : 0
    return Math.max(latest, Number.isFinite(timestamp) ? timestamp : 0)
  }, 0)

  const generate = async (force = false) => {
    if (!career) return
    if (force && !window.confirm('Regenerate this draft using the current profile and verified data?')) return
    setGenerationState('loading')
    setGenerationError('')
    setErrorSource(null)
    try {
      const next = await generateAiRoadmap({
        studentExternalId:studentKey,
        profile: profile as unknown as Record<string, unknown>,
        primaryCareer: {
          name: career.name,
          fitFactors: career.why,
          concerns: career.concerns,
        },
        alternativeCareers: matches
          .filter((_, index) => index !== selected)
          .slice(0, 3)
          .map((match) => ({
            name: match.name,
            fitFactors: match.why,
            concerns: match.concerns,
          })),
        force,
      })
      if (!next) throw new Error('The roadmap service did not return a draft. Please try again.')
      setGeneration(next)
      setSavedDraftInvalid(false)
      setNotes(next.counsellorNotes||'')
      setGenerationState('idle')
      setErrorSource(null)
      notify(next?.cached ? 'Existing roadmap reused — no new AI tokens consumed' : 'AI-assisted roadmap draft created')
    } catch (error) {
      setGenerationState('error')
      setGenerationError(error instanceof Error ? error.message : 'Roadmap generation failed.')
      setErrorSource('generate')
    }
  }

  const saveGeneration = async (
    roadmap: AiRoadmap,
    status = generation?.status || 'draft',
  ) => {
    if (!generation||reviewSaving) return
    setReviewSaving(true)
    try {
      const updated = await updateAiRoadmap(generation.id, {
        expectedVersion:generation.version,
        roadmap,
        status,
        counsellorNotes: notes,
      })
      setGeneration(updated)
      notify('Roadmap review saved')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save the roadmap review')
    }finally{setReviewSaving(false)}
  }

  const editStage = async (index: number) => {
    if (!generation) return
    const current = generation.roadmap.stages[index]
    const title = window.prompt('Stage title', current.title)
    if (!title) return
    const description = window.prompt('Stage wording', current.description)
    if (!description) return
    const roadmap = {
      ...generation.roadmap,
      stages: generation.roadmap.stages.map((item, itemIndex) =>
        itemIndex === index ? { ...item, title, description } : item,
      ),
    }
    await saveGeneration(roadmap, 'draft')
  }

  const removeCourse = async (courseId: string) => {
    if (!generation) return
    const roadmap = {
      ...generation.roadmap,
      course_options: generation.roadmap.course_options.filter(
        (course) => course.course_id !== courseId,
      ),
    }
    await saveGeneration(roadmap, 'draft')
  }

  const setStatus = async (status: 'reviewed' | 'approved' | 'published') => {
    if (!generation||reviewSaving) return
    setReviewSaving(true)
    try {
      const updated = await updateAiRoadmap(generation.id, {
        expectedVersion:generation.version,
        status,
        counsellorNotes: notes,
      })
      setGeneration(updated)
      notify(`Roadmap marked ${status}`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update roadmap status')
    }finally{setReviewSaving(false)}
  }

  const saveNotes=async()=>{if(!generation||reviewSaving)return;setReviewSaving(true);try{const updated=await updateAiRoadmap(generation.id,{expectedVersion:generation.version,counsellorNotes:notes});setGeneration(updated);notify('Review notes saved')}catch(error){notify(error instanceof Error?error.message:'Review notes could not be saved.')}finally{setReviewSaving(false)}}
  const add = () => {
    const title = window.prompt('Custom roadmap step')
    if (!title) return
    void saveChecklist([...steps,{id:crypto.randomUUID(),phase:'Now',title:title.trim(),detail:'Counsellor-added step. Confirm sources and deadlines before acting.',mandatory:false,done:false}])
  }

  const exportPlan = async () => {
    try{await operationsRequest('/export-log',{method:'POST',body:JSON.stringify({kind:'roadmap_checklist',studentKey})})}catch(error){notify(error instanceof Error?error.message:'Export could not be recorded.');return}
    const content = `Manyfolds planning checklist\nStudent record: ${studentKey}\nGenerated: ${new Date().toLocaleString()}\nTarget: ${career?.name}\n\n${steps
      .map((stepItem) => `[${stepItem.done ? 'x' : ' '}] ${stepItem.phase}: ${stepItem.title}\n${stepItem.detail}`)
      .join('\n\n')}\n\nCollege admissions: programme-level verification may be incomplete.`
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
    anchor.download = 'manyfolds-roadmap.txt'
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  const savedStatusUnavailable = errorSource === 'load' && Boolean(generationError) && !savedDraftInvalid

  return (
    <div className="content diagnostic roadmap">
      <p className="eyebrow">Your pathway planner</p>
      <div className="diagnostic-top">
        <div>
          <h1>AI roadmap</h1>
          <p>Guidance for {profile.grade || 'your stage'}, {profile.geography || 'your location preference'} and {profile.budget || 'your stated budget'}.</p>
        </div>
      </div>

      <section className={`roadmap-status-card ${generationState === 'loading' || loadingSaved ? 'is-loading' : savedStatusUnavailable || savedDraftInvalid ? 'has-error' : generation ? 'has-roadmap' : 'is-empty'}`} role="status" aria-live="polite">
        <span className="roadmap-status-icon" aria-hidden="true">{generationState === 'loading' || loadingSaved ? '◷' : savedStatusUnavailable ? '!' : generation ? '✓' : '＋'}</span>
        <div className="roadmap-status-copy">
          <p className="eyebrow">{loadingSaved ? 'Checking saved AI work' : generationState === 'loading' ? 'AI generation in progress' : savedDraftInvalid ? 'SAVED AI DRAFT: VERIFICATION REQUIRED' : savedStatusUnavailable ? 'AI roadmap status unavailable' : generation ? 'AI GENERATED · SAVED IN YOUR WORKSPACE' : 'AI ROADMAP · NOT GENERATED'}</p>
          <h2>{loadingSaved ? 'Looking for an AI-generated roadmap' : generationState === 'loading' ? 'AI is generating your roadmap' : savedDraftInvalid ? 'Your saved AI draft needs regeneration' : savedStatusUnavailable ? 'Could not confirm your AI roadmap' : generation ? 'Your AI-generated roadmap is ready' : 'Generate your first AI roadmap'}</h2>
          <p>{loadingSaved ? 'This should only take a moment.' : generationState === 'loading' ? 'Manyfolds is organising your profile and the available verified records. You can keep this page open.' : savedDraftInvalid ? 'A previous draft is saved, but it no longer passes the verification checks and is withheld. Generate a new draft using current evidence.' : savedStatusUnavailable ? 'Retry the workspace check to see whether a draft is already saved.' : generation ? `${generation.roadmap.roadmap_title} · Generated ${new Date(generation.generatedAt).toLocaleString()} · ${generation.status.replaceAll('_', ' ')}. Review the AI draft and its sources below.` : `Your diagnostic profile is ready. The rule-based checklist below is separate. Generate a saved AI draft for ${career?.name || 'your selected direction'}.`}</p>
          {generation && generationState === 'loading' && <small>Your previous saved roadmap remains available below while the new draft is built.</small>}
          {generation && generationState !== 'loading' && <small>This draft uses a saved evidence snapshot. Regenerate to check the current verified catalogue.</small>}
        </div>
        <div className="roadmap-status-actions">
          {generation ? <a className="new" href="#ai-roadmap-draft">View saved roadmap</a> : !loadingSaved && generationState !== 'loading' && !generationError && <button className="new" disabled={!canEdit} onClick={() => void generate(false)}>Generate AI Roadmap</button>}
        </div>
      </section>
      {loadingSaved && !generation && <div className="panel roadmap-loading"><LoadingSkeleton label="Loading saved roadmap" rows={2} /></div>}
      {generationError && <div className="ai-roadmap-error" role="alert"><span>{savedDraftInvalid ? 'The saved AI draft is withheld.' : errorSource === 'load' ? 'We could not check for your saved roadmap.' : 'We could not finish generating the roadmap.'} {generationError} {generation && 'Your existing saved roadmap is still available.'}</span><button className="secondary" disabled={loadingSaved || generationState === 'loading' || ((savedDraftInvalid || errorSource !== 'load') && !canEdit)} onClick={() => errorSource === 'load' && !savedDraftInvalid ? setLoadAttempt((attempt) => attempt + 1) : void generate(false)}>{savedDraftInvalid ? 'Generate a new draft' : 'Try again'}</button></div>}

      {generation && (
        <section id="ai-roadmap-draft" className="panel ai-roadmap-draft">
          <div className="roadmap-ai-origin"><strong>AI-GENERATED ROADMAP</strong><span>Created {new Date(generation.generatedAt).toLocaleString()} · {verifiedSources.length ? 'Based on your profile and the cited verified records' : 'Profile-based exploration guidance; no verified source records were included'} · Counsellor review required</span></div>
          <div className="ai-roadmap-meta">
            <div>
              <p className="eyebrow">Roadmap details <StatusBadge tone={generation.status === 'approved' || generation.status === 'published' ? 'success' : 'neutral'}>{generation.status.replaceAll('_', ' ')}</StatusBadge></p>
              <small>Review the guidance and its evidence below.</small>
            </div>
            <div className="roadmap-actions">
              <button className="secondary" disabled={!canEdit||reviewSaving||generationState==='loading'} onClick={() => void generate(true)}>Regenerate with current data</button>
              {generation.status === 'draft' && <button className="secondary" disabled={!canEdit||reviewSaving||generationState==='loading'} onClick={() => void setStatus('reviewed')}>Save review</button>}
              {generation.status === 'reviewed' && <button className="new" disabled={!canEdit||reviewSaving||generationState==='loading'} onClick={() => void setStatus('approved')}>Approve</button>}
              {generation.status === 'approved' && (
                <button className="new" disabled={!canEdit||reviewSaving||generationState==='loading'} onClick={() => void setStatus('published')}>Publish</button>
              )}
            </div>
          </div>
          <h2>{generation.roadmap.roadmap_title}</h2>
          {generation.sourcesCurrent === false && <p className="guidance-error" role="status">The evidence behind this draft needs refreshing. Regenerate with current data before approving or publishing it.</p>}
          <p className="diagnostic-note">{generation.roadmap.summary}</p>
          {verifiedSources.length > 0 && <div className="roadmap-verification-summary">
            <span><b>{verifiedSources.length}</b> verified sources</span>
            <span>
              <b>{lastVerifiedTimestamp ? new Date(lastVerifiedTimestamp).toLocaleDateString() : 'No verification supplied'}</b>
              latest verification
            </span>
            <span><b>{generation.roadmap.eligibility_summary.status.replaceAll('_', ' ')}</b> programme eligibility</span>
          </div>}
          {generation.verifiedDates?.filter((item) => item.deadline >= new Date().toISOString().slice(0, 10)).map((item) => (
            <div className="roadmap-official-date" key={`${item.programmeName}-${item.deadline}`}>
              <div><b>Official application deadline · {item.cycle}</b><span>{item.programmeName}: {item.deadline}</span></div>
              {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Check official notice ↗</a>}
            </div>
          ))}
          <p className="ai-notice">{generation.notice}</p>

          {generation.roadmap.eligibility_summary.status !== 'insufficient_data' && <div className={`eligibility-box ${generation.roadmap.eligibility_summary.status}`}>
            <b>Eligibility: {generation.roadmap.eligibility_summary.status.replaceAll('_', ' ')}</b>
            <p>{generation.roadmap.eligibility_summary.explanation}</p>
            {generation.roadmap.eligibility_summary.missing_requirements.map((item) => (
              <small key={item}>Missing: {item}</small>
            ))}
          </div>}

          <div className="ai-roadmap-grid">
            <div>
              <h3>Why it fits</h3>
              {generation.roadmap.why_it_fits.map((item) => (
                <div className="ai-fact" key={`${item.factor}-${item.student_evidence}`}>
                  <b>{item.factor}</b><small>{item.student_evidence}</small>
                </div>
              ))}
            </div>
            {generation.roadmap.important_tradeoffs.length > 0 && <div>
              <h3>Important trade-offs</h3>
              {generation.roadmap.important_tradeoffs.map((item) => (
                <div className="ai-fact" key={item}><small>{item}</small></div>
              ))}
            </div>}
          </div>

          {verifiedStages.length > 0 && <><h3>Roadmap stages</h3>
          <div className="ai-stage-list">
            {verifiedStages.map(({ item: stageItem, index }) => (
              <article key={`${stageItem.stage}-${index}`}>
                <div>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <small>{phaseLabels[stageItem.stage]} · {stageItem.status.replaceAll('_', ' ')}</small>
                </div>
                <h4>{stageItem.title}</h4>
                <p>{stageItem.description}</p>
                <div className="ai-stage-tags">
                  {stageItem.mandatory && <b>Mandatory</b>}
                  {stageItem.verified_deadline && <b className="verified">Official {stageItem.date_type.replaceAll('_', ' ')}: {stageItem.verified_deadline}</b>}
                  <button disabled={!canEdit} onClick={() => void editStage(index)}>Edit wording</button>
                </div>
              </article>
            ))}
          </div></>}

          {verifiedCourseOptions.length > 0 && (
            <>
              <h3>Verified course options supplied to AI</h3>
              <div className="ai-option-list">
                {verifiedCourseOptions.map((courseOption) => (
                  <article key={courseOption.course_id}>
                    <b>{courseOption.course_id}</b>
                    <p>{courseOption.reason}</p>
                    <button disabled={!canEdit} onClick={() => void removeCourse(courseOption.course_id)}>Remove</button>
                  </article>
                ))}
              </div>
            </>
          )}

          <div className="ai-roadmap-grid">
            <div>
              <h3>Next actions</h3>
              {generation.roadmap.next_actions.map((action) => (
                <div className="ai-fact" key={action.action}>
                  <b>{action.priority} · {action.action}</b><small>{action.reason}</small>
                </div>
              ))}
            </div>
            <div>
              <h3>Questions for the counsellor</h3>
              {generation.roadmap.questions_for_counsellor.map((question) => (
                <div className="ai-fact" key={question}><small>{question}</small></div>
              ))}
            </div>
          </div>

          <label className="ai-review-notes">
            Counsellor review notes
            <textarea
              value={notes}
              disabled={!canEdit||reviewSaving}
              maxLength={4000}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add context, wording changes, or follow-up notes. These notes are not sent to the model."
            />
          </label>

          {canEdit&&<button className="secondary" disabled={reviewSaving||notes===(generation.counsellorNotes||'')} onClick={()=>void saveNotes()}>{reviewSaving?'Saving review...':'Save review notes'}</button>}
          {verifiedSources.length > 0 && <div className="ai-sources">
            <h3>Sources and verification</h3>
            {verifiedSources.map((source) => (
              <article key={source.record_id}>
                <div>
                  <b>{source.name}</b>
                  <small>
                    {source.entity_type} · {source.verification_status.replaceAll('_', ' ')}
                    {source.admission_cycle ? ` · ${source.admission_cycle}` : ''}
                  </small>
                </div>
                <div>
                  <small>
                    Last verified: {source.last_verified_at ? new Date(source.last_verified_at).toLocaleDateString() : 'Not recorded'}
                  </small>
                  {source.source_url && (
                    <a href={source.source_url} target="_blank" rel="noreferrer">Official source ↗</a>
                  )}
                </div>
              </article>
            ))}
          </div>}

          {(generation.missingData.length > 0 || generation.validationWarnings.length > 0 || !verifiedSources.length || generation.roadmap.eligibility_summary.status === 'insufficient_data') && (
            <div className="ai-missing-data">
              <h3>Before making an application decision</h3>
              <p>Use official research below to check current admissions details. Only supported facts appear in this roadmap; personal eligibility still needs a counsellor’s review.</p>
              <details><summary>Details to check with your counsellor</summary>
               {[...new Set([...generation.missingData, ...generation.validationWarnings, ...generation.roadmap.eligibility_summary.missing_requirements])].map(warning => <p key={warning}>{warning}</p>)}
              </details>
            </div>
          )}
        </section>
      )}

      <OfficialResearch canEdit={canEdit} />

      <details className="roadmap-secondary" open={!generation && !loadingSaved && generationState !== 'loading' && !savedStatusUnavailable}>
        <summary>Explore other directions and the planning checklist <span>Rule-based guidance · separate from the saved AI roadmap</span></summary>
        <div className="roadmap-secondary-body">
          <div className="roadmap-checklist-actions"><button className="secondary" disabled={!canEdit||checklistLoading||checklistSaving||Boolean(checklistError)} onClick={add}>Add counsellor step</button><button className="secondary" disabled={!canEdit||!checklist.version||checklistSaving||Boolean(checklistError)} onClick={()=>void exportPlan()}>Export roadmap checklist</button>{!checklist.version&&<button className="new" disabled={!canEdit||checklistLoading||checklistSaving||Boolean(checklistError)} onClick={()=>void saveChecklist(steps)}>Save suggested checklist to school</button>}</div>
      <p role="status">{checklistLoading?'Loading the school checklist...':checklistSaving?'Saving to the school...':checklist.updated_at?`Saved to the school workspace ${new Date(checklist.updated_at).toLocaleString()}`:'Suggested checklist. Save it to keep progress in the school workspace.'}</p>{checklistError&&<p className="guidance-error" role="alert">{checklistError}<button onClick={()=>setChecklistAttempt(value=>value+1)}>Reload checklist</button></p>}
      <section className="roadmap-capability" aria-label="Roadmap data capability">
        <article>
          <p className="eyebrow">Available now</p>
          <h3>Career guidance from verified records</h3>
          <p>
            Career-fit explanations, subject and skill connections, alternatives, trade-offs,
            questions and immediate next actions can be organised from verified career evidence.
          </p>
        </article>
        <article>
          <p className="eyebrow">Verification boundary</p>
          <h3>Programme admissions are not yet complete</h3>
          <p>
            Career guidance is available, but verified course, college and admission details are
            incomplete. Ask an authorised counsellor to add and verify programme information
            before using this roadmap for an application decision.
          </p>
        </article>
      </section>

      <div className="roadmap-tabs">
        {matches.slice(0, 5).map((match, index) => (
          <button
            className={selected === index ? 'active' : ''}
            disabled={checklistSaving} onClick={() => setSelected(index)}
            key={match.name}
          >
            {match.name}<small>{match.band}</small>
          </button>
        ))}
      </div>

      <section className="panel diagnostic-report deterministic-compare">
        <p className="eyebrow">Deterministic recommendation · comparison baseline</p>
        <h2>{career?.name}</h2>
        {generation && <p className="roadmap-comparison-note">This is a separate direction to compare. Your saved AI roadmap above remains for <b>{generation.roadmap.roadmap_title}</b>.</p>}
        <p className="diagnostic-note">
          Why: {career?.why.join('; ')}. {career?.concerns.join(' ')}
        </p>
        <p className="review">
          This selection comes from the transparent scoring engine. AI may explain and organise
          supplied records, but it cannot change the verified eligibility result.
        </p>
        {generation && <button className="secondary" disabled={!canEdit||reviewSaving||generationState==='loading'} onClick={() => void generate(false)}>Generate for this direction</button>}
      </section>

      {(['Now', 'Next 6–12 months', 'After current qualification', 'Long-term'] as const).map(
        (phase) => (
          <section className="panel diagnostic-report roadmap-phase" key={phase}>
            <p className="eyebrow">{phase} · deterministic plan</p>
            {steps.filter((stepItem) => stepItem.phase === phase).map((stepItem) => (
              <label className="roadmap-step" key={stepItem.id}>
                <input
                  type="checkbox"
                  checked={stepItem.done}
                  disabled={!canEdit||checklistLoading||checklistSaving||Boolean(checklistError)}
                  onChange={()=>void saveChecklist(steps.map(item=>item.id===stepItem.id?{...item,done:!item.done}:item))}
                />
                <span>
                  <b>{stepItem.title}{stepItem.mandatory && ' · Verify before acting'}</b>
                  <small>{stepItem.detail}</small>
                </span>
              </label>
            ))}
          </section>
        ),
      )}

      <section className="panel diagnostic-report">
        <p className="eyebrow">Connected route records</p>
        <h2>Verified routes</h2>
        <p className="review">Generate the AI roadmap for this direction to check verified career-to-course, course-to-programme and course-to-exam links. No route is shown from a keyword match alone.</p>
      </section>
        </div>
      </details>
    </div>
  )
}
