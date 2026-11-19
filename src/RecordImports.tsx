import { useCallback, useEffect, useState } from 'react'
import { recordImportFields, recordImportLabels, type RecordImportKind } from '../server/school/recordImportSchema'
import { operationsRequest, refreshStudents } from './operationsApi'

type ImportRow = { studentId:string; entryId:string; version:number; values:Record<string,string> }
type Preview = { rows:ImportRow[]; previewHash:string; students:number }
type Batch = { id:string; kind:RecordImportKind; status:string; created_at:string; students:number;row_count:number }
const labels:Record<string,string> = { studentId:'Student ID', grade:'Configured class / section', staffEmail:'Active staff email', name:'Guardian name', relationship:'Relationship', scheduledAt:'Session date/time with timezone', sessionType:'Session type', resultType:'Result type', studentActions:'Student actions', counsellorActions:'Counsellor actions' }
const label = (field:string) => labels[field] || field[0].toUpperCase()+field.slice(1)
const required:Record<RecordImportKind,string[]> = { class:['studentId','grade'], staff:['studentId','staffEmail'], guardians:['studentId','name','relationship','source'], academics:['studentId','subject','result','scale','term','year','source','resultType'], sessions:['studentId','title','scheduledAt','sessionType','attendees','reason','source'] }

export function RecordImports({role,canRollback}:{role:string;canRollback:boolean}) {
  const kinds = (Object.keys(recordImportFields) as RecordImportKind[]).filter(kind => role==='data_entry' ? ['class','academics'].includes(kind) : ['staff','sessions'].includes(kind) ? ['owner','admin','lead_counsellor'].includes(role) : true)
  const [kind,setKind] = useState<RecordImportKind>('class'), [csv,setCsv] = useState(''), [headers,setHeaders] = useState<string[]>([]), [mapping,setMapping] = useState<Record<string,string>>({})
  const [preview,setPreview] = useState<Preview|null>(null), [history,setHistory] = useState<Batch[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState(''), [batchId,setBatchId] = useState(()=>crypto.randomUUID())
  const [historyLoading,setHistoryLoading]=useState(true),[fileName,setFileName]=useState('')
  const loadHistory = useCallback(async()=>{setHistoryLoading(true);try{setHistory((await operationsRequest<{records:Batch[]}>('/imports/records')).records)}finally{setHistoryLoading(false)}},[])
  useEffect(()=>{void loadHistory().catch(e=>setError(e instanceof Error?e.message:'Could not load import history.'))},[loadHistory])
  useEffect(()=>{
    const guard=(event:Event)=>{if(busy||(csv&&!window.confirm('Discard the CSV and its unsaved import preview?')))event.preventDefault()}
    const unload=(event:BeforeUnloadEvent)=>{if(busy||csv){event.preventDefault();event.returnValue=''}}
    window.addEventListener('manyfolds-before-navigate',guard);window.addEventListener('beforeunload',unload)
    return()=>{window.removeEventListener('manyfolds-before-navigate',guard);window.removeEventListener('beforeunload',unload)}
  },[busy,csv])
  const clear=()=>{setCsv('');setFileName('');setHeaders([]);setMapping({});setPreview(null);setBatchId(crypto.randomUUID())}
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await action()}catch(e){setError(e instanceof Error?e.message:'Import failed. Reload and review before retrying.')}finally{setBusy(false)}}
  const upload=(file:File)=>run(async()=>{
    clear();if(file.size>900_000)throw Error('Choose a CSV under 900 KB with at most 100 rows.')
    const content=await file.text(), data=await operationsRequest<{headers:string[]}>('/imports/records/preview',{method:'POST',body:JSON.stringify({kind,csv:content})})
    setCsv(content);setFileName(file.name);setHeaders(data.headers)
    const normal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'')
    setMapping(Object.fromEntries(recordImportFields[kind].map(field=>[field,data.headers.find(header=>normal(header)===normal(field)||(field==='studentId'&&normal(header)==='id'))||''])))
  })
  const review=()=>run(async()=>{
    setPreview(null);setBatchId(crypto.randomUUID())
    setPreview(await operationsRequest<Preview>('/imports/records/preview',{method:'POST',body:JSON.stringify({kind,csv,mapping})}))
  })
  const apply=()=>run(async()=>{
    if(!preview)return
    const data=await operationsRequest<{students:number;reused?:boolean}>('/imports/records',{method:'POST',body:JSON.stringify({id:batchId,kind,rows:preview.rows,previewHash:preview.previewHash})})
    clear();refreshStudents();setNotice(`${recordImportLabels[kind]} saved for ${data.students} students${data.reused?' (previously completed batch)':''}.`)
    try{await loadHistory()}catch{setError('Import saved, but history could not reload. Use Reload history below.')}
  })
  const rollback=(batch:Batch)=>{
    if(!window.confirm(`Roll back ${recordImportLabels[batch.kind].toLowerCase()} for ${batch.students} students? Later edits, notes or linked tasks will block the whole rollback. Historical sessions are cancelled and retained.`))return
    void run(async()=>{await operationsRequest('/imports/records/rollback',{method:'POST',body:JSON.stringify({id:batch.id})});refreshStudents();setNotice('Import rolled back. Audit and record history are retained.');await loadHistory()})
  }
  const template=()=>{
    const fields=recordImportFields[kind], url=URL.createObjectURL(new Blob([fields.join(',')+'\n'],{type:'text/csv;charset=utf-8'})), a=document.createElement('a')
    a.href=url;a.download=`manyfolds-${kind}-template.csv`;a.click();URL.revokeObjectURL(url)
  }
  const report=(batch:Batch)=>run(async()=>{
    const {report}=await operationsRequest<{report:Batch&{student_keys:string[];rolled_back_at:string|null}}>(`/imports/records/report?id=${encodeURIComponent(batch.id)}`)
    const rows=[['Batch ID','Record type','Status','Created','Rolled back','Batch rows','Student ID'],...report.student_keys.map(key=>[report.id,recordImportLabels[report.kind],report.status,report.created_at,report.rolled_back_at||'',String(report.row_count),key])]
    const cell=(value:string)=>'"'+value.replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"'
    const url=URL.createObjectURL(new Blob([rows.map(row=>row.map(cell).join(',')).join('\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a')
    a.href=url;a.download=`manyfolds-import-${report.id}.csv`;a.click();URL.revokeObjectURL(url);setNotice('Import result report downloaded.')
  })
  return <section className="panel school-form" aria-labelledby="record-import-title">
    <h2 id="record-import-title">Import records for existing students</h2>
    <p>Use the exact Student ID from the registry export. Each batch is validated before saving; a conflicting row blocks the whole batch. Existing profile entries are preserved. Import up to 100 rows at a time.</p>
    <label>Record type<select disabled={busy} value={kind} onChange={e=>{if(!csv||window.confirm('Discard this CSV and preview to change the import type?')){clear();setKind(e.target.value as RecordImportKind);setError('');setNotice('')}}}>{kinds.map(value=><option key={value} value={value}>{recordImportLabels[value]}</option>)}</select></label>
    <button className="secondary" disabled={busy} onClick={template}>Download column template</button>
    {kind==='class'&&<p>Class labels must match School configuration, for example “11 A”.</p>}
    {kind==='staff'&&<p>Assign an active guidance staff member from this school using their sign-in email.</p>}
    {kind==='academics'&&<p>Use the profile’s result types: Reported result, Internal assessment or School prediction. A source reference is required.</p>}
    {kind==='sessions'&&<p>Use a past ISO date with timezone, for example 2026-10-01T10:00:00+05:30, and an existing session type such as Initial intake or Follow-up. Include a decision or student/counsellor action. Imported sessions are completed records; they do not grant sharing approval.</p>}
    <label>Records CSV<input key={kind} type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{const selected=e.target.files?.[0];e.currentTarget.value='';if(selected)void upload(selected)}}/></label>
    {fileName&&<p>Loaded {fileName}. Review the column mappings below.</p>}
    {!!headers.length&&<>
      <div className="school-class-row">{recordImportFields[kind].map(field=><label key={field}>{label(field)}{required[kind].includes(field)?' (required)':' (optional)'}<select disabled={busy} value={mapping[field]||''} onChange={e=>{setMapping({...mapping,[field]:e.target.value});setPreview(null)}}><option value="">Choose column</option>{headers.map(header=><option key={header}>{header}</option>)}</select></label>)}</div>
      <button className="secondary" disabled={busy||required[kind].some(field=>!mapping[field])} onClick={()=>void review()}>{busy?'Validating…':'Validate and preview'}</button>
      <button className="text-button" disabled={busy} onClick={clear}>Discard CSV</button>
    </>}
    {preview&&<>
      <h3>Review before saving</h3><p>{preview.rows.length} records for {preview.students} students. Review the values below, then confirm.</p>
      <div className="school-report-table" role="region" aria-label="CSV import preview" tabIndex={0}><table><thead><tr><th>Student ID</th>{recordImportFields[kind].filter(field=>field!=='studentId').map(field=><th key={field}>{label(field)}</th>)}</tr></thead><tbody>{preview.rows.map(row=><tr key={row.entryId}><td>{row.studentId}</td>{recordImportFields[kind].filter(field=>field!=='studentId').map(field=><td key={field}>{row.values[field]||'—'}</td>)}</tr>)}</tbody></table></div>
      <button className="new" disabled={busy} onClick={()=>void apply()}>{busy?'Saving…':`Confirm ${recordImportLabels[kind].toLowerCase()} import`}</button>
    </>}
    {error&&<p className="guidance-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">Working on this batch…</p>}
    <h3>Saved record imports</h3><button className="text-button" disabled={busy||historyLoading} onClick={()=>void run(loadHistory)}>Reload history</button>
    {historyLoading?<p role="status">Loading import history…</p>:!history.length&&<p>No record imports saved.</p>}
    {history.map(batch=><div className="guidance-row" key={batch.id}><div><b>{recordImportLabels[batch.kind]} · {batch.row_count} records · {batch.students} students</b><p>{new Date(batch.created_at).toLocaleString()} · {batch.status.replaceAll('_',' ')}</p></div><button className="text-button" disabled={busy} onClick={()=>void report(batch)}>Download result report</button>{canRollback&&batch.status==='completed'&&<button className="secondary" disabled={busy} onClick={()=>rollback(batch)}>Roll back unchanged records</button>}</div>)}
  </section>
}
