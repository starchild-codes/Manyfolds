# Manyfolds production deployment

The app needs a Node server for authentication, school records, verified catalogue access,
and AI generation. Deploying only `dist` leaves those workflows unavailable.

## Runtime

- Node 24.12 or later, with `npm ci --omit=dev`.
- Build with `npm ci` and `npm run build`; ship `dist`, `server`, and the package manifests.
- Start with `npm start`. `PORT` defaults to 8080; `HOST` defaults to `0.0.0.0`.
- Run behind the hosting provider's HTTPS proxy. Keep public access on HTTPS.
- Set `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` in the server environment.
  Set `OPENROUTER_API_KEY` and existing model/budget settings for AI generation.
- The public Supabase URL/key must also be available **during the frontend build** and
  point to the same project as the server. Never put a database password or OpenRouter
  key in a `VITE_` variable.
- Add the deployed origin's `/auth/callback` to Supabase's allowed redirects.
- Apply `20261008_guidance_activities.sql`, `20261008_school_workflows.sql` and the `20261009_*` operations/private-note migrations, along
  with earlier migrations, before starting this release.
- `/api/health` checks database connectivity and returns only readiness status.

## Container

`Dockerfile` builds the UI with the public Supabase URL/key build arguments and installs
only production dependencies in its final image. Supply secrets as runtime environment
variables through your host's secret store. `.dockerignore` excludes local environment
files. The container runs as the unprivileged `node` user.

## Release checks

Run `npm run build`, `npm run lint`, `npm test`, `npm run test:school`,
`npm run test:operations`, `npm run test:guidance`, `npm run test:students`, `npm run test:rls`,
`npm run test:production`, and `npm run test:production-package`.

The school integration test uses temporary database records and injected identities.
It checks acceptance, email matching, expiry, revocation, role restrictions, student
history, version conflicts, school isolation, and live report counts. It does not send
invitation emails. School staff share invitation links themselves.

The production smoke test checks protected APIs, catalogue reads, SPA routes, readiness,
private-file denial, and exclusion of server secrets from the public JS bundle. The
package test installs the final runtime dependencies in an isolated temporary directory
and confirms that the server runs without Vite.

After deploying, verify actual sign-in/callback, a new owner's onboarding, invitation
acceptance using a separate confirmed email account, and saved student workflows through
the deployed origin. Check that a second school cannot access the first school's records.

## Verification status (17 October 2026)

Manyfolds is deployed at https://manyfolds.vercel.app under the `manyfolds` project. The local Motive association was removed. Vercel authentication and production/preview environment setup succeeded. Deployment `dpl_8jU8ozYt54UscbecHu1RiS2UP3HW` passed hosted HTTP checks: SPA routes and database health return 200; protected student/profile/document/roadmap APIs return 401 without a session; unknown APIs return 404; cross-origin mutations return 403. TypeScript relative import rewriting is required for the compiled function. Health checks accept query parameters added by the host.

Supabase's site URL is now https://manyfolds.vercel.app, with the exact production `/auth/callback` and local development callbacks allowed. Actual browser sign-in, onboarding, invitation acceptance and authenticated production workflows still require verification. The hosting team is currently on Hobby; [Vercel restricts Hobby to personal, non-commercial use](https://vercel.com/docs/plans/hobby). Upgrade before commercial launch. This deployment is not a commercial-readiness certification.

Intermittent connection resets have been observed from the configured Supabase pooler.
Connection checks retry before a transaction starts; writes are not blindly replayed.
Create requests for diagnostics, interventions, guidance activities, and invitations
use stable IDs so an ambiguous response can be retried without duplicating the record.
Version conflicts require reloading before another edit. Monitor database availability
on the chosen host before commercial launch.

## Student profiles and private documents (17 October)

Apply `20261016_student_profiles.sql`, `20261017_shared_planning.sql` and `20261017_student_documents.sql`. Configure `DOCUMENT_SIGNING_SECRET` as a server-only random secret of at least 32 characters, identical across instances. A local secret was generated in the ignored environment file; it is not included in Git or the browser bundle. Rotating it invalidates outstanding document links.

Document binaries are held in the private database table; direct authenticated clients can read permitted metadata only. A signed two-minute download grant rechecks the issuing staff member's active school membership, current role and document archive state. Uploads validate file signatures/types and allow up to 5 MB each, 100 files per student and 1 GB per school, including archived files. Allowed formats are PDF, PNG, JPEG and UTF-8 text. Archives preserve contents; permanent purge and contractual retention policies require school-specific configuration and remain a launch requirement. Include these tables in backup/restore verification.

## Manyfolds Vercel target

Run `vercel login`, then `vercel link --project manyfolds --yes`. Configure the server variables from `.env.example` in that project, including DATABASE_URL, OPENROUTER_API_KEY and DOCUMENT_SIGNING_SECRET, and the public Supabase URL/key for the build and runtime. Never upload `.env.local`; `.vercelignore` excludes private environment files. Use `npm run deploy`; this command refuses a linked project whose name is not manyfolds. The local Motive association has been removed.

`api/index.ts` reuses the tested Node middleware and database pool. `vercel.json` sends API paths to that handler and preserves SPA deep links. `npm run test:vercel` tests rewritten paths and API authentication locally; it does not establish a hosted deployment. The setup follows [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js) and [Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite). On Vercel, document uploads are capped at 3 MB before base64 encoding to stay inside the [function payload limit](https://vercel.com/docs/functions/limitations); the standalone Node host retains the 5 MB cap. The document UI reads the actual limit from the server.

Apply `20261017_roadmap_review_lifecycle.sql` for atomic roadmap version checks. Content edits return a roadmap to draft; review precedes approval, and approval precedes publication. Saved review notes remain internal to counselling staff. Run `npm run test:roadmap-review` to verify these transitions and role restrictions without sending an AI request.

## Counselling session records and personal bookmarks (17 October)

Apply `20261017_counselling_session_records.sql` and `20261017_saved_pathways.sql`. Session details are restricted to counselling staff; private session notes are restricted to their author, including against other admins. Direct authenticated writes are revoked. Session completion requires attendees, a reason and a recorded outcome. Activity and detailed-record versions are checked in one transaction. A separate approved summary is the only narrative included in guardian exports. Internal case-note exports include only the requesting author's private note. Recorded actions/follow-up dates do not yet create calendar events automatically.

Personal saved options are held per school and user, with idempotent insertion, a 500-option quota and serialized preference changes. Browser bookmarks are offered for explicit selection/import because the old local store was school-scoped. They are never silently assigned to a person. These bookmarks are not student action plans. Run `npm run test:guidance` and `npm run test:saved-pathways`.

Production deployment `dpl_ANkbn1nc1TpmzuNj4EKgV4tytZXJ` includes these features. Hosted health returns 200 and anonymous session/bookmark API calls return 401. The Edge browser extension now opens the hosted sign-in page; authenticated UI checks are awaiting the user's sign-in.

### Email delivery and the future domain

The configured Supabase project has Google and email authentication enabled, requires email confirmation, and has no custom SMTP host. [Supabase's default SMTP sender is restricted to team addresses and is not intended for production](https://supabase.com/docs/guides/auth/auth-smtp). Configure the chosen mail provider and verified sender when its credentials and domain are available, then verify signup and recovery emails. Do not disable confirmation to conceal delivery failures. When the domain is purchased, add it to this Manyfolds Vercel project, configure DNS/HTTPS, and add the exact new `/auth/callback` to Supabase while preserving valid Vercel/development redirects.
