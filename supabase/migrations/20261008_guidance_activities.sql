begin;
create table if not exists public.guidance_activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  student_key text not null,
  kind text not null check (kind in ('session','task')),
  title text not null check (length(btrim(title)) between 1 and 200),
  scheduled_at timestamptz not null,
  status text not null check (status in ('scheduled','open','completed','cancelled')),
  summary text not null default '' check (length(summary) <= 5000),
  assigned_to text not null,
  created_by text not null,
  updated_by text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete restrict,
  check ((kind='session' and status in ('scheduled','completed','cancelled')) or
         (kind='task' and status in ('open','completed','cancelled')))
);
create index if not exists guidance_activities_school_schedule_idx on public.guidance_activities(organisation_id,scheduled_at);
create index if not exists guidance_activities_student_idx on public.guidance_activities(organisation_id,student_key);
alter table public.guidance_activities enable row level security;
revoke all on public.guidance_activities from anon,authenticated;
grant select,insert on public.guidance_activities to authenticated;
grant update(title,scheduled_at,status,summary,updated_by,updated_at,version) on public.guidance_activities to authenticated;
drop policy if exists "school staff read guidance activities" on public.guidance_activities;
create policy "school staff read guidance activities" on public.guidance_activities for select to authenticated
  using (organisation_id=public.current_organisation_id());
drop policy if exists "guidance staff create activities" on public.guidance_activities;
create policy "guidance staff create activities" on public.guidance_activities for insert to authenticated
  with check (organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin','counsellor')
    and created_by=(select auth.uid())::text and updated_by=(select auth.uid())::text and assigned_to=(select auth.uid())::text);
drop policy if exists "guidance staff update activities" on public.guidance_activities;
create policy "guidance staff update activities" on public.guidance_activities for update to authenticated
  using (organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin','counsellor'))
  with check (organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin','counsellor')
    and updated_by=(select auth.uid())::text);
commit;
