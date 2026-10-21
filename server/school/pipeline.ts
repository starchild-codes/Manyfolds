import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool,PoolClient} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {AccessError,assertStudentAccess,canGuide,canCounsel} from '../access.ts'
import {checkedDatabaseClient,readDatabase} from '../database.ts'
import {pipelineStages,pipelineStage,isPipelineStage,stageLabel,pipelineRequirement,suggestedPipelineStage,type PipelineFacts} from './pipelineModel.ts'
const send=(res:ServerResponse,value:unknown)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value))}
async function read(req:IncomingMessage){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>50000)throw new AccessError('Use a batch of at most 100 students.',413)}try{const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body as Record<string,unknown>}catch{throw new AccessError('Provide a valid pipeline request.',400)}}
async function facts(db:Pool|PoolClient,org:string,keys:string[]){
 const result=await db.query(`select s.external_key,
  (select details from student_guidance_profiles where organisation_id=s.organisation_id and student_key=s.external_key) profile,
  exists(select 1 from guidance_activities where organisation_id=s.organisation_id and student_key=s.external_key and kind='session' and status='completed') completed_session,
  exists(select 1 from school_student_planning where organisation_id=s.organisation_id and student_key=s.external_key and kind='pathway' and payload->>'status'='active') active_pathway,
  exists(select 1 from school_student_planning where organisation_id=s.organisation_id and student_key=s.external_key and kind='plan' and payload->>'status'='active') active_plan,
  (exists(select 1 from guidance_activities where organisation_id=s.organisation_id and student_key=s.external_key and kind='task' and status<>'cancelled' and task_details->>'category'='Examination registration') or exists(select 1 from school_student_planning where organisation_id=s.organisation_id and student_key=s.external_key and kind='outcome' and payload->>'status'<>'archived' and payload->>'type'='Course application')) application_activity,
  exists(select 1 from school_student_planning where organisation_id=s.organisation_id and student_key=s.external_key and kind='outcome' and payload->>'status'<>'archived') outcome
  from student_registry_records s where s.organisation_id=$1 and s.external_key=any($2::text[])`,[org,keys])
 return new Map<string,PipelineFacts>(result.rows.map(r=>{const has=(v:unknown)=>Array.isArray(v)?v.length>0:!!v&&typeof v==='object'&&Object.values(v).some(Boolean);return[r.external_key,{profileAreas:['academics','interests','skills','constraints'].filter(k=>has(r.profile?.[k])).length,completedSession:r.completed_session,activePathway:r.active_pathway,activePlan:r.active_plan,applicationActivity:r.application_activity,outcome:r.outcome}]}))
}
export async function pipelineRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(!['/pipeline','/pipeline-labels','/pipeline-history'].includes(url.pathname))return false
 if(!canGuide(auth.role))throw new AccessError('The pipeline is limited to authorised guidance staff.',403)
 const org=auth.organisationId
 if(req.method==='GET'){
  if(url.pathname==='/pipeline-history'){
   const key=url.searchParams.get('student')||'';await assertStudentAccess(pool,auth,key)
   const result=await readDatabase(pool,"select h.id,h.from_stage,h.to_stage,h.from_key,h.to_key,h.reason,h.manual_override,h.recorded_at,h.registry_version,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),'School staff') actor_name from school_pipeline_history h left join auth.users u on u.id::text=h.actor_id where h.organisation_id=$1 and h.student_key=$2 order by h.id desc limit 100",[org,key]);send(res,{records:result.rows});return true
  }
  const config=(await readDatabase(pool,'select labels,version from school_pipeline_configuration where organisation_id=$1',[org])).rows[0]||{labels:{},version:0}
  if(url.pathname==='/pipeline-labels'){send(res,{configuration:config,canConfigure:['owner','admin'].includes(auth.role)});return true}
  const records=await readDatabase(pool,'select payload,version,archived_at from student_registry_records where organisation_id=$1 and public.school_can_access_student(organisation_id,external_key,$2) and (archived_at is null or $3) order by external_key limit 5001',[org,auth.userId,url.searchParams.get('archived')==='true'])
  if(records.rows.length>5000)throw new AccessError('The pipeline supports up to 5000 records. Contact support for a larger cohort.',413)
  const recorded=await facts(pool,org,records.rows.map(r=>r.payload.id))
  send(res,{configuration:config,canConfigure:['owner','admin'].includes(auth.role),canOverride:canCounsel(auth.role),records:records.rows.map(r=>{const current=pipelineStage(r.payload,!!r.archived_at),f=recorded.get(r.payload.id)!;return{...r.payload,version:Number(r.version),archivedAt:r.archived_at,currentStage:current,suggestion:suggestedPipelineStage(current,f),facts:f}})});return true
 }
 if(req.method!=='PUT'||url.pathname==='/pipeline-history')throw new AccessError('Method not allowed.',405)
 const body=await read(req),db=await checkedDatabaseClient(pool)
 try{await db.query('begin')
  if(url.pathname==='/pipeline-labels'){
   if(!['owner','admin'].includes(auth.role))throw new AccessError('Only school owners and admins can rename pipeline labels.',403)
   if(!Number.isSafeInteger(body.version)||Number(body.version)<0||!body.labels||typeof body.labels!=='object'||Array.isArray(body.labels))throw new AccessError('Provide the current label version and all stage labels.',400)
   const input=body.labels as Record<string,unknown>,labels:Record<string,string>={}
   if(Object.keys(input).length!==pipelineStages.length)throw new AccessError('Keep all fourteen underlying stages.',400)
   for(const [key] of pipelineStages){const value=input[key];if(typeof value!=='string'||!value.trim()||value.length>80||Array.from(value).some(c=>c.charCodeAt(0)<32))throw new AccessError('Each stage needs a label of up to 80 characters.',400);labels[key]=value.trim()}
   if(new Set(Object.values(labels).map(v=>v.toLowerCase())).size!==pipelineStages.length)throw new AccessError('Stage labels must be different.',400)
   const result=body.version===0?await db.query('insert into school_pipeline_configuration(organisation_id,labels,updated_by) values($1,$2,$3) on conflict do nothing returning labels,version',[org,labels,auth.userId]):await db.query('update school_pipeline_configuration set labels=$2,version=version+1,updated_by=$3,updated_at=now() where organisation_id=$1 and version=$4 returning labels,version',[org,labels,auth.userId,body.version])
   if(!result.rowCount)throw new AccessError('Pipeline labels changed elsewhere. Reload before saving.',409)
   await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,metadata) values($1,'pipeline.labels_changed',$2,$3)",[org,auth.userId,{version:result.rows[0].version}]);await db.query('commit');send(res,{configuration:result.rows[0]});return true
  }
  if(!isPipelineStage(body.stage)||body.stage==='archived')throw new AccessError('Choose an active pipeline stage. Use the registry archive/restore workflow for archived records.',400)
  if(typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>1000)throw new AccessError('Record a reason of 5 to 1000 characters for this transition.',400)
  if(body.override!==undefined&&typeof body.override!=='boolean')throw new AccessError('Choose whether this is a manual override.',400)
  if(body.override===true&&!canCounsel(auth.role))throw new AccessError('Ask a counsellor to review a manual override.',403)
  const selections=body.records
  if(!Array.isArray(selections)||!selections.length||selections.length>100||selections.some(r=>!r||typeof r.id!=='string'||r.id.length>120||!r.id||!Number.isSafeInteger(r.version)||r.version<1)||new Set(selections.map(r=>r.id)).size!==selections.length)throw new AccessError('Select up to 100 distinct students and their saved versions.',400)
  const keys=selections.map(r=>r.id).sort()
  const result=await db.query('select external_key,payload,version,archived_at from student_registry_records where organisation_id=$1 and external_key=any($2::text[]) order by external_key for update',[org,keys])
  if(result.rows.length!==keys.length)throw new AccessError()
  const recorded=await facts(db,org,keys)
  for(const row of result.rows){await assertStudentAccess(db,auth,row.external_key);if(row.archived_at)throw new AccessError('Restore archived students before moving stages.',409);if(Number(row.version)!==selections.find(s=>s.id===row.external_key).version)throw new AccessError('A selected student changed. Reload and review the batch before retrying.',409);const requirement=pipelineRequirement(body.stage,recorded.get(row.external_key)!);if(requirement&&!body.override)throw new AccessError(`${row.payload.name}: ${requirement} A counsellor can record an explicit manual override.`,409)}
  await db.query("select set_config('manyfolds.pipeline_reason',$1,true),set_config('manyfolds.pipeline_override',$2,true)",[body.reason.trim(),String(body.override===true)])
  const updated=[]
  for(const row of result.rows){if(pipelineStage(row.payload)===body.stage)continue;const saved=await db.query("update student_registry_records set payload=payload||$3::jsonb,version=version+1,updated_by=$4,updated_at=now() where organisation_id=$1 and external_key=$2 returning payload,version",[org,row.external_key,{pipelineStage:body.stage,stage:stageLabel(body.stage)},auth.userId]);updated.push(saved.rows[0]);await db.query("insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values($1,'pipeline.stage_changed',$2,$3,$4)",[org,auth.userId,row.external_key,{from:pipelineStage(row.payload),to:body.stage,manualOverride:body.override===true,reason:body.reason.trim()}])}
  await db.query('commit');send(res,{changed:updated.length});return true
 }catch(e){try{await db.query('rollback')}catch{/* Preserve the original failure. */}throw e}finally{db.release()}
}
