begin;
create table if not exists public.guidance_session_leadership_notes(
 organisation_id uuid not null references public.organisations(id),activity_id uuid not null,
 body text not null check(length(body)<=20000),version integer not null default 1 check(version>0),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 primary key(organisation_id,activity_id),
 foreign key(organisation_id,activity_id) references public.guidance_activities(organisation_id,id) on delete cascade
);
create table if not exists public.guidance_session_leadership_note_history(
 organisation_id uuid not null,activity_id uuid not null,version integer not null,body text not null,
 updated_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 primary key(organisation_id,activity_id,version),
 foreign key(organisation_id,activity_id) references public.guidance_session_leadership_notes(organisation_id,activity_id) on delete cascade
);
alter table public.guidance_session_leadership_notes enable row level security;
alter table public.guidance_session_leadership_note_history enable row level security;
revoke all on public.guidance_session_leadership_notes,public.guidance_session_leadership_note_history from anon,authenticated;
grant select on public.guidance_session_leadership_notes,public.guidance_session_leadership_note_history to authenticated;
grant all on public.guidance_session_leadership_notes,public.guidance_session_leadership_note_history to service_role;
create policy leadership_note_read on public.guidance_session_leadership_notes for select to authenticated using(
 organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor')
 and exists(select 1 from public.guidance_activities a where a.organisation_id=guidance_session_leadership_notes.organisation_id and a.id=activity_id and public.school_can_access_student(a.organisation_id,a.student_key,auth.uid()))
);
create policy leadership_note_history_read on public.guidance_session_leadership_note_history for select to authenticated using(
 organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','lead_counsellor')
 and exists(select 1 from public.guidance_activities a where a.organisation_id=guidance_session_leadership_note_history.organisation_id and a.id=activity_id and public.school_can_access_student(a.organisation_id,a.student_key,auth.uid()))
);
create or replace function public.record_leadership_note_change() returns trigger language plpgsql security definer set search_path=public as $$begin
 insert into guidance_session_leadership_note_history(organisation_id,activity_id,version,body,updated_by) values(new.organisation_id,new.activity_id,new.version,new.body,new.updated_by);
 insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata) values(new.organisation_id,'session.leadership_note_saved',new.updated_by::text,new.activity_id::text,jsonb_build_object('version',new.version));
 return new;
end $$;
revoke all on function public.record_leadership_note_change() from public,anon,authenticated;
create trigger leadership_note_history after insert or update on public.guidance_session_leadership_notes for each row execute function public.record_leadership_note_change();
commit;
