begin;
create table public.student_private_notes (
 organisation_id uuid not null references public.organisations(id),
 student_key text not null,
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(body)<=20000),
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key(organisation_id,student_key,author_id),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete restrict
);
alter table public.student_private_notes enable row level security;
revoke all on public.student_private_notes from anon,authenticated;
grant select on public.student_private_notes to authenticated;
create policy "authors read their private student notes" on public.student_private_notes for select to authenticated
 using(author_id=auth.uid() and organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','counsellor'));
create trigger private_student_note_change after insert or update on public.student_private_notes for each row execute function public.record_school_change();
commit;
