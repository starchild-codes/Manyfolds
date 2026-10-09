begin;
alter table public.student_registry_records add column if not exists archived_at timestamptz;
alter table public.student_registry_records add column if not exists archived_by text;
create table public.student_registry_history (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 student_key text not null, payload jsonb not null, version bigint not null,
 recorded_by text, recorded_at timestamptz not null default now()
);
create index on public.student_registry_history(organisation_id,student_key,recorded_at);
create table public.school_audit_events (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 event_type text not null, actor_id text, subject_key text,
 metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index on public.school_audit_events(organisation_id,created_at desc);
create table public.school_configuration (
 organisation_id uuid primary key references public.organisations(id), settings jsonb not null default '{}',
 version integer not null default 1, updated_by text not null, updated_at timestamptz not null default now()
);
create table public.school_resources (
 id uuid primary key, organisation_id uuid not null references public.organisations(id),
 title text not null check(length(btrim(title)) between 1 and 200),
 resource_type text not null, body text not null check(length(btrim(body)) between 1 and 20000),
 version integer not null default 1, created_by text not null, updated_by text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.student_import_batches (
 id uuid primary key, organisation_id uuid not null references public.organisations(id),
 records jsonb not null, status text not null check(status in ('completed','rolled_back')),
 created_by text not null, created_at timestamptz not null default now(), rolled_back_at timestamptz
);
create table public.school_annual_rollovers (
 id uuid primary key, organisation_id uuid not null references public.organisations(id),
 before_records jsonb not null, after_records jsonb not null,
 before_configuration jsonb not null, after_configuration_version integer not null,
 next_year text not null, status text not null check(status in ('completed','rolled_back')),
 created_by text not null, created_at timestamptz not null default now(), rolled_back_at timestamptz
);
alter table public.student_registry_history enable row level security;
alter table public.school_audit_events enable row level security;
alter table public.school_configuration enable row level security;
alter table public.school_resources enable row level security;
alter table public.student_import_batches enable row level security;
alter table public.school_annual_rollovers enable row level security;
revoke all on public.student_registry_history,public.school_audit_events,public.school_configuration,public.school_resources,public.student_import_batches,public.school_annual_rollovers from anon,authenticated;
grant select on public.student_registry_history,public.school_configuration,public.school_resources to authenticated;
grant select on public.school_audit_events,public.student_import_batches,public.school_annual_rollovers to authenticated;
create policy "school student history" on public.student_registry_history for select to authenticated using(organisation_id=public.current_organisation_id());
create policy "school configuration" on public.school_configuration for select to authenticated using(organisation_id=public.current_organisation_id());
create policy "school resources" on public.school_resources for select to authenticated using(organisation_id=public.current_organisation_id());
create policy "school administrators read audit" on public.school_audit_events for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin'));
create policy "school import history" on public.student_import_batches for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin','counsellor'));
create policy "school rollover history" on public.school_annual_rollovers for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin'));

create function public.record_school_change() returns trigger language plpgsql security definer set search_path=public as $$
declare row_data jsonb; previous jsonb; org uuid; actor text; subject text; event_name text; details jsonb;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 previous:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 org:=(row_data->>'organisation_id')::uuid;
 actor:=coalesce(nullif(current_setting('manyfolds.actor',true),''),row_data->>'updated_by',row_data->>'created_by');
 subject:=coalesce(row_data->>'external_key',row_data->>'student_key',row_data->>'id');
 event_name:=tg_table_name||'.'||lower(tg_op);
 details:=jsonb_build_object('version',row_data->'version');
 if tg_table_name='student_registry_records' and tg_op='UPDATE' then
  insert into student_registry_history(organisation_id,student_key,payload,version,recorded_by)
  values(org,old.external_key,old.payload,old.version,actor);
  if old.archived_at is null and new.archived_at is not null then event_name:='student.archived';
  elsif old.archived_at is not null and new.archived_at is null then event_name:='student.restored';
  else event_name:='student.updated'; end if;
 elsif tg_table_name='school_staff_invitations' then
  -- Never copy invitation tokens, email addresses, or student responses into audit metadata.
  if tg_op='UPDATE' and previous->>'accepted_at' is null and row_data->>'accepted_at' is not null then
   event_name:='staff.invitation_accepted';actor:=row_data->>'accepted_by';
  elsif tg_op='UPDATE' and previous->>'revoked_at' is null and row_data->>'revoked_at' is not null then event_name:='staff.invitation_revoked';
  else event_name:='staff.invitation_created';end if;
  details:=jsonb_build_object('role',row_data->>'role');
 elsif tg_table_name='organisation_memberships' then
  subject:=row_data->>'user_id';
  details:=jsonb_build_object('role',row_data->>'role','active',row_data->'active');
  if tg_op='UPDATE' and previous->>'active'='true' and row_data->>'active'='false' then event_name:='staff.deactivated';
  elsif tg_op='UPDATE' and previous->>'role'<>row_data->>'role' then event_name:='staff.role_changed';
  else event_name:='staff.membership_changed';end if;
 elsif tg_table_name='student_diagnostic_history' then details:=jsonb_build_object('revision',row_data->'revision','status',row_data->'status');
 end if;
 insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values(org,event_name,actor,subject,details);
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.record_school_change() from public,anon,authenticated;
create trigger student_registry_change after insert or update on public.student_registry_records for each row execute function public.record_school_change();
create trigger school_membership_change after insert or update on public.organisation_memberships for each row execute function public.record_school_change();
create trigger school_invitation_change after insert or update on public.school_staff_invitations for each row execute function public.record_school_change();
create trigger school_diagnostic_change after insert on public.student_diagnostic_history for each row execute function public.record_school_change();
create trigger school_guidance_change after insert or update on public.guidance_activities for each row execute function public.record_school_change();
create trigger school_intervention_change after insert or update on public.school_interventions for each row execute function public.record_school_change();
create trigger school_configuration_change after insert or update on public.school_configuration for each row execute function public.record_school_change();
create trigger school_resource_change after insert or update on public.school_resources for each row execute function public.record_school_change();
create trigger school_import_change after insert or update on public.student_import_batches for each row execute function public.record_school_change();
create trigger school_rollover_change after insert or update on public.school_annual_rollovers for each row execute function public.record_school_change();
commit;
