-- College programme identities are evidenced by Bharati College's own page.
-- Current admission eligibility, costs, and next-cycle dates remain unverified.
insert into public.catalogue_source_monitors
  (monitor_key,source_url,source_kind,entity_scope,check_interval_hours,next_check_at)
values ('bharati-programmes','https://www.bharaticollege.du.ac.in/academics/program',
        'html','programme_offering',168,now())
on conflict(monitor_key) do nothing;

insert into public.institutions
  (institution_id,institution_name,state,country,official_website,source_name,
   source_url,source_vintage,verification_status,publish_recommendation,last_reviewed)
values ('official-bharati-college','Bharati College','Delhi','India',
        'https://www.bharaticollege.du.ac.in/','Bharati College',
        'https://www.bharaticollege.du.ac.in/academics/program','2026',
        'verified','source_linked_pilot',current_date::text)
on conflict(institution_id) do update set
  institution_name=excluded.institution_name,source_url=excluded.source_url,
  verification_status=excluded.verification_status,last_reviewed=excluded.last_reviewed;

insert into public.courses
  (course_id,course_name,source_basis,source_url,verification_status,
   publish_recommendation,last_verified_at)
values ('official-bharati-bcom-hons','B.Com (Hons.)',
        'Bharati College undergraduate course and programme listing',
        'https://www.bharaticollege.du.ac.in/academics/program',
        'verified','source_linked_pilot',now())
on conflict(course_id) do update set course_name=excluded.course_name,
  source_url=excluded.source_url,verification_status=excluded.verification_status,
  last_verified_at=excluded.last_verified_at;

insert into public.institution_programmes
  (institution_id,course_id,programme_name,campus,official_programme_url,
   source_domain,source_date,verification_status,data_sufficient,last_verified_at,
   verification_notes)
values
  ('official-bharati-college','official-uod-ba-hons-psychology',
   'B.A. (Hons.) Psychology','Janakpuri, New Delhi',
   'https://www.bharaticollege.du.ac.in/academics/program',
   'www.bharaticollege.du.ac.in',current_date,'verified',false,now(),
   'Offering checked; next admission cycle, eligibility and fees pending.'),
  ('official-bharati-college','official-bharati-bcom-hons',
   'B.Com (Hons.)','Janakpuri, New Delhi',
   'https://www.bharaticollege.du.ac.in/academics/program',
   'www.bharaticollege.du.ac.in',current_date,'verified',false,now(),
   'Offering checked; next admission cycle, eligibility and fees pending.')
on conflict(institution_id,programme_name) do update set
  course_id=excluded.course_id,official_programme_url=excluded.official_programme_url,
  verification_status='verified',data_sufficient=false,
  last_verified_at=excluded.last_verified_at,verification_notes=excluded.verification_notes;

insert into public.institution_programme_sources
  (institution_programme_id,source_name,source_url,source_year,last_verified_at,status)
select p.id,'Bharati College programme outcomes',
       'https://www.bharaticollege.du.ac.in/academics/program','2026',now(),'verified'
from public.institution_programmes p
where p.institution_id='official-bharati-college'
  and p.programme_name in ('B.A. (Hons.) Psychology','B.Com (Hons.)')
  and not exists(select 1 from public.institution_programme_sources s
    where s.institution_programme_id=p.id
      and s.source_url='https://www.bharaticollege.du.ac.in/academics/program');

insert into public.catalogue_claims
  (claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,
   document_title,checked_at,reviewer,review_method,academic_cycle,
   evidence_locator,verification_status)
values
  ('institution:bharati:name','institution','official-bharati-college','name',
   to_jsonb('Bharati College'::text),
   'https://www.bharaticollege.du.ac.in/academics/program','Bharati College',
   'Programme & Course Outcome',now(),'codex-source-audit','source_audit',null,
   'College masthead','verified'),
  ('course:bharati-bcom:name','course','official-bharati-bcom-hons','name',
   to_jsonb('B.Com (Hons.)'::text),
   'https://www.bharaticollege.du.ac.in/academics/program','Bharati College',
   'Programme & Course Outcome',now(),'codex-source-audit','source_audit',null,
   'Department of Commerce programme outcomes','verified'),
  ('programme:bharati-psychology:offering','programme',
   'official-bharati-college:B.A. (Hons.) Psychology','offering',
   to_jsonb('B.A. (Hons.) Psychology'::text),
   'https://www.bharaticollege.du.ac.in/academics/program','Bharati College',
   'Programme & Course Outcome',now(),'codex-source-audit','source_audit',null,
   'Department of Psychology programme outcomes','verified'),
  ('programme:bharati-bcom:offering','programme',
   'official-bharati-college:B.Com (Hons.)','offering',
   to_jsonb('B.Com (Hons.)'::text),
   'https://www.bharaticollege.du.ac.in/academics/program','Bharati College',
   'Programme & Course Outcome',now(),'codex-source-audit','source_audit',null,
   'Department of Commerce programme outcomes','verified')
on conflict(claim_key) do nothing;
