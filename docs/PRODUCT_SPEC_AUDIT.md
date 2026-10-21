# Manyfolds product specification audit

Updated on 20 October 2026 against `Product_info.md`. This is a feature-group audit, not a claim that every individual requirement is complete. Passing regression tests does not establish implementation of missing features.

## Counsellor journey changes

1. Create a student and use the explicit **Start career diagnostic** next action.
2. Confirm the student's name/class in the persistent four-step guidance header. The diagnostic defaults to the recorded class when supported.
3. Save each diagnostic step. A grade and at least one subject, skill or work preference are required before the exploration report.
4. Use **Continue to AI roadmap**, or **Plan this direction with AI** for a specific career. Student and career context are preserved; unsaved work is guarded.
5. Choose a direction, explicitly generate the AI draft, review it, approve it and publish it. Generation and saved-state feedback remain separate from the rule-based exploration report.
6. Download an approved, current roadmap as a printable HTML document with **Print / Save as PDF**. The server blocks drafts, stale evidence, archived students, other schools and unauthorized roles. Internal review notes are excluded.
7. Use **Open this student's follow-ups** to continue with the same student selected.

Career suitability percentages were removed from the diagnostic report to follow the specification's non-deterministic guidance requirement. Staff-only positioning was clarified on the landing page. Catalogue administration appears only for configured curators; school-administration navigation follows the current role permissions.

## Specification coverage

| Specification | Present and exercised | Remaining gap |
| --- | --- | --- |
| 1–3: purpose and principles | School workspaces, staff-mediated diagnostics, profile context, source gates, private notes, no student/guardian accounts | Complete longitudinal outcomes and all non-AI pathways are still needed |
| 4: roles | Lead counsellor, guidance teacher, class teacher, data-entry and reviewer roles; assigned/temporary caseloads; primary assignment controls; limited-role screens; API-only registry writes; scoped RLS; explicitly allowlisted platform school provisioning/suspension | Final browser checks of the new role screens; platform operator identities must be configured explicitly |
| 5: mediated sharing | Student summary, approved guardian summary, session/action/internal exports; approved AI roadmap printable document | Dedicated consent, deadline and outcome documents |
| 6–7: public website | Home, explanation of guidance and staff login | Dedicated school/staff/impact/resources/privacy/contact pages and an agreed public demo/support destination |
| 8.1: Today | Real registry/class counts, priority queue and links | Full deadline/reminder/readiness cards and live coverage charts |
| 8.2: registry | Create/update, class/staff fields, filtering, CSV import mapping, duplicate IDs, archive/restore, history and CAS conflicts | Full specified demographics/filter matrix, richer bulk assignment/action workflows |
| 8.3 A–H/K: student profile | Academics and CSV preview, interests, skills/evidence, constraints, family summaries, exploration, documents and session records | Unified timeline/profile navigation across all modules and all specified overview fields |
| 8.3 I-J/L: pathways/action plans/audit | Primary/alternative/exploratory pathways, dated goals, staff owners, milestones, dependencies, task links, review dates, version history, evidence-checked outcomes and integrated guidance timeline | Full detailed audit navigation and dedicated consent/deadline documents |
| 8.4: sessions | Sixteen session types, briefing, structured records, author-private notes, separate approved sharing, completion gate, exports and deduplicated conversion of saved actions to tasks | Leadership-restricted note category and all dedicated print formats |
| 8.5: pipeline | Current registry stages grouped into a pipeline and linked student records | Full configurable fourteen-stage model, validated drag-and-drop, bulk transition reasons and suggested transitions |
| 8.6: tasks | Responsibility/category/priority, assigned staff, active/blocked/evidence states, dependencies/cycle checks, evidence documents, comments, completion, due/overdue views and session-action conversion | Complete configurable task-automation rules and reminder coverage |
| 8.7: calendar | Day/week/month views; sessions/tasks/interventions; current verified official dates; staff/type filters; availability; concurrent conflict checks; recurring school events/availability; cancellation; scoped ICS export | Broader official-date coverage and final responsive/browser validation |
| 8.8: interventions | Types/objectives/cohort selection, organiser, venue, duration, resources, attendance, pre/post responses, feedback, reflections, cost/partner notes and linked follow-ups; attendance required before completion; printable attendance sheet | Final browser validation and broader curated workshop materials |
| 8.9–13: verified catalogue | Claim-level provenance, expiry/stale withholding, official source links, programme pilot and scholarships; on-demand official-source AI research | Complete field-level guidance for representative academic and vocational routes, fees/recognition/benefits, comparison and student-pathway links |
| 8.14: resources | Eleven counsellor playbooks and persisted school resources | All resource types/structured worksheets and broader curated launch materials |
| 8.15: reports | Recorded pathway/action/conversation/exposure/outcome indicators, class/year/stream/staff/field/outcome filters, cohort and selected-student CSV/printable reports, annual report and explicit definitions; no suitability scores | Full demographic collection matrix, final browser QA of staff activity and filtered report exports |
| 8.16: outcomes | Dedicated outcome/date/provider/programme/reporting-source/evidence/confidence records; checked outcomes stamp verifier/time; reported and checked outcomes remain distinct | Broader longitudinal dashboards and dedicated outcome documents |
| 8.17: school administration | Setup, classes/sections, expanded staff roles, primary/bulk/caseload assignment, temporary cover with expiry/revocation, safe rollover/rollback, explicit unassigned-access policy | Contractual retention settings and complete academic-structure matrix |
| 8.18: imports/exports | Roster CSV mapping/preview/duplicates/rollback; academic CSV/history; shareable exports | Guardian/staff/class-assignment imports and feasible historical-session imports |
| 8.19: search | Permission-aware name/title search across students, staff, sessions, tasks, interventions, resources and verified careers/courses/exams/scholarships/institutions; no private-note indexing | Final browser navigation checks and richer resource filters |
| 8.20: notifications | Internal reminders for sessions, due/overdue tasks, assignments, AI drafts, official deadlines, pathway reviews, missing attendance and contact review; saved read state and per-user preferences | Dedicated stale-source/import-error events and exact task-reassignment event history |
| 9–11: data/security/verification | Server authentication, tenant RLS, role checks, CAS, audit events, source review/expiry, no private notes in AI/shareable exports | Full role/caseload policy, contractual retention/deletion settings, operational recovery drill and complete content workflow |
| 12–14: UX/quality | Loading/error/empty states, guarded navigation, guided student journey, keyboard/modal basics, regression suites | Full accessibility and browser coverage across every required workflow; a test cannot cover a feature that is not implemented |
| 16: launch dataset | Traceable academic pilot, verified occupation titles, ten scholarship listings, eleven playbooks | Representative verified vocational/diploma/apprenticeship route facts and fuller relationship/field coverage |
| 17: production readiness | Manyfolds-only deployment, API/SPA health, migrations/RLS, approved AI provider order and token limits | Domain/mail-provider activation, real email delivery/fresh-school onboarding, commercial hosting confirmation, monitoring/backup/retention ownership |

