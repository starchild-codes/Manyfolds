import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Client} from 'pg'
import {loadEnv} from 'vite'
import {assertStudentAccess,assertAreaAccess} from '../server/access.ts'
const env=loadEnv('development',process.cwd(),''),db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
await db.connect()
try{
 await db.query('begin')
 const sql=(await readFile('supabase/migrations/20261020_staff_access.sql','utf8')).replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'')
 await db.query(sql)
 const orgs=(await db.query("select distinct organisation_id from organisation_memberships where active and role='owner' limit 2")).rows;assert.equal(orgs.length,2)
 const org=orgs[0].organisation_id,other=orgs[1].organisation_id,users={}
 for(const role of ['counsellor','guidance_teacher','teacher','lead_counsellor','data_entry','reviewer']){
  const id=randomUUID();users[role]=id;await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@example.invalid`]);await db.query('delete from organisation_memberships where user_id=$1',[id]);await db.query('insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,$3)',[org,id,role])
 }
 const a=randomUUID(),b=randomUUID(),c=randomUUID()
 for(const [key,school,assigned] of [[a,org,users.counsellor],[b,org,''],[c,other,'']])await db.query('insert into student_registry_records(organisation_id,external_key,payload) values($1,$2,$3)',[school,key,{id:key,name:'Synthetic scoped fixture',grade:'10 A',counsellorId:assigned}])
 const auth=role=>({userId:users[role],organisationId:org,role})
 await assertStudentAccess(db,auth('counsellor'),a)
 await assert.rejects(assertStudentAccess(db,auth('counsellor'),b),e=>e.statusCode===404)
 await assert.rejects(assertStudentAccess(db,auth('counsellor'),c),e=>e.statusCode===404)
 await assertStudentAccess(db,auth('lead_counsellor'),b)
 await assertStudentAccess(db,auth('data_entry'),b)
 await assert.rejects(assertStudentAccess(db,auth('reviewer'),a),e=>e.statusCode===404)
 assert.throws(()=>assertAreaAccess(auth('data_entry'),'operations','/private-notes','GET'))
 assert.throws(()=>assertAreaAccess(auth('teacher'),'ai','/latest','GET'))
 assert.throws(()=>assertAreaAccess(auth('reviewer'),'students','/','GET'))
 assert.doesNotThrow(()=>assertAreaAccess(auth('reviewer'),'operations','/analytics','GET'))
 await db.query('insert into school_student_assignments(organisation_id,student_key,staff_id,assigned_by,reason) values($1,$2,$3,$4,$5)',[org,b,users.teacher,users.lead_counsellor,'Synthetic assignment'])
 await assertStudentAccess(db,auth('teacher'),b)
 const observationId=randomUUID();await db.query('insert into school_teacher_observations(id,organisation_id,student_key,author_id,observation) values($1,$2,$3,$4,$5)',[observationId,org,b,users.teacher,'Synthetic RLS observation']);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[users.teacher]);await db.query('set local role authenticated');assert.equal((await db.query('select external_key from student_registry_records where organisation_id=$1',[org])).rowCount,0,'Limited staff use the basic API projection rather than the full registry JSON');assert.equal((await db.query('select id from school_teacher_observations where id=$1',[observationId])).rowCount,1);await db.query('reset role')
 await db.query("update school_student_assignments set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where organisation_id=$1 and student_key=$2",[org,b])
 await assert.rejects(assertStudentAccess(db,auth('teacher'),b),e=>e.statusCode===404)
 await db.query('update organisations set allow_unassigned_guidance=true where id=$1',[org]);await assertStudentAccess(db,auth('guidance_teacher'),b)
 await db.query('update organisations set allow_unassigned_guidance=false where id=$1',[org])
 // Exercise restrictive RLS under an authenticated database role, not only the API helper.
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[users.counsellor]);await db.query('set local role authenticated')
 assert.deepEqual((await db.query('select external_key from student_registry_records where organisation_id=$1 and external_key=any($2::text[]) order by external_key',[org,[a,b]])).rows.map(r=>r.external_key),[a])
 assert.equal((await db.query('select school_can_access_student($1,$2,$3) allowed',[org,b,users.lead_counsellor])).rows[0].allowed,false,'An authenticated user cannot impersonate another staff member in the scope function')
 await db.query('reset role')
 await db.query('update organisations set active=false where id=$1',[org]);await assert.rejects(assertStudentAccess(db,auth('counsellor'),a),e=>e.statusCode===404)
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[users.lead_counsellor]);await db.query('set local role authenticated');assert.equal((await db.query('select count(*)::int n from student_registry_records where organisation_id=$1',[org])).rows[0].n,0,'Suspension must also close direct RLS reads for managers');await db.query('reset role')
 console.log('Staff access passed: role entry gates, assigned and unassigned caseloads, temporary expiry, school isolation, suspension, restrictive RLS and impersonation denial. All fixture and migration changes rolled back.')
}finally{await db.query('rollback').catch(()=>{});await db.end()}
