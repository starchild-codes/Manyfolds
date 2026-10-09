-- Official-source pilot reviewed on 2026-10-04. Programme and exam cycles are
-- labelled explicitly; no future IIT or DU dates, fees, or scholarships are inferred.
alter table public.courses add column if not exists last_verified_at timestamptz;

update public.courses set
  verification_status='verified',
  publish_recommendation='source_linked_pilot',
  source_basis='IIT Delhi official undergraduate programme and JEE Advanced 2026 eligibility',
  source_url='https://curriculum.iitd.ac.in/view_program.php?program_code=CS1',
  last_verified_at='2026-10-04 00:00:00+05:30'
where course_id='course-bachelor-of-technology-in-computer-science-and-engineering';

update public.courses set
  verification_status='verified',
  publish_recommendation='source_linked_pilot',
  source_basis='NLSIU official five-year B.A., LL.B. (Hons.) programme and CLAT 2027',
  source_url='https://www.nls.ac.in/programme/ba-llb-hons/',
  last_verified_at='2026-10-04 00:00:00+05:30'
where course_id='course-bachelor-of-arts-and-bachelor-of-laws';

insert into public.courses(course_id,course_name,award_level,degree_family,field,category,route_type,typical_entry_stage,source_basis,source_url,verification_status,publish_recommendation,last_verified_at)
values('official-uod-ba-hons-psychology','B.A. (Hons.) Psychology','Undergraduate','BA','Psychology','Social Sciences','Degree','After Class 12','University of Delhi official 2026 undergraduate admissions FAQ','https://admission.uod.ac.in/userfiles/downloads/2026/17052026_Updated_FAQsUG%202026-final.pdf','verified','source_linked_pilot','2026-10-04 00:00:00+05:30')
on conflict(course_id) do update set source_url=excluded.source_url,verification_status=excluded.verification_status,last_verified_at=excluded.last_verified_at;

insert into public.career_course_links(course_id,career_id,relationship_type,confidence,verification_status)
values
  ('course-bachelor-of-technology-in-computer-science-and-engineering','nco-2512-0100','official_programme_route','high','verified'),
  ('course-bachelor-of-technology-in-computer-science-and-engineering','nco-2512-0201','official_programme_route','high','verified'),
  ('course-bachelor-of-arts-and-bachelor-of-laws','nco-2611-9900','official_programme_route','high','verified'),
  ('official-uod-ba-hons-psychology','nco-2634-0100','foundation_study_not_practice_qualification','moderate','verified')
on conflict do nothing;

insert into public.institutions(institution_id,institution_name,institution_type,state,country,official_website,source_name,source_url,source_vintage,verification_status,publish_recommendation,last_reviewed)
values
  ('official-iit-delhi','Indian Institute of Technology Delhi','Institute of Technology','Delhi','India','https://home.iitd.ac.in/','IIT Delhi','https://academics.iitd.ac.in/undergraduate/','2026','verified','source_linked_pilot','2026-10-04'),
  ('official-nlsiu-bengaluru','National Law School of India University','National Law University','Karnataka','India','https://www.nls.ac.in/','NLSIU','https://www.nls.ac.in/programme/ba-llb-hons/','2026','verified','source_linked_pilot','2026-10-04')
on conflict(institution_id) do update set
  official_website=excluded.official_website,
  source_name=excluded.source_name,
  source_url=excluded.source_url,
  source_vintage=excluded.source_vintage,
  verification_status=excluded.verification_status,
  last_reviewed=excluded.last_reviewed;

insert into public.institution_programmes
  (institution_id,course_id,programme_name,degree_level,duration,mode,verification_status,data_sufficient,last_verified_at,campus,official_programme_url,official_admissions_url,source_domain,source_date,verification_notes)
values
  ('official-iit-delhi','course-bachelor-of-technology-in-computer-science-and-engineering','B.Tech. in Computer Science and Engineering','Undergraduate','4 years','On campus','verified',true,'2026-10-04 00:00:00+05:30','New Delhi','https://curriculum.iitd.ac.in/view_program.php?program_code=CS1','https://academics.iitd.ac.in/ug-admissions/','iitd.ac.in','2026-10-04','Programme and 2026-27 entry route verified; later application dates and fees not verified.'),
  ('official-nlsiu-bengaluru','course-bachelor-of-arts-and-bachelor-of-laws','B.A., LL.B. (Hons.)','Integrated Undergraduate','5 years','On campus','verified',true,'2026-10-04 00:00:00+05:30','Bengaluru','https://www.nls.ac.in/programme/ba-llb-hons/','https://clat2027.consortiumofnlus.ac.in/clat-2027/','nls.ac.in','2026-10-04','Programme and CLAT 2027 entry route verified; tuition and scholarships not verified.')
on conflict(institution_id,programme_name) do update set
  course_id=excluded.course_id,
  verification_status=excluded.verification_status,
  data_sufficient=excluded.data_sufficient,
  last_verified_at=excluded.last_verified_at,
  official_programme_url=excluded.official_programme_url,
  official_admissions_url=excluded.official_admissions_url,
  verification_notes=excluded.verification_notes;

insert into public.institution_programme_sources(institution_programme_id,source_name,source_url,source_year,last_verified_at,status)
select p.id,source.name,source.url,source.year,'2026-10-04 00:00:00+05:30','verified'
from (values
  ('official-iit-delhi','B.Tech. in Computer Science and Engineering','IIT Delhi programme curriculum','https://curriculum.iitd.ac.in/view_program.php?program_code=CS1','2026'),
  ('official-nlsiu-bengaluru','B.A., LL.B. (Hons.)','NLSIU programme and eligibility','https://www.nls.ac.in/programme/ba-llb-hons/','2027')
) as source(institution_id,programme_name,name,url,year)
join public.institution_programmes p on p.institution_id=source.institution_id and p.programme_name=source.programme_name
where not exists (select 1 from public.institution_programme_sources existing where existing.institution_programme_id=p.id and existing.source_url=source.url);

