-- Add the missing tenant boundary to counsellor-owned dashboard data.
alter table public.counsellor_private_records
  add column if not exists organisation_id uuid references public.organisations(id) on delete cascade;

-- Existing records were saved against the counsellor's auth user ID.
update public.counsellor_private_records as record
set organisation_id = (
  select membership.organisation_id
  from public.organisation_memberships as membership
  where membership.user_id::text = record.counsellor_external_id
    and membership.active
  order by membership.created_at
  limit 1
)
where record.organisation_id is null;

do $$
begin
  if exists (select 1 from public.counsellor_private_records where organisation_id is null) then
    raise exception 'Private records without an active organisation require manual assignment';
  end if;
end $$;

alter table public.counsellor_private_records
  alter column organisation_id set not null;

alter table public.counsellor_private_records
  drop constraint if exists counsellor_private_records_counsellor_external_id_record_ty_key;

create unique index if not exists counsellor_private_records_tenant_key
  on public.counsellor_private_records(organisation_id,counsellor_external_id,record_type,external_key);
create index if not exists counsellor_private_records_tenant_scope_idx
  on public.counsellor_private_records(organisation_id,counsellor_external_id,record_type,updated_at desc);

alter table public.counsellor_private_records enable row level security;
revoke all on table public.counsellor_private_records from anon, authenticated;
grant select, insert, update, delete on table public.counsellor_private_records to authenticated;

drop policy if exists "counsellors read own private records" on public.counsellor_private_records;
create policy "counsellors read own private records" on public.counsellor_private_records
  for select to authenticated
  using (organisation_id = public.current_organisation_id() and counsellor_external_id = (select auth.uid())::text);

drop policy if exists "counsellors insert own private records" on public.counsellor_private_records;
create policy "counsellors insert own private records" on public.counsellor_private_records
  for insert to authenticated
  with check (organisation_id = public.current_organisation_id() and counsellor_external_id = (select auth.uid())::text);

drop policy if exists "counsellors update own private records" on public.counsellor_private_records;
create policy "counsellors update own private records" on public.counsellor_private_records
  for update to authenticated
  using (organisation_id = public.current_organisation_id() and counsellor_external_id = (select auth.uid())::text)
  with check (organisation_id = public.current_organisation_id() and counsellor_external_id = (select auth.uid())::text);

drop policy if exists "counsellors delete own private records" on public.counsellor_private_records;
create policy "counsellors delete own private records" on public.counsellor_private_records
  for delete to authenticated
  using (organisation_id = public.current_organisation_id() and counsellor_external_id = (select auth.uid())::text);

-- TRUNCATE is outside row level security, so exposed roles get only the operations they need.
revoke all on table public.organisations, public.organisation_memberships,
  public.school_classes, public.school_sections from anon, authenticated;
grant select, update on table public.organisations to authenticated;
grant select on table public.organisation_memberships,
  public.school_classes, public.school_sections to authenticated;
