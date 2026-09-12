# Manyfolds completion checklist

Source of truth: `Product_info.md`. Audit started 2026-09-12.

## Restored and locally checked

- [x] Restore the Manyfolds dashboard, styling, document title, authenticated Supabase client, and Vite API handlers from b57b3d6.
- [x] Preserve Common Lounge in commit 247e0df and leave its extra files and unrelated user work intact.
- [x] Run existing recommendation, interaction, authentication, roadmap, and programme validation tests.
- [x] Run TypeScript/build and lint.
- [x] Add a secret-free roadmap readiness command: `node --experimental-strip-types scripts/roadmap-readiness.mjs`.

## External blocker

The configured Supabase pooler returns SQLSTATE XX000, ENOTFOUND tenant/user not found.
Database-backed tests, generation, saving, and authenticated end-to-end verification cannot complete until the project is restored or the connection configuration is corrected privately.
No paid generation calls were made during this check.

## Required completion work (not verified or complete)

- [ ] Public pages and contact/demo form: verify against specification section 7.
- [ ] School onboarding, classes, staff roles, invitation and deactivation workflows: verify server persistence and authorization.
- [ ] Students: organisation-scoped registry, imports, assignment, history, archive/restore and bulk actions.
- [ ] Replace the generic Workspace component's seeded demo entries, localStorage-only persistence, and placeholder actions with real records.
- [ ] Sessions, tasks, calendar and interventions: implement linked student records, permissions, forms and live reporting.
- [ ] Remove all fabricated dashboard statistics and audit events; calculate metrics from authorised records.
- [ ] Diagnostic/profile and roadmap: scope to the selected student and persist profile history.
- [ ] Roadmap: validate production evidence compaction preserves decisive constraints, source IDs and explicit relationships.
- [ ] Roadmap: verify live eligibility using the exact runtime environment and preserve model approval gates.
- [ ] Roadmap: test authenticated generation, save/edit/review/approval/publish and material/non-material cache invalidation.
- [ ] Catalogue: verify source freshness, private counsellor additions and programme relationships.
- [ ] Shareable documents: real export with required student/school/staff/date metadata and exclusion of private notes.
- [ ] Reports and school administration: live coverage/outcomes, academic-year rollover with history preserved.
- [ ] Privacy: enforce server and database permissions, audit sensitive operations and test cross-school denial.
- [ ] Deployment: provide a production server for every API route; verify deployed auth and persistence.
- [ ] Browser QA: exercise every navigation, form, filter and action, including loading/error/empty states.

Existing passing source-level checks do not establish completion of these workflows.
