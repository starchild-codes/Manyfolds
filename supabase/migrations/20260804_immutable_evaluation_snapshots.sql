-- Phase 1: immutable snapshots for future evaluation calls. Legacy rows are deliberately not backfilled.
alter table ai_evaluation_calls
  add column if not exists prompt_version text,
  add column if not exists schema_version text,
  add column if not exists snapshot_status text not null default 'legacy_unverifiable' check (snapshot_status in ('snapshot_complete','snapshot_incomplete','legacy_unverifiable','integrity_failed')),
  add column if not exists profile_fixture_snapshot jsonb,
  add column if not exists evidence_package_snapshot jsonb,
  add column if not exists source_records_snapshot jsonb,
  add column if not exists relationship_records_snapshot jsonb,
  add column if not exists decisive_constraints_snapshot jsonb,
  add column if not exists required_personalisation_effects_snapshot jsonb,
  add column if not exists prompt_input_snapshot jsonb,
  add column if not exists evidence_builder_version text,
  add column if not exists profile_fixture_version text,
  add column if not exists validator_versions jsonb,
  add column if not exists provider_id text,
  add column if not exists token_limit_config jsonb,
  add column if not exists call_isolation_metadata jsonb,
  add column if not exists canonicalization_version text,
  add column if not exists profile_snapshot_hash text check (profile_snapshot_hash is null or profile_snapshot_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists evidence_snapshot_hash text check (evidence_snapshot_hash is null or evidence_snapshot_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists source_records_hash text check (source_records_hash is null or source_records_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists relationship_records_hash text check (relationship_records_hash is null or relationship_records_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists decisive_constraints_hash text check (decisive_constraints_hash is null or decisive_constraints_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists personalisation_effects_hash text check (personalisation_effects_hash is null or personalisation_effects_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists prompt_input_hash text check (prompt_input_hash is null or prompt_input_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists validator_config_hash text check (validator_config_hash is null or validator_config_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists parsed_output_hash text check (parsed_output_hash is null or parsed_output_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists complete_call_input_hash text check (complete_call_input_hash is null or complete_call_input_hash ~ '^[0-9a-f]{64}$');

alter table ai_evaluation_calls add constraint ai_eval_snapshot_complete_requires_inputs check (
 snapshot_status <> 'snapshot_complete' or (profile_fixture_snapshot is not null and evidence_package_snapshot is not null and source_records_snapshot is not null and relationship_records_snapshot is not null and decisive_constraints_snapshot is not null and required_personalisation_effects_snapshot is not null and prompt_input_snapshot is not null and prompt_version is not null and schema_version is not null and evidence_builder_version is not null and profile_fixture_version is not null and validator_versions is not null and model_id is not null and token_limit_config is not null and call_isolation_metadata is not null and canonicalization_version is not null and profile_snapshot_hash is not null and evidence_snapshot_hash is not null and source_records_hash is not null and relationship_records_hash is not null and decisive_constraints_hash is not null and personalisation_effects_hash is not null and prompt_input_hash is not null and validator_config_hash is not null and complete_call_input_hash is not null)
);

create table if not exists ai_evaluation_revalidations (
 id uuid primary key default gen_random_uuid(), organisation_id uuid references organisations(id), original_evaluation_id uuid not null references ai_evaluation_runs(id), reason text not null, requested_validator_versions jsonb not null, canonicalization_version text not null, code_commit text not null, status text not null default 'pending' check (status in ('pending','completed','completed_with_failures','failed_closed','legacy_unverifiable')), calls_found integer not null default 0, calls_eligible integer not null default 0, calls_revalidated integer not null default 0, calls_failed_closed integer not null default 0, model_calls_made integer not null default 0 check (model_calls_made=0), model_cost numeric not null default 0 check (model_cost=0), report_path text, created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz);
create table if not exists ai_evaluation_revalidation_calls (
 id uuid primary key default gen_random_uuid(), revalidation_id uuid not null references ai_evaluation_revalidations(id) on delete cascade, original_call_id uuid not null references ai_evaluation_calls(id), snapshot_integrity_status text not null, output_integrity_status text not null, reconstruction_status text not null check (reconstruction_status in ('revalidated_pass','revalidated_fail','missing_output','missing_evidence','integrity_mismatch','missing_version_metadata','incomplete_call','legacy_unverifiable')), recomputed_validator_results jsonb not null default '{}', recomputed_validation_events jsonb not null default '[]', failure_reason text, original_records_modified boolean not null default false check (original_records_modified=false), model_call_made boolean not null default false check (model_call_made=false), created_at timestamptz not null default now(), unique(revalidation_id,original_call_id));
create index if not exists ai_eval_calls_snapshot_status_idx on ai_evaluation_calls(snapshot_status);
create index if not exists ai_eval_revalidations_original_idx on ai_evaluation_revalidations(original_evaluation_id,created_at);
create index if not exists ai_eval_revalidations_org_idx on ai_evaluation_revalidations(organisation_id,created_at);
create index if not exists ai_eval_revalidation_calls_lookup_idx on ai_evaluation_revalidation_calls(revalidation_id,original_call_id);

alter table ai_evaluation_revalidations add constraint ai_eval_revalidation_counts check (calls_found>=0 and calls_eligible>=0 and calls_revalidated>=0 and calls_failed_closed>=0 and calls_eligible<=calls_found and calls_revalidated<=calls_eligible and calls_failed_closed<=calls_found and model_calls_made=0 and model_cost>=0);

create or replace function protect_revalidation_lifecycle() returns trigger language plpgsql as $$ begin
 if tg_op='DELETE' and old.status <> 'pending' then raise exception 'terminal revalidation records are immutable'; end if;
 if tg_op='UPDATE' and old.status <> 'pending' then raise exception 'terminal revalidation records are immutable'; end if;
 return coalesce(new,old); end $$;
create trigger ai_eval_revalidation_lifecycle before update or delete on ai_evaluation_revalidations for each row execute function protect_revalidation_lifecycle();

create or replace function protect_revalidation_child() returns trigger language plpgsql as $$ declare p text; begin
 select status into p from ai_evaluation_revalidations where id=coalesce(new.revalidation_id,old.revalidation_id); if p is distinct from 'pending' then raise exception 'revalidation child records require a pending parent'; end if; return coalesce(new,old); end $$;
create trigger ai_eval_revalidation_child_lifecycle before insert or update or delete on ai_evaluation_revalidation_calls for each row execute function protect_revalidation_child();

alter table ai_evaluation_revalidations enable row level security;
alter table ai_evaluation_revalidation_calls enable row level security;
create policy ai_eval_revalidation_admin_read on ai_evaluation_revalidations for select using (organisation_id = public.current_organisation_id() and public.current_organisation_role() in ('owner','admin'));
create policy ai_eval_revalidation_admin_write on ai_evaluation_revalidations for all using (organisation_id = public.current_organisation_id() and public.current_organisation_role() in ('owner','admin')) with check (organisation_id = public.current_organisation_id() and public.current_organisation_role() in ('owner','admin'));
create policy ai_eval_revalidation_child_admin_read on ai_evaluation_revalidation_calls for select using (exists (select 1 from ai_evaluation_revalidations r where r.id=revalidation_id and r.organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin')));
create policy ai_eval_revalidation_child_admin_write on ai_evaluation_revalidation_calls for all using (exists (select 1 from ai_evaluation_revalidations r where r.id=revalidation_id and r.organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin'))) with check (exists (select 1 from ai_evaluation_revalidations r where r.id=revalidation_id and r.organisation_id=public.current_organisation_id() and public.current_organisation_role() in ('owner','admin')));

create or replace function prevent_evaluation_snapshot_mutation() returns trigger language plpgsql as $$ begin
 if old.status <> 'in_progress' and row(new.profile_fixture_snapshot,new.evidence_package_snapshot,new.source_records_snapshot,new.relationship_records_snapshot,new.decisive_constraints_snapshot,new.required_personalisation_effects_snapshot,new.prompt_input_snapshot,new.profile_snapshot_hash,new.evidence_snapshot_hash,new.source_records_hash,new.relationship_records_hash,new.decisive_constraints_hash,new.personalisation_effects_hash,new.prompt_input_hash,new.validator_config_hash,new.complete_call_input_hash,new.prompt_version,new.schema_version,new.evidence_builder_version,new.profile_fixture_version,new.validator_versions,new.model_id,new.provider_id,new.token_limit_config,new.call_isolation_metadata,new.canonicalization_version) is distinct from row(old.profile_fixture_snapshot,old.evidence_package_snapshot,old.source_records_snapshot,old.relationship_records_snapshot,old.decisive_constraints_snapshot,old.required_personalisation_effects_snapshot,old.prompt_input_snapshot,old.profile_snapshot_hash,old.evidence_snapshot_hash,old.source_records_hash,old.relationship_records_hash,old.decisive_constraints_hash,old.personalisation_effects_hash,old.prompt_input_hash,old.validator_config_hash,old.complete_call_input_hash,old.prompt_version,old.schema_version,old.evidence_builder_version,old.profile_fixture_version,old.validator_versions,old.model_id,old.provider_id,old.token_limit_config,old.call_isolation_metadata,old.canonicalization_version) then raise exception 'evaluation inputs are immutable after preparation'; end if;
 if old.raw_output_hash is not null and new.raw_output_hash is distinct from old.raw_output_hash then raise exception 'raw output hash is write-once'; end if;
 if old.parsed_output_hash is not null and new.parsed_output_hash is distinct from old.parsed_output_hash then raise exception 'parsed output hash is write-once'; end if; return new; end $$;
drop trigger if exists ai_eval_snapshot_immutable on ai_evaluation_calls;
create trigger ai_eval_snapshot_immutable before update on ai_evaluation_calls for each row execute function prevent_evaluation_snapshot_mutation();
