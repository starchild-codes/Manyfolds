# Manyfolds product specification audit

Checked against `Product_info.md` on 19 October 2026. This is a feature-group audit, not a claim that every individual requirement is complete. Passing regression tests does not establish implementation of missing features.

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
| 4: roles | Owner/admin/counsellor/teacher enforcement, invitations and immediate revocation; global catalogue curator restriction | Separate lead counsellor, guidance teacher, data operator/reviewer roles; full assigned-caseload scope and platform school-administration UI |
| 5: mediated sharing | Student summary, approved guardian summary, session/action/internal exports; approved AI roadmap printable document | Dedicated pathway comparison, consent, deadline and outcome documents |
| 6–7: public website | Home, explanation of guidance and staff login | Dedicated school/staff/impact/resources/privacy/contact pages and an agreed public demo/support destination |
| 8.1: Today | Real registry/class counts, priority queue and links | Full deadline/reminder/readiness cards and live coverage charts |
| 8.2: registry | Create/update, class/staff fields, filtering, CSV import mapping, duplicate IDs, archive/restore, history and CAS conflicts | Full specified demographics/filter matrix, richer bulk assignment/action workflows |
| 8.3 A–H/K: student profile | Academics and CSV preview, interests, skills/evidence, constraints, family summaries, exploration, documents and session records | Unified timeline/profile navigation across all modules and all specified overview fields |
| 8.3 I–J/L: pathways/action plans/audit | AI draft lifecycle, persistent planning checklist, record audit history | Multiple primary/alternative/exploratory plans, full goals/milestones/dependencies/review-date model, integrated per-student audit view |
| 8.4: sessions | Sixteen session types, briefing, structured notes, author-private notes, separately approved shareable summary, outcome completion gate, exports | Authorized leadership note category, direct conversion of recorded actions into tasks, all printable formats |
| 8.5: pipeline | Current registry stages grouped into a pipeline and linked student records | Full configurable fourteen-stage model, validated drag-and-drop, bulk transition reasons and suggested transitions |
| 8.6: tasks | Persisted student-linked follow-ups, dates, status, completion and staff filters | Responsibility/category/priority/dependency/evidence/comments, reassignment and automation |
| 8.7: calendar | Persisted sessions/follow-ups ordered by time | Day/week/month grid, interventions and official deadlines, staff availability, conflict checks, recurrence and export |
| 8.8: interventions | Title/date, student membership, status and saved summaries | Attendance, objectives/types, resources, pre/post measures, feedback, costs and linked follow-up tasks |
| 8.9–13: verified catalogue | Claim-level provenance, expiry/stale withholding, official source links, programme pilot and scholarships; on-demand official-source AI research | Complete field-level guidance for representative academic and vocational routes, fees/recognition/benefits, comparison and student-pathway links |
| 8.14: resources | Eleven counsellor playbooks and persisted school resources | All resource types/structured worksheets and broader curated launch materials |
| 8.15: reports | Real activity counts, date filters and CSV exports | Readiness, caseload, cohort, equity and annual printable reporting |
| 8.16: outcomes | Session outcomes and exploration outcomes recorded as narrative | Dedicated verified outcome records, provider/programme/source/confidence and longitudinal reports |
| 8.17: school administration | Setup, classes/sections, staff invitations/roles, individual assignment, safe academic-year rollover/rollback | Retention settings, complete academic structures, class/caseload assignments, temporary reassignment/workload balancing |
| 8.18: imports/exports | Roster CSV mapping/preview/duplicates/rollback; academic CSV/history; shareable exports | Guardian/staff/class-assignment imports and feasible historical-session imports |
| 8.19: search | Student search/command palette and category-specific catalogue search | One permission-aware search spanning staff, sessions, tasks, interventions and resources |
| 8.20: notifications | Follow-up views and priority records | Persistent notifications, read state/preferences and all specified event types |
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

Manyfolds is **not fully conformant with the original specification yet**. The core diagnostic-to-AI-roadmap journey can be improved and verified independently, but missing roles, action-plan/outcome/reminder/reporting capabilities and external launch setup must not be described as finished. Buying a domain alone does not satisfy those requirements.
