# Manyfolds website and workflow verification

Review date: 16 November 2026. Target: https://www.manyfolds.in.

This review distinguishes public claims, implemented workflows, automated evidence and manual browser evidence. A passing test is not proof of a missing feature, inbox delivery or an untested browser interaction. The detailed original-spec gaps remain in `PRODUCT_SPEC_AUDIT.md` and `SPEC_COMPLETION_WORK.md`.

## Public claims and their implementation evidence

| Public capability | Real implementation checked | Verification groups |
| --- | --- | --- |
| Separate school workspaces and fresh school setup | Authentication gates, school/class/section setup, scoped registry and database RLS | `test:onboarding`, `test:staff-access`, `test:students`, `test:rls` |
| Staff roles and assigned students | School roles, primary/temporary caseloads, classroom projections and suspended-school denial | `test:staff-access`, `test:platform`, `test:planning` |
| Longitudinal student records | Create/update/archive/restore, profile revisions, academic entries, roster imports and rollover safeguards | `test:school`, `test:operations`, `test:students` |
| Saved consent responses | Purpose, response, received date/reference, acknowledgement, withdrawal history and restricted access | `test:operations`, `test` |
| Explainable career exploration | Recorded diagnostic, profile-specific reasons and selected-student/direction navigation | `test`, `test:school`, `test:journey` |
| Staff-requested AI roadmaps | Saved-diagnostic fingerprint, provider validation, conflicts, review/approval/publication and approved-only downloads | `test:roadmap-generation`, `test:roadmap-review`, `test:roadmap-evidence`, live provider smoke |
| Primary/alternative pathways and action plans | Persistent plans, milestones/dependencies, approved comparisons, task links and outcome evidence | `test:planning`, `test:sharing`, `test:saved-pathways` |
| Session records and private notes | Completion gates, separate author-private/leadership notes, revision permissions and approved summaries | `test:guidance`, `test:leadership-notes` |
| Follow-ups, calendar and interventions | Ownership, completion/evidence, dependencies, booking conflicts, attendance, notifications and ICS export | `test:tasks-calendar`, `test:guidance` |
| Guidance pipeline | Fourteen stages, reasons/overrides, prerequisites, atomic bulk moves and version history | `test:pipeline` |
| Recorded coverage and outcome reports | Scoped live records, cohort/staff filters, selected-student and printable exports; no ability scores | `test:planning`, `test:sharing`, `test:operations` |
| Verified information and official-source research | Claim-level provenance, stale/expired withholding, source/relationship validation and official-publisher research gates | `test:research`, `test:roadmap-evidence`, `test:verification-workspace`, `test:scholarship-parser` |
| Public interactive walkthrough | Fictional profiles using the real exploration engine, clearly illustrative roadmap and page-local tasks | `test` public-demo checks; public route HTTP checks |
| Hosted application and protected APIs | Build, production-only packaging, SPA deep links, readiness, authentication, private-file/secret denial | `test:production`, `test:vercel`, `test:production-package` |

API integration tests exercise the actual handlers and database policies using synthetic identities/data or rolled-back fixtures. They do not establish that Google account selection or every responsive browser interaction was manually completed.

## Changes included in this review

- Saved offline consent/acknowledgement records in student profiles, with source references, validation and profile revision history. Printing an unsigned form does not grant consent.
- Fifteen detailed registry filters backed by scoped saved data, extra context columns and actual selected-record CSV exports.
- A six-step staff workflow guide on Today, linked to the existing screens.
- A short pause before the existing bounded connection/read retries. Uncertain application writes are not replayed.
- Independent official-source refresh steps so a changed/expired scholarship listing cannot prevent unrelated academic offering checks. Expired dates remain withheld.
- Corrected an outdated evidence test that required the October 31 CLAT deadline to appear after expiry; it now checks that current evidence follows the claim's verification/expiry state.
- Corrected the curator's deadline validation to accept valid dates in either year of the supported 2026-27 cycle. Synthetic checks separately reject expired windows, changed official cards and invalid calendar dates. No new scholarship deadline was inferred or published by this fix.

