# Manyfolds launch checklist

Source of truth: Product_info.md. Updated 17 October 2026.

## Implemented and checked locally

- [x] Shared student registry, server-confirmed saves, version conflicts and school isolation.
- [x] Student edit form: name, class, recorded guidance stage, active staff assignment, pathway and priority.
- [x] CSV mapping, preview, duplicate detection, atomic imports and guarded rollback.
- [x] Archive/restore and prior student versions; linked guidance is preserved.
- [x] School configuration, classes/sections and version conflicts.
- [x] Academic-year preview, class changes, archive choices and guarded undo.
- [x] Email-bound staff invitations, expiry, revocation, acceptance, role changes and access removal.
- [x] Linked sessions, follow-ups, calendar and group interventions with summaries and status updates.
- [x] Student diagnostic history, saved/unsaved states and selected-student roadmap context.
- [x] Private student notes: author-only API/RLS reads; text excluded from audit and exports.
- [x] Recorded audit events and export initiation logging.
- [x] Real activity report counts, CSV exports and spreadsheet formula protection.
- [x] Persisted resources, eleven conversation templates, live pipeline and account settings.
- [x] Replace generic local-note Workspace pages and remove unreachable legacy catalogue UI.
- [x] Production Node server serves all APIs and SPA routes without Vite.
- [x] Production package runs with runtime dependencies only.
- [x] All 104 public database tables have RLS enabled.
- [x] Official-source claim gates, expiry, review queue and scheduled freshness checks.
- [x] Recheck changed NLSIU, NID and NSP pilot facts against current official sources on 9 October.

## Evidence and limits

Build, lint and the app suite passed. Database/HTTP tests cover invitations,
diagnostics, interventions, guidance, operations, conflicts, rollback, privacy and
school isolation. Operations tests create temporary schools and remove fixtures.
Their identities are injected; they do not establish a deployed login journey.
Production HTTP and production-only package tests passed.

Signed-in browser checks inspected administration, resources, reports, the student
registry and summary export in the local production server. No real student note,
diagnostic or guidance record was created by browser checks. These checks do not
establish full coverage of all forms or the deployed application.

Catalogue coverage: 37 active claims, four verified scholarship listings,
31 staged candidates and twelve checked source monitors. This is a verified pilot,
not comprehensive national coverage. Changed sources can reduce coverage pending review.

## Remaining launch requirements

Manyfolds is not 100% commercially ready while these requirements remain open.

- [x] Select Manyfolds as the sole deployment target and remove the local Motive association.
- [x] Restore Vercel authentication, link manyfolds, configure environment settings and deploy https://manyfolds.vercel.app. Hosted HTTP and database readiness checks pass.
- [ ] Upgrade the current Vercel Hobby team before commercial use.
- [ ] Verify real sign-in, callback, fresh-school onboarding, invitation acceptance and persistence on the deployed origin.
- [ ] Full browser QA of critical journeys, mobile layouts, accessibility, loading/error states and concurrent edits.
- [x] Structured student academics (manual/CSV/history), interests, skills evidence, restricted practical constraints, family conversations and career exploration. Approved guardian summaries export separately.
- [x] Shared checklist progress per student and direction, conflict checks and teacher read access.
- [x] Private student document upload, role-restricted metadata, signed expiring downloads and archive/restore.
- [ ] Configure contractual document retention/purge rules and verify backup restoration. Archived files currently remain stored and count toward quotas.
- [x] Roadmap review, approval and publication gates; atomic version conflicts; edits reset approval; private saved review notes.
- [ ] Full pathway/action-plan workflow: approval/publish lifecycle, alternatives, richer task dependencies and final shareable outputs. Checklist progress now persists to the server.
- [ ] Verify authenticated live AI generation and approval/evaluation gates in production. Model choices were preserved in this work.
- [ ] Expanded session fields, pre-session briefing, private session notes and required document variants.
- [ ] Task recurrence, assignment controls, follow-up automation and notifications.
- [ ] Full staff-role matrix from the specification beyond owner/admin/counsellor/teacher.
- [ ] Outcome, cohort and equity reports; current counts do not measure readiness or outcomes.
- [ ] Required public pages and a working contact/demo request destination.
- [ ] National verified routes, fee/benefit/recognition facts and state adapters from VERIFIED_DATA_EXPANSION_PLAN.md.
- [ ] Production monitoring, backup/restore drill, retention controls and operational ownership.

Do not promote stale facts, invent statistics, enable unapproved models or describe
unchecked production journeys as passed to make this checklist appear complete.

## Verification on 17 October

Profile and document migrations are applied in the configured project. The operations HTTP suite checks profile revisions, invalid dates, teacher restrictions, approved-summary isolation, academic CSV duplicates, shared planning conflicts, private/shared documents, file signature rejection, idempotent uploads, tampered download links, archive/restore and revoked membership. Only temporary schools were modified. The RLS audit reports 104/104 public tables enabled. New profile/document screens build and lint; browser verification of these screens is incomplete because Computer Use stopped when it could not reliably identify the Windows browser URL.

The Manyfolds Vercel adapter and deployment guard are implemented. Local rewritten-API and roadmap lifecycle integration tests pass. Vercel authentication succeeded and production is deployed. Hosted SPA routes, database health, anonymous API rejection, unknown routes and cross-origin mutation rejection pass. Supabase production callback configuration is applied. Authenticated browser journeys remain unverified; the hosting team is still on Hobby.
