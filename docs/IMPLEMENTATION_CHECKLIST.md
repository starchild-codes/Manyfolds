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
- [x] Recheck catalogue source state and claim expiry at roadmap review/approval/publication, beyond validating the saved snapshot. Changed or legacy sourced drafts require regeneration; this does not replace official-source monitoring.
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


## Official research, coverage and email workflows, 19 October

Authenticated roadmap research now uses a live OpenRouter/Exa search of eight supported official exam/admission/scholarship publishers. Only official citation excerpts with the selected year appear; generated prose cannot publish facts. School-scoped cache, usage ledger, one-minute cooldown and hourly cap are protected by RLS. A live NID 2027 lookup returned two official sources. The research tests cover privacy/query restrictions, citation/year filtering, cache/rate limits, roles and school isolation. Repeated missing-data notices are consolidated; empty admissions stages and trade-off sections are omitted. Research is accessible without a completed diagnostic.

Six reviewed NSP listings were added with names and application windows only. Final source recheck: 44 active claims, 10 verified scholarship listings, 25 staged candidates, 12 checked monitors. Nationwide route, fee, recognition and eligibility coverage remains incomplete. Source fingerprints now block review/approval/publication after catalogue changes or claim expiry; a regression test verifies changed evidence is rejected.

Email activation tooling and branded confirmation/recovery templates are prepared. Password recovery previously had no new-password form; it now uses the SDK recovery event, exchanges a recovery code even with an existing session, validates confirmation and saves the new password. Callback tests cover active-session recovery and expired/missing codes. The user confirmed no domain/provider is purchased yet. SMTP, sender verification and inbox delivery remain blocked; Supabase also refuses template changes on the current default-sender/free setup. No mail was sent. See EMAIL_SETUP.md for activation.

The previous browser connection is unavailable in this session, so these changes have automated/build/live-service checks, not a new browser QA pass. Other unchecked launch workflows above remain open.


## Direct official-source answers, 19 October 2026

Research now accepts short questions such as When is JEE Main 2027? and returns concise AI-selected statements linked to official notices. Each displayed statement must match an exact excerpt in accepted citation content; unsupported dates/prose are rejected. Original question text is reduced to public exam/topic/year choices before search. Old-cycle titles are excluded, source excerpts are collapsed, and empty-data notices are consolidated. A live NID DAT 2027 request returned one grounded answer from the admissions handbook. A separate JEE Main 2027 request returned no current source, without inventing a date or declaring that nothing has been announced. Question, evidence-grounding, privacy, cache, role and isolation tests pass. This is eight supported publishers and three topics, not unrestricted web Q&A or completed national coverage. Domain purchase alone does not complete launch requirements above.


Production browser follow-through on 19 October found the live-research environment flag disabled. It was explicitly enabled for Manyfolds production and deployed again. The signed-in owner submitted When is NID DAT 2027? through the deployed Ask AI form and received the cached source-grounded answer with the official handbook link, check time and collapsed supporting excerpts. No student record was edited. The previously unavailable browser connection was restored for this check.

## Product audit and counsellor journey, 19 October 2026

The feature-group audit against the original specification is in [PRODUCT_SPEC_AUDIT.md](PRODUCT_SPEC_AUDIT.md). It explicitly lists missing capabilities; this release is not a claim of full specification or commercial readiness.

The student journey now preserves student/career context, defaults the diagnostic grade, guards unsaved answers/review notes and provides explicit diagnostic-to-AI and published-roadmap-to-follow-up actions. Career-fit percentages were removed. Approved, current AI roadmaps can be downloaded as printable HTML with a Print / Save as PDF action; private notes are excluded and exports are audited. School/role/version/archive/source/diagnostic freshness gates are enforced by the server. Exact saved diagnostic answers supply generation input, including a canonical fingerprint to detect changes during the model request. Migration `20261019_roadmap_diagnostic_hash.sql` was applied.

