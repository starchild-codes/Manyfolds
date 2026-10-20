import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {loadEnv} from 'vite'
import {Client} from 'pg'
import {RoadmapService} from '../server/ai/service.ts'
import {createAiConfig} from '../server/ai/config.ts'
import {roadmapSourceState} from '../server/ai/sourceState.ts'
import {diagnosticProfileHash} from '../server/ai/profileState.ts'
import {approvedRoadmapHtml} from '../src/roadmapDocument.ts'
const env={...loadEnv('development',process.cwd(),''),...process.env},config=createAiConfig(env)
const db=new Client({connectionString:config.databaseUrl,ssl:{rejectUnauthorized:false}})
const {evidence,roadmap}=JSON.parse(await readFile(new URL('./fixtures/roadmap-review.json',import.meta.url),'utf8'))
await db.connect()
try{
 const members=(await db.query("select user_id,organisation_id,role from organisation_memberships where active and role='owner'")).rows
 const owner=members[0],other=members.find(row=>row.organisation_id!==owner.organisation_id)
 assert.ok(owner&&other)
 const auth={userId:owner.user_id,organisationId:owner.organisation_id,role:'owner'},service=new RoadmapService(db,config),snapshot=randomUUID(),id=randomUUID(),key=randomUUID()
 await db.query('begin')
 await db.query('insert into student_registry_records(organisation_id,external_key,payload) values($1,$2,$3)',[auth.organisationId,key,{id:key,name:'Synthetic export student',grade:'12 A'}])
 await db.query('insert into roadmap_evidence_snapshots(id,organisation_id,student_external_id,evidence_hash,evidence,input_token_estimate) values($1,$2,$3,$4,$5,100)',[snapshot,auth.organisationId,key,key,evidence])
 await db.query('update roadmap_evidence_snapshots set source_state_hash=$2 where id=$1',[snapshot,await roadmapSourceState(db,evidence)])
 await db.query("insert into roadmap_generations(id,organisation_id,student_external_id,counsellor_id,evidence_snapshot_id,generation_hash,prompt_version,engine_version,roadmap,model_generated_notice,schema_valid,factual_validation_valid) values($1,$2,$3,$4,$5,$3,'test','test',$6,'Synthetic test fixture',true,true)",[id,auth.organisationId,key,auth.userId,snapshot,roadmap])
 const fails=async(role,payload,status,organisationId=auth.organisationId)=>assert.rejects(service.update({...auth,role,organisationId},id,payload),error=>error.statusCode===status)
 await fails('teacher',{expectedVersion:1,status:'reviewed'},403)
 await fails('viewer',{expectedVersion:1,status:'reviewed'},403)
 await fails('owner',{expectedVersion:1,status:'reviewed'},404,other.organisation_id)
 await fails('owner',{status:'reviewed'},409)
 await fails('owner',{expectedVersion:1,status:'approved'},409)
 await fails('owner',{expectedVersion:1,status:'published'},409)
 await assert.rejects(service.exportApproved(auth,id,1),error=>error.statusCode===409)
 await assert.rejects(service.exportApproved({...auth,role:'teacher'},id,1),error=>error.statusCode===403)
 await assert.rejects(service.exportApproved({...auth,organisationId:other.organisation_id},id,1),error=>error.statusCode===404)
 // A source change after generation blocks review, even when the saved JSON is
 // still internally valid. No real catalogue fact is changed by this fixture.
 const claimKey=`test-source-change:${key}`
 await db.query(`insert into catalogue_claims(claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,document_title,checked_at,reviewer,review_method,evidence_locator,verification_status)
 values($1,'career','c1','test','"Synthetic changed fact"'::jsonb,'https://official.example/career','Test','Test',now(),'Test','source_audit','Test','stale')`,[claimKey])
 await fails('owner',{expectedVersion:1,status:'reviewed'},422)
 await db.query('delete from catalogue_claims where claim_key=$1',[claimKey])
 const reviewed=await service.update(auth,id,{expectedVersion:1,status:'reviewed',counsellorNotes:'Saved internal review'})
 assert.equal(reviewed.status,'reviewed');assert.equal(reviewed.version,2);assert.equal(reviewed.counsellorNotes,'Saved internal review')
 await fails('owner',{expectedVersion:1,status:'approved'},409)
 const approved=await service.update(auth,id,{expectedVersion:2,status:'approved'});assert.equal(approved.version,3)
 const published=await service.update(auth,id,{expectedVersion:3,status:'published'});assert.equal(published.status,'published')
 const exported=await service.exportApproved(auth,id,4)
 assert.equal(exported.studentName,'Synthetic export student')
 assert.equal(exported.version,4)
 const baseline=randomUUID(),latest=randomUUID(),originalProfile={grade:'Class 12',subjects:{Psychology:'like'}}
 assert.equal(diagnosticProfileHash(originalProfile),diagnosticProfileHash({subjects:{Psychology:'like'},grade:'Class 12'}))
 await db.query('update roadmap_evidence_snapshots set diagnostic_profile_hash=$2 where id=$1',[snapshot,diagnosticProfileHash(originalProfile)])
 await db.query(`insert into student_diagnostic_history(id,organisation_id,student_key,revision,profile,step,status,created_by,created_at) values($1,$2,$3,1,$4,6,'ready',$5,now()-interval '1 minute'),($6,$2,$3,2,$4,6,'review_requested',$5,now()+interval '1 minute')`,[baseline,auth.organisationId,key,originalProfile,auth.userId,latest])
 assert.equal((await service.latest(auth,key)).profileCurrent,true,'Changing diagnostic review status without changing answers must not stale the roadmap')
 await db.query('update student_diagnostic_history set profile=$2 where id=$1',[latest,{...originalProfile,subjects:{Psychology:'dislike'}}])
 assert.equal((await service.latest(auth,key)).profileCurrent,false)
 await assert.rejects(service.exportApproved(auth,id,4),error=>error.statusCode===422)
 await fails('owner',{expectedVersion:4,status:'published'},422)
 await db.query('update student_diagnostic_history set profile=$2 where id=$1',[latest,originalProfile])
 assert.ok(!JSON.stringify(exported).includes('Saved internal review'),'Private review notes must not enter the shareable export DTO')
 const html=approvedRoadmapHtml({...exported,studentName:'<img src=x onerror=alert(1)>',counsellorNotes:'PRIVATE-NOTE-EXCLUDED',sources:[...exported.sources,{record_id:'unsafe',source_url:'javascript:alert(1)',name:'bad'}]})
 assert.ok(html.includes('STUDENT / PARENT SHAREABLE'));assert.ok(html.includes('Print / Save as PDF'));assert.ok(html.includes('&lt;img'))
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('PRIVATE-NOTE-EXCLUDED'));assert.ok(!html.includes('javascript:'))
 assert.equal((await db.query("select count(*)::int count from school_audit_events where organisation_id=$1 and subject_key=$2 and event_type='export.approved_ai_roadmap'",[auth.organisationId,key])).rows[0].count,1)
 await assert.rejects(service.exportApproved(auth,id,3),error=>error.statusCode===409)
 await db.query('update student_registry_records set archived_at=now() where organisation_id=$1 and external_key=$2',[auth.organisationId,key])
 await assert.rejects(service.exportApproved(auth,id,4),error=>error.statusCode===404)
 await db.query('update student_registry_records set archived_at=null where organisation_id=$1 and external_key=$2',[auth.organisationId,key])
 assert.equal((await service.latest({...auth,role:'teacher'},key)).counsellorNotes,undefined)
 await fails('owner',{expectedVersion:4,status:'published',roadmap},409)
 const changed=await service.update(auth,id,{expectedVersion:4,status:'draft',roadmap:{...roadmap,roadmap_title:'Revised counsellor draft'}})
 assert.equal(changed.status,'draft');assert.equal(changed.version,5)
 const timestamps=(await db.query('select approved_at,reviewed_at from roadmap_generations where id=$1',[id])).rows[0];assert.equal(timestamps.approved_at,null);assert.equal(timestamps.reviewed_at,null)
 await db.query('update roadmap_generations set factual_validation_valid=false where id=$1',[id])
 await fails('owner',{expectedVersion:5,status:'reviewed'},422)
 await db.query("update roadmap_generations set roadmap=jsonb_set(roadmap,'{career_id}','\"not-in-evidence\"'::jsonb) where id=$1",[id])
 await assert.rejects(service.latest(auth,key),error=>error.statusCode===422,'A saved draft that fails verification must be identified as withheld, not reported as never generated')
 console.log('Roadmap lifecycle passed: role/school denial, atomic versions, review/approval/publication gates, private review notes, edit reset and invalid-evidence rejection. Fixture transaction rolled back; no AI call was made.')
}finally{await db.query('rollback').catch(()=>{});await db.end()}
