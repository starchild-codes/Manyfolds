-- The current NID admissions page verifies identity and offering only. It does
-- not make the programme route complete without handbook eligibility review.
insert into public.courses
  (course_id,course_name,source_basis,source_url,verification_status,publish_recommendation,last_verified_at)
values
  ('official-nid-2027-integrated-design','5.5 Year Professional Education Master of Design (Integrated Pathway)',
   'NID admissions 2027-28','https://admissions.nid.edu/NIDA2027/Default.aspx',
   'verified','source_linked_pilot',now())
on conflict(course_id) do update set
  course_name=excluded.course_name,source_url=excluded.source_url,
  verification_status=excluded.verification_status,last_verified_at=excluded.last_verified_at;

insert into public.institutions
  (institution_id,institution_name,country,official_website,source_name,source_url,
   source_vintage,verification_status,publish_recommendation,last_reviewed)
values
  ('official-nid','National Institute of Design','India','https://nid.edu/',
   'National Institute of Design','https://admissions.nid.edu/NIDA2027/Default.aspx',
   '2027-28','verified','source_linked_pilot',current_date::text)
on conflict(institution_id) do update set institution_name=excluded.institution_name,
  source_url=excluded.source_url,verification_status=excluded.verification_status,
  last_reviewed=excluded.last_reviewed;

insert into public.institution_programmes
  (institution_id,course_id,programme_name,campus,official_programme_url,
   official_admissions_url,source_domain,source_date,verification_status,data_sufficient,
   last_verified_at,verification_notes)
values
  ('official-nid','official-nid-2027-integrated-design',
   '5.5 Year Professional Education Master of Design (Integrated Pathway)',
   'Ahmedabad, Gandhinagar and Bengaluru','https://admissions.nid.edu/NIDA2027/Default.aspx',
   'https://admissions.nid.edu/NIDA2027/Default.aspx','admissions.nid.edu',current_date,
   'verified',false,now(),'Name and offering verified. Handbook eligibility, fee and recognition details pending review.')
on conflict(institution_id,programme_name) do update set
  course_id=excluded.course_id,campus=excluded.campus,official_programme_url=excluded.official_programme_url,
  official_admissions_url=excluded.official_admissions_url,verification_status='verified',
  data_sufficient=false,last_verified_at=excluded.last_verified_at,
  verification_notes=excluded.verification_notes;

insert into public.institution_programme_sources
  (institution_programme_id,source_name,source_url,source_year,last_verified_at,status)
select p.id,'NID admissions 2027-28','https://admissions.nid.edu/NIDA2027/Default.aspx','2027',now(),'verified'
from public.institution_programmes p where p.institution_id='official-nid'
  and p.programme_name='5.5 Year Professional Education Master of Design (Integrated Pathway)'
  and not exists(select 1 from public.institution_programme_sources s
    where s.institution_programme_id=p.id and s.source_url='https://admissions.nid.edu/NIDA2027/Default.aspx');

insert into public.catalogue_claims
  (claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,
   document_title,checked_at,reviewer,review_method,academic_cycle,expires_at,
   evidence_locator,verification_status)
values
  ('course:nid-integrated-2027:name','course','official-nid-2027-integrated-design','name',
   to_jsonb('5.5 Year Professional Education Master of Design (Integrated Pathway)'::text),
   'https://admissions.nid.edu/NIDA2027/Default.aspx','National Institute of Design',
   'NID Admission 2027-28',now(),'codex-source-audit','source_audit','2027-28','2027-06-30',
   'Programme of Study, integrated pathway heading','verified'),
  ('institution:nid:name','institution','official-nid','name',
   to_jsonb('National Institute of Design'::text),
   'https://admissions.nid.edu/NIDA2027/Default.aspx','National Institute of Design',
   'NID Admission 2027-28',now(),'codex-source-audit','source_audit',null,null,
   'Official portal footer and NID identity','verified'),
  ('programme:nid-integrated-2027:offering','programme',
   'official-nid:5.5 Year Professional Education Master of Design (Integrated Pathway)',
   'offering',to_jsonb('5.5 Year Professional Education Master of Design (Integrated Pathway)'::text),
   'https://admissions.nid.edu/NIDA2027/Default.aspx','National Institute of Design',
   'NID Admission 2027-28',now(),'codex-source-audit','source_audit','2027-28','2027-06-30',
   'Programme of Study lists NID Ahmedabad, Gandhinagar and Bengaluru','verified')
on conflict(claim_key) do nothing;
