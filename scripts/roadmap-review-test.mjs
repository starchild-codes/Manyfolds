import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {loadEnv} from 'vite'
import {Client} from 'pg'
import {RoadmapService} from '../server/ai/service.ts'
import {createAiConfig} from '../server/ai/config.ts'
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
 await db.query('insert into roadmap_evidence_snapshots(id,organisation_id,student_external_id,evidence_hash,evidence,input_token_estimate) values($1,$2,$3,$4,$5,100)',[snapshot,auth.organisationId,key,key,evidence])
 await db.query("insert into roadmap_generations(id,organisation_id,student_external_id,counsellor_id,evidence_snapshot_id,generation_hash,prompt_version,engine_version,roadmap,model_generated_notice,schema_valid,factual_validation_valid) values($1,$2,$3,$4,$5,$3,'test','test',$6,'Synthetic test fixture',true,true)",[id,auth.organisationId,key,auth.userId,snapshot,roadmap])
 const fails=async(role,payload,status,organisationId=auth.organisationId)=>assert.rejects(service.update({...auth,role,organisationId},id,payload),error=>error.statusCode===status)
 await fails('teacher',{expectedVersion:1,status:'reviewed'},403)
 await fails('viewer',{expectedVersion:1,status:'reviewed'},403)
 await fails('owner',{expectedVersion:1,status:'reviewed'},404,other.organisation_id)
 await fails('owner',{status:'reviewed'},409)
 await fails('owner',{expectedVersion:1,status:'approved'},409)
 await fails('owner',{expectedVersion:1,status:'published'},409)
 const reviewed=await service.update(auth,id,{expectedVersion:1,status:'reviewed',counsellorNotes:'Saved internal review'})
 assert.equal(reviewed.status,'reviewed');assert.equal(reviewed.version,2);assert.equal(reviewed.counsellorNotes,'Saved internal review')
 await fails('owner',{expectedVersion:1,status:'approved'},409)
 const approved=await service.update(auth,id,{expectedVersion:2,status:'approved'});assert.equal(approved.version,3)
 const published=await service.update(auth,id,{expectedVersion:3,status:'published'});assert.equal(published.status,'published')
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
