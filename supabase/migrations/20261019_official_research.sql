begin;
create table public.official_research_requests (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id),
 author_id uuid not null references auth.users(id),
 subject text not null,
 topic text not null,
 cycle integer not null check(cycle between 2020 and 2100),
 status text not null default 'pending' check(status in ('pending','complete','failed')),
 result jsonb,
 usage jsonb not null default '[]',
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index official_research_cache on public.official_research_requests(organisation_id,subject,topic,cycle,created_at desc);
create index official_research_rate on public.official_research_requests(author_id,created_at desc);
alter table public.official_research_requests enable row level security;
revoke all on public.official_research_requests from anon,authenticated;
grant select on public.official_research_requests to authenticated;
create policy "school staff read official research" on public.official_research_requests
 for select to authenticated using(organisation_id=public.current_organisation_id());
commit;
