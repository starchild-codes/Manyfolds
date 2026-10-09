begin;
alter table public.student_import_batches add column request_hash text not null default '';
alter table public.school_annual_rollovers add column request_hash text not null default '';
create index on public.school_intervention_students(organisation_id,student_key);
commit;
