import { useEffect, useMemo, useState } from 'react'
import { buildMatches, type Profile } from './recommendationEngine'
import { getSavedPaths, getLegacySavedPaths, removeSavedPath, preferSavedPath, savePath, type SavedPath } from './savedPathways'
import { getDiagnostics } from './schoolApi'

const titleFromPath = () => decodeURIComponent(window.location.pathname.split('/').pop() || '').replaceAll('-', ' ')

export default function RecommendationDetail() {
  const studentKey=new URLSearchParams(window.location.search).get('student')||''
  const [profile,setProfile]=useState<Profile|null>(null),[profileError,setProfileError]=useState('')
  const contextQuery=studentKey?'&student='+encodeURIComponent(studentKey):''
  useEffect(()=>{if(!studentKey)return;let active=true;void getDiagnostics(studentKey).then(records=>{if(active)setProfile(records[0]?.status!=='draft'?records[0]?.profile||null:null)}).catch(error=>{if(active)setProfileError(error instanceof Error?error.message:'Student profile could not load.')});return()=>{active=false}},[studentKey])
  const [saved, setSaved] = useState<SavedPath[]>([]),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('')
  useEffect(()=>{let active=true;void getSavedPaths().then(items=>{if(active)setSaved(items)}).catch(error=>{if(active)setSaveError(error instanceof Error?error.message:'Saved options could not load.')});return()=>{active=false}},[])
  const path = window.location.pathname+window.location.search
  const type = path.split('/')[1] || 'careers'
  const title = titleFromPath()
  const matches = useMemo(() => profile ? buildMatches(profile) : [], [profile])
  const match = matches.find(item => item.name.toLowerCase() === title.toLowerCase())
  const label = type === 'courses' ? 'Course' : type === 'colleges' || type === 'programmes' ? 'College programme' : 'Career'
  const add = async() => {if(saving)return;setSaving(true);setSaveError('');try{setSaved(await savePath({ name: title, type: label, path }))}catch(error){setSaveError(error instanceof Error?error.message:'Option could not be saved.')}finally{setSaving(false)}}
  const savedAlready = saved.some(item => item.path === path)

  return <main className="detail-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/dashboard">Dashboard</a><span>›</span><a href={"/dashboard?view=diagnostic"+contextQuery}>Career Diagnostic</a><span>›</span><b>{title}</b></nav>
    <section className="detail-hero">
      <p className="eyebrow">{label} exploration</p><h1>{title}</h1>
      <p>{match ? `Recommended because it ${match.why.join(', ')}.` : 'No verified pathway details are loaded for this option.'}</p>
      <div className="detail-actions"><button className="new" onClick={()=>void add()} disabled={saving||savedAlready}>{saving?'Saving…':savedAlready ? 'Saved to My Plan' : 'Save to My Plan'}</button><a className="secondary" href={"/dashboard?view=diagnostic"+contextQuery}>Back to diagnostic</a></div>
      {saveError&&<p role="alert" className="guidance-error">{saveError}</p>}
    </section>
    {profileError&&<p className="guidance-error" role="alert">{profileError}</p>}<section className="detail-grid">
      <article className="panel detail-section"><p className="eyebrow">Why it fits</p><h2>Fit explanation</h2><p>{match?.band || 'Worth exploring'}{match ? ` · ${match.fit}% transparent rule-based fit.` : ''}</p><p>{match?.concerns.join(' ') || 'Complete the diagnostic to make this more specific.'}</p><h3>Student context</h3><p>{profile ? `${profile.grade || 'Stage not supplied'} · ${profile.geography || 'Location preference not supplied'} · ${profile.budget || 'Budget not supplied'}` : 'No active profile available.'}</p></article>
      <article className="panel detail-section"><p className="eyebrow">Pathway</p><h2>What to explore next</h2><p>No course, exam or programme link is shown here without verified relationship data. Generate an AI roadmap to check the current source-backed route for this direction.</p><a className="new" href={"/dashboard?view=roadmap"+contextQuery}>View AI Roadmap</a></article>
      <article className="panel detail-section full"><p className="eyebrow">Admissions and colleges</p><h2>Verified programme data</h2><p className="review">This detail page has no verified programme, eligibility, fee, document or scholarship data loaded for this option. Check the AI roadmap and official sources before making an application decision.</p><div className="detail-link-row"><a href="/dashboard?view=courses">Explore verified courses</a><a href="/dashboard?view=exams">Browse verified examinations</a><a href="/dashboard?view=institutions">Browse verified institutions</a></div></article>
    </section>
  </main>
}

