import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {AccessError,assertStudentAccess,canGuide} from '../access.ts'
export async function caseSummaryRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(url.pathname!=='/student-case-summary')return false
 if(!canGuide(auth.role))throw new AccessError('Student guidance summaries are restricted to guidance staff.',403)
 if(req.method!=='GET')throw new AccessError('Method not allowed.',405)
 const key=url.searchParams.get('student')||'';await assertStudentAccess(pool,auth,key)
 const [last,actions,plans,diagnostic,roadmap]=await Promise.all([
  pool.query("select max(scheduled_at) happened_at from guidance_activities where organisation_id=$1 and student_key=$2 and kind='session' and status='completed'",[auth.organisationId,key]),
  pool.query("select id,kind,title,status,scheduled_at from guidance_activities where organisation_id=$1 and student_key=$2 and status not in('completed','cancelled') order by scheduled_at limit 5",[auth.organisationId,key]),
  pool.query("select count(*)::int count from school_student_planning where organisation_id=$1 and student_key=$2 and kind='plan' and payload->>'status'='active'",[auth.organisationId,key]),
  pool.query('select max(created_at) saved_at from student_diagnostic_history where organisation_id=$1 and student_key=$2',[auth.organisationId,key]),
  pool.query('select status,updated_at from roadmap_generations where organisation_id=$1 and student_external_id=$2 order by generated_at desc limit 1',[auth.organisationId,key])
 ])
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({lastInteraction:last.rows[0].happened_at,openActivities:actions.rows,activePlans:plans.rows[0].count,diagnosticSavedAt:diagnostic.rows[0].saved_at,roadmap:roadmap.rows[0]||null}));return true
}
