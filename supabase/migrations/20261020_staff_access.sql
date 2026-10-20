begin;
alter table public.organisations add column if not exists active boolean not null default true;
alter table public.organisations add column if not exists access_version integer not null default 1;
alter table public.organisations add column if not exists allow_unassigned_guidance boolean not null default false;
create or replace function public.current_organisation_id() returns uuid language sql stable security definer set search_path=public as $$
 select m.organisation_id from organisation_memberships m join organisations o on o.id=m.organisation_id where m.user_id=auth.uid() and m.active and o.active order by m.created_at limit 1
$$;
create or replace function public.current_organisation_role() returns text language sql stable security definer set search_path=public as $$
 select m.role from organisation_memberships m join organisations o on o.id=m.organisation_id where m.user_id=auth.uid() and m.active and o.active order by m.created_at limit 1
$$;
alter table public.organisation_memberships drop constraint if exists organisation_memberships_role_check;
alter table public.organisation_memberships add constraint organisation_memberships_role_check check(role in('owner','admin','lead_counsellor','counsellor','guidance_teacher','teacher','data_entry','reviewer','viewer'));
alter table public.school_staff_invitations drop constraint if exists school_staff_invitations_role_check;
alter table public.school_staff_invitations add constraint school_staff_invitations_role_check check(role in('admin','lead_counsellor','counsellor','guidance_teacher','teacher','data_entry','reviewer'));
create table if not exists public.school_student_assignments(
 organisation_id uuid not null references public.organisations(id),student_key text not null,
 staff_id uuid not null references auth.users(id),assigned_by uuid not null references auth.users(id),
 starts_at timestamptz not null default now(),ends_at timestamptz,reason text not null,version integer not null default 1,
 primary key(organisation_id,student_key,staff_id),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key),
 check(ends_at is null or ends_at>starts_at)
);
alter table public.school_student_assignments enable row level security;
alter table public.school_student_assignments add column if not exists revoked_at timestamptz;
create index if not exists school_assignment_staff_lookup on public.school_student_assignments(organisation_id,staff_id);
create or replace function public.school_can_access_student(org uuid,student text,actor uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from organisation_memberships m join organisations o on o.id=m.organisation_id
 join student_registry_records s on s.organisation_id=m.organisation_id and s.external_key=student
 where m.organisation_id=org and m.user_id=actor and m.active and o.active and
 (actor=auth.uid() or (session_user in('postgres','supabase_admin') and current_setting('role',true)<>'authenticated') or current_setting('request.jwt.claim.role',true)='service_role') and
 (m.role in('owner','admin','lead_counsellor','data_entry') or
  (m.role in('counsellor','guidance_teacher','teacher') and
   (s.payload->>'counsellorId'=actor::text or
    exists(select 1 from school_student_assignments a where a.organisation_id=org and a.student_key=student and a.staff_id=actor and a.revoked_at is null and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())) or
    (m.role in('counsellor','guidance_teacher') and coalesce(s.payload->>'counsellorId','')='' and (s.created_by=actor::text or o.allow_unassigned_guidance))))))
$$;
revoke all on function public.school_can_access_student(uuid,text,uuid) from public,anon;
grant execute on function public.school_can_access_student(uuid,text,uuid) to authenticated,service_role;
-- Older imported profile tables retain text organisation IDs.
create or replace function public.school_can_access_student(org text,student text,actor uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select case when org ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.school_can_access_student(org::uuid,student,actor) else false end
$$;
revoke all on function public.school_can_access_student(text,text,uuid) from public,anon;
grant execute on function public.school_can_access_student(text,text,uuid) to authenticated,service_role;
drop policy if exists assignments_read on public.school_student_assignments;
drop policy if exists assignments_manage on public.school_student_assignments;
create policy assignments_read on public.school_student_assignments for select to authenticated using(organisation_id=public.current_organisation_id() and (staff_id=auth.uid() or public.current_organisation_role() in('owner','admin','lead_counsellor')));
create policy assignments_manage on public.school_student_assignments for all to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor')) with check(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor') and exists(select 1 from organisation_memberships m where m.organisation_id=school_student_assignments.organisation_id and m.user_id=staff_id and m.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher','teacher')));
revoke insert,update,delete on public.school_student_assignments from authenticated;
grant select on public.school_student_assignments to authenticated;
grant all on public.school_student_assignments to service_role;
-- Restrictive policies are ANDed with all legacy permissive tenant policies.
-- New roles cannot gain sensitive access merely through school membership.
do $$ declare r record; key_column text; sensitive boolean; begin
 for r in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' loop
  key_column:=null;
  if r.table_name='student_registry_records' then key_column:='external_key';
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='student_key') then key_column:='student_key';
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='student_external_id') then key_column:='student_external_id'; end if;
  if key_column is not null and r.table_name not in('school_student_assignments','school_teacher_observations') and exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name='organisation_id') then
   sensitive:=r.table_name<>'student_registry_records';
   execute format('drop policy if exists school_caseload_scope on public.%I',r.table_name);
   if not sensitive then
    execute format('create policy school_caseload_scope on public.%I as restrictive for all to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in(''owner'',''admin'',''lead_counsellor'',''counsellor'',''guidance_teacher'') and (public.current_organisation_role() in(''owner'',''admin'',''lead_counsellor'') or payload->>''counsellorId''=auth.uid()::text or public.school_can_access_student(organisation_id,%I,auth.uid()))) with check(organisation_id=public.current_organisation_id() and public.current_organisation_role() in(''owner'',''admin'',''lead_counsellor'',''counsellor'',''guidance_teacher'',''data_entry''))',r.table_name,key_column);
   else
    execute format('create policy school_caseload_scope on public.%I as restrictive for all to authenticated using(public.school_can_access_student(organisation_id,%I,auth.uid()) and public.current_organisation_role() in(''owner'',''admin'',''lead_counsellor'',''counsellor'',''guidance_teacher'')) with check(public.school_can_access_student(organisation_id,%I,auth.uid()) and public.current_organisation_role() in(''owner'',''admin'',''lead_counsellor'',''counsellor'',''guidance_teacher''))',r.table_name,key_column,key_column);
   end if;
  end if;
 end loop;
