import { useEffect, useState } from 'react'
import './ManyfoldsLanding.css'

const interestExamples = [
  ['Psychology + computing', 'People, behaviour, and technology.'],
  ['History + chemistry', 'Research, science, and public impact.'],
  ['Economics + design', 'Creative, commercial, and product pathways.'],
]

const processSteps = [
  'Add a student or import the school roster.',
  'Record the diagnostic together during a guidance meeting.',
  'Generate an AI roadmap and review the evidence.',
  'Agree next actions and track follow-ups over time.',
]

function FoldMark({ large = false }: { large?: boolean }) {
  return (
    <svg
      className={large ? 'fold-mark fold-mark-large' : 'fold-mark'}
      viewBox="0 0 72 72"
      role="img"
      aria-label="Manyfolds branching pathways symbol"
    >
      <path className="branch-route branch-route-top" d="M8 36h13c5 0 7-2 11-7l11-11c3-3 6-4 11-4h11" />
      <path className="branch-route branch-route-middle" d="M8 36h57" />
      <path className="branch-route branch-route-bottom" d="M8 36h13c5 0 7 2 11 7l11 11c3 3 6 4 11 4h11" />
      <circle className="branch-origin" cx="8" cy="36" r="5" />
      <circle className="branch-end branch-end-top" cx="65" cy="14" r="3.5" />
      <circle className="branch-end branch-end-middle" cx="65" cy="36" r="3.5" />
      <circle className="branch-end branch-end-bottom" cx="65" cy="58" r="3.5" />
    </svg>
  )
}

function Wordmark({ withMark = true }: { withMark?: boolean }) {
  return (
    <span className="manyfolds-lockup">
      {withMark && <FoldMark />}
      <span className="manyfolds-wordmark" aria-label="Manyfolds">
        many<span>folds</span>
      </span>
    </span>
  )
}

function PossibilityMap() {
  return (
    <div className="possibility-map" aria-label="Profile signals combine into three career directions">
      <svg viewBox="0 0 560 520" aria-hidden="true">
        <defs>
          <marker id="arrow-in" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10Z" fill="#92b79f" />
          </marker>
          <marker id="arrow-one" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10Z" fill="#b7d6a7" />
          </marker>
          <marker id="arrow-two" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10Z" fill="#8fbda7" />
          </marker>
          <marker id="arrow-three" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10Z" fill="#69a18b" />
          </marker>
        </defs>
        <path className="signal-route" d="M72 104C100 145 180 159 242 226" />
        <path className="signal-route" d="M176 87C198 142 229 167 262 219" />
        <path className="signal-route" d="M280 80V211" />
        <path className="signal-route" d="M384 87C361 142 331 167 298 219" />
        <path className="signal-route" d="M489 104C460 145 381 159 318 226" />
        <path className="outcome-route outcome-one" d="M251 294C214 330 149 344 103 401" />
        <path className="outcome-route outcome-two" d="M280 302V401" />
        <path className="outcome-route outcome-three" d="M309 294C346 330 411 344 457 401" />
      </svg>

      <div className="map-step map-step-inputs"><b>1</b><span>Profile signals</span></div>
      <span className="map-label source source-one"><small>Interest</small><b>Psychology</b></span>
      <span className="map-label source source-two"><small>Subject</small><b>Computing</b></span>
      <span className="map-label source source-three"><small>Skill</small><b>Research</b></span>
      <span className="map-label source source-four"><small>Context</small><b>Location + budget</b></span>
      <span className="map-label source source-five"><small>Priority</small><b>People-focused</b></span>

      <div className="map-centre">
        <small>2 · Combined</small>
        <strong>Student profile</strong>
        <span>Interests + skills + context</span>
      </div>

      <div className="map-step map-step-results"><b>3</b><span>Directions to explore</span></div>
      <article className="map-result result-one">
        <small>01 · strong fit</small>
        <strong>UX research</strong>
        <span>People + technology</span>
      </article>
      <article className="map-result result-two">
        <small>02 · explore</small>
        <strong>Cognitive science</strong>
        <span>Mind + computation</span>
      </article>
      <article className="map-result result-three">
        <small>03 · new link</small>
        <strong>Behavioural data</strong>
        <span>Patterns + impact</span>
      </article>
    </div>
  )
}

