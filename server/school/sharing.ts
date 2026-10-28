import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {AccessError,assertStudentAccess,canGuide,canCounsel} from '../access.ts'
import type {PrintableDocument} from '../../src/printDocumentTypes.ts'
const validDate=(v:unknown):v is string=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v
export async function sharingRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(url.pathname!=='/student-sharing')return false
 if(!canGuide(auth.role))throw new AccessError('Document generation is limited to authorised guidance staff.',403)
 if(req.method!=='POST')throw new AccessError('Method not allowed.',405)
 const key=url.searchParams.get('student')||'';await assertStudentAccess(pool,auth,key)
 let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>50000)throw new AccessError('Use a smaller document request.',413)}let body:Record<string,unknown>;try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{throw new AccessError('Provide a valid document request.',400)}
 const found=await pool.query("select s.payload->>'name' student,s.payload->>'grade' grade,o.name school,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Authorised school staff') author from student_registry_records s join organisations o on o.id=s.organisation_id join auth.users u on u.id=$3 where s.organisation_id=$1 and s.external_key=$2 and s.archived_at is null",[auth.organisationId,key,auth.userId]);const row=found.rows[0];if(!row)throw new AccessError('Restore this student before generating a document.',409)
 const generated=new Date().toISOString(),document:PrintableDocument={title:'',classification:'STUDENT / PARENT SHAREABLE',metadata:{Student:row.student,School:row.school,'Class / section':row.grade,'Prepared by':row.author,Generated:generated},sections:[]}
 if(body.kind==='consent'){
  if(!canCounsel(auth.role))throw new AccessError('A counsellor must review the consent wording before creating this form.',403)
  if(typeof body.wording!=='string'||body.wording.trim().length<30||body.wording.length>12000||body.reviewed!==true)throw new AccessError('Provide the school-approved consent wording and confirm your review.',400)
  document.title='School guidance consent form';document.sections=[{title:'For completion offline',body:'This unsigned form does not record consent in Manyfolds. The school must obtain and retain the completed form through its consent process.'},{title:'School-approved consent wording',body:body.wording.trim()},{title:'Student / guardian response',body:'Full name and relationship: ______________________________\nDecision and any limitations: ______________________________\nSignature: ______________________________\nDate: ______________________________'},{title:'School acknowledgement',body:'Receiving staff member: ______________________________\nDate received and school record reference: ______________________________'}]
 }else if(body.kind==='deadlines'){
  if(!validDate(body.from)||!validDate(body.to)||body.to<body.from||Date.parse(body.to)-Date.parse(body.from)>370*86400000)throw new AccessError('Choose a valid deadline date range of up to one year.',400)
  const claims=await pool.query("select claim_key,document_title,field_name,claim_value#>>'{}' date,source_url,publisher,checked_at,academic_cycle from catalogue_claims where verification_status='verified' and (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date) and field_name in('application_deadline','registration_deadline','registration_close','exam_date','scholarship_deadline') and jsonb_typeof(claim_value)='string' and claim_value#>>'{}'>=$1 and claim_value#>>'{}'<=$2 order by claim_value#>>'{}',claim_key limit 201",[body.from,body.to])
  if(claims.rows.length>200)throw new AccessError('Choose a smaller date range for this sheet.',413)
  const dates=claims.rows.filter(r=>{try{const u=new URL(r.source_url);return validDate(r.date)&&u.protocol==='https:'&&!u.username&&!u.password}catch{return false}})
  if(!dates.length)throw new AccessError('No current official dates are available for this period. Choose another range or use official-source AI research in the database.',409)
  document.title='Upcoming official dates and deadlines';document.metadata.Period=`${body.from} to ${body.to}`;document.sections=[{title:'How to use this sheet',body:'These are current source-checked dates in the selected period. Inclusion does not establish personal eligibility or a requirement to apply. Open the official source for application instructions.'},...dates.map(r=>({title:r.document_title,body:`${r.field_name.replaceAll('_',' ')}: ${r.date}${r.academic_cycle?`\nAcademic cycle: ${r.academic_cycle}`:''}\nPublisher: ${r.publisher}\nSource checked: ${new Date(r.checked_at).toISOString()}`,links:[{title:'Official source',url:r.source_url}]}))]
 }else if(body.kind==='plan'||body.kind==='outcome'){
  if(typeof body.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)||!Number.isSafeInteger(body.version))throw new AccessError('Choose a saved record and its current version.',400)
  const saved=(await pool.query('select payload,version from school_student_planning where organisation_id=$1 and student_key=$2 and id=$3 and kind=$4',[auth.organisationId,key,body.id,body.kind])).rows[0]
  if(!saved)throw new AccessError('This record is unavailable for the student.',404)
  if(saved.version!==body.version)throw new AccessError('This record changed. Reload and review the current summary.',409)
  if(!saved.payload.summaryApproved||!saved.payload.shareableSummary||saved.payload.status==='archived')throw new AccessError('Approve a separate current summary before sharing this record.',409)
  document.title=body.kind==='outcome'?'Student outcome summary':'Student action plan';document.metadata.Version=saved.version;document.sections=[{title:saved.payload.title,body:saved.payload.shareableSummary}]
 }else throw new AccessError('Choose a consent form, deadline sheet, action plan or outcome summary.',400)
 await pool.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'export.student_document',$2,$3,$4)",[auth.organisationId,auth.userId,key,{kind:body.kind,recordId:body.id||null,version:body.version||null}])
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({document}));return true
}
