begin;
create table public.school_staff_invitations (
 id uuid primary key,
 organisation_id uuid not null references public.organisations(id),
 email text not null check(email=lower(email)),
 role text not null check(role in ('admin','counsellor','teacher')),
 token_hash text not null unique,
 created_by text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 accepted_at timestamptz,
 accepted_by text
);
create index on public.school_staff_invitations(organisation_id,created_at);
alter table public.school_staff_invitations enable row level security;
revoke all on public.school_staff_invitations from anon,authenticated;
-- Invitations are accessible only through authenticated, role-checked server endpoints.
create table public.student_diagnostic_history (
 id uuid primary key,
 organisation_id uuid not null,
 student_key text not null,
 revision integer not null check(revision>0),
 profile jsonb not null check(jsonb_typeof(profile)='object'),
 step integer not null check(step between 0 and 6),
 status text not null check(status in ('draft','ready','review_requested')),
 pinned jsonb not null default '[]' check(jsonb_typeof(pinned)='array'),
 created_by text not null,
 created_at timestamptz not null default now(),
 unique(organisation_id,student_key,revision),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete restrict
);
create table public.school_interventions (
 id uuid primary key,
 organisation_id uuid not null references public.organisations(id),
 title text not null check(length(btrim(title)) between 1 and 200),
 scheduled_at timestamptz not null,
 status text not null check(status in ('scheduled','completed','cancelled')),
 summary text not null default '' check(length(summary)<=5000),
 version integer not null default 1,
 created_by text not null,
 updated_by text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organisation_id,id)
);
create table public.school_intervention_students (
 organisation_id uuid not null,
 intervention_id uuid not null,
 student_key text not null,
 primary key(intervention_id,student_key),
 foreign key(organisation_id,intervention_id) references public.school_interventions(organisation_id,id),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete restrict
);
alter table public.student_diagnostic_history enable row level security;
alter table public.school_interventions enable row level security;
alter table public.school_intervention_students enable row level security;
revoke all on public.student_diagnostic_history,public.school_interventions,public.school_intervention_students from anon,authenticated;
grant select on public.student_diagnostic_history,public.school_interventions,public.school_intervention_students to authenticated;
create policy "school diagnostic history" on public.student_diagnostic_history for select to authenticated using(organisation_id=public.current_organisation_id());
create policy "school interventions" on public.school_interventions for select to authenticated using(organisation_id=public.current_organisation_id());
create policy "school intervention students" on public.school_intervention_students for select to authenticated using(organisation_id=public.current_organisation_id());
commit;