end $$;
do $$ declare t text; begin
 foreach t in array array['guidance_session_records','guidance_session_private_notes'] loop
  execute format('drop policy if exists session_caseload_scope on public.%I',t);
  execute format('create policy session_caseload_scope on public.%I as restrictive for all to authenticated using(public.current_organisation_role() in(''owner'',''admin'',''lead_counsellor'',''counsellor''%s) and exists(select 1 from public.guidance_activities a where a.id=activity_id and a.organisation_id=%I.organisation_id and public.school_can_access_student(a.organisation_id,a.student_key,auth.uid())))',t,case when t='guidance_session_records' then ',''guidance_teacher''' else '' end,t);
 end loop;
 foreach t in array array['student_private_notes','counsellor_private_records'] loop
  execute format('drop policy if exists private_note_staff_scope on public.%I',t);
  execute format('create policy private_note_staff_scope on public.%I as restrictive for all to authenticated using(public.current_organisation_role() in(''owner'',''admin'',''lead_counsellor'',''counsellor''))',t);
 end loop;
end $$;
create or replace function public.school_can_access_intervention(org uuid,item uuid,actor uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from organisation_memberships m join organisations o on o.id=m.organisation_id where m.organisation_id=org and m.user_id=actor and m.active and o.active and m.role in('owner','admin','lead_counsellor','counsellor','guidance_teacher')) and not exists(select 1 from school_intervention_students s where s.organisation_id=org and s.intervention_id=item and not public.school_can_access_student(org,s.student_key,actor))
$$;
revoke all on function public.school_can_access_intervention(uuid,uuid,uuid) from public,anon;
grant execute on function public.school_can_access_intervention(uuid,uuid,uuid) to authenticated,service_role;
drop policy if exists school_intervention_scope on public.school_interventions;
create policy school_intervention_scope on public.school_interventions as restrictive for all to authenticated using(public.school_can_access_intervention(organisation_id,id,auth.uid()));
create table if not exists public.school_teacher_observations(
 id uuid primary key,organisation_id uuid not null references organisations(id),student_key text not null,
 author_id uuid not null references auth.users(id),observation text not null check(length(observation) between 1 and 3000),
 needs_attention boolean not null default false,created_at timestamptz not null default now(),
 foreign key(organisation_id,student_key) references student_registry_records(organisation_id,external_key)
);
alter table public.school_teacher_observations enable row level security;
drop policy if exists school_caseload_scope on public.school_teacher_observations;
drop policy if exists observation_read on public.school_teacher_observations;
create policy observation_read on public.school_teacher_observations for select to authenticated using(public.school_can_access_student(organisation_id,student_key,auth.uid()) and (author_id=auth.uid() or public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher')));
grant select on public.school_teacher_observations to authenticated;
grant all on public.school_teacher_observations to service_role;
-- Registry writes use the API so role-specific projections, primary assignment,
-- optimistic versions and audit checks cannot be bypassed by a direct client.
revoke insert,update,delete on public.student_registry_records from authenticated;
revoke update(payload,version,updated_by,updated_at) on public.student_registry_records from authenticated;
grant select on public.student_registry_records to authenticated;
drop policy if exists "counselling team reads session records" on public.guidance_session_records;
create policy "counselling team reads session records" on public.guidance_session_records for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher'));
drop policy if exists "authors read private session notes" on public.guidance_session_private_notes;
create policy "authors read private session notes" on public.guidance_session_private_notes for select to authenticated using(organisation_id=public.current_organisation_id() and author_id=auth.uid() and public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor'));
commit;
