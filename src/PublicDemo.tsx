import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import PublicShell from './PublicShell'
import { demoProfiles, demoSubjectChoices, demoSteps, initialDemoProfile, demoDirections,
  sampleRoadmap, initialDemoTasks, type DemoProfileId } from './publicDemoData'
import type { Profile } from './recommendationEngine'
import './PublicDemo.css'

export default function PublicDemo() {
  const initial = initialDemoProfile(new URLSearchParams(window.location.search).get('profile'))
  const [persona, setPersona] = useState<DemoProfileId>(initial)
  const [profile, setProfile] = useState<Profile>(() => structuredClone(demoProfiles[initial].profile))
  const [step, setStep] = useState(0), [selected, setSelected] = useState('')
  const [reviewed, setReviewed] = useState(false), [approved, setApproved] = useState(false)
  const [tasks, setTasks] = useState(initialDemoTasks), [taskText, setTaskText] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const directions = useMemo(() => demoDirections(profile), [profile])
  const direction = directions.find(item => item.name === selected) || directions[0]
  const completed = tasks.filter(task => task.done).length

  useEffect(() => {
    document.title = 'Interactive product demo | Manyfolds'
    return () => { document.title = 'Manyfolds | More Than One Way Forward' }
  }, [])
  const go = (index: number) => {
    setStep(index)
    requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start', behavior: 'auto' }) })
  }
  const chooseProfile = (id: DemoProfileId) => {
    setPersona(id); setProfile(structuredClone(demoProfiles[id].profile)); setSelected('')
    setReviewed(false); setApproved(false); setTasks(initialDemoTasks()); setTaskText(''); setStep(0)
  }
  const changeSubject = (subject: string) => {
    setProfile(old => ({ ...old, subjects: { ...old.subjects, [subject]: ['love', 'like'].includes(old.subjects[subject]) ? 'not-studied' : 'love' } }))
    setSelected(''); setReviewed(false); setApproved(false)
  }
  const chooseDirection = (name: string) => { setSelected(name); setReviewed(false); setApproved(false) }
  const addTask = (event: FormEvent) => {
    event.preventDefault()
    if (!taskText.trim() || tasks.length >= 10) return
    setTasks(old => [...old, { id: crypto.randomUUID(), title: taskText.trim(), done: false }]); setTaskText('')
  }

  return <PublicShell current="/demo">
    <main id="public-content" className="demo-page">
      <div className="demo-intro">
        <p className="public-eyebrow">Interactive product walkthrough</p>
        <h1>Follow one student.<br /><em>Unfold a few possibilities.</em></h1>
        <p>Explore the idea behind Manyfolds in four short steps. Change a profile, compare directions and turn a plan into actions.</p>
        <div className="demo-disclosure"><span className="demo-dot" /> Fictional records · No account needed · No live AI calls</div>
      </div>
      <div className="demo-layout">
        <aside className="demo-sidebar">
          <p className="public-eyebrow">The student journey</p>
          <nav aria-label="Demo steps">{demoSteps.map((label, index) =>
            <button key={label} type="button" aria-current={step === index ? 'step' : undefined} onClick={() => go(index)}>
              <span>{String(index + 1).padStart(2, '0')}</span><b>{label}</b><span aria-hidden="true">{step === index ? '→' : ''}</span>
            </button>)}</nav>
          <div className="demo-persona-note"><span className="demo-avatar" aria-hidden="true">{demoProfiles[persona].name.slice(0, 1)}</span>
            <div><strong>{demoProfiles[persona].name}</strong><small>Fictional student · Class 12</small></div></div>
          <button type="button" className="public-text-button" onClick={() => chooseProfile(initial)}>Reset this demo</button>
          <p className="demo-local-note">Changes stay in this page and reset when it reloads. Real school records are never loaded here.</p>
        </aside>
        <section className="demo-stage" aria-labelledby="demo-step-title">
          <div className="demo-stage-top"><span>Step {step + 1} of 4</span><span className="demo-badge">Working demo</span></div>
          <h2 id="demo-step-title" tabIndex={-1} ref={heading}>{demoSteps[step]}</h2>

          {step === 0 && <>
            <p className="demo-lead">Start with a person, not a single career label.</p>
            <fieldset className="demo-personas"><legend>Choose a fictional profile</legend>
              {(Object.entries(demoProfiles) as Array<[DemoProfileId, typeof demoProfiles[DemoProfileId]]>).map(([id, item]) =>
                <button key={id} type="button" aria-pressed={persona === id} onClick={() => chooseProfile(id)}><b>{item.label}</b><span>{item.description}</span></button>)}
            </fieldset>
            <div className="demo-signal-box"><h3>What does {demoProfiles[persona].name} enjoy?</h3><p>Toggle subjects to change the exploration results in the next step.</p>
              <div className="demo-subjects">{demoSubjectChoices.map(subject => <button key={subject} type="button" aria-pressed={['love', 'like'].includes(profile.subjects[subject])} onClick={() => changeSubject(subject)}>{subject}<span aria-hidden="true">{['love', 'like'].includes(profile.subjects[subject]) ? ' ✓' : ' +'}</span></button>)}</div>
            </div>
            <div className="demo-context-grid"><div><small>Skills to build on</small><p>{Object.keys(profile.skills).join(' · ')}</p></div><div><small>What matters</small><p>{profile.values.join(' · ')}</p></div></div>
            <p className="demo-note">The staff diagnostic also records academic context, constraints, location and affordability. This shorter demo uses fictional inputs.</p>
          </>}

          {step === 1 && <>
            <p className="demo-lead">Three directions to discuss, with reasons you can inspect.</p>
            <p className="demo-note">These results use the same rule-based exploration engine as the staff diagnostic. They are discussion prompts, not admission predictions or eligibility decisions.</p>
            <div className="demo-direction-list">{directions.map((match, index) => <article key={match.name} className={direction.name === match.name ? 'is-selected' : ''}>
              <div className="demo-direction-number">0{index + 1}</div><div><h3>{match.name}</h3><p><b>Why it appears:</b> {match.why.map(text => text.replace(/^matches /, '')).join(' · ')}.</p>
                <button type="button" className="public-text-button" aria-pressed={direction.name === match.name} onClick={() => chooseDirection(match.name)}>{direction.name === match.name ? 'Selected for the sample plan ✓' : 'Explore this direction →'}</button></div>
            </article>)}</div>
            <button type="button" className="public-text-button" onClick={() => go(0)}>Change the profile and compare the results</button>
          </>}

          {step === 2 && <>
            <p className="demo-lead">A useful roadmap connects a direction to a next step.</p>
            <div className="demo-roadmap-label"><span className="demo-badge">Illustrative sample</span><b>{direction.name}</b></div>
            <p className="demo-note">The private staff workspace generates AI drafts on request, then supports staff review and approval. This public sample illustrates that workflow; it is not a live AI-generated result.</p>
            <ol className="demo-roadmap">{sampleRoadmap(direction.name).map((stage, index) => <li key={stage.title}><span className="demo-roadmap-index">{index + 1}</span><div><small>{stage.timing}</small><h3>{stage.title}</h3><p>{stage.action}</p><p className="demo-output"><b>Leave with:</b> {stage.output}</p></div></li>)}</ol>
            <div className="demo-review"><h3>Keep a person in the loop</h3><p>AI output is a draft. Staff should check its evidence, the student’s circumstances and any open questions.</p>
              <label><input type="checkbox" checked={reviewed} onChange={event => { setReviewed(event.target.checked); setApproved(false) }} />I have reviewed this example’s next steps.</label>
              <button type="button" className="public-button" disabled={!reviewed || approved} onClick={() => setApproved(true)}>{approved ? 'Sample review completed ✓' : 'Complete the sample review'}</button>
              <p role="status">{approved ? 'Demo review complete. Next, turn the plan into actions.' : 'Try the review checkbox to see how approval stays deliberate.'}</p>
            </div>
          </>}

          {step === 3 && <>
            <p className="demo-lead">A plan matters when someone follows through.</p>
            <p>Try completing a task or adding a next step. This checklist is interactive and stays inside the public demo.</p>
            <div className="demo-task-progress"><span>{completed} of {tasks.length} steps completed in this demo</span><progress value={completed} max={tasks.length} aria-label="Demo task completion" /></div>
            <ul className="demo-tasks">{tasks.map(task => <li key={task.id} className={task.done ? 'is-complete' : ''}><label><input type="checkbox" checked={task.done} onChange={() => setTasks(old => old.map(item => item.id === task.id ? { ...item, done: !item.done } : item))} /><span>{task.title}</span></label></li>)}</ul>
            <form className="demo-add-task" onSubmit={addTask}><label htmlFor="demo-task">Add a fictional next step<input id="demo-task" value={taskText} maxLength={120} onChange={event => setTaskText(event.target.value)} placeholder="For example, discuss an alternative route" /></label><button className="public-button" disabled={!taskText.trim() || tasks.length >= 10}>Add step</button></form>
            <p className="demo-note">In the staff workspace, tasks can have an owner, target date, evidence and a link to the student’s guidance history.</p>
            <div className="demo-finish"><h3>That is the idea behind Manyfolds.</h3><p>Student context → explainable exploration → a reviewed roadmap → practical follow-through.</p><a className="public-button" href="/project">Explore the project behind it <span aria-hidden="true">↗</span></a></div>
          </>}

          <div className="demo-step-controls"><button type="button" className="public-text-button" disabled={step === 0} onClick={() => go(step - 1)}>← Back</button>{step < 3 ? <button type="button" className="public-button" onClick={() => go(step + 1)}>{['Explore directions', 'View the sample roadmap', 'Try the follow-ups'][step]} →</button> : <a className="public-text-button" href="/">Return to Manyfolds →</a>}</div>
        </section>
      </div>
    </main>
  </PublicShell>
}
