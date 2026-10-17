begin;
create table public.student_planning_checklists (
 organisation_id uuid not null references public.organisations(id),
 student_key text not null,
 direction text not null check(length(direction) between 1 and 300),
 steps jsonb not null check(jsonb_typeof(steps)='array'),
 version integer not null default 1 check(version>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(organisation_id,student_key,direction),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete restrict
);
alter table public.student_planning_checklists enable row level security;
revoke all on public.student_planning_checklists from anon,authenticated;
grant select on public.student_planning_checklists to authenticated;
create policy "school staff read planning checklists" on public.student_planning_checklists for select to authenticated using(organisation_id=public.current_organisation_id());
create trigger planning_checklist_audit after insert or update on public.student_planning_checklists for each row execute function public.record_school_change();
commit;