## Test evidence

The initial sweep passed 16/18 test groups. Two catalogue tests failed because sources had changed. Four Bharati College identity/offering claims were rechecked against the live programme page and restored without inferring admissions eligibility or fees. The inaccessible Bar Council relationship remains stale and withheld. Its regression check now tests whether evidence follows the active claim rather than assuming the regulator page always remains verified. Both failed groups passed on targeted rerun.

`npm run test:release` runs the existing integration/regression groups plus student-journey navigation and writes timestamped detailed results to ignored `output/qa/release-sweep.json`. Current approved-roadmap export tests check school/role/version/approval/archive restrictions, note exclusion, audit logging and escaped printable output. Final deployment/browser evidence is recorded in `IMPLEMENTATION_CHECKLIST.md`.

The final automated sweep passed **19/19 groups**, along with the production build and lint. Exact saved diagnostic answers now determine the server-side generation input; a canonical answer fingerprint also detects changes made during the provider request. Regression tests reject missing/incomplete saved diagnostics, ignore altered client answers, and block review/export when answers change. The fingerprint migration was applied to the configured database.

The deployed synthetic workflow was exercised end to end: registry creation, seven saved diagnostic steps, selected-career navigation, live primary-model generation, review, approval, publication, downloaded document privacy, student-linked follow-up creation and completion. Reload persistence and mobile width were checked on 20 October. This verifies that core journey; it does not implement the remaining features in the matrix above.

## Launch conclusion

Manyfolds is **not fully conformant with every original-spec detail yet**. The major role/caseload, action-plan/outcome, task/calendar, intervention, search/notification and reporting implementations are now present and have synthetic API/RLS regression evidence. Remaining details are listed above and in `SPEC_COMPLETION_WORK.md`. Final browser validation, broad verified relationship/fee/recognition coverage, real sender activation and inbox testing remain separate requirements. Buying a domain alone does not satisfy them.


## 20 October implementation evidence

Five new test groups cover staff scope/RLS, plans/outcomes/search/report privacy, tasks/calendar/intervention/notifications, mocked invitation mail and allowlisted platform administration. Registry and assignment writes are server-only; limited roles receive basic projections. Suspension closes tenant RLS as well as APIs, downloads and invitation acceptance. Existing private-note author isolation and approved-only summaries remain enforced.

Six live DGT CTS qualification listings add 36 audited field claims. Six exact structured scholarship-deadline claims support the calendar. Current source audit: 90 active claims, 10 NSP listings, 25 staged candidates, 13 checked source monitors. This is not full national coverage.

SMTP invitation delivery is implemented behind explicit activation, with a server-only sending/sent/failed/unknown ledger. Mock tests send no real email. Sender/domain/provider setup, auth template activation and inbox delivery tests remain blocked on actual mail service configuration.


### 21 October follow-through

Approved-only, version-checked pathway comparison downloads and filter-aware staff activity reports are implemented and exercised in the synthetic planning HTTP regression. The planning form has clearer student/section/save-state controls and optional-field disclosure. Report exports retain their loaded period. Build and lint passed. Authenticated visual verification remains partial because the Edge connection is unavailable; see SPEC_COMPLETION_WORK.md for precise evidence and remaining work.
