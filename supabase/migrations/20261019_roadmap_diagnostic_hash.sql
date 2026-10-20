-- Fingerprint the exact saved answers used, including when answers change while
-- the model request is running. Legacy drafts require regeneration if a saved
-- diagnostic exists; timestamps cannot establish which answers were used.
alter table public.roadmap_evidence_snapshots
  add column if not exists diagnostic_profile_hash text;
