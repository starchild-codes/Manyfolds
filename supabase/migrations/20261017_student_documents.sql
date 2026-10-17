begin;
create table public.school_student_documents (
 id uuid primary key,
 organisation_id uuid not null references public.organisations(id),
 student_key text not null,
 filename text not null check(length(filename) between 1 and 200),
 media_type text not null check(media_type in('application/pdf','image/png','image/jpeg','text/plain')),
 category text not null check(category in('Consent','Academic record','Student work','Meeting record','Summary','Pathway comparison','Institution document')),
 visibility text not null default 'counselling_staff' check(visibility in('counselling_staff','school_staff')),
 content bytea not null,
 size_bytes integer not null check(size_bytes between 1 and 5242880 and size_bytes=octet_length(content)),
 sha256 text not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 archived_at timestamptz,
 archived_by uuid references auth.users(id),
 foreign key(organisation_id,student_key) references public.student_registry_records(organisation_id,external_key) on delete restrict
);
create index school_student_documents_student on public.school_student_documents(organisation_id,student_key,created_at);
alter table public.school_student_documents enable row level security;
revoke all on public.school_student_documents from anon,authenticated;
grant select(id,organisation_id,student_key,filename,media_type,category,visibility,size_bytes,created_by,created_at,archived_at) on public.school_student_documents to authenticated;
create policy "school staff read authorized document metadata" on public.school_student_documents for select to authenticated using(organisation_id=public.current_organisation_id() and (visibility='school_staff' or public.current_organisation_role() in('owner','admin','counsellor')));
create trigger student_document_audit after insert or update on public.school_student_documents for each row execute function public.record_school_change();
commit;