The final automated sweep passed **19/19 test groups**, with detailed timestamped output in ignored `output/qa/release-sweep.json`. Production build and lint passed. The subsequent question-step scroll adjustment passed a fresh build/lint. Deployment `dpl_6AVkWJhUT7ivYfLgDgTwxbEW7wAJ` is ready at `https://manyfolds.vercel.app`; its health endpoint returned 200.

Four existing Bharati College name/programme claims were reverified against the current official programme page. The Bar Council relationship stays stale because its official page returned no readable evidence. No admissions rule, fee or eligibility was inferred from the programme names.

### Deployed journey verification, 19–20 October 2026

Using only an explicitly synthetic student, the signed-in owner created a record, completed all seven diagnostic steps, reopened saved answers, selected a software direction from the exploration report, generated a live AI draft, saved a review, approved and published it, downloaded the approved document, created a student-linked follow-up and marked it complete. The primary approved Mistral model succeeded in 18.2 seconds with 3,298 total tokens. The saved generation contains the diagnostic fingerprint. The downloaded HTML contains the approval/shareable classifications and excludes the unique internal-note sentinel. Its export audit event was confirmed.

On 20 October the published draft and completed follow-up remained saved. Reloading follow-ups and returning through the sidebar retained the selected student. The approval banner correctly identifies approval. At 390 × 844, the journey uses one column, has no horizontal overflow and contains zero visible occurrences of “unverified”. Download and follow-up actions remain accessible. The temporary viewport was reset. Screenshots and the downloaded document are retained under ignored `output/qa/`; these do not contain real student information. The browser download event observer timed out, but the actual downloaded file was found and its content checked successfully.

Final UI follow-through deployment: `dpl_H5GCRq6PTBzhPzvRckx78Y1h1Yyc`, ready and aliased to `https://manyfolds.vercel.app`. It includes approval-aware origin labels, persistent student filters across reload/sidebar navigation, question-step scroll reset and the fixed-header anchor offset. A fresh build/lint and targeted journey/guidance suites passed after the substantive follow-up changes; the final CSS offset passed another build/lint.

The synthetic student was soft-archived after verification on 20 October. Its completed follow-up, diagnostic/roadmap history, usage and audit records are preserved. The cleanup transaction confirmed every other registry row remained unchanged. The browser was returned to the normal student registry.

### Specification expansion, 20 October 2026

Implemented expanded staff roles with assigned/temporary caseloads and role-specific screens; API-only registry and assignment writes; scoped RLS; manager primary-assignment controls; platform school provisioning/suspension restricted to an explicit operator allowlist; multiple pathways, dated action plans/milestones/dependencies and checked outcomes; richer tasks/comments/evidence; saved-session action conversion; day/week/month calendar, availability/weekly recurrence, booking locks and ICS; intervention attendance/responses/resources/costs; derived guidance reports/printable exports; unified title/name search; and internal notification state/preferences.

Applied `20261020_staff_access.sql`, `20261020_student_planning.sql`, `20261020_tasks_calendar.sql`, `20261020_internal_notifications.sql` and `20261020_email_delivery.sql` to the configured database. Suspended schools lose tenant RLS access, API access, downloads and invitation acceptance. Limited staff receive API projections, with no direct full-registry JSON access. Author-private notes and approved-summary export boundaries are preserved.

The expanded release sweep records **24/24 passing groups after a targeted rerun**. One task/calendar attempt encountered a transient connection reset; its original failure is retained under `previousAttempts` in ignored `output/qa/release-sweep.json`. The fixed client retries only supported reads and idempotent request-ID writes once; versioned writes remain reload-and-review flows. Build and lint pass. Targeted planning/search and RLS checks were rerun after subsequent permission and presentation refinements.

Current verified-data audit: 90 active field claims, ten NSP listings, 25 staged candidates and thirteen checked source monitors. Six DGT CTS listings contribute 36 checked qualification fields; six exact scholarship-deadline claims feed the calendar. No provider availability, fees, seats, employment or personal eligibility was inferred. The Bar Council relationship remains withheld.

