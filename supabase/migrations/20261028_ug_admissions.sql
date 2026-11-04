begin;
create table public.school_ug_applications(
 id uuid primary key,organisation_id uuid not null references public.organisations(id),student_key text not null,
 payload jsonb not null,version integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organisation_id,id),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key)
);
create index ug_application_student on public.school_ug_applications(organisation_id,student_key,updated_at);
create table public.school_ug_application_history(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,application_id uuid not null,student_key text not null,
 payload jsonb not null,version integer not null,recorded_by uuid not null,recorded_at timestamptz not null default now(),
 foreign key(organisation_id,application_id) references public.school_ug_applications(organisation_id,id) on delete cascade
);
create table public.school_ug_application_followups(
 organisation_id uuid not null,application_id uuid not null,application_version integer not null,task_id uuid not null,created_by uuid not null,created_at timestamptz not null default now(),
 primary key(application_id,application_version),unique(task_id),
 foreign key(organisation_id,application_id) references public.school_ug_applications(organisation_id,id) on delete cascade,
 foreign key(organisation_id,task_id) references public.guidance_activities(organisation_id,id)
);
create table public.ug_admission_sources(
 id text primary key,title text not null,publisher text not null,category text not null,source_url text not null,identity_phrase text not null,
 source_hash text,checked_at timestamptz,review_after date,enabled boolean not null default false
);
alter table public.school_ug_applications enable row level security;
alter table public.school_ug_application_history enable row level security;
alter table public.school_ug_application_followups enable row level security;
alter table public.ug_admission_sources enable row level security;
revoke all on public.school_ug_applications,public.school_ug_application_history,public.school_ug_application_followups,public.ug_admission_sources from anon,authenticated;
grant select on public.school_ug_applications,public.school_ug_application_history,public.school_ug_application_followups,public.ug_admission_sources to authenticated;
grant all on public.school_ug_applications,public.school_ug_application_history,public.school_ug_application_followups,public.ug_admission_sources to service_role;
create policy ug_application_read on public.school_ug_applications for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,student_key,auth.uid()));
create policy ug_application_history_read on public.school_ug_application_history for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,student_key,auth.uid()));
create policy ug_application_followups_read on public.school_ug_application_followups for select to authenticated using(exists(select 1 from public.school_ug_applications a where a.organisation_id=school_ug_application_followups.organisation_id and a.id=school_ug_application_followups.application_id));
create policy ug_sources_read on public.ug_admission_sources for select to authenticated using(enabled and review_after>=(now() at time zone 'Asia/Kolkata')::date and checked_at>now()-interval '14 days');
create function public.record_ug_application_change() returns trigger language plpgsql security definer set search_path=public as $$begin
 if tg_op='UPDATE' then insert into school_ug_application_history(organisation_id,application_id,student_key,payload,version,recorded_by) values(old.organisation_id,old.id,old.student_key,old.payload,old.version,new.updated_by);end if;
 insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values(new.organisation_id,'admissions.'||lower(tg_op),new.updated_by::text,new.student_key,jsonb_build_object('applicationId',new.id,'version',new.version,'status',new.payload->>'status'));
 return new;
end $$;
revoke all on function public.record_ug_application_change() from public,anon,authenticated;
create trigger ug_application_changed after insert or update on public.school_ug_applications for each row execute function public.record_ug_application_change();
commit;