## External and manual checks

Live provider smoke uses the production provider client and generation validator with fictional sparse evidence. The primary response was rejected for unsupported education advice; the configured fallback returned a schema-valid, factual-valid response. This demonstrates an available fallback path for that fixture, not universal quality or completion of the entire browser generation journey. No model order, budgets, prompts, student records or model approvals were changed by the smoke check.

Public-page HTTP checks have passed for the home, demo, project, school/staff information, resources, privacy, contact and auth routes. The readiness endpoint returned ready and protected API routes rejected anonymous access. HTTP success is separate from visual inspection.

Custom SMTP and a verified sender are still not configured. Mock invitation tests do not establish delivery to a real inbox. Auth email, recovery and invitation inbox delivery remain unverified.

Browser inspection is not yet complete. The computer-use bridge previously failed URL verification and, on the current retry, returned a different application's screenshot for the requested Edge window. Input was stopped. A request to leave the signed-in Manyfolds window visible is pending. No full authenticated visual, mobile or accessibility sign-off is claimed.

## Current result

The full sweep and targeted reruns finished with **27 of 28 groups passing**. The remaining group passes its permission, expiry and candidate-change protections, then fails its unchanged dataset thresholds: **one programme with checked eligibility versus a minimum of two**, and **one current verified relationship versus a minimum of two**. These are explicit data-coverage failures, not a successful launch sign-off.

The initial guidance test encountered an availability error; its targeted rerun passed. The original failure remains in `previousAttempts` in the detailed ignored QA report. A clean rerun does not establish that the hosting/network will never fail.

After exact official-source rechecks, the coverage audit reports 59 active field claims, zero current verified scholarship listings, 31 pending source candidates and 15 checked source monitors. Expired scholarship windows remain withheld. These counts are a small reviewed catalogue, not national coverage.

The production site URL, www auth callback and Google provider configuration were checked successfully through the auth configuration API. This is configuration evidence, not a completed Google sign-in or inbox-delivery test.

Lint, TypeScript/production build, core regressions and server-render checks passed. Server-render checks covered the staff workflow guide, fifteen registry controls, demo URL/profile cases, project page and seven public information pages; they do not replace browser interaction or visual QA.

The original specification still has open import/bulk-workflow, retention/operational and broader verified-data requirements. Authenticated browser inspection and real email delivery remain incomplete. This document does not certify 100% commercial or original-spec readiness.

## Regression group results

| Group | Result |
| --- | --- |
| `test` | PASS |
| `test:onboarding` | PASS |
| `test:staff-access` | PASS |
| `test:planning` | PASS |
| `test:sharing` | PASS |
| `test:pipeline` | PASS |
| `test:leadership-notes` | PASS |
| `test:tasks-calendar` | PASS |
| `test:email` | PASS |
| `test:platform` | PASS |
| `test:journey` | PASS |
| `test:students` | PASS |
| `test:school` | PASS |
| `test:operations` | PASS |
| `test:guidance` | PASS |
| `test:saved-pathways` | PASS |
| `test:roadmap-review` | PASS |
| `test:roadmap-generation` | PASS |
| `test:model-refresh` | PASS |
| `test:research` | PASS |
| `test:roadmap-evidence` | PASS |
| `test:verification-workspace` | FAIL - dataset coverage; functional protection checks passed |
| `test:evaluation-persistence` | PASS |
| `test:scholarship-parser` | PASS |
| `test:rls` | PASS |
| `test:production` | PASS |
| `test:vercel` | PASS |
| `test:production-package` | PASS |

Detailed timestamped outputs and prior attempts are retained locally in `output/qa/release-sweep.json`. Live HTTP, AI-provider and auth-configuration results are retained alongside it. Synthetic provider output is kept out of Git.
