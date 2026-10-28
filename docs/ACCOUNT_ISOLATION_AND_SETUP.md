# Account isolation and school setup

Checked on 28 October 2026.

## Account behaviour

- An independent new account has no school membership and cannot read existing school records. Setup creates a new organisation owned by that authenticated user, even if another school has the same name.
- Returning accounts keep their saved workspace. A new workspace is not created for every sign-in.
- A staff member who explicitly accepts an email-bound school invitation joins that school with its assigned role and caseload permissions. Collaboration is intentional; it is not automatic membership based on email domain or school name.
- The protected application remounts on authenticated user ID changes. Changing identity clears the previous browser workspace scope. Private local drafts also require a user-specific storage key, including for staff in the same school. Older browser drafts without provable user identity are not automatically imported.

## Personalisation

Setup collects school name, type, location, country and estimated student count; board, academic year, contact details and counselling model are also available. Classes start blank and must be explicitly entered. Classes and sections are validated and saved together with the school profile in a transaction.

For classes 11 and 12 with A, B and C in each, the dashboard and student creation choices use those six configured combinations. No students or demonstration records are seeded. Schools without sections retain their class choices. Owners/admins can add classes and sections later in School administration and refresh to load the updated choices.

## Verification

- `node --experimental-strip-types scripts/onboarding-isolation-test.mjs`: synthetic fresh accounts, no inherited membership, no school visibility before setup, separate empty registries, exact 11/12 A/B/C structure, school configuration persistence, repeated request safety, later class additions, API cross-school write rejection, and authenticated database RLS denial across school tables. Fixtures are removed. Auth identities are injected into the HTTP test; this does not replace a real browser Google sign-in check.
- `npm run test:rls`: private records, roadmaps, verification tasks and catalogue notes.
- `npm run test:staff-access`: role entry gates, caseloads, suspension, restrictive RLS and impersonation denial.
- `npm run test:students`: shared registry versioning and cross-school isolation.
- `node scripts/rls-audit.mjs`: 123 public tables, all with RLS enabled at inspection time.
- Browser storage and authentication checks, TypeScript production build and lint.

## Domain

Vercel reports `www.manyfolds.in` correctly configured for the existing `manyfolds` project. HTTPS landing, authentication and health endpoints return 200; health reports ready. Supabase's site URL is `https://www.manyfolds.in`; exact callback URLs for both the www and apex domain were added without removing the existing Vercel/local development callbacks. The production `MANYFOLDS_SITE_URL` is set to the www domain for invitation links.

These checks establish the account/setup behaviour described above. They do not assert that every feature in the original product specification is complete or that custom email delivery has been configured.

## Release verification

Code commit `a38cee6` was deployed from an isolated clean worktree to the existing Manyfolds project: deployment `dpl_EWUShBHJuzazdxr4LmU7N5SyEvYn`, state READY. Unrelated unfinished workspace edits were excluded.

The isolated release passed onboarding isolation (including subsequent class additions), school invitation/workflow, staff access, authentication, private browser storage, production HTTP and Vercel adapter checks, plus build and lint. The new onboarding bundle was fetched from `https://www.manyfolds.in` after deployment. Landing, auth, dashboard SPA and health endpoints returned 200, health reported ready, and unauthenticated workspace/student API calls returned 401. No manual browser Google sign-in was performed in this check.