Invitation SMTP delivery is implemented with TLS, exact invitation/recipient validation and a server-only delivery ledger. Mock tests exercise known failure retries and block resending uncertain acceptance; no real email was sent. Activation remains off until a provider, verified sender and real inbox tests are supplied. No platform operator was automatically granted access.

The browser connection was restored after the extension disconnected. Account selection for the expired Google session is pending; the new UI must still be checked in the authenticated deployed session. Remaining original-spec details are tracked explicitly in `SPEC_COMPLETION_WORK.md`; this release is not a claim of total specification or commercial readiness.

Deployment `dpl_C5HxsEy9rqeDe8DVKuZQ5szpi9DS` is ready and aliased to `https://manyfolds.vercel.app` from commit `2c01223`. Live checks returned health 200/ready, one Electrician course with its five displayable checked facts, ten scholarship listings, and 401 for unauthenticated planning/platform administration. Source claims and migrations were already applied. Build/lint and the targeted planning/search workflow passed after the final shared-style and catalogue-search refinements. Authenticated visual checks remain pending Google account selection.


## 21 October planning and reporting follow-through

- Added a student/guardian pathway comparison download for two to four saved, approved pathway summaries. The server checks student scope, current versions, approval and archive state, and audits the export. Internal planning fields and evidence notes are excluded.
- Made the planning student selector consistent with other forms, highlighted the active section and saved/unsaved state, and grouped optional pathway fields behind a disclosure. Added removal of accidental milestones, including cleanup of their prerequisite references.
- Added staff activity tables and printable sections: current primary caseload, completed/scheduled sessions, recorded session minutes, and current open/overdue tasks. Counts and session types follow the selected student/cohort filters. The report states that recorded durations are not measured time or performance scores.
- Fixed report period labelling: exports now use the loaded report's dates even if the date inputs are later changed.
- Production build, lint and the expanded planning HTTP regression passed. Synthetic regression fixtures check comparison privacy, stale/revoked approval, archive state, student scope, filtered workload totals, session periods and exclusion of private text. Fixtures were cleaned.

Google sign-in succeeded on 20 October after fixing expired OAuth redirects (commit dade299). The signed-in owner created only the synthetic student 97cc5c0a-c2ef-4a53-ac59-b7913605ca12, saved a primary pathway and an action plan, and downloaded an approved summary. The downloaded file included the approved summary and excluded its internal-note sentinel. The browser connection is unavailable on 21 October; outcome/task/calendar/intervention/report responsive checks and visual validation of this new comparison UI remain pending. No new sender/provider configuration has been supplied. The full original specification remains incomplete as recorded above.


Synthetic browser fixture cleanup on 21 October: student 97cc5c0a-c2ef-4a53-ac59-b7913605ca12 was soft-archived with its two planning records and audit/history preserved. The transaction confirmed every other registry row was unchanged. No real student record was edited.

Production deployment dpl_DGr64mygr3qUkZJ1QhvPZ5Vnwyz6 is READY and aliased to https://manyfolds.vercel.app from code commit 41c2f2a. The first deployment attempt returned Not authorized; an explicit Manyfolds team scope succeeded without changing account permissions. Live health and planning SPA checks returned 200; unauthenticated comparison POST and reporting GET returned 401. Authenticated visual checks of these refinements remain pending the browser connection.


## 21 October guidance pipeline implementation

Implemented the fourteen original-spec stages with stable internal keys and legacy-stage mapping. The new board and table support class/section, primary-staff and student filters, archived visibility, selection of up to 100 visible students, drag-to-review and keyboard-accessible move controls. A move is saved only after staff supply a reason. Server validation checks saved profile/session/pathway/plan/application/outcome support for the corresponding stages. An explicit counsellor override is separately recorded. Suggestions use current saved records, never change stages automatically and do not move students backwards.

