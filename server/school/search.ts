import type {IncomingMessage,ServerResponse} from 'node:http'
import type {Pool} from 'pg'
import type {AuthContext} from '../ai/types.ts'
import {AccessError,canGuide} from '../access.ts'
import {readDatabase} from '../database.ts'
export type SearchResult={id:string;kind:string;title:string;context:string;href:string}
export async function searchRequest(req:IncomingMessage,res:ServerResponse,pool:Pool,auth:AuthContext,url:URL){
 if(url.pathname!=='/search')return false
 if(!canGuide(auth.role)||req.method!=='GET')throw new AccessError('Search is limited to authorised guidance staff.',403)
 const q=(url.searchParams.get('q')||'').trim();if(q.length<2||q.length>120)throw new AccessError('Enter 2–120 characters to search.',400)
 const org=auth.organisationId,user=auth.userId
 const [students,activities,interventions,resources,staff,claims,careers]=await Promise.all([
  readDatabase(pool,`select external_key id,payload->>'name' title,payload->>'grade' context from student_registry_records where organisation_id=$1 and archived_at is null and public.school_can_access_student(organisation_id,external_key,$2) and position(lower($3) in lower(concat(payload->>'name',' ',payload->>'grade',' ',external_key)))>0 order by payload->>'name' limit 10`,[org,user,q]),
  readDatabase(pool,`select id,student_key,kind,title,to_char(scheduled_at,'YYYY-MM-DD') context from guidance_activities where organisation_id=$1 and public.school_can_access_student(organisation_id,student_key,$2) and position(lower($3) in lower(title))>0 order by scheduled_at desc limit 15`,[org,user,q]),
  readDatabase(pool,`select id,title,to_char(scheduled_at,'YYYY-MM-DD') context from school_interventions where organisation_id=$1 and public.school_can_access_intervention(organisation_id,id,$2) and position(lower($3) in lower(title))>0 order by scheduled_at desc limit 10`,[org,user,q]),
  readDatabase(pool,'select id,title,resource_type context from school_resources where organisation_id=$1 and position(lower($2) in lower(title))>0 order by title limit 10',[org,q]),
  readDatabase(pool,"select m.user_id id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email) title,m.role context from organisation_memberships m join auth.users u on u.id=m.user_id where m.organisation_id=$1 and m.active and position(lower($2) in lower(coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email)))>0 limit 10",[org,q]),
  readDatabase(pool,`select distinct c.entity_type kind,c.entity_id id,c.claim_value#>>'{}' title,c.publisher context from catalogue_claims c join (
   select 'course' kind,course_id id,course_name name from courses where verification_status='verified' and source_url~*'^https?://' and last_verified_at is not null
   union all select 'exam',exam_id,exam_name from exams where verification_status='verified' and official_url~*'^https?://' and last_reviewed is not null
   union all select 'scholarship',scholarship_id,scholarship_name from scholarships where verification_status in('verified','verified_listing') and official_url~*'^https?://' and last_reviewed is not null
   union all select 'institution',institution_id,institution_name from institutions where verification_status='verified' and source_url~*'^https?://' and last_reviewed is not null
   ) e on e.kind=c.entity_type and e.id=c.entity_id and c.claim_value=to_jsonb(e.name) where c.field_name='name' and c.verification_status='verified' and (c.expires_at is null or c.expires_at>=(now() at time zone 'Asia/Kolkata')::date) and jsonb_typeof(c.claim_value)='string' and position(lower($1) in lower(c.claim_value#>>'{}'))>0 order by title limit 20`,[q]),
  readDatabase(pool,"select career_id id,title,division_title context from careers where verification_status in('verified','official_taxonomy_title') and position(lower($1) in lower(title))>0 order by title limit 10",[q])
 ])
 const href=(view:string,student?:string,title?:string)=>`?view=${view}${student?`&student=${encodeURIComponent(student)}`:''}${title?`&q=${encodeURIComponent(title)}`:''}`,records:SearchResult[]=[]
 for(const r of students.rows)records.push({...r,kind:'student',href:href('students',r.id,r.title)})
 for(const r of activities.rows)records.push({id:r.id,kind:r.kind,title:r.title,context:r.context,href:href(r.kind==='session'?'sessions':'followups',r.student_key,r.title)})
 for(const r of interventions.rows)records.push({...r,kind:'intervention',href:href('interventions',undefined,r.title)})
 for(const r of resources.rows)records.push({...r,kind:'resource',href:href('resources',undefined,r.title)})
 for(const r of staff.rows)records.push({...r,kind:'staff',href:href(['owner','admin'].includes(auth.role)?'administration':'sessions')})
 const views:Record<string,string>={course:'courses',exam:'exams',scholarship:'scholarships',institution:'institutions'}
 for(const r of claims.rows)records.push({...r,href:href(views[r.kind],undefined,r.title)})
 for(const r of careers.rows)records.push({...r,kind:'career',href:href('careers',undefined,r.title)})
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({records,query:q,limitPerCategory:20}));return true
}
