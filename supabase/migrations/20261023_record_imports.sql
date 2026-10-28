begin;
create table if not exists public.school_record_imports(
 id uuid primary key,organisation_id uuid not null references public.organisations(id),kind text not null check(kind in('class','staff','guardians','academics','sessions')),
 request_hash text not null,student_keys text[] not null,before_records jsonb not null,after_records jsonb not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),status text not null default 'completed' check(status in('completed','rolled_back')),rolled_back_at timestamptz
);
alter table public.school_record_imports enable row level security;
revoke all on public.school_record_imports from anon,authenticated;
grant all on public.school_record_imports to service_role;
commit;