School owners/admins can rename pipeline display labels with version conflict protection, distinct labels and all underlying stages retained. These custom labels apply to the pipeline; other screens retain the standard stage label. Stage history records the saved version, actor, reason, override and archive/restore changes. Existing legacy student rows were not rewritten and old history is not fabricated. Full registry versions remain available separately.

Applied 20261021_guidance_pipeline.sql after a successful rolled-back DDL check. Configuration/history have scoped read RLS and server-only writes. New registry records cannot claim an advanced stage, and ordinary registry edits cannot bypass pipeline validation. Data-entry name/class saves now merge only permitted demographic changes into the protected server record and return the basic projection, preserving stage, assignments and internal fields.

Added test:pipeline to the release runner (now 25 groups). Targeted pipeline checks cover stage/legacy mapping, no-mutation suggestions, label conflicts, caseload and direct RLS isolation, prerequisites, explicit override, atomic bulk failure, stale versions, normal-registry bypass prevention, projected demographic saves and archive/restore history. Only synthetic fixture schools are used and cleaned. Build/lint and relevant regression results are recorded below after completion. The full 25-group release sweep has not been rerun for this increment.

Browser inventory on 21 October still contains no connected browser. Authenticated drag/keyboard/responsive visual validation remains pending; API/RLS checks do not replace it. SMTP sender activation, broad verified data coverage and the other remaining specification details above are still open.

Pipeline release checks: npm run build, npm run lint, npm run test:pipeline, npm run test:planning and npm run test:operations passed on 21 October. The final pipeline regression also verifies that a projected data-entry name/class save preserves the canonical stage and internal sentinel while returning no internal sentinel. All synthetic fixtures were cleaned. No real school student stages or labels were changed.

Pipeline production deployment dpl_9mruZtdn9JTjHRdn1ATErV3Z2Hmk is READY at https://manyfolds.vercel.app from code commit 878a820. Vercel also passed the current production build. Live health and the pipeline SPA returned 200; pipeline, label and history APIs returned 401 without authentication. The regression runner now includes 25 groups, but this increment ran only the affected pipeline/planning/operations suites, build and lint.


## 23 October leadership note category

Added an explicit school-leadership note area for session records. Only owners, administrators and lead counsellors with access to the student can read or save this separate category. Counsellors, guidance teachers, class teachers, data-entry staff, reviewers and other schools are denied by the API and table RLS. Existing author-private notes remain author-only, including against owners and administrators. No previous note was reclassified or exposed.

Leadership notes have saved-state feedback, stale-version conflict protection, unsaved-change navigation/close guards and read-only historical revisions. Reads and saves create audit events containing record/version metadata, never note text. They do not enter session/guardian/action/internal exports, briefing data, search, reports or timelines. AI input assembly was not changed and does not query these new tables.

Applied 20261023_leadership_notes.sql after a rolled-back DDL verification. It adds only new restricted note/history tables and their audit/history trigger; real student/session records were not edited. Added test:leadership-notes to the release runner, bringing it to 26 groups. The targeted note regression passed API and direct-RLS role/school boundaries, suspended-school isolation, revision immutability, stale writes, archive protection, content-free audits, export/search/report/briefing/timeline exclusion and unchanged author-private isolation. Its synthetic school fixtures were cleaned. Build and lint passed. The complete 26-group sweep has not been rerun for this increment.

The current Windows Computer Use helper could not connect, so signed-in visual verification remains pending. Domain and email provider/sender activation are still not supplied; the user plans to purchase a domain soon. Other remaining original-spec and verified-data coverage work stays open.

The existing test:guidance suite also passed after this change, covering completion gates, assignments, briefings, private notes, approved exports, conflict handling and school isolation.

Leadership-note production deployment dpl_Dcdrtqe9LcLThAySE9Z6pXDP1Ujz is READY and aliased to https://manyfolds.vercel.app from code commit 2254846. Vercel passed its production build. Live health and the sessions SPA returned 200; the new leadership-note endpoint returned 401 without authentication. Signed-in UI verification remains pending the desktop connection.
