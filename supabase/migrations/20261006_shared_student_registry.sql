-- Shared student roster. Counsellor-only notes remain in counsellor_private_records.
create table if not exists public.student_registry_records (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  external_key text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version bigint not null default 1 check (version > 0),
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, external_key),
  check (length(external_key) between 1 and 120),
  check (payload->>'id' = external_key),
  check (nullif(btrim(payload->>'name'), '') is not null)
);

create index if not exists student_registry_records_recent_idx
  on public.student_registry_records(organisation_id, updated_at desc);

-- Preserve each existing counsellor record. A repeat run never overwrites a
-- student already edited in the shared register.
insert into public.student_registry_records
  (organisation_id, external_key, payload, created_by, updated_by, created_at, updated_at)
select organisation_id, external_key, payload, counsellor_external_id,
       counsellor_external_id, created_at, updated_at
from (
  select distinct on (organisation_id, external_key) *
  from public.counsellor_private_records
  where record_type = 'student'
    and jsonb_typeof(payload) = 'object'
    and payload->>'id' = external_key
    and nullif(btrim(payload->>'name'), '') is not null
  order by organisation_id, external_key, updated_at desc
) legacy
on conflict (organisation_id, external_key) do nothing;

alter table public.student_registry_records enable row level security;
revoke all on public.student_registry_records from anon, authenticated;
grant select, insert, update, delete on public.student_registry_records to authenticated;

drop policy if exists "school staff read shared students" on public.student_registry_records;
create policy "school staff read shared students" on public.student_registry_records
  for select to authenticated
  using (organisation_id = public.current_organisation_id());

drop policy if exists "guidance staff create shared students" on public.student_registry_records;
create policy "guidance staff create shared students" on public.student_registry_records
  for insert to authenticated
  with check (organisation_id = public.current_organisation_id()
    and public.current_organisation_role() in ('owner', 'admin', 'counsellor'));

drop policy if exists "guidance staff update shared students" on public.student_registry_records;
create policy "guidance staff update shared students" on public.student_registry_records
  for update to authenticated
  using (organisation_id = public.current_organisation_id()
    and public.current_organisation_role() in ('owner', 'admin', 'counsellor'))
  with check (organisation_id = public.current_organisation_id()
    and public.current_organisation_role() in ('owner', 'admin', 'counsellor'));

drop policy if exists "school admins delete shared students" on public.student_registry_records;
create policy "school admins delete shared students" on public.student_registry_records
  for delete to authenticated
  using (organisation_id = public.current_organisation_id()
    and public.current_organisation_role() in ('owner', 'admin'));
