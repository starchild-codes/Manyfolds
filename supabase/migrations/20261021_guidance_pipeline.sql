begin;
create table if not exists public.school_pipeline_configuration(
 organisation_id uuid primary key references public.organisations(id) on delete cascade,
 labels jsonb not null default '{}',version integer not null default 1 check(version>0),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create table if not exists public.school_pipeline_history(
 id bigint generated always as identity primary key,organisation_id uuid not null,student_key text not null,
 from_stage text,to_stage text not null,from_key text,to_key text,reason text not null,manual_override boolean not null default false,
 actor_id text,recorded_at timestamptz not null default now(),registry_version integer not null,
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete cascade
);
create index if not exists pipeline_history_student on public.school_pipeline_history(organisation_id,student_key,recorded_at desc);
create or replace function public.record_pipeline_history() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  insert into school_pipeline_history(organisation_id,student_key,to_stage,to_key,reason,actor_id,registry_version) values(new.organisation_id,new.external_key,coalesce(new.payload->>'stage','Basic record created'),new.payload->>'pipelineStage','Student record created',coalesce(new.updated_by,new.created_by)::text,new.version);
 elsif (old.payload->>'stage',old.payload->>'pipelineStage',old.archived_at is null) is distinct from (new.payload->>'stage',new.payload->>'pipelineStage',new.archived_at is null) then
  insert into school_pipeline_history(organisation_id,student_key,from_stage,to_stage,from_key,to_key,reason,manual_override,actor_id,registry_version)
  values(new.organisation_id,new.external_key,case when old.archived_at is not null then 'Archived' else coalesce(old.payload->>'stage','Basic record created') end,case when new.archived_at is not null then 'Archived' else coalesce(new.payload->>'stage','Basic record created') end,case when old.archived_at is not null then 'archived' else old.payload->>'pipelineStage' end,case when new.archived_at is not null then 'archived' else new.payload->>'pipelineStage' end,coalesce(nullif(current_setting('manyfolds.pipeline_reason',true),''),case when new.archived_at is not null then 'Student archived' when old.archived_at is not null then 'Student restored' else 'Stage changed through another school workflow' end),coalesce(current_setting('manyfolds.pipeline_override',true),'false')='true',new.updated_by::text,new.version);
 end if;
 return new;
end $$;
drop trigger if exists record_pipeline_history on public.student_registry_records;
create trigger record_pipeline_history after insert or update on public.student_registry_records for each row execute function public.record_pipeline_history();
alter table public.school_pipeline_configuration enable row level security;
alter table public.school_pipeline_history enable row level security;
revoke all on public.school_pipeline_configuration,public.school_pipeline_history from anon,authenticated;
grant select on public.school_pipeline_configuration,public.school_pipeline_history to authenticated;
grant all on public.school_pipeline_configuration,public.school_pipeline_history to service_role;
create policy pipeline_configuration_read on public.school_pipeline_configuration for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher'));
create policy pipeline_history_read on public.school_pipeline_history for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,student_key,auth.uid()));
commit;
