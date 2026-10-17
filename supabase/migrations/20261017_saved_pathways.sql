begin;
create table public.staff_saved_pathways (
 organisation_id uuid not null references public.organisations(id),
 author_id uuid not null references auth.users(id),
 path text not null check(length(path) between 1 and 1600),
 name text not null check(length(btrim(name)) between 1 and 300),
 type text not null check(length(btrim(type)) between 1 and 80),
 preferred boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(organisation_id,author_id,path)
);
create unique index one_preferred_staff_path on public.staff_saved_pathways(organisation_id,author_id) where preferred;
alter table public.staff_saved_pathways enable row level security;
revoke all on public.staff_saved_pathways from anon,authenticated;
grant select on public.staff_saved_pathways to authenticated;
create policy "staff read their own saved paths" on public.staff_saved_pathways for select to authenticated
 using(organisation_id=public.current_organisation_id() and author_id=auth.uid());
commit;
