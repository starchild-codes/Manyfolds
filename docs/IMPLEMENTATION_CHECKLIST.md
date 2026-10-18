# Manyfolds launch checklist

Source of truth: Product_info.md. Updated 19 October 2026.

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
- [x] Recoverable UI error screen for rendering/chunk-load failures; explicit JavaScript-required fallback.
- [x] Build, lint and app-test GitHub Actions workflow prepared for pushes and pull requests. It needs to reach the remote repository to become active.
- [x] All 107 public database tables have RLS enabled (17 October audit).
- [x] Official-source claim gates, expiry, review queue and scheduled freshness checks.
- [x] Recheck changed NLSIU, NID and NSP pilot facts against current official sources on 17 October.

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

Catalogue coverage after the 17 October source audit: 32 active claims, four verified scholarship listings,
31 staged candidates and twelve checked source monitors. This is a verified pilot,
not comprehensive national coverage. Changed sources can reduce coverage pending review.

## Remaining launch requirements

Manyfolds is not 100% commercially ready while these requirements remain open.

- [x] Select Manyfolds as the sole deployment target and remove the local Motive association.
- [x] Restore Vercel authentication, link manyfolds, configure environment settings and deploy https://manyfolds.vercel.app. Hosted HTTP and database readiness checks pass.
- [ ] Upgrade the current Vercel Hobby team before commercial use.
- [x] Real Google sign-in, production callback and saved-session persistence for the existing owner account.
- [ ] Fresh-school onboarding and confirmed-email invitation acceptance on the deployed origin.
- [ ] Configure a custom SMTP sender and verify real signup-confirmation/password-reset delivery. No custom SMTP host is currently configured; Supabase's built-in sender is restricted to project-team addresses.
- [ ] Full browser QA of critical journeys, mobile layouts, accessibility, loading/error states and concurrent edits.
- [x] Structured student academics (manual/CSV/history), interests, skills evidence, restricted practical constraints, family conversations and career exploration. Approved guardian summaries export separately.
- [x] Shared checklist progress per student and direction, conflict checks and teacher read access.
- [x] Private student document upload, role-restricted metadata, signed expiring downloads and archive/restore.
- [ ] Configure contractual document retention/purge rules and verify backup restoration. Archived files currently remain stored and count toward quotas.
- [x] Roadmap review, approval and publication gates; atomic version conflicts; edits reset approval; private saved review notes.
- [ ] Full pathway/action-plan workflow: approval/publish lifecycle, alternatives, richer task dependencies and final shareable outputs. Checklist progress now persists to the server.
- [x] Authenticated live AI generation and draft/review/approval/publication transitions using a synthetic student. Approved model choices and token ceilings were preserved.
- [ ] Recheck current source freshness at roadmap approval/publication, beyond validating the saved evidence snapshot.
- [x] Expanded session records, active staff assignment, live pre-session briefing, completion outcome gate, author-private notes and separately approved guardian summaries. Session/parent summaries, action sheets and own internal case notes export as text documents.
- [ ] Additional note visibility for separately authorized school leadership; printable document layouts; linked task/calendar creation from recorded session actions.
- [x] Personal My Plan bookmarks persist across devices, with user/school isolation, idempotent saves, one preferred option and explicit import of older browser bookmarks. This is distinct from an approved student action plan.
- [ ] Task recurrence, assignment controls, follow-up automation and notifications.
- [ ] Full staff-role matrix from the specification beyond owner/admin/counsellor/teacher.
- [ ] Outcome, cohort and equity reports; current counts do not measure readiness or outcomes.
- [ ] Required public pages and a working contact/demo request destination.
- [ ] National verified routes, fee/benefit/recognition facts and state adapters from VERIFIED_DATA_EXPANSION_PLAN.md.
- [ ] Production monitoring, backup/restore drill, retention controls and operational ownership.

Do not promote stale facts, invent statistics, enable unapproved models or describe
unchecked production journeys as passed to make this checklist appear complete.

## Verification on 17 October

Profile and document migrations are applied in the configured project. The operations HTTP suite checks profile revisions, invalid dates, teacher restrictions, approved-summary isolation, academic CSV duplicates, shared planning conflicts, private/shared documents, file signature rejection, idempotent uploads, tampered download links, archive/restore and revoked membership. Only temporary schools were modified. The initial audit covered 104 public tables; the later session/bookmark migrations bring the latest audit to 107/107. New profile/document screens build and lint. Initial browser verification stopped at that point; later authenticated checks are recorded below.

The Manyfolds Vercel adapter and deployment guard are implemented. Local rewritten-API and roadmap lifecycle integration tests pass. Vercel authentication succeeded and production is deployed. Hosted SPA routes, database health, anonymous API rejection, unknown routes and cross-origin mutation rejection pass. Supabase production callback configuration is applied. Google sign-in and several authenticated production journeys are now checked below; the hosting team is still on Hobby.

