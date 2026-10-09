import { useCallback, useEffect, useState } from 'react'
import { activityInput, listActivities, saveActivity, type ActivityInput, type GuidanceActivity } from './guidanceApi'
import type { StudentRecord } from './studentRegistryApi'
import { EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from './UiPrimitives'
import './GuidanceActivities.css'

const localInputDate=(value:string)=>{const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`}
const dateLabel=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})

export default function GuidanceActivities({mode,students,canEdit,notify,initialStudentKey=''}:{mode:'session'|'task'|'calendar';students:StudentRecord[];canEdit:boolean;notify:(message:string)=>void;initialStudentKey?:string}){
  const [records,setRecords]=useState<GuidanceActivity[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [filter,setFilter]=useState('active')
  const [studentFilter,setStudentFilter]=useState(initialStudentKey)
  const [editor,setEditor]=useState<GuidanceActivity|null|undefined>(undefined)
  const [pending,setPending]=useState(false)
  const load=useCallback(async()=>{setLoading(true);setError('');try{setRecords(await listActivities())}catch(e){setError(e instanceof Error?e.message:'Activities could not be loaded.')}finally{setLoading(false)}},[])
  useEffect(()=>{void load()},[load])
  const active=(record:GuidanceActivity)=>record.status==='open'||record.status==='scheduled'
  const scoped=records.filter(record=>(mode==='calendar'||record.kind===mode)&&(!studentFilter||record.student_key===studentFilter))
  const visible=scoped.filter(record=>(filter==='all'||filter==='mine'&&record.mine||filter==='active'&&active(record)||filter==='completed'&&record.status==='completed')&&(!studentFilter||record.student_key===studentFilter)).sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at))
  const write=async(input:ActivityInput,id?:string)=>{
    if(pending)return false
    setPending(true);setError('')
    try{const saved=await saveActivity(input,id);const student=students.find(item=>item.id===saved.student_key);const enriched={...saved,student_name:student?.name,student_grade:student?.grade};setRecords(current=>current.some(item=>item.id===saved.id)?current.map(item=>item.id===saved.id?enriched:item):[...current,enriched]);notify(id?'Activity updated':'Activity saved to your school');return true}
    catch(e){setError(e instanceof Error?e.message:'Activity could not be saved.');return false}
    finally{setPending(false)}
  }
  const title=mode==='session'?'Sessions':mode==='task'?'Tasks & follow-ups':'Guidance calendar'
  return <div className="content guidance-work">
    <PageHeader eyebrow="School guidance" title={title} description={mode==='session'?'Schedule student conversations and record shared decisions.':mode==='task'?'Track student actions through completion or cancellation.':'Sessions and follow-ups scheduled by your school team.'} action={canEdit&&<button className="new" disabled={!students.length||loading} onClick={()=>{setError('');setEditor(null)}}>{mode==='session'?'New session':mode==='task'?'New follow-up':'Schedule activity'}</button>}/>
    {error&&<div className="guidance-error" role="alert"><span>{error}</span><button disabled={pending||loading} onClick={()=>void load()}>Reload activities</button></div>}
    <div className="guidance-counts"><span><b>{scoped.filter(active).length}</b> active</span><span><b>{scoped.filter(item=>active(item)&&Date.parse(item.scheduled_at)<Date.now()).length}</b> past scheduled time</span><span><b>{scoped.filter(item=>item.status==='completed').length}</b> completed</span></div>
    <div className="guidance-toolbar"><div className="filters">{[['active','Active'],['mine','Assigned to me'],['completed','Completed'],['all','All activities']].map(([value,label])=><button key={value} className={`filter ${filter===value?'active':''}`} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><label>Student<select value={studentFilter} onChange={event=>setStudentFilter(event.target.value)}><option value="">All students</option>{students.map(student=><option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label></div>
    <section className="panel guidance-list">{loading?<LoadingSkeleton label="Loading school activities" rows={4}/>:visible.length?visible.map(record=><article className="guidance-row" key={record.id}><div><p className="eyebrow">{record.kind==='session'?'Session':'Follow-up'} · {record.student_name||'Student record'}</p><h3>{record.title}</h3><p>{dateLabel(record.scheduled_at)} · {record.mine?'Assigned to you':'Assigned to another staff member'}</p>{record.summary&&<p className="guidance-summary">{record.summary}</p>}</div><div className="guidance-row-actions"><StatusBadge tone={record.status==='completed'?'success':'neutral'}>{record.status}</StatusBadge>{canEdit&&<><button className="secondary" disabled={pending} onClick={()=>{setError('');setEditor(record)}}>Edit activity</button>{active(record)&&<button className="new" disabled={pending} onClick={()=>void write({...activityInput(record),status:'completed'},record.id)}>Mark complete</button>}</>}</div></article>):<EmptyState title={students.length?'No activities in this view':'Add a student first'} description={students.length?'Schedule an activity or change the filters to see completed and cancelled items.':'Sessions and follow-ups are linked to a record in the student register.'}/> }</section>
    {editor!==undefined&&<ActivityEditor mode={mode} existing={editor} initialStudentKey={studentFilter} students={students} pending={pending} error={error} close={()=>setEditor(undefined)} save={async(input)=>{if(await write(input,editor?.id))setEditor(undefined)}}/>}
  </div>
}

function ActivityEditor({mode,existing,students,pending,error,close,save,initialStudentKey}:{mode:'session'|'task'|'calendar';existing:GuidanceActivity|null;students:StudentRecord[];pending:boolean;error:string;close:()=>void;save:(input:ActivityInput)=>Promise<void>;initialStudentKey:string}){
  const [requestId]=useState(()=>crypto.randomUUID())
  const [kind,setKind]=useState<'session'|'task'>(existing?.kind||(mode==='task'?'task':'session'))
  const [status,setStatus]=useState<GuidanceActivity['status']>(existing?.status||(kind==='session'?'scheduled':'open'))
  useEffect(()=>{const handle=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!pending)close()};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle)},[close,pending])
  return <div className="overlay"><form role="dialog" aria-modal="true" aria-labelledby="activity-editor-title" className="modal guidance-modal" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);void save({kind,status,studentKey:String(data.get('student')),title:String(data.get('title')).trim(),scheduledAt:new Date(String(data.get('date'))).toISOString(),summary:String(data.get('summary')||''),version:existing?.version,requestId})}}>
    <button className="drawer-close" type="button" aria-label="Close activity form" disabled={pending} onClick={close}>×</button><p className="eyebrow">Student-linked activity</p><h2 id="activity-editor-title">{existing?'Edit activity':'Schedule activity'}</h2>
    <fieldset disabled={pending}><label>Activity type<select value={kind} disabled={Boolean(existing)||mode!=='calendar'} onChange={event=>{const next=event.target.value as 'session'|'task';setKind(next);setStatus(next==='session'?'scheduled':'open')}}><option value="session">Counselling session</option><option value="task">Follow-up task</option></select></label>
    <label>Student<select name="student" autoFocus={!existing} required defaultValue={existing?.student_key||initialStudentKey} disabled={Boolean(existing)}><option value="" disabled>Select a student</option>{students.map(student=><option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select>{existing&&<input type="hidden" name="student" value={existing.student_key}/>}</label>
    <label>Title<input name="title" autoFocus={Boolean(existing)} required maxLength={200} defaultValue={existing?.title||''} placeholder={kind==='session'?'Pathway review conversation':'Confirm shortlisted course requirements'}/></label>
    <label>{kind==='session'?'Session date and time':'Follow-up due date and time'}<input name="date" type="datetime-local" required defaultValue={localInputDate(existing?.scheduled_at||new Date().toISOString())}/></label>
    <label>Status<select value={status} onChange={event=>setStatus(event.target.value as GuidanceActivity['status'])}><option value={kind==='session'?'scheduled':'open'}>{kind==='session'?'Scheduled':'Open'}</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
    <label>Shared decisions and actions<textarea name="summary" maxLength={5000} rows={4} defaultValue={existing?.summary||''}/></label><p className="guidance-shared-hint">Visible to staff in your school. Keep private counsellor notes out of this summary.</p></fieldset>
    {error&&<p className="inline-student-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={pending} onClick={close}>Cancel</button><button className="new" disabled={pending} type="submit">{pending?'Saving…':'Save activity'}</button></div>
  </form></div>
}
