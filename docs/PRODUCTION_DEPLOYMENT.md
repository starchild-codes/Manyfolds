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

## Verification status (9 October 2026)

Local production HTTP smoke and school workflow integration checks passed. No remote
release was published in this work. The existing Vercel CLI credentials were rejected
as invalid, and the local Vercel link names the project `motive`. Its ownership/target
must be confirmed before publishing Manyfolds. The supplied Dockerfile targets a Node
host; the existing static Vercel configuration is not a working backend deployment.

Intermittent connection resets have been observed from the configured Supabase pooler.
Connection checks retry before a transaction starts; writes are not blindly replayed.
Create requests for diagnostics, interventions, guidance activities, and invitations
use stable IDs so an ambiguous response can be retried without duplicating the record.
Version conflicts require reloading before another edit. Monitor database availability
on the chosen host before commercial launch.

## Student profiles and private documents (17 October)

Apply `20261016_student_profiles.sql`, `20261017_shared_planning.sql` and `20261017_student_documents.sql`. Configure `DOCUMENT_SIGNING_SECRET` as a server-only random secret of at least 32 characters, identical across instances. A local secret was generated in the ignored environment file; it is not included in Git or the browser bundle. Rotating it invalidates outstanding document links.

Document binaries are held in the private database table; direct authenticated clients can read permitted metadata only. A signed two-minute download grant rechecks the issuing staff member's active school membership, current role and document archive state. Uploads validate file signatures/types and allow up to 5 MB each, 100 files per student and 1 GB per school, including archived files. Allowed formats are PDF, PNG, JPEG and UTF-8 text. Archives preserve contents; permanent purge and contractual retention policies require school-specific configuration and remain a launch requirement. Include these tables in backup/restore verification.
