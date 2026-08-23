-- First-login school setup. New users are deliberately not assigned a generic workspace.
drop trigger if exists on_manyfolds_auth_user_created on auth.users;

alter table organisations
  add column if not exists school_type text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text not null default 'India',
  add column if not exists approximate_student_count integer check (approximate_student_count is null or approximate_student_count >= 0),
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists school_classes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  class_name text not null,
  created_at timestamptz not null default now(),
  unique(organisation_id,class_name)
);
create table if not exists school_sections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  class_id uuid not null references school_classes(id) on delete cascade,
  section_name text not null,
  created_at timestamptz not null default now(),
  unique(class_id,section_name)
);
create index if not exists school_classes_org_idx on school_classes(organisation_id);
create index if not exists school_sections_org_idx on school_sections(organisation_id,class_id);

alter table school_classes enable row level security;
alter table school_sections enable row level security;

drop policy if exists "members read own school classes" on school_classes;
create policy "members read own school classes" on school_classes for select using (organisation_id=public.current_organisation_id());
drop policy if exists "members read own school sections" on school_sections;
create policy "members read own school sections" on school_sections for select using (organisation_id=public.current_organisation_id());

-- Settings are server-mediated; only owners and admins may update their organisation settings.
drop policy if exists "owners update own organisation" on organisations;
create policy "owners update own organisation" on organisations for update
using (id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin'))
with check (id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin'));
