begin;
create table if not exists public.school_email_delivery(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),invitation_id uuid not null references public.school_staff_invitations(id),recipient text not null,requested_by uuid not null references auth.users(id),
 status text not null check(status in('sending','sent','failed','unknown')),attempt integer not null default 1 check(attempt between 1 and 3),provider_message_id text,last_error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(invitation_id)
);
alter table public.school_email_delivery enable row level security;
revoke all on public.school_email_delivery from anon,authenticated;
grant all on public.school_email_delivery to service_role;
commit;
