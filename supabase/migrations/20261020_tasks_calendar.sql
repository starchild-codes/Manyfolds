begin;
alter table public.guidance_activities add column if not exists task_details jsonb not null default '{}';
alter table public.guidance_activities add column if not exists completed_at timestamptz;
alter table public.guidance_activities add column if not exists duration_minutes integer not null default 45 check(duration_minutes between 5 and 480);
alter table public.guidance_activities add column if not exists recurrence_id uuid;
alter table public.guidance_activities add column if not exists source_session_id uuid references public.guidance_activities(id);
alter table public.guidance_activities add column if not exists source_action_key text;
do $$ declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.guidance_activities'::regclass and contype='c' and pg_get_constraintdef(oid) like '%status%' loop execute format('alter table public.guidance_activities drop constraint %I',c.conname);end loop;
end $$;
alter table public.guidance_activities add constraint guidance_activity_status check((kind='session' and status in('scheduled','completed','cancelled')) or(kind='task' and status in('open','in_progress','blocked','awaiting_evidence','completed','cancelled')));
create unique index if not exists guidance_source_action_unique on public.guidance_activities(organisation_id,source_session_id,source_action_key) where source_session_id is not null;
create table if not exists public.guidance_task_comments(id uuid primary key,organisation_id uuid not null references public.organisations(id),activity_id uuid not null references public.guidance_activities(id),author_id uuid not null references auth.users(id),body text not null check(length(btrim(body)) between 1 and 3000),created_at timestamptz not null default now());
alter table public.guidance_task_comments enable row level security;
drop policy if exists task_comment_read on public.guidance_task_comments;
create policy task_comment_read on public.guidance_task_comments for select to authenticated using(public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and exists(select 1 from public.guidance_activities a where a.id=activity_id and a.organisation_id=guidance_task_comments.organisation_id and public.school_can_access_student(a.organisation_id,a.student_key,auth.uid())));
grant select on public.guidance_task_comments to authenticated;
grant all on public.guidance_task_comments to service_role;
create table if not exists public.school_calendar_events(
 id uuid primary key,organisation_id uuid not null references public.organisations(id),staff_id uuid not null references auth.users(id),kind text not null check(kind in('school_event','available','unavailable')),title text not null,
 starts_at timestamptz not null,ends_at timestamptz not null,notes text not null default '',recurrence_id uuid,status text not null default 'scheduled' check(status in('scheduled','cancelled')),
 version integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_at>starts_at)
);
create index if not exists school_calendar_staff_schedule on public.school_calendar_events(organisation_id,staff_id,starts_at,ends_at);
create table if not exists public.school_calendar_requests(id uuid primary key,organisation_id uuid not null references public.organisations(id),author_id uuid not null references auth.users(id),request_hash text not null,event_ids uuid[] not null,created_at timestamptz not null default now());
alter table public.school_calendar_events enable row level security;
alter table public.school_calendar_requests enable row level security;
drop policy if exists calendar_read on public.school_calendar_events;
create policy calendar_read on public.school_calendar_events for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher'));
grant select on public.school_calendar_events to authenticated;
grant all on public.school_calendar_events,public.school_calendar_requests to service_role;
alter table public.school_interventions add column if not exists duration_minutes integer not null default 60 check(duration_minutes between 5 and 480);
alter table public.school_interventions add column if not exists details jsonb not null default '{}';
commit;
