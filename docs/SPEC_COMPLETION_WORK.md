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
- [ ] Complete remaining original-spec details: configurable pipeline, full overview/filter/import matrix, leadership note category, dedicated consent/deadline documents, public/support pages, broader structured resources and all notification event types
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
