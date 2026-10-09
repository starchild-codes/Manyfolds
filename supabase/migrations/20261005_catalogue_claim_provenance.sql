-- Field-level provenance. A catalogue row can be published only for the fields
-- explicitly checked here; source presence alone never verifies a whole route.
create table if not exists public.catalogue_claims (
  claim_key text primary key,
  entity_type text not null,
  entity_id text not null,
  field_name text not null,
  claim_value jsonb not null,
  source_url text not null check (source_url ~* '^https://'),
  publisher text not null,
  document_title text not null,
  source_published_on date,
  checked_at timestamptz not null,
  reviewer text not null,
  review_method text not null check (review_method in ('source_audit','human_confirmed')),
  academic_cycle text,
  expires_at date,
  evidence_locator text not null,
  evidence_excerpt text,
  source_hash text,
  verification_status text not null check (verification_status in ('pending_review','verified','stale','conflicting','archived')),
  supersedes_claim_key text references public.catalogue_claims(claim_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (verification_status <> 'verified' or (length(trim(evidence_locator)) > 0 and length(trim(reviewer)) > 0))
);

create index if not exists catalogue_claims_entity_idx
  on public.catalogue_claims(entity_type,entity_id,field_name,verification_status,expires_at);
create index if not exists catalogue_claims_expiry_idx
  on public.catalogue_claims(expires_at) where verification_status='verified';

create table if not exists public.catalogue_source_monitors (
  monitor_key text primary key,
  source_url text not null check (source_url ~* '^https://'),
  source_kind text not null,
  entity_scope text not null,
  check_interval_hours integer not null check (check_interval_hours between 1 and 8760),
  last_checked_at timestamptz,
  last_http_status integer,
  last_content_hash text,
  changed_at timestamptz,
  next_check_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.catalogue_import_candidates (
  candidate_key text primary key,
  entity_type text not null,
  source_url text not null check (source_url ~* '^https://'),
  source_cycle text not null,
  source_hash text not null,
  payload jsonb not null,
  status text not null default 'pending_review'
    check (status in ('pending_review','published','rejected','conflicting')),
  detected_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  reviewer_notes text,
  updated_at timestamptz not null default now()
);
create index if not exists catalogue_import_candidates_queue_idx
  on public.catalogue_import_candidates(status,entity_type,detected_at desc);

alter table public.catalogue_claims enable row level security;
alter table public.catalogue_source_monitors enable row level security;
alter table public.catalogue_import_candidates enable row level security;
drop policy if exists catalogue_claims_verified_read on public.catalogue_claims;
create policy catalogue_claims_verified_read on public.catalogue_claims for select to authenticated
  using (verification_status='verified' and (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date));
drop policy if exists catalogue_claims_service_write on public.catalogue_claims;
create policy catalogue_claims_service_write on public.catalogue_claims for all to service_role
  using (true) with check (true);
drop policy if exists catalogue_source_monitors_service on public.catalogue_source_monitors;
create policy catalogue_source_monitors_service on public.catalogue_source_monitors for all to service_role
  using (true) with check (true);
drop policy if exists catalogue_import_candidates_service on public.catalogue_import_candidates;
create policy catalogue_import_candidates_service on public.catalogue_import_candidates for all to service_role
  using (true) with check (true);

insert into public.catalogue_source_monitors(monitor_key,source_url,source_kind,entity_scope,check_interval_hours,next_check_at)
values
  ('nsp-2026-scholarships','https://scholarships.gov.in/All-Scholarships','html','scholarship',24,now()),
  ('clat-2027-instructions','https://clat2027.consortiumofnlus.ac.in/clat-2027/ug-instructions.html','html','exam_cycle',24,now()),
  ('nid-2027-admissions','https://admissions.nid.edu/NIDA2027/Default.aspx','html','exam_cycle',24,now()),
  ('josaa-seat-matrix','https://josaa.nic.in/seat-matrix/','html','seat_matrix',168,now()),
  ('mcc-ug-events','https://mcc.nic.in/current-events-ug/','html','seat_matrix',168,now()),
  ('inc-recognition','https://www.indiannursingcouncil.org/nursing-institute-for-the-year-2025-26-and-2026-27','html','recognition',168,now())
on conflict(monitor_key) do nothing;

update public.catalogue_source_monitors set next_check_at=now()
where monitor_key='josaa-seat-matrix' and last_http_status is null
  and (next_check_at is null or next_check_at>now()+interval '24 hours');

insert into public.catalogue_source_monitors(monitor_key,source_url,source_kind,entity_scope,check_interval_hours,next_check_at)
values
  ('nlsiu-ballb','https://www.nls.ac.in/programme/ba-llb-hons/','html','programme_eligibility',24,now()),
  ('iitd-cse','https://curriculum.iitd.ac.in/view_program.php?program_code=CS1','html','programme_offering',168,now()),
  ('uod-psychology-2026','https://admission.uod.ac.in/userfiles/downloads/2026/17052026_Updated_FAQsUG%202026-final.pdf','pdf','course',168,now()),
  ('bci-law-degree-route','https://www.barcouncilofindia.org/info/notificati-4u2peb','html','career_course_relationship',168,now())
on conflict(monitor_key) do nothing;

-- Backfill only facts individually reviewed in the official-source pilot.
-- These are source audits, not claims of a human sign-off.
update public.courses set course_name='B.Tech. in Computer Science and Engineering'
where course_id='course-bachelor-of-technology-in-computer-science-and-engineering';
update public.courses set course_name='B.A., LL.B. (Hons.)'
where course_id='course-bachelor-of-arts-and-bachelor-of-laws';

insert into public.catalogue_claims
  (claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,
   document_title,checked_at,reviewer,review_method,academic_cycle,expires_at,evidence_locator,
   verification_status)
values
  ('course:iitd-cse:name','course','course-bachelor-of-technology-in-computer-science-and-engineering','name',to_jsonb('B.Tech. in Computer Science and Engineering'::text),'https://curriculum.iitd.ac.in/view_program.php?program_code=CS1','IIT Delhi','B.Tech. CSE curriculum','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit',null,null,'Programme heading','verified'),
  ('course:nlsiu-ballb:name','course','course-bachelor-of-arts-and-bachelor-of-laws','name',to_jsonb('B.A., LL.B. (Hons.)'::text),'https://www.nls.ac.in/programme/ba-llb-hons/','NLSIU','B.A., LL.B. (Hons.) programme','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit',null,null,'Programme heading','verified'),
  ('course:uod-psychology:name','course','official-uod-ba-hons-psychology','name',to_jsonb('B.A. (Hons.) Psychology'::text),'https://admission.uod.ac.in/userfiles/downloads/2026/17052026_Updated_FAQsUG%202026-final.pdf','University of Delhi','UG admissions FAQ 2026','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit','2026-27',null,'Programme-specific eligibility FAQ','verified'),
  ('institution:iitd:name','institution','official-iit-delhi','name',to_jsonb('Indian Institute of Technology Delhi'::text),'https://academics.iitd.ac.in/ug-admissions/','IIT Delhi','Undergraduate admissions','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit',null,null,'Official admissions page header','verified'),
  ('institution:nlsiu:name','institution','official-nlsiu-bengaluru','name',to_jsonb('National Law School of India University'::text),'https://www.nls.ac.in/programme/ba-llb-hons/','NLSIU','B.A., LL.B. (Hons.) programme','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit',null,null,'Institution name on programme page','verified'),
  ('exam:jee-advanced:name','exam','exam-jee-advanced','name',to_jsonb('Joint Entrance Examination Advanced'::text),'https://jeeadv.ac.in/eligibility.html','JEE Advanced','Eligibility criteria 2026','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit','2026',null,'Eligibility page title','verified'),
  ('exam:clat:name','exam','exam-clat','name',to_jsonb('Common Law Admission Test'::text),'https://clat2027.consortiumofnlus.ac.in/clat-2027/ug-instructions.html','Consortium of NLUs','CLAT 2027 UG instructions','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit','2027',null,'Instruction page title','verified'),
  ('exam:cuet-ug:name','exam','exam-cuet-ug','name',to_jsonb('Common University Entrance Test Undergraduate'::text),'https://cuet.nta.nic.in/','National Testing Agency','CUET UG official portal','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit',null,null,'Exam portal title','verified'),
  ('exam:nid-dat:name','exam','exam-nid-dat','name',to_jsonb('National Institute of Design Design Aptitude Test'::text),'https://admissions.nid.edu/NIDA2027/Default.aspx','NID','Admissions 2027-28','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit','2027',null,'Admissions page exam heading','verified'),
  ('programme:iitd-cse:offering','programme','official-iit-delhi:B.Tech. in Computer Science and Engineering','offering',to_jsonb('B.Tech. in Computer Science and Engineering'::text),'https://curriculum.iitd.ac.in/view_program.php?program_code=CS1','IIT Delhi','B.Tech. CSE curriculum','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit',null,null,'Programme heading and curriculum','verified'),
  ('programme:nlsiu-ballb:offering','programme','official-nlsiu-bengaluru:B.A., LL.B. (Hons.)','offering',to_jsonb('B.A., LL.B. (Hons.)'::text),'https://www.nls.ac.in/programme/ba-llb-hons/','NLSIU','B.A., LL.B. (Hons.) programme','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit',null,null,'Programme heading and eligibility section','verified'),
  ('cycle:clat2027:deadline','exam_cycle','exam-clat:2027','registration_deadline',to_jsonb('2026-10-31'::text),'https://clat2027.consortiumofnlus.ac.in/clat-2027/ug-instructions.html','Consortium of NLUs','CLAT 2027 UG instructions','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit','2027','2026-10-31','Application timeline','verified'),
  ('cycle:nid2027:deadline','exam_cycle','exam-nid-dat:2027','registration_deadline',to_jsonb('2026-11-30'::text),'https://admissions.nid.edu/NIDA2027/Default.aspx','NID','Admissions 2027-28','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit','2027','2026-11-30','Admissions application timeline','verified'),
  ('programme-cycle:nlsiu-clat2027:deadline','programme_cycle','official-nlsiu-bengaluru:B.A., LL.B. (Hons.):2027','application_deadline',to_jsonb('2026-10-31'::text),'https://clat2027.consortiumofnlus.ac.in/clat-2027/ug-instructions.html','Consortium of NLUs','CLAT 2027 UG instructions','2026-10-04 00:00:00+05:30','codex-source-audit','source_audit','2027','2026-10-31','Application timeline for CLAT route','verified')
on conflict(claim_key) do nothing;

insert into public.catalogue_claims
  (claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,document_title,
   checked_at,reviewer,review_method,academic_cycle,expires_at,evidence_locator,verification_status)
values
  ('programme:nlsiu-ballb:eligibility','programme','official-nlsiu-bengaluru:B.A., LL.B. (Hons.)','eligibility','[]'::jsonb,
   'https://www.nls.ac.in/programme/ba-llb-hons/','NLSIU','B.A., LL.B. (Hons.) programme',
   '2026-10-05 00:00:00+05:30','codex-source-audit','source_audit','2027-28','2026-10-31',
   'Eligibility section: 10+2 marks and CLAT; no required subject combination stated','verified')
on conflict(claim_key) do nothing;

-- Only directly supported links are promoted. The other pilot mappings can
-- retrieve possible courses but cannot be represented as verified pathways.
insert into public.catalogue_claims
  (claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,document_title,
   checked_at,reviewer,review_method,academic_cycle,expires_at,evidence_locator,verification_status)
values
  ('relationship:lawyer:ballb','career_course_relationship','nco-2611-9900:course-bachelor-of-arts-and-bachelor-of-laws',
   'possible_study_route',to_jsonb('possible_study_route'::text),
   'https://www.barcouncilofindia.org/info/notificati-4u2peb','Bar Council of India',
   'Recognition of foreign law degrees and Indian law degree routes','2026-10-06 00:00:00+05:30',
   'codex-source-audit','source_audit',null,null,
   'Indian law-degree routes include a five-year integrated law degree after Class 12','verified'),
  ('relationship:ballb:clat','course_exam_relationship','course-bachelor-of-arts-and-bachelor-of-laws:exam-clat',
   'admission_route',to_jsonb('admission_route'::text),
   'https://www.nls.ac.in/programme/ba-llb-hons/','NLSIU','B.A., LL.B. (Hons.) programme',
   '2026-10-06 00:00:00+05:30','codex-source-audit','source_audit','2027-28','2026-10-31',
   'Admission section: NLSIU accepts CLAT for its five-year B.A., LL.B. (Hons.)','verified')
on conflict(claim_key) do nothing;

update public.catalogue_claims set expires_at='2027-06-30',updated_at=now()
where claim_key in ('course:uod-psychology:name','relationship:lawyer:ballb')
  and expires_at is null;

-- Verified 2026-27 NSP listings. These establish scheme identity and the
-- student application window only; individual eligibility and awards remain absent.
insert into public.scholarships
  (scholarship_id,scholarship_name,provider,category,geographic_scope,
   application_window,official_url,verification_status,date_policy,last_reviewed)
values
  ('official-nsp-2026-swanath-degree','AICTE Swanath Scholarship Scheme (Technical Degree)','AICTE','Technical degree','India','Student applications open till 31 October 2026','https://scholarships.gov.in/All-Scholarships','verified_listing','2026-27 cycle only','2026-10-05'),
  ('official-nsp-2026-pragati-degree','AICTE Pragati Scholarship Scheme for Girl Students (Technical Degree)','AICTE','Technical degree','India','Student applications open till 31 October 2026','https://scholarships.gov.in/All-Scholarships','verified_listing','2026-27 cycle only','2026-10-05'),
  ('official-nsp-2026-saksham-degree','AICTE Saksham Scholarship Scheme for Specially Abled Students (Technical Degree)','AICTE','Technical degree','India','Student applications open till 31 October 2026','https://scholarships.gov.in/All-Scholarships','verified_listing','2026-27 cycle only','2026-10-05'),
  ('official-nsp-2026-top-class-sc','Central Sector Scholarship of Top Class Education for SC Students','Department of Social Justice & Empowerment','Higher education','India','Student applications open till 31 October 2026','https://scholarships.gov.in/All-Scholarships','verified_listing','2026-27 cycle only','2026-10-05')
on conflict(scholarship_id) do update set
  scholarship_name=excluded.scholarship_name,
  provider=excluded.provider,
  application_window=excluded.application_window,
  official_url=excluded.official_url,
  verification_status=excluded.verification_status,
  date_policy=excluded.date_policy,
  last_reviewed=excluded.last_reviewed;

insert into public.catalogue_claims
  (claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,
   document_title,checked_at,reviewer,review_method,academic_cycle,expires_at,evidence_locator,
   verification_status)
select 'scholarship:'||s.scholarship_id||':'||claim.field_name,
       'scholarship',s.scholarship_id,claim.field_name,
       to_jsonb(case claim.field_name when 'name' then s.scholarship_name else s.application_window end),
       'https://scholarships.gov.in/All-Scholarships','National Scholarship Portal',
       'Schemes on NSP, academic year 2026-27','2026-10-05 00:00:00+05:30',
       'codex-source-audit','source_audit','2026-27','2026-10-31',
       'Scheme card and student application closing date','verified'
from public.scholarships s cross join (values ('name'),('application_window')) as claim(field_name)
where s.scholarship_id in
  ('official-nsp-2026-swanath-degree','official-nsp-2026-pragati-degree',
   'official-nsp-2026-saksham-degree','official-nsp-2026-top-class-sc')
on conflict(claim_key) do nothing;
