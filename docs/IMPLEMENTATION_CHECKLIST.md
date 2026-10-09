# Manyfolds launch checklist

Source of truth: Product_info.md. Updated 9 October 2026.

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
- [x] All 100 public database tables have RLS enabled.
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

- [ ] Restore production host access and confirm target: saved Vercel credentials are invalid; local link names motive.
- [ ] Deploy; verify real sign-in, callback, fresh-school onboarding, invitation acceptance and persistence on the deployed origin.
- [ ] Full browser QA of critical journeys, mobile layouts, accessibility, loading/error states and concurrent edits.
- [ ] Complete structured academic history, family conversations, skills evidence and supporting documents.
- [ ] Document storage with signed access, retention rules and tested permissions.
- [ ] Full pathway/action-plan workflow: server-persisted checklist progress, approval/publish lifecycle, alternatives and final shareable outputs.
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
