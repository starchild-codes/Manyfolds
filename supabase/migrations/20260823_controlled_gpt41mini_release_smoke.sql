-- Controlled counsellor release approval only. This is not a full benchmark approval.
insert into ai_model_allowlist(model_id,enabled,review_status,reviewed_at,notes)
values (
  'openai/gpt-4.1-mini',
  true,
  'approved',
  now(),
  'Controlled counsellor release smoke passed: 4/4 profiles, manyfolds-roadmap-eval-v5 / manyfolds-roadmap-v3 / manyfolds-roadmap-schema-v2; live search disabled. Full benchmark status remains separate.'
)
on conflict(model_id) do update set
  enabled=excluded.enabled,
  review_status=excluded.review_status,
  reviewed_at=excluded.reviewed_at,
  notes=excluded.notes;
