-- The production roadmap models explicitly selected for this release.
insert into ai_model_allowlist(model_id,enabled,review_status,reviewed_at,notes)
values
  ('mistralai/mistral-small-3.2-24b-instruct',true,'approved',now(),'Manyfolds primary roadmap model; live schema and factual validation passed'),
  ('openai/gpt-4.1-mini',true,'approved',now(),'Manyfolds fallback roadmap model; live schema and factual validation passed')
on conflict(model_id) do update set
  enabled=excluded.enabled,
  review_status=excluded.review_status,
  reviewed_at=excluded.reviewed_at,
  notes=excluded.notes;

-- GPT-OSS-120B truncated the required roadmap schema at the production output cap.
update ai_model_allowlist set enabled=false
where model_id='openai/gpt-oss-120b';

-- Bounded attempts share a session cap informed by live roadmap usage.
alter table ai_generation_sessions
  drop constraint if exists ai_generation_sessions_total_tokens_check;
alter table ai_generation_sessions
  add constraint ai_generation_sessions_total_tokens_check check (total_tokens <= 9000);

-- One primary correction followed by one fallback is at most three attempts.
alter table ai_generation_sessions
  drop constraint if exists ai_generation_sessions_retry_count_check;
alter table ai_generation_sessions
  add constraint ai_generation_sessions_retry_count_check check (retry_count between 0 and 2);
alter table ai_usage_records
  drop constraint if exists ai_usage_records_attempt_check;
alter table ai_usage_records
  add constraint ai_usage_records_attempt_check check (attempt between 1 and 3);
