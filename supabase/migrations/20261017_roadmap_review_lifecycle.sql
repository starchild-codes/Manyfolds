begin;
alter table public.roadmap_generations add column version integer not null default 1 check(version>0);
alter table public.roadmap_generations add column updated_by uuid references auth.users(id);
create trigger roadmap_review_audit after update on public.roadmap_generations for each row execute function public.record_school_change();
-- Reviews use the authenticated server and atomic version checks.
revoke insert,update,delete on public.roadmap_generations from anon,authenticated;
commit;
