begin;
create table if not exists public.school_student_planning(
 id uuid primary key,organisation_id uuid not null references public.organisations(id),student_key text not null,
 kind text not null check(kind in('pathway','plan','outcome')),payload jsonb not null,
 version integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key)
);
create unique index if not exists student_one_active_primary_pathway on public.school_student_planning(organisation_id,student_key) where kind='pathway' and payload->>'category'='primary' and payload->>'status'='active';
create index if not exists student_planning_lookup on public.school_student_planning(organisation_id,student_key,kind,updated_at desc);
create table if not exists public.school_student_planning_history(
 record_id uuid not null references public.school_student_planning(id),organisation_id uuid not null,student_key text not null,
 kind text not null,payload jsonb not null,version integer not null,actor_id uuid not null,recorded_at timestamptz not null default now(),
 primary key(record_id,version)
);
create or replace function public.record_student_planning_history() returns trigger language plpgsql security definer set search_path=public as $$begin
 insert into school_student_planning_history(record_id,organisation_id,student_key,kind,payload,version,actor_id) values(new.id,new.organisation_id,new.student_key,new.kind,new.payload,new.version,new.updated_by);
 insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values(new.organisation_id,'planning.'||new.kind||'.saved',new.updated_by::text,new.student_key,jsonb_build_object('recordId',new.id,'version',new.version,'status',new.payload->>'status'));
 return new;end $$;
drop trigger if exists student_planning_history on public.school_student_planning;
create trigger student_planning_history after insert or update on public.school_student_planning for each row execute function public.record_student_planning_history();
alter table public.school_student_planning enable row level security;
alter table public.school_student_planning_history enable row level security;
drop policy if exists planning_read on public.school_student_planning;
drop policy if exists planning_history_read on public.school_student_planning_history;
create policy planning_read on public.school_student_planning for select to authenticated using(public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,student_key,auth.uid()));
create policy planning_history_read on public.school_student_planning_history for select to authenticated using(public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,student_key,auth.uid()));
grant select on public.school_student_planning,public.school_student_planning_history to authenticated;
grant all on public.school_student_planning,public.school_student_planning_history to service_role;
commit;
