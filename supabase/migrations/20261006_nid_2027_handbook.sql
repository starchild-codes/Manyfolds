-- NID 2027-28 handbook, published 10 September 2026. Cycle-specific facts
-- are separate claims, and unannounced DAT Mains/admission dates remain null.
insert into public.catalogue_source_monitors
  (monitor_key,source_url,source_kind,entity_scope,check_interval_hours,next_check_at)
values ('nid-2027-integrated-handbook',
        'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf',
        'pdf','programme_eligibility',24,now())
on conflict(monitor_key) do nothing;

insert into public.institution_programme_sources
  (institution_programme_id,source_name,source_url,source_year,last_verified_at,status)
select p.id,'NID 2027-28 integrated pathway admissions handbook',
       'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf',
       '2027',now(),'verified'
from public.institution_programmes p
where p.institution_id='official-nid'
  and p.programme_name='5.5 Year Professional Education Master of Design (Integrated Pathway)'
  and not exists(select 1 from public.institution_programme_sources s
    where s.institution_programme_id=p.id
      and s.source_url='https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf');

insert into public.institution_programme_eligibility
  (institution_programme_id,required_subjects,minimum_percentage,exam_id,source_id,
   verification_status,admission_cycle,official_source,last_verified_at,category_specific_rules)
select p.id,array[]::text[],null::numeric,'exam-nid-dat',s.id,'verified','2027-28',
       s.source_url,now(),
       '{"class12":"Passed or appearing in recognised 10+2 or equivalent; any stream; see handbook Section 5 for result and equivalence conditions", "age_general_ews_born_on_or_after":"2006-07-01", "age_obc_sc_st_born_on_or_after":"2003-07-01", "age_pwd_born_on_or_after":"2001-07-01", "age_overseas_born_on_or_after":"2006-07-01"}'::jsonb
from public.institution_programmes p
join public.institution_programme_sources s on s.institution_programme_id=p.id
  and s.source_url='https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf'
where p.institution_id='official-nid'
  and not exists(select 1 from public.institution_programme_eligibility e
    where e.institution_programme_id=p.id and e.admission_cycle='2027-28');

update public.institution_programmes set data_sufficient=true,
  verification_notes='Offering, 2027-28 handbook eligibility and DAT application route checked. Personal category, result and document conditions still require individual review; tuition is not verified.'
where institution_id='official-nid'
  and programme_name='5.5 Year Professional Education Master of Design (Integrated Pathway)';

insert into public.college_program_admission_routes
  (institution_programme_id,route_type,application_method,official_url,
   verification_status,direct_application_required,counselling_body,admission_cycle,last_verified_at)
select p.id,'Design Aptitude Test (DAT)','Apply online for DAT Prelims and Mains',
       'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf',
       'verified',true,'NID Admissions Cell','2027-28',now()
from public.institution_programmes p
where p.institution_id='official-nid'
  and not exists(select 1 from public.college_program_admission_routes r
    where r.institution_programme_id=p.id and r.admission_cycle='2027-28');

insert into public.college_program_application_cycles
  (admission_route_id,cycle_year,registration_open,registration_close,official_url,verification_status)
select r.id,'2027','2026-09-10','2026-11-30',
       'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf','verified'
from public.college_program_admission_routes r
join public.institution_programmes p on p.id=r.institution_programme_id
where p.institution_id='official-nid' and r.admission_cycle='2027-28'
  and not exists(select 1 from public.college_program_application_cycles c
    where c.admission_route_id=r.id and c.cycle_year='2027');

insert into public.exam_course_links(exam_id,course_id,relationship_type,verification_status)
values ('exam-nid-dat','official-nid-2027-integrated-design','official_2027_admission_route','verified')
on conflict do nothing;

insert into public.catalogue_claims
  (claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,
   document_title,source_published_on,checked_at,reviewer,review_method,
   academic_cycle,expires_at,evidence_locator,verification_status)
values
  ('programme:nid-integrated-2027:eligibility','programme',
   'official-nid:5.5 Year Professional Education Master of Design (Integrated Pathway)',
   'eligibility','[]'::jsonb,
   'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf',
   'NID Admissions Cell','Admissions Handbook 2027-28','2026-09-10',now(),
   'codex-source-audit','source_audit','2027-28','2027-07-15',
   'Section 5, printed page 8: 10+2 or equivalent in any stream','verified'),
  ('programme:nid-integrated-2027:age_rules','programme',
   'official-nid:5.5 Year Professional Education Master of Design (Integrated Pathway)',
   'age_rules','{"general_ews":"2006-07-01","obc_sc_st":"2003-07-01","pwd":"2001-07-01","overseas":"2006-07-01"}'::jsonb,
   'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf',
   'NID Admissions Cell','Admissions Handbook 2027-28','2026-09-10',now(),
   'codex-source-audit','source_audit','2027-28','2027-07-15',
   'Section 5, printed page 8: age limits by category','verified'),
  ('programme:nid-integrated-2027:class12','programme',
   'official-nid:5.5 Year Professional Education Master of Design (Integrated Pathway)',
   'educational_qualification',to_jsonb('Recognised 10+2 or equivalent, any stream; appearing candidates must meet the handbook result conditions'::text),
   'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf',
   'NID Admissions Cell','Admissions Handbook 2027-28','2026-09-10',now(),
   'codex-source-audit','source_audit','2027-28','2027-07-15',
   'Section 5, printed pages 8-9: educational qualification and result conditions','verified'),
  ('programme-cycle:nid2027:deadline','programme_cycle',
   'official-nid:5.5 Year Professional Education Master of Design (Integrated Pathway):2027',
   'application_deadline',to_jsonb('2026-11-30'::text),
   'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf',
   'NID Admissions Cell','Admissions Handbook 2027-28','2026-09-10',now(),
   'codex-source-audit','source_audit','2027-28','2026-11-30',
   'Section 3, printed page 5: DAT application close 11:59 pm IST','verified'),
  ('relationship:nid-integrated:dat','course_exam_relationship',
   'official-nid-2027-integrated-design:exam-nid-dat','admission_route',
   to_jsonb('admission_route'::text),
   'https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf',
   'NID Admissions Cell','Admissions Handbook 2027-28','2026-09-10',now(),
   'codex-source-audit','source_audit','2027-28','2026-11-30',
   'Section 2.1, printed page 3: DAT application and two stages','verified')
on conflict(claim_key) do nothing;
