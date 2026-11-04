import { useEffect } from 'react'
import PublicShell from './PublicShell'

export default function ProjectPage() {
  useEffect(() => {
    document.title = 'The project | Manyfolds'
    return () => { document.title = 'Manyfolds | More Than One Way Forward' }
  }, [])
  return <PublicShell current="/project">
    <main id="public-content" className="project-page">
      <section className="project-intro">
        <p className="public-eyebrow">A student-built project</p>
        <h1>More context.<br /><em>More considered choices.</em></h1>
        <p>Manyfolds explores a simple question: how can a school help a student connect their interests, circumstances and possibilities—and keep supporting them after the first conversation?</p>
        <div className="project-actions"><a className="public-button" href="/demo">Try the interactive demo →</a><a className="public-text-button" href="https://github.com/starchild-codes/Manyfolds" target="_blank" rel="noopener noreferrer">Browse the source code ↗</a></div>
      </section>
      <section className="project-problem">
        <p className="public-eyebrow">The problem</p><h2>A student is more than a stream or a test result.</h2>
        <p>Interests can overlap. Affordability, location, subject choices and access to support shape what is practical. A useful guidance tool needs to hold those details together and make the next conversation easier.</p>
      </section>
      <section className="project-features" aria-labelledby="project-features-title">
        <p className="public-eyebrow">What the project does</p><h2 id="project-features-title">One connected guidance workflow.</h2>
        <div className="project-feature-grid">
          <article><span>01</span><h3>Understand the student</h3><p>A staff-mediated diagnostic records subjects, interests, skills, priorities and practical constraints. Saved answers remain connected to the student record.</p></article>
          <article><span>02</span><h3>Explain the possibilities</h3><p>A profile-based exploration engine suggests directions with reasons. The public demo runs this same engine with fictional profiles.</p></article>
          <article><span>03</span><h3>Review an AI roadmap</h3><p>Authorised staff can request an AI draft, inspect available source evidence and review the plan before approving a shareable version.</p></article>
          <article><span>04</span><h3>Follow through</h3><p>Pathways, action plans, sessions, tasks, calendar entries and recorded outcomes help staff continue the conversation over time.</p></article>
        </div>
      </section>
      <section className="project-principles">
        <p className="public-eyebrow">Engineering decisions</p><h2>Careful boundaries are part of the product.</h2>
        <div><article><h3>School and role isolation</h3><p>Authentication, server-side permissions and database row-level security restrict access to the appropriate school and authorised caseload. Private notes have separate access rules.</p></article>
          <article><h3>Evidence has a source and a date</h3><p>The catalogue uses field-level source claims and expiry checks. Coverage is still growing. Missing or outdated facts are withheld rather than filled from model memory.</p></article>
          <article><h3>AI supports a reviewed workflow</h3><p>AI generation is an explicit staff action. It does not silently approve a roadmap, decide a student’s eligibility or guarantee an admission outcome.</p></article></div>
      </section>
      <section className="project-under-hood"><h2>Under the hood</h2><p>React and TypeScript power the interface and exploration flow. Node.js APIs connect authentication, PostgreSQL/Supabase data storage and permission checks. OpenRouter routes AI roadmap requests. Regression checks exercise school isolation, version conflicts, privacy and the guidance workflow.</p><a className="public-text-button" href="https://github.com/starchild-codes/Manyfolds" target="_blank" rel="noopener noreferrer">Inspect the implementation on GitHub ↗</a></section>
      <section className="project-scope"><p className="public-eyebrow">Current scope</p><h2>A working pilot you can explore.</h2><p>The public walkthrough uses fictional records and an illustrative roadmap. The private staff workspace supports saved school records and live AI requests after sign-in. Wider verified data coverage and operational launch checks remain ongoing work.</p><div className="project-actions"><a className="public-button" href="/demo">Explore without an account →</a><a className="public-text-button" href="/contact">Get in touch</a></div></section>
    </main>
  </PublicShell>
}