insert into public.institution_programme_eligibility
  (institution_programme_id,required_subjects,minimum_percentage,exam_id,source_id,verification_status,admission_cycle,official_source,last_verified_at,category_specific_rules)
select p.id,eligibility.subjects,eligibility.minimum,eligibility.exam_id,s.id,'verified',eligibility.cycle,eligibility.url,'2026-10-04 00:00:00+05:30',eligibility.category_rules
from (values
  ('official-iit-delhi','B.Tech. in Computer Science and Engineering',array['Physics','Chemistry','Mathematics']::text[],null::numeric,'exam-jee-advanced','2026-27','https://jeeadv.ac.in/eligibility.html','{}'::jsonb,'https://curriculum.iitd.ac.in/view_program.php?program_code=CS1'),
  ('official-nlsiu-bengaluru','B.A., LL.B. (Hons.)',array[]::text[],45::numeric,'exam-clat','2027-28','https://www.nls.ac.in/programme/ba-llb-hons/','{"SC_ST_minimum_percentage":40,"PwD":"Confirm category threshold with NLSIU; official sources differ"}'::jsonb,'https://www.nls.ac.in/programme/ba-llb-hons/')
) as eligibility(institution_id,programme_name,subjects,minimum,exam_id,cycle,url,category_rules,programme_url)
join public.institution_programmes p on p.institution_id=eligibility.institution_id and p.programme_name=eligibility.programme_name
join public.institution_programme_sources s on s.institution_programme_id=p.id and s.source_url=eligibility.programme_url
where not exists (select 1 from public.institution_programme_eligibility existing where existing.institution_programme_id=p.id and existing.admission_cycle=eligibility.cycle);

insert into public.college_program_admission_routes
  (institution_programme_id,route_type,application_method,official_url,verification_status,direct_application_required,counselling_body,admission_cycle,last_verified_at)
select p.id,route.route_type,route.method,route.url,'verified',false,route.counselling_body,route.cycle,'2026-10-04 00:00:00+05:30'
from (values
  ('official-iit-delhi','B.Tech. in Computer Science and Engineering','JEE Advanced and JoSAA','JoSAA seat allocation','https://josaa.nic.in/','JoSAA','2026-27'),
  ('official-nlsiu-bengaluru','B.A., LL.B. (Hons.)','CLAT 2027','CLAT application and counselling','https://clat2027.consortiumofnlus.ac.in/clat-2027/ug-instructions.html','Consortium of NLUs','2027-28')
) as route(institution_id,programme_name,route_type,method,url,counselling_body,cycle)
join public.institution_programmes p on p.institution_id=route.institution_id and p.programme_name=route.programme_name
where not exists (select 1 from public.college_program_admission_routes existing where existing.institution_programme_id=p.id and existing.admission_cycle=route.cycle);

insert into public.college_program_application_cycles
  (admission_route_id,cycle_year,registration_open,registration_close,official_url,verification_status)
select route.id,'2027','2026-08-03','2026-10-31','https://clat2027.consortiumofnlus.ac.in/clat-2027/ug-instructions.html','verified'
from public.college_program_admission_routes route
join public.institution_programmes p on p.id=route.institution_programme_id
where p.institution_id='official-nlsiu-bengaluru' and route.admission_cycle='2027-28'
  and not exists (select 1 from public.college_program_application_cycles existing where existing.admission_route_id=route.id and existing.cycle_year='2027');

update public.exams set verification_status='verified',last_reviewed='2026-10-04',date_policy='Use examination_cycles for year-specific dates' where exam_id in ('exam-jee-advanced','exam-clat','exam-cuet-ug','exam-nid-dat');
update public.exams set official_url='https://clat2027.consortiumofnlus.ac.in/clat-2027/' where exam_id='exam-clat';
update public.exams set official_url='https://admissions.nid.edu/NIDA2027/Default.aspx' where exam_id='exam-nid-dat';
update public.exams set official_url='https://cuet.nta.nic.in/' where exam_id='exam-cuet-ug';

insert into public.exam_course_links(exam_id,course_id,relationship_type,verification_status)
values
  ('exam-jee-advanced','course-bachelor-of-technology-in-computer-science-and-engineering','official_admission_route','verified'),
  ('exam-clat','course-bachelor-of-arts-and-bachelor-of-laws','official_admission_route','verified'),
  ('exam-cuet-ug','official-uod-ba-hons-psychology','official_2026_admission_route','verified')
on conflict do nothing;

insert into public.examination_cycles
  (exam_id,cycle_year,registration_opening,registration_deadline,examination_date,official_source,verification_status,last_verified_at)
values
  ('exam-clat','2027','2026-08-03','2026-10-31','2026-12-06','https://clat2027.consortiumofnlus.ac.in/clat-2027/ug-instructions.html','verified','2026-10-04 00:00:00+05:30'),
  ('exam-nid-dat','2027',null,'2026-11-30',null,'https://admissions.nid.edu/NIDA2027/Default.aspx','verified','2026-10-04 00:00:00+05:30')
on conflict(exam_id,cycle_year) do update set
  registration_opening=excluded.registration_opening,
  registration_deadline=excluded.registration_deadline,
  examination_date=excluded.examination_date,
  official_source=excluded.official_source,
  verification_status=excluded.verification_status,
  last_verified_at=excluded.last_verified_at;
