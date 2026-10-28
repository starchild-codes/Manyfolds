begin;
create table if not exists public.school_task_assignment_events(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),
 activity_id uuid not null,student_key text not null,to_staff text not null,from_staff text not null,
 occurred_at timestamptz not null default now(),activity_version integer not null,
 foreign key(organisation_id,activity_id) references public.guidance_activities(organisation_id,id) on delete cascade
);
alter table public.school_task_assignment_events enable row level security;
revoke all on public.school_task_assignment_events from anon,authenticated;
grant select on public.school_task_assignment_events to authenticated;
grant all on public.school_task_assignment_events to service_role;
create policy task_assignment_events_read on public.school_task_assignment_events for select to authenticated using(organisation_id=public.current_organisation_id() and to_staff=auth.uid()::text and public.current_organisation_role() in('owner','admin','lead_counsellor','counsellor','guidance_teacher') and public.school_can_access_student(organisation_id,student_key,auth.uid()));
create or replace function public.record_task_assignment_event() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.kind='task' and new.assigned_to is distinct from old.assigned_to then
  insert into school_task_assignment_events(organisation_id,activity_id,student_key,to_staff,from_staff,activity_version) values(new.organisation_id,new.id,new.student_key,new.assigned_to,old.assigned_to,new.version);
 end if;
 return new;
end $$;
revoke all on function public.record_task_assignment_event() from public,anon,authenticated;
create trigger task_assignment_event after update on public.guidance_activities for each row execute function public.record_task_assignment_event();
commit;
