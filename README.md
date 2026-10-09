# Manyfolds

Manyfolds is a counsellor-led school career-guidance workspace. This repository contains the staff-facing interface, with a daily priority queue, longitudinal student registry, follow-up surface, verified opportunity deadlines, and privacy-safe student summaries.

## AI-assisted roadmaps

Manyfolds can organise the existing deterministic recommendation and verified database evidence into a structured counsellor-reviewed roadmap through a server-only OpenRouter integration.

- Copy the documented variables from `.env.example` into `.env.local`.
- Keep `OPENROUTER_API_KEY` server-side. Never create a `VITE_OPENROUTER_API_KEY`.
- Configure only models that have passed the roadmap evaluation harness.
- Run `npm run ai:evaluate` for a zero-cost dry run.
- Run `npm run ai:evaluate:run` only after explicitly reviewing the configured models and expected cost.
- Run `npm run ai:evaluate:persist` to save reviewed results; only models passing every
  mandatory threshold are enabled.
- Apply `supabase/migrations/20260804_ai_roadmap_architecture.sql` and `supabase/migrations/20261001_openrouter_roadmap_models.sql` before using generation.
- Apply `supabase/migrations/20261004_official_roadmap_evidence_pilot.sql` for the reviewed engineering, law, psychology, and 2027 examination evidence. The verified facts and remaining gaps are listed in `docs/OFFICIAL_ROADMAP_EVIDENCE_2026-10-04.md`.

The generator enforces 2,800 estimated input tokens and 1,700 output tokens per call, with at most three attempts and a 9,000-token session ceiling. Live retrieval is disabled by default. Missing or stale current data creates a verification task rather than becoming an unsourced claim. Set the primary and fallback model variables to the values in `.env.example`; existing local or host values override the defaults. The live-tested primary is Mistral Small 3.2; GPT-4.1-mini is the fallback. GPT-OSS-120B truncated the required roadmap schema at this output limit.

The **Data Verification** workspace is restricted to organisation owners and
admins whose Supabase user UUID is listed in the server-only
`MANYFOLDS_CATALOGUE_CURATOR_IDS` environment variable. An empty list denies
all catalogue changes. It manages official-source review queues, pending programme imports,
freshness/conflict states, reviewer notes, and source history. Import templates
are in `data/templates`; the pilot scope and capability boundary are documented
in `docs/PROGRAMME_VERIFICATION_PILOT.md` and
`docs/AI_ROADMAP_CAPABILITY_MATRIX.md`.

The verified data expansion uses `supabase/migrations/20261005_catalogue_claim_provenance.sql`
`supabase/migrations/20261006_nid_design_offering.sql`, and
`supabase/migrations/20261006_bharati_offerings.sql`, and
`supabase/migrations/20261006_nid_2027_handbook.sql`.
Its claim table gates the knowledge API and AI evidence by verified field and expiry.
Run `npm run data:scholarships:stage:apply` to stage current NSP listings, then review
them in **Data Verification**; staging never publishes a listing. Run
`npm run data:sources:check:apply` on a schedule to check official pages and mark
claims stale when their source changes. The dry runs omit `:apply`. Current scope,
coverage, and remaining work are recorded in `docs/VERIFIED_DATA_EXPANSION_PLAN.md`.
The GitHub Actions workflow `.github/workflows/verified-data-refresh.yml` runs the
checks daily in the Manyfolds repository using the `MANYFOLDS_DATABASE_URL` Actions
secret. It stages new or changed scholarship cards for review and never publishes
them automatically. The first manual run passed on 6 October 2026.

## Run locally

```powershell
npm install
npm run dev
```

Use `npm run build` for a production bundle and `npm run lint` for static checks.

## Product boundaries

- Staff only: students and parents do not get accounts.
- Private counsellor notes must not appear in shareable summaries.
- Career information must be verified, sourced, and date-stamped before production publication.
- No deterministic career verdicts: the product supports counsellor judgement.

Sessions, tasks and the guidance calendar use school-scoped `guidance_activities`.
Apply `20261008_guidance_activities.sql` and run `npm run test:guidance` before using
these screens. Each activity belongs to a student, has a scheduled time and status,
and saves a shared decision summary. Owners, admins and counsellors can create and
edit; teachers can read. Cancelled and completed activities remain in history.
Scheduling records an internal school activity; it does not send email or calendar invitations.
The student drawer opens that student's linked follow-ups.

## Controlled release configuration

This release is for authenticated staff only. Apply the Supabase migrations, including `20261004_private_workspace_isolation.sql`, `20261004_legacy_personal_data_rls.sql`, `20261004_complete_public_rls.sql`, and `20261006_shared_student_registry.sql`, before using real student records. The shared registry migration copies existing student records from private counsellor storage without deleting the originals. Run `npm run test:students` and `node scripts/rls-audit.mjs` to verify cross-school isolation and RLS in the configured project. A fresh account completes school onboarding to create its own organisation and owner membership. Configure Google OAuth to redirect to `<production-origin>/auth/callback` (and `http://localhost:5173/auth/callback` locally). In deployment, configure the variables from `.env.example` in the host; the server reads host-provided variables and does not require a checked-in `.env.local`.

The server endpoints verify the Supabase access token and derive the counsellor identity from it; they never accept a counsellor identity from the browser. Keep `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENROUTER_API_KEY` only in the server environment. A static host cannot serve the `/api/*` endpoints: deploy the supplied Node production server to a Node-capable host. See `docs/PRODUCTION_DEPLOYMENT.md`.

For the current development and preview server, use:

```powershell
npm run dev -- --host localhost --port 5173
```

Never put real student data into front-end source files.

## School operations and production runtime

Apply `20261008_school_workflows.sql` and the `20261009_*` migrations before using administration, imports, private notes, archives and annual rollover. Run `npm run test:school` and `npm run test:operations` for API authorization and persistence checks. Operations tests use disposable schools.

After `npm run build`, use `npm start` with host environment variables. For local production preview using the existing private environment file:

```powershell
$env:PORT = '5173'
$env:HOST = '127.0.0.1'
node --env-file=.env.local server/index.ts
```

The Dockerfile targets Node 24. `npm run test:production-package` verifies startup without Vite; the Docker image itself requires a Docker-capable host for verification. Remaining launch work is in `docs/IMPLEMENTATION_CHECKLIST.md`. No remote release was published in this pass.