export default function Landing({ openDashboard }: { openDashboard: () => void }) {
  const [showOpening, setShowOpening] = useState(true)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setShowOpening(false)
      return
    }

    const timer = window.setTimeout(() => setShowOpening(false), 2850)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="manyfolds-landing">
      {showOpening && (
        <div className="manyfolds-opening" aria-hidden="true">
          <div className="opening-stage">
            <FoldMark large />
            <div>
              <Wordmark withMark={false} />
              <p>possibilities, unfolded.</p>
            </div>
          </div>
          <div className="opening-paths">
            <i />
            <i />
            <i />
          </div>
        </div>
      )}

      <header className="manyfolds-nav">
        <a href="/" className="wordmark-link">
          <Wordmark />
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#counsellors">For counsellors</a>
        </nav>
        <button type="button" className="nav-sign-in" onClick={openDashboard}>
          Sign in
        </button>
      </header>

      <main>
        <section className="manyfolds-hero">
          <div className="hero-copy">
            <p className="eyebrow">Career guidance for schools</p>
            <h1>
              More than one interest.
              <em>More than one way forward.</em>
            </h1>
            <p className="hero-lead">
              Manyfolds brings together subjects, skills, academics, priorities, and
              circumstances so school counsellors and guidance teachers can explore options
              with students, record decisions, and keep follow-ups connected.
            </p>
            <div className="hero-actions">
              <button type="button" onClick={openDashboard}>
                Open the staff workspace <span>↗</span>
              </button>
              <a href="#how">See how it works</a>
            </div>
            <p className="hero-proof">
              Whole-student signals <i /> Connected pathways <i /> Realistic trade-offs
            </p>
          </div>

          <div className="pathway-preview" aria-label="Example personalised pathway">
            <div className="preview-heading">
              <div>
                <span>Personalisation · worked example</span>
                <strong>How one profile becomes three directions.</strong>
              </div>
              <span className="preview-status"><i /> Example</span>
            </div>
            <PossibilityMap />
          </div>
        </section>

        <section className="manyfolds-statement">
          <p>Students are more complicated than one stream.</p>
          <h2>
            Different interests can belong together. Manyfolds keeps those combinations
            visible—without pretending there is one perfect answer.
          </h2>
        </section>

        <section className="manyfolds-examples">
          <div className="section-heading">
            <p className="eyebrow">Where interests can meet</p>
            <h2>From scattered interests to connected possibilities.</h2>
          </div>
          <div className="example-grid">
            {interestExamples.map(([title, description], index) => (
              <article key={title}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <button type="button" onClick={openDashboard}>
                  Explore this combination <b>↗</b>
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="manyfolds-process" id="how">
          <div>
            <p className="eyebrow">A clearer process</p>
            <h2>From what matters to what’s possible.</h2>
            <p>
              A pathway is not a verdict. It is a set of informed options you can
              compare, test, and change.
            </p>
          </div>
          <ol>
            {processSteps.map((step, index) => (
              <li key={step}>
                <span>0{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="manyfolds-counsellor" id="counsellors">
          <div>
            <p className="eyebrow">For counsellors</p>
            <h2>More context. Less fragmented guidance.</h2>
            <p>
              Review profile signals, compare pathways, and keep the next useful step
              visible for every student.
            </p>
            <button type="button" onClick={openDashboard}>
              Explore the counsellor workspace
            </button>
          </div>
          <aside>
            <span>Student context</span>
            <div>
              <b>Interests</b>
              <b>Academic fit</b>
              <b>Eligibility</b>
              <b>Priorities</b>
            </div>
            <p>One connected guidance view.</p>
          </aside>
        </section>

        <section className="manyfolds-close">
          <p className="eyebrow">Manyfolds</p>
          <h2>Your future does not have to fit into one box.</h2>
          <button type="button" onClick={openDashboard}>
            Staff sign in <span>↗</span>
          </button>
        </section>
      </main>

      <footer className="manyfolds-footer">
        <Wordmark />
        <p>More than one interest. More than one way forward.</p>
        <button type="button" onClick={openDashboard}>
          For counsellors
        </button>
      </footer>
    </div>
  )
}