The session and personal-bookmark migrations are applied. Guidance integration tests exercise completion validation, date validation, staff assignment, atomic versions, private-note conflicts, colleague denial, briefing, approved-only guardian exports, internal export isolation and redacted audits. Bookmark integration tests exercise persistence, duplicate retries, same-school author isolation, other-school isolation, teacher bookmarks, simultaneous preferred-option updates, quota and RLS. The full app, operations, school, student, RLS, roadmap review, production HTTP and adapter suites passed. One bookmark test initially hit an intermittent database acquisition failure; a clean rerun passed. This remains a real availability concern to monitor, not a hidden test success.

Seventeen existing pilot claims were rechecked against the current NLSIU, NID and NSP pages on 17 October. Other stale claims remain withheld. The scheduled-workflow source now runs the strict pilot recheck after freshness/staging checks; this workflow change still needs to reach the remote repository before it affects GitHub's schedule.

## Authenticated production verification, 17-18 October

Google sign-in returned successfully to the deployed owner workspace. Browser checks created one clearly named synthetic student, scheduled and completed a session with required outcomes, saved an author-private note and a separately approved shareable summary, and downloaded the guardian summary. The downloaded file contained only the approved summary; the private note was absent. All seven diagnostic steps saved, the completed exploration report loaded, and a personal pathway bookmark persisted across navigation/reload. No real student was edited. The live report counted the synthetic completed session and completed diagnostic.

The first AI generation hit the hosting timeout. The model catalogue refresh performed hundreds of sequential database writes; it now uses one atomic batch. A live request then reached the approved fallback after a primary-provider 429. One fallback response failed factual validation and was withheld; a subsequent request saved an AI draft and completed the reviewed, approved and published status transitions. This test exposed an additional compaction bug: programme evidence could be removed while its eligibility label survived. Compaction now resets that result to insufficient data, and the validator rejects that inconsistency even in older snapshots. Drafts without sources are explicitly described as profile-based exploration guidance.

Model refresh tests cover atomic writes, duplicate provider IDs, cache reuse, configured approval/priority preservation and recovery after a health cooldown. Model attempts now share a bounded request time budget. Auth and HTTP waiting are bounded, and the UI displays the safe generation failure reason. The app, build, lint and roadmap lifecycle tests pass.

Live layout checks found and fixed the unbounded sidebar, clipped modal height and sticky session header. Sidebar navigation styles are now scoped to the sidebar so session/profile tabs no longer inherit full-width navigation controls. Diagnostic card actions are React components with explicit student context; the former DOM enhancer incorrectly injected duplicate actions into My Plan.

A further live draft used tentative degree-to-career wording without relationship evidence. A regression now rejects that wording; existing invalid saved drafts return a verification-required state with regeneration, rather than being presented as never generated. Phone-width checks covered roadmap status, horizontal overflow and access to Settings through the scrolling navigation. The browser viewport was restored. This is a limited responsive check, not full mobile/accessibility coverage.

Forced regeneration of the same evidence now resets a previously published roadmap to draft, clears review/approval timestamps, increments its version and links the newly generated step record. The generation persistence integration test exercises the actual generation/save/cache/review path with mocked provider responses inside a rolled-back database transaction; it makes no chargeable provider call.

Prompt v7 and additional sparse-evidence checks reject unsupported degree suggestions, entrance-exam preparation and admissions feasibility/marks advice. The regression suite retains safe research/verification wording and rejects the live failure examples. Archived students cannot start a generation or save roadmap review changes; this is covered by the rolled-back generation persistence test before any mocked provider call.

## Verification on 19 October

Prompt v8 uses an evidence-dependent response schema: when verified pathway relationships are absent, admissions stages, route options and route-specific trade-offs must be empty. Server generation validation enforces the same restriction even if the provider ignores it, while accounting for reported usage before validation. An actual approved-provider generation through the service saved a draft with empty stages, profile-based exploration actions and insufficient-data eligibility. This is exploration guidance, not verified admissions advice. The UI explains empty trade-offs and stages explicitly.

School-board input is now mapped to board rather than stream, and current state/city are separate from study-location constraints. A national study preference is no longer narrowed to the current state. Schema-valid factual failures count against model health. Regression tests cover these cases, failed replies preserving the existing draft, archive write denial and regeneration invalidating publication. Approved models and token ceilings remain unchanged.

The final approved-provider service request saved a draft in 7.55 seconds after a primary-provider 429 and configured fallback. The deployed browser loaded the saved draft with explicit AI origin, no-source notice and insufficient-data eligibility. Session layout checks confirmed a static header, flex tabs and dialog bounds inside the viewport. API clients and the initial protected-workspace check now bound authentication waiting; remaining unbounded workspace/private/student/verification HTTP requests also have time limits. Session-check failures show an explicit retry state.

The synthetic QA student was archived, its synthetic session cancelled and its personal bookmark removed. The two real student rows were compared before/after cleanup and remained unchanged. Archived diagnostic/session/AI history and provider usage were preserved. The interrupted old QA generation was marked failed. Screenshots and the verified guardian export are local ignored QA artifacts.
