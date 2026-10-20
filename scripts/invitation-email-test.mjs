import assert from 'node:assert/strict'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {loadEnv} from 'vite'
import {deliverInvitation,mailReadiness} from '../server/school/email.ts'
const local=loadEnv('development',process.cwd(),''),pool=new Pool({connectionString:local.DATABASE_URL,ssl:{rejectUnauthorized:false},max:2}),org=randomUUID(),user=randomUUID(),other=randomUUID(),invitations=[]
const env={MANYFOLDS_EMAIL_ENABLED:'true',SMTP_HOST:'mock.invalid',SMTP_PORT:'587',SMTP_USER:'mock',SMTP_PASS:'mock',SMTP_FROM:'staff@example.invalid',MANYFOLDS_SITE_URL:'https://manyfolds.example.invalid'},auth={userId:user,organisationId:org,role:'owner'}
try{
 await pool.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@example.invalid`]);for(const id of [org,other])await pool.query('insert into organisations(id,name,slug) values($1,$2,$3)',[id,'Synthetic email school',`email-${id}`]);await pool.query("insert into organisation_memberships(organisation_id,user_id,role) values($1,$2,'owner')",[org,user])
 const invite=async()=>{const id=randomUUID(),token=randomBytes(32).toString('hex');invitations.push(id);await pool.query("insert into school_staff_invitations(id,organisation_id,email,role,token_hash,created_by,expires_at) values($1,$2,'synthetic-recipient@example.invalid','counsellor',$3,$4,now()+interval '7 days')",[id,org,createHash('sha256').update(token).digest('hex'),user]);return{invitationId:id,token}}
 const body=await invite(),messages=[],sender=async(_env,message)=>{messages.push(message);return 'synthetic-message-id'}
 assert.equal(mailReadiness({}).ready,false)
 await assert.rejects(deliverInvitation(pool,auth,body,{},sender),e=>e.statusCode===503);assert.equal(messages.length,0)
 await assert.rejects(deliverInvitation(pool,{...auth,role:'counsellor'},body,env,sender),e=>e.statusCode===403)
 await assert.rejects(deliverInvitation(pool,{...auth,organisationId:other},body,env,sender),e=>e.statusCode===404)
 assert.equal((await deliverInvitation(pool,auth,body,env,sender)).status,'sent');assert.equal(messages.length,1);assert.ok(messages[0].text.includes(`/invite/${body.token}`));assert.ok(messages[0].html.includes('Synthetic email school'))
 assert.equal((await deliverInvitation(pool,auth,body,env,sender)).reused,true);assert.equal(messages.length,1)
 const ledger=(await pool.query('select * from school_email_delivery where invitation_id=$1',[body.invitationId])).rows[0];assert.equal(ledger.status,'sent');assert.ok(!JSON.stringify(ledger).includes(body.token))
 const failed=await invite();await assert.rejects(deliverInvitation(pool,auth,failed,env,async()=>{throw Object.assign(Error('Fake auth failure'),{code:'EAUTH'})}),e=>e.statusCode===502);assert.equal((await pool.query('select status from school_email_delivery where invitation_id=$1',[failed.invitationId])).rows[0].status,'failed');assert.equal((await deliverInvitation(pool,auth,failed,env,sender)).status,'sent')
 const uncertain=await invite();await assert.rejects(deliverInvitation(pool,auth,uncertain,env,async()=>{throw Object.assign(Error('Fake socket loss'),{code:'ETIMEDOUT'})}),e=>e.statusCode===502);await assert.rejects(deliverInvitation(pool,auth,uncertain,env,sender),e=>e.statusCode===409)
 assert.ok(!(await pool.query('select metadata from school_audit_events where organisation_id=$1',[org])).rows.some(r=>JSON.stringify(r).includes(body.token)))
 console.log('Invitation email passed: sender activation gate, role/school boundaries, exact invitation recipient, sent replay deduplication, no token stored, safe failed retry and uncertain-delivery resend block. Mock transport only; no emails sent.')
}finally{
 await pool.query('delete from school_email_delivery where organisation_id=$1',[org]);await pool.query('delete from school_staff_invitations where id=any($1::uuid[])',[invitations]);for(const id of [org,other]){await pool.query('delete from school_audit_events where organisation_id=$1',[id]);await pool.query('delete from organisation_memberships where organisation_id=$1',[id]);await pool.query('delete from organisations where id=$1',[id])}await pool.query('delete from auth.users where id=$1',[user]);await pool.end()
}
