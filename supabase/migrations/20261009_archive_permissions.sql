begin;
-- Archives/restores are available only through the owner/admin server workflow.
revoke update on public.student_registry_records from authenticated;
grant update(payload,version,updated_by,updated_at) on public.student_registry_records to authenticated;
commit;
