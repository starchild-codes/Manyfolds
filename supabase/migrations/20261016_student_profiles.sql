begin;
create table public.student_guidance_profiles (
 organisation_id uuid not null references public.organisations(id),
 student_key text not null,
 details jsonb not null check(jsonb_typeof(details)='object'),
 version integer not null default 1 check(version>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(organisation_id,student_key),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete restrict
);
create table public.student_guidance_profile_history (
 organisation_id uuid not null references public.organisations(id),
 student_key text not null,
 details jsonb not null,
 version integer not null,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null,
 primary key(organisation_id,student_key,version),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete restrict
);
alter table public.student_guidance_profiles enable row level security;
alter table public.student_guidance_profile_history enable row level security;
revoke all on public.student_guidance_profiles,public.student_guidance_profile_history from anon,authenticated;
grant select on public.student_guidance_profiles,public.student_guidance_profile_history to authenticated;
create policy "counselling staff read school profiles" on public.student_guidance_profiles for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','counsellor'));
create policy "counselling staff read school profile history" on public.student_guidance_profile_history for select to authenticated using(organisation_id=public.current_organisation_id() and public.current_organisation_role() in('owner','admin','counsellor'));
create function public.preserve_guidance_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into student_guidance_profile_history(organisation_id,student_key,details,version,updated_by,updated_at) values(old.organisation_id,old.student_key,old.details,old.version,old.updated_by,old.updated_at);
 return new;
end $$;
revoke all on function public.preserve_guidance_profile() from public,anon,authenticated;
create trigger guidance_profile_history before update on public.student_guidance_profiles for each row execute function public.preserve_guidance_profile();
create trigger guidance_profile_audit after insert or update on public.student_guidance_profiles for each row execute function public.record_school_change();
commit;
