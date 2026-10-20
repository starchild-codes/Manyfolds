import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { activityInput, listActivities, saveActivity, type ActivityInput, type GuidanceActivity } from './guidanceApi'
import type { StudentRecord } from './studentRegistryApi'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from './UiPrimitives'
import './GuidanceActivities.css'
import ActivityEditor from './ActivityEditor'
const SessionRecord=lazy(()=>import('./SessionRecord'))

const dateLabel=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})

export default function GuidanceActivities({mode,students,canEdit,notify,initialStudentKey='',onStudentChange}:{mode:'session'|'task'|'calendar';students:StudentRecord[];canEdit:boolean;notify:(message:string)=>void;initialStudentKey?:string;onStudentChange?:(studentKey:string)=>void}){
  const [records,setRecords]=useState<GuidanceActivity[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [filter,setFilter]=useState(()=>new URLSearchParams(window.location.search).get('q')?'all':'active')
  const [search,setSearch]=useState(()=>new URLSearchParams(window.location.search).get('q')||'')
  const [studentFilter,setStudentFilter]=useState(initialStudentKey)
  useEffect(()=>{setStudentFilter(initialStudentKey)},[initialStudentKey])
  const [editor,setEditor]=useState<GuidanceActivity|null|undefined>(undefined)
  const [pending,setPending]=useState(false)
  const [sessionId,setSessionId]=useState('')
  const load=useCallback(async()=>{setLoading(true);setError('');try{setRecords(await listActivities())}catch(e){setError(e instanceof Error?e.message:'Activities could not be loaded.')}finally{setLoading(false)}},[])
  useEffect(()=>{void load()},[load])
  const active=(record:GuidanceActivity)=>!['completed','cancelled'].includes(record.status)
  const scoped=records.filter(record=>(!search||record.title.toLowerCase().includes(search.toLowerCase()))&&(mode==='calendar'||record.kind===mode)&&(!studentFilter||record.student_key===studentFilter))
  const visible=scoped.filter(record=>(filter==='all'||filter==='mine'&&record.mine||filter==='active'&&active(record)||filter==='completed'&&record.status==='completed'||filter==='overdue'&&active(record)&&Date.parse(record.scheduled_at)<Date.now()||filter==='blocked'&&record.status==='blocked'||filter==='awaiting_evidence'&&record.status==='awaiting_evidence')&&(!studentFilter||record.student_key===studentFilter)).sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at))
  const write=async(input:ActivityInput,id?:string)=>{
    if(pending)return false
    setPending(true);setError('')
    try{const saved=await saveActivity(input,id);const student=students.find(item=>item.id===saved.student_key);const enriched={...saved,student_name:student?.name,student_grade:student?.grade};setRecords(current=>current.some(item=>item.id===saved.id)?current.map(item=>item.id===saved.id?enriched:item):[...current,enriched]);notify(id?'Activity updated':'Activity saved to your school');if(!id&&saved.kind==='session')setSessionId(saved.id);return true}
    catch(e){setError(e instanceof Error?e.message:'Activity could not be saved.');return false}
    finally{setPending(false)}
  }
  const title=mode==='session'?'Sessions':mode==='task'?'Tasks & follow-ups':'Guidance calendar'
  return <div className="content guidance-work">
    <PageHeader eyebrow="School guidance" title={title} description={mode==='session'?'Schedule student conversations and record shared decisions.':mode==='task'?'Track student actions through completion or cancellation.':'Sessions and follow-ups scheduled by your school team.'} action={canEdit&&<button className="new" disabled={!students.length||loading} onClick={()=>{setError('');setEditor(null)}}>{mode==='session'?'New session':mode==='task'?'New follow-up':'Schedule activity'}</button>}/>
    {error&&<div className="guidance-error" role="alert"><span>{error}</span><button disabled={pending||loading} onClick={()=>void load()}>Reload activities</button></div>}
    <div className="guidance-counts"><span><b>{scoped.filter(active).length}</b> active</span><span><b>{scoped.filter(item=>active(item)&&Date.parse(item.scheduled_at)<Date.now()).length}</b> past scheduled time</span><span><b>{scoped.filter(item=>item.status==='completed').length}</b> completed</span></div>
    <div className="guidance-toolbar"><div className="filters">{[['active','Active'],['mine','Assigned to me'],['overdue','Overdue'],['blocked','Blocked'],['awaiting_evidence','Awaiting evidence'],['completed','Completed'],['all','All activities']].map(([value,label])=><button key={value} className={`filter ${filter===value?'active':''}`} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><label>Title<input value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Student<select value={studentFilter} onChange={event=>{setStudentFilter(event.target.value);onStudentChange?.(event.target.value)}}><option value="">All students</option>{students.map(student=><option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label></div>
    <section className="panel guidance-list">{loading?<LoadingSkeleton label="Loading school activities" rows={4}/>:visible.length?visible.map(record=><article className="guidance-row" key={record.id}><div><p className="eyebrow">{record.kind==='session'?'Session':'Follow-up'} · {record.student_name||'Student record'}</p><h3>{record.title}</h3><p>{dateLabel(record.scheduled_at)} · {record.mine?'Assigned to you':'Assigned to another staff member'}</p>{record.summary&&<p className="guidance-summary">{record.summary}</p>}</div><div className="guidance-row-actions"><StatusBadge tone={record.status==='completed'?'success':'neutral'}>{record.status.replaceAll('_',' ')}</StatusBadge>{canEdit&&<><button className="secondary" disabled={pending} onClick={()=>{setError('');setEditor(record)}}>Edit activity</button>{record.kind==='session'&&<button className="new" disabled={pending} onClick={()=>setSessionId(record.id)}>Open session record</button>}{record.kind==='task'&&active(record)&&<button className="new" disabled={pending} onClick={()=>void write({...activityInput(record),status:'completed'},record.id)}>Mark complete</button>}</>}</div></article>):<EmptyState title={students.length?'No activities in this view':'Add a student first'} description={students.length?'Schedule an activity or change the filters to see completed and cancelled items.':'Sessions and follow-ups are linked to a record in the student register.'}/> }</section>
    {sessionId&&<Suspense fallback={<p role="status">Opening session record…</p>}><SessionRecord id={sessionId} onClose={()=>setSessionId('')} onSaved={saved=>{setRecords(current=>current.map(item=>item.id===saved.id?{...item,...saved}:item))}}/></Suspense>}
    {editor!==undefined&&<ActivityEditor mode={mode} existing={editor} initialStudentKey={studentFilter} students={students} pending={pending} error={error} close={()=>setEditor(undefined)} save={async(input)=>{if(await write(input,editor?.id))setEditor(undefined)}}/>}
  </div>
}
