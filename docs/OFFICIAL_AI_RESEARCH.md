# Official AI research

Implemented 19 October 2026. Authenticated staff can open the research panel on the Roadmap page, choose an exam/portal, topic and admission year, and request current official sources. Owner/admin/counsellor roles can run searches; teachers can read saved school research.

## Supported scope

JEE Main, NEET UG, CUET UG, CLAT, NID DAT, NIFT, National Scholarship Portal and Delhi University admissions. Topics: schedules/deadlines, eligibility and application fees. Domain lists are publisher-specific. This is an initial supported set, not nationwide verified route coverage.

The server uses the existing approved OpenRouter model order and Exa web grounding. It displays only provider citation excerpts from allowed HTTPS hosts mentioning the chosen year. Model-generated prose, arbitrary URLs and student profile information are excluded. A search excerpt is a lead to the official notice, not a reviewed catalogue claim or a determination of personal eligibility. A year mention does not establish that every date in a mixed-cycle document applies to that year. The interface requires users to open the notice and check amendments; absence of a result is not described as “not announced”.

Research cannot change an AI roadmap, approve a fact, or publish a catalogue record. Publication retains the field-level review process. Results include retrieval time, are cached per school for six hours, and are stored behind RLS. New searches have a school-wide one-minute cooldown and a maximum of 20 per hour, including failed attempts. Usage and provider cost are retained in the request ledger. Search fees use OpenRouter credits in addition to model inference. Input/output/session limits remain unchanged; over-budget provider responses are withheld, although already-incurred provider usage cannot be undone.

`MANYFOLDS_LIVE_DATA_ENABLED=true` and the server's existing OpenRouter key enable this endpoint. The automatic roadmap missing-record queue remains a separate review queue; generating a roadmap does not silently run paid searches.

## Verified catalogue expansion

Six exact NSP cards were reviewed against the live official portal and pinned by content hash in `data/verified/nsp-listings-2026.json`. `scripts/publish-reviewed-nsp-listings.mjs` refuses altered, duplicate, expired, renewal-only or conflicting records. It publishes only names and general application windows, without amounts or eligibility claims. Existing source monitors and claim expiry rules still withhold changed facts. The daily workflow includes this strict manifest recheck; remote CI must receive the local changes before that updated job can run.

At the final source recheck: 44 active field claims, 10 verified scholarship listings, 25 staged candidates, 12 source monitors checked. These are pilot coverage counts, not national completeness.

Roadmap snapshots now retain a separate source-state fingerprint. Review, approval and publication compare it to current catalogue state; legacy sourced drafts require regeneration. Audit metadata does not increase model prompt size.

Provider references: [OpenRouter web grounding and citation annotations](https://openrouter.ai/docs/guides/features/plugins/web-search).
