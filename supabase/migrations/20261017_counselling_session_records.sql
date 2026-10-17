begin;
alter table public.guidance_activities add constraint guidance_activity_school_unique unique(organisation_id,id);
create table public.guidance_session_records (
 organisation_id uuid not null references public.organisations(id),
 activity_id uuid not null,
 details jsonb not null check(jsonb_typeof(details)='object'),
 version integer not null default 1 check(version>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(organisation_id,activity_id),
 foreign key(organisation_id,activity_id) references public.guidance_activities(organisation_id,id) on delete cascade
);
create table public.guidance_session_private_notes (
 organisation_id uuid not null references public.organisations(id),
 activity_id uuid not null,
 author_id uuid not null references auth.users(id),
 body text not null check(length(body)<=20000),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 primary key(organisation_id,activity_id,author_id),
 foreign key(organisation_id,activity_id) references public.guidance_activities(organisation_id,id) on delete cascade
);
alter table public.guidance_session_records enable row level security;
alter table public.guidance_session_private_notes enable row level security;
revoke all on public.guidance_session_records,public.guidance_session_private_notes from anon,authenticated;
grant select on public.guidance_session_records,public.guidance_session_private_notes to authenticated;
create policy "counselling team reads session records" on public.guidance_session_records for select to authenticated
 using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','counsellor'));
create policy "authors read private session notes" on public.guidance_session_private_notes for select to authenticated
 using(organisation_id=public.current_organisation_id() and author_id=auth.uid() and public.current_organisation_role() in('owner','admin','counsellor'));
create function public.record_session_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into school_audit_events(organisation_id,event_type,actor_id,subject_key,metadata)
 values(new.organisation_id,tg_table_name||'.'||lower(tg_op),nullif(current_setting('manyfolds.actor',true),''),new.activity_id::text,jsonb_build_object('version',new.version));
 return new;
end $$;
revoke all on function public.record_session_change() from public,anon,authenticated;
create trigger session_record_audit after insert or update on public.guidance_session_records for each row execute function public.record_session_change();
create trigger session_private_note_audit after insert or update on public.guidance_session_private_notes for each row execute function public.record_session_change();
-- All activity changes now pass server validation, including session completion gates.
revoke insert,update,delete on public.guidance_activities from anon,authenticated;
revoke update(title,scheduled_at,status,summary,updated_by,updated_at,version) on public.guidance_activities from authenticated;
commit;