export function SavedPlan({ notify }: { notify: (message: string) => void }) {
  const [items,setItems]=useState<SavedPath[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [legacy]=useState(getLegacySavedPaths),[selectedLegacy,setSelectedLegacy]=useState<string[]>([])
  const availableLegacy=legacy.filter(item=>!items.some(saved=>saved.path===item.path))
  const importLegacy=async()=>{setBusy(true);setError('');try{for(const item of availableLegacy.filter(item=>selectedLegacy.includes(item.path)))setItems(await savePath(item));setSelectedLegacy([]);notify('Selected browser bookmarks saved to your account')}catch(reason){setError(reason instanceof Error?reason.message:'Some bookmarks could not be imported. Confirm saved options before retrying.')}finally{setBusy(false)}}
  const load=async()=>{setLoading(true);setError('');try{setItems(await getSavedPaths())}catch(reason){setError(reason instanceof Error?reason.message:'Saved options could not load.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])
  const change=async(path:string,action:'remove'|'prefer')=>{if(busy)return;setBusy(true);setError('');try{setItems(await (action==='remove'?removeSavedPath(path):preferSavedPath(path)));notify(action==='remove'?'Removed from My Plan':'Preferred option saved')}catch(reason){setError(reason instanceof Error?reason.message:'Could not confirm this change. Reload My Plan.')}finally{setBusy(false)}}
  return <div className="content diagnostic"><p className="eyebrow">Saved to your account</p><h1>My Plan</h1><p className="diagnostic-note">Your personal saved options sync across devices in this school account. They are bookmarks for exploration, not an approved student action plan. Other staff cannot see this list.</p>{!loading&&availableLegacy.length>0&&<details className="panel diagnostic-report"><summary>Review older bookmarks from this browser ({availableLegacy.length})</summary><p>These bookmarks were stored for this school in this browser. Choose which ones to import into your personal account. The browser copy is preserved.</p>{availableLegacy.map(item=><label key={item.path} style={{display:'flex',gap:10,margin:'12px 0'}}><input type="checkbox" disabled={busy} checked={selectedLegacy.includes(item.path)} onChange={event=>setSelectedLegacy(current=>event.target.checked?[...current,item.path]:current.filter(path=>path!==item.path))}/>{item.name} ({item.type})</label>)}<button className="new" disabled={busy||!selectedLegacy.length} onClick={()=>void importLegacy()}>Import selected bookmarks</button></details>}{error&&<div role="alert" className="guidance-error">{error}<button disabled={loading||busy} onClick={()=>void load()}>Reload My Plan</button></div>}{loading?<p role="status">Loading saved options...</p>:!error&&items.length?<section className="panel diagnostic-report">{items.map(item=><div className="match" key={item.path}><div className="match-score"><b>{item.type}</b><small>{item.preferred?'Preferred':'Saved'}</small></div><div><b>{item.name}</b><p>{item.preferred?'Your preferred option.':'Saved for later comparison and guidance discussion.'}</p></div><a className="secondary" href={item.path}>Explore</a><button className="text-button" disabled={busy||item.preferred} onClick={()=>void change(item.path,'prefer')}>Prefer</button><button className="text-button" disabled={busy} onClick={()=>void change(item.path,'remove')}>Remove</button></div>)}</section>:!error&&<section className="panel diagnostic-report"><h2>No saved options yet</h2><p>Use Save to My Plan on a career result or verified catalogue record.</p><a className="secondary" href="/dashboard?view=diagnostic">Explore careers</a></section>}</div>
}
