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
- Apply `supabase/migrations/20260804_ai_roadmap_architecture.sql` before using generation.

The generator enforces 2,800 estimated input tokens, 1,700 output tokens, and a 5,000-token absolute session ceiling. Live retrieval is disabled by default. Missing or stale current data creates a verification task rather than becoming an unsourced claim.

The **Data Verification** workspace is restricted to organisation owners and
admins. It manages official-source review queues, pending programme imports,
freshness/conflict states, reviewer notes, and source history. Import templates
are in `data/templates`; the pilot scope and capability boundary are documented
in `docs/PROGRAMME_VERIFICATION_PILOT.md` and
`docs/AI_ROADMAP_CAPABILITY_MATRIX.md`.

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

## Controlled release configuration

This release is for authenticated counsellors only. Apply the Supabase migrations before using real student records, assign each staff account an active `organisation_memberships` row, and configure Google OAuth to redirect to `<production-origin>/auth/callback` (and `http://localhost:5173/auth/callback` locally).

The server endpoints verify the Supabase access token and derive the counsellor identity from it; they never accept a counsellor identity from the browser. Keep `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENROUTER_API_KEY` only in the server environment. A static host cannot serve the `/api/*` endpoints: deploy the Vite server integration to a Node-capable host or move those handlers to serverless functions before production.

For the current development and preview server, use:

```powershell
npm run dev -- --host localhost --port 5173
```

Never put real student data into front-end source files.
