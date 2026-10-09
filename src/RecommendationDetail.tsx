import { useEffect, useMemo, useState } from 'react'
import { buildMatches, type Profile } from './recommendationEngine'
import { getSavedPaths, replaceSavedPaths, savePath, type SavedPath } from './savedPathways'
import { getDiagnostics } from './schoolApi'

const titleFromPath = () => decodeURIComponent(window.location.pathname.split('/').pop() || '').replaceAll('-', ' ')

export default function RecommendationDetail() {
  const studentKey=new URLSearchParams(window.location.search).get('student')||''
  const [profile,setProfile]=useState<Profile|null>(null),[profileError,setProfileError]=useState('')
  const contextQuery=studentKey?'&student='+encodeURIComponent(studentKey):''
  useEffect(()=>{if(!studentKey)return;let active=true;void getDiagnostics(studentKey).then(records=>{if(active)setProfile(records[0]?.status!=='draft'?records[0]?.profile||null:null)}).catch(error=>{if(active)setProfileError(error instanceof Error?error.message:'Student profile could not load.')});return()=>{active=false}},[studentKey])
  const [saved, setSaved] = useState(() => getSavedPaths())
  const path = window.location.pathname+window.location.search
  const type = path.split('/')[1] || 'careers'
  const title = titleFromPath()
  const matches = useMemo(() => profile ? buildMatches(profile) : [], [profile])
  const match = matches.find(item => item.name.toLowerCase() === title.toLowerCase())
  const label = type === 'courses' ? 'Course' : type === 'colleges' || type === 'programmes' ? 'College programme' : 'Career'
  const add = () => { savePath({ name: title, type: label, path }); setSaved(getSavedPaths()) }
  const savedAlready = saved.some(item => item.path === path)

  return <main className="detail-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><span>›</span><a href={"/dashboard?view=diagnostic"+contextQuery}>Career Diagnostic</a><span>›</span><b>{title}</b></nav>
    <section className="detail-hero">
      <p className="eyebrow">{label} exploration</p><h1>{title}</h1>
      <p>{match ? `Recommended because it ${match.why.join(', ')}.` : 'No verified pathway details are loaded for this option.'}</p>
      <div className="detail-actions"><button className="new" onClick={add} disabled={savedAlready}>{savedAlready ? 'Saved to My Plan' : 'Save to My Plan'}</button><a className="secondary" href="/dashboard?view=diagnostic">Back to diagnostic</a></div>
    </section>
    {profileError&&<p className="guidance-error" role="alert">{profileError}</p>}<section className="detail-grid">
      <article className="panel detail-section"><p className="eyebrow">Why it fits</p><h2>Fit explanation</h2><p>{match?.band || 'Worth exploring'}{match ? ` · ${match.fit}% transparent rule-based fit.` : ''}</p><p>{match?.concerns.join(' ') || 'Complete the diagnostic to make this more specific.'}</p><h3>Student context</h3><p>{profile ? `${profile.grade || 'Stage not supplied'} · ${profile.geography || 'Location preference not supplied'} · ${profile.budget || 'Budget not supplied'}` : 'No active profile available.'}</p></article>
      <article className="panel detail-section"><p className="eyebrow">Pathway</p><h2>What to explore next</h2><p>No course, exam or programme link is shown here without verified relationship data. Generate an AI roadmap to check the current source-backed route for this direction.</p><a className="new" href={"/dashboard?view=roadmap"+contextQuery}>View AI Roadmap</a></article>
      <article className="panel detail-section full"><p className="eyebrow">Admissions and colleges</p><h2>Verified programme data</h2><p className="review">This detail page has no verified programme, eligibility, fee, document or scholarship data loaded for this option. Check the AI roadmap and official sources before making an application decision.</p><div className="detail-link-row"><a href="/dashboard?view=courses">Explore verified courses</a><a href="/dashboard?view=exams">Browse verified examinations</a><a href="/dashboard?view=institutions">Browse verified institutions</a></div></article>
    </section>
  </main>
}

export function SavedPlan({ notify }: { notify: (message: string) => void }) {
  const [items, setItems] = useState<SavedPath[]>(() => getSavedPaths())
  const remove = (path: string) => { const next = items.filter(item => item.path !== path); replaceSavedPaths(next); setItems(next); notify('Removed from My Plan') }
  const prefer = (path: string) => { const next = items.map(item => ({ ...item, preferred: item.path === path })); replaceSavedPaths(next); setItems(next); notify('Preferred pathway updated') }
  return <div className="content diagnostic"><p className="eyebrow">Saved and resumable</p><h1>My Plan</h1><p className="diagnostic-note">Saved options remain on this device until student accounts and organisation storage are connected.</p>{items.length ? <section className="panel diagnostic-report">{items.map(item => <div className="match" key={item.path}><div className="match-score"><b>{item.type}</b><small>{item.preferred ? 'Preferred' : 'Saved'}</small></div><div><b>{item.name}</b><p>{item.preferred ? 'Your preferred option.' : 'Saved for later comparison and counsellor discussion.'}</p></div><a className="secondary" href={item.path}>Explore</a><button className="text-button" onClick={() => prefer(item.path)}>Prefer</button><button className="text-button" onClick={() => remove(item.path)}>Remove</button></div>)}</section> : <section className="panel diagnostic-report"><h2>No saved options yet</h2><p>Use “Save to My Plan” on a career result, course, or programme detail page.</p><a className="secondary" href="/dashboard?view=diagnostic">Explore careers</a></section>}</div>
}
