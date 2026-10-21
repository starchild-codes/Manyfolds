# Original specification completion work

Started 20 October 2026. This is an implementation tracker, not a readiness claim.

- [x] Implement roles, assigned caseloads, temporary coverage, limited staff screens and explicitly allowlisted platform school administration; exercise API/RLS boundaries on synthetic schools
- [x] Implement multiple student pathways and dated action plans with milestones, dependencies and review history; test primary-route uniqueness, conflicts and approved summary privacy
- [x] Implement task ownership, responsibility, priority, evidence, comments and deduplicated session-action conversion
- [x] Implement day/week/month calendar, concurrent booking checks, availability, weekly recurrence, cancellation and scoped ICS export
- [x] Implement evidence-backed outcomes and selected-student/cohort/caseload/annual printable reports with definitions and current workflow indicators
- [x] Implement intervention attendance, resources, pre/post responses, feedback, costs and linked tasks; require attendance before completion
- [x] Implement permission-aware unified title/name search, student guidance timeline and a persistent notification read state/preferences inbox
- [x] Audit six current DGT CTS vocational qualification listings and publish 36 exact field claims; add six exact scholarship deadline claims and recheck existing pilot/NSP listings
- [x] Implement explicitly requested staff-invitation SMTP delivery and server-only delivery ledger; test with a mock transport
- [x] Implement fourteen-stage pipeline board/table, cohort filters, validated atomic bulk moves, reasons/overrides, suggestions, label configuration and scoped stage history; visual browser verification remains pending
- [ ] Complete remaining original-spec details: full overview/filter/import matrix, leadership note category, dedicated consent/deadline documents, public/support pages, broader structured resources and all notification event types
- [ ] Expand verified institution/programme/fee/benefit/recognition/relationship coverage beyond the current pilot; do not describe a small launch catalogue as national coverage
- [ ] Activate the actual verified mail sender, apply auth templates and complete fresh-account/recovery/invitation inbox tests
- [x] Expand the regression runner to 24 groups, pass build/lint and deploy the code to the Manyfolds project
- [ ] Complete authenticated browser/accessibility verification of the new workflows after the user selects their Google account

External activation cannot be reported as complete without the user's actual mail provider, verified sender/domain, and delivery results. No domain/provider had been purchased at the last user update. Existing AI models and budgets remain unchanged.

## Verification evidence

The new `test:staff-access`, `test:planning`, `test:tasks-calendar`, `test:email` and `test:platform` groups use rolled-back or explicitly cleaned synthetic fixtures. They cover temporary assignment/revocation, suspended-school RLS, scope impersonation, approved summary exports, dependencies and outcome provenance, concurrent bookings, classroom projections, recurring availability, notification state, search privacy, allowlisted platform administration and SMTP acceptance ambiguity. Email tests never contact an SMTP server.

Current source audit on 20 October 2026: 90 active field claims, 10 current NSP listings, 25 staged candidates and 13 checked source monitors. DGT facts describe national CTS qualifications only; provider availability, fees, seats, enrolment dates and employment outcomes are not inferred. Live counts can fall when a source changes or a claim expires.

Browser verification resumed after reconnecting Edge. The previously authenticated session had expired, so Google account selection is pending. No test writes have been made to real student records.

Deployment `dpl_C5HxsEy9rqeDe8DVKuZQ5szpi9DS` is ready at `https://manyfolds.vercel.app`, from code commit `2c01223`. The live health endpoint returned 200/ready; the public Electrician search returned the five checked displayed fact fields; scholarships returned ten current listings; unauthenticated planning and platform-administration requests returned 401. The release report preserves the original transient task/calendar failure and its successful targeted rerun; all 24 groups currently pass.


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
