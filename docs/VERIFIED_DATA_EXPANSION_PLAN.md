# Manyfolds verified data expansion plan

Prepared 5 October 2026. Scope: India-focused career, education, admission, and funding records used by the knowledge database and AI roadmap.

## Starting point

The live database currently exposes 3 verified courses, 2 verified institutions, 4 verified examinations, and no verified scholarships. Its 3,327 career entries are verified occupation titles from the National Classification of Occupations, not verified career requirements. The larger seed catalogues remain discovery material until individual claims and relationships are checked.

## Source register

| Data | Primary source | What it can verify | What needs another source |
| --- | --- | --- | --- |
| Occupation names and codes | [National Classification of Occupations](https://www.ncs.gov.in/documents/national%20classification%20of%20occupations%20_vol%20i-%202015.pdf) | Occupation identity, taxonomy, and published role description | Present-day demand, pay, hiring prospects, and a compulsory course route |
| Institution identity | [AISHE institution directory](https://dashboard.aishe.gov.in/) and [UGC university directory](https://www.ugc.gov.in/universitydetails/university/?type=0wBmFB1Rb4JGVzq9UP%2FiOg%3D%3D) | Registered institution and university identity | Current programme offering, recognition for a regulated profession, fees, and admission dates |
| Vocational qualifications | [NCVET National Qualification Register](https://www.nqr.gov.in/qualifications-search) | Approved qualification, level, awarding body, and stated outcomes | Availability at a particular provider and current enrolment dates. The register announces a migration, so the connector must accommodate its successor. |
| Technical, medical, nursing, and law recognition | Relevant regulator: [NMC college and course search](https://oldnmc.nmc.org.in/information-desk/college-and-course-search/), [Indian Nursing Council lists](https://www.indiannursingcouncil.org/nursing-institute-for-the-year-2025-26-and-2026-27), [Bar Council legal education notices](https://www.barcouncilofindia.org/info) | Recognition or restriction for the stated programme and academic year | Institution-specific admissions and fees. AICTE approval data should be added after its official access and reuse terms are confirmed. |
| Programme offering, eligibility, duration, and fees | Exact institution programme page, annual admission bulletin, prospectus, and fee circular; for example [IIT Delhi](https://curriculum.iitd.ac.in/view_program.php?program_code=CS1), [NLSIU](https://www.nls.ac.in/programme/ba-llb-hons/), [Bharati College](https://www.bharaticollege.du.ac.in/academics/program), and [University of Delhi admissions](https://admission.uod.ac.in/) | The named programme and only the facts expressly published for its cycle | General institution directory entries cannot establish these facts |
| Entrance exams and dates | Conducting authority's current information bulletin and corrigenda: [JEE Main](https://jeemain.nta.nic.in/information-bulletin/), [CUET UG](https://cuet.nta.nic.in/document-category/information-bulletine/), [CLAT](https://clat2027.consortiumofnlus.ac.in/clat-2027/ug-instructions.html), and each other relevant authority | Exam eligibility, registration window, fee, test dates, and changes for a named cycle | Whether a specific institution programme accepts that exam |
| Seats, counselling, and cutoffs | Current [JoSAA seat matrix](https://josaa.nic.in/seat-matrix/), [MCC UG notices](https://mcc.nic.in/current-events-ug/), and the relevant state or institutional counselling authority | Programme and category-specific seat or allocation facts for one cycle | Admission probability. Historic cutoffs must stay labelled historical. |
| Scholarships | [National Scholarship Portal scheme list](https://scholarships.gov.in/All-Scholarships), the actual scheme guideline, and state or provider portal where relevant | Scheme existence, criteria, benefit, application window, and current status | Personal eligibility without the student's required documents and conditions |

## Verification contract

1. Store each fact as a claim with entity ID, field, value, source URL, publisher, document title, publication date, date checked, source excerpt or page number, reviewer, academic cycle, and expiry rule. Preserve a copy or hash of the cited bulletin where reuse permits.
2. Verify relationships separately: career-to-course, institution-to-programme, programme-to-exam, programme-to-cycle, and programme-to-scholarship. A source mentioning two entities is insufficient unless it states the relationship.
3. Use the strongest authority for each claim. A regulator confirms recognition; the institution confirms its offering and fees; the exam body confirms exam dates; the counselling body confirms its own seats and rounds. Store conflicting claims for review and publish neither until resolved.
4. Promote a record only when its required fields, source, cycle, and human review are complete. A verified occupation title does not promote its description or education route. Missing values remain null in storage and appear as “No verified data available” in the product.
5. Expire cycle-specific dates and figures at cycle close or when a corrigendum appears. Recheck active deadlines daily, open admission cycles weekly, institution offerings and fees at each new prospectus, regulator recognition at each published list, and taxonomy annually. These are proposed operating intervals; source notices take precedence.
6. AI generation reads only promoted claims and relationships. It cites the supplied source record IDs and never fills absent fees, seats, dates, eligibility, or scholarship details from model memory.

## Rollout order

**Phase 1 — infrastructure and audit.** Inventory every field and relationship in the 38,378 institution, 683 course, 75 exam, and 41 scholarship seed rows. Create source adapters, claim-level provenance, a review queue, duplicate/entity matching rules, expiry jobs, and a coverage dashboard. Keep all unreviewed seed facts out of student-facing results.

**Phase 2 — useful national routes.** Import current, source-linked records for the most requested pathways across engineering, medicine, nursing, law, design, commerce, humanities, psychology, and vocational training. Build each route end to end: occupation or field → qualification → named institution programme → current admission route → applicable exam → cycle. Start with the existing IIT Delhi, NLSIU, and Delhi University pilot, then expand by student search demand and geographic coverage. A route is complete only when every displayed link has its own evidence.

**Phase 3 — cost and access.** Add institution fee circulars, hostel charges where published, official scholarship schemes and windows, category or domicile rules, and counselling seat matrices. Show historical cutoffs only with year, category, quota, and round. Do not calculate admission chances from them.

**Phase 4 — national and state breadth.** Add state counselling authorities and university admission portals through source-specific adapters. Prioritise states represented in actual Manyfolds users, then expand state by state. Monitor broken links, changed documents, withdrawn recognition, amended dates, and new cycles. Use reviewer sign-off for conflicts and high-impact eligibility changes.

## Release gates and measures

- No blank or pending-review factual value reaches the knowledge API or AI evidence package.
- Every published programme has an exact institution-programme source; every current date includes its academic cycle and authoritative notice.
- Every published regulated programme has a current recognition check and no unresolved adverse notice.
- Coverage dashboard reports verified entities, verified relationships, complete routes, source age, conflicts, expired cycles, and missing fees/scholarships by field and state. Counts must distinguish title-only records from full guidance records.
- Sample audits compare extracted values with source documents, including amended notices. Failed or stale rows return to the review queue and disappear from student-facing results.

The database becomes comprehensive through repeatable source coverage and re-verification, rather than bulk-promoting the existing seed catalogue.

## Execution status, 6 October 2026

- **Phase 1 operating:** `catalogue_claims` records field-level provenance, review method, cycle, expiry, and source. The knowledge API and roadmap evidence require active claims, using the India calendar date for cycle expiry. The Data Verification workspace shows published coverage, checked eligibility, missing fees, verified relationships, expired/stale/conflicting claims, state coverage, candidate queue, and source checks. Twelve official-source monitors are registered. A changed page marks its verified claims stale; a failed fetch is retried within 24 hours. The NSP staging feed also stales published claims when an individual card changes or disappears. A reviewer publication rechecks the current official card and matches the four already published scheme IDs. Existing seed rows remain hidden unless separately verified. The daily GitHub Actions source refresh is active in the Manyfolds repository; its first manual run passed on 6 October 2026 using the repository secret.
- **Phase 2 pilot:** The IIT Delhi CSE, NLSIU law, University of Delhi psychology, NID integrated design, and Bharati College B.Com course names are published from official sources; four institutions and four exams have name claims. Five exact institution-programme offerings have been promoted. NLSIU law and NID integrated design have checked core eligibility claims. The [NID 2027–28 admissions handbook](https://admissions.nid.edu/NIDA2027/download/BDES_IntegratedPathway_AdmissionsHandbook2027_28.pdf) now backs its any-stream 10+2 rule, category-specific age cutoffs, DAT route, and 30 November 2026 DAT application deadline. NID fees and personal document/results checks remain unavailable. Bharati Psychology and Bharati B.Com offerings remain incomplete pending next-cycle eligibility and fees. NLSIU's eligibility section and the CLAT 2027 application deadline have separate claims. Course attributes and exam descriptions without field claims are withheld from AI evidence. A career-to-course or course-to-exam link is described as verified only with its own official relationship claim; the law degree, NLSIU CLAT, and NID DAT links meet that test. Seeded software and psychology links remain unverified.
- **Phase 3 scholarship start:** Four NSP 2026–27 listings with 31 October 2026 student application windows are published as **verified listings**. This does not establish an award amount or an individual's eligibility. The current NSP page yields 31 scheme cards, staged as pending review through `npm run data:scholarships:stage:apply`; an owner/admin can publish a checked name and window with a required reviewer note. The portal's conflicting PM-USP CSSS application dates remain unpublished.
- **Checks:** The scholarship parser, roadmap evidence stale-claim and relationship checks, verification workspace query, app suite, RLS isolation suite, lint, and production build pass. All 87 public tables have RLS enabled. The source-monitor baseline was checked against official pages; the JoSAA page could not be fetched by the monitor and remains unverified by that job. Current live state: 37 active claims, four verified scholarship listings, 31 pending NSP candidates, and twelve checked source monitors.

**Remaining for national coverage:** Verify and publish more routes in medicine, nursing, design, commerce, humanities, and vocational education; add official fee/benefit/recognition/seat claims and state source adapters; review staged scholarship cards; and continuously recheck changed notices. The publication coverage panel is the current count, not a claim that the seeded national database is complete.

## Source recheck, 9 October 2026

Changed-page monitoring withheld eighteen pilot claims. Current official NLSIU and NID pages, the NID handbook and exact NSP cards were checked again. Seventeen claims were reverified with `scripts/reverify-official-pilot.mjs --apply`; NID DAT identity now cites the handbook cover and section 2.1 through `20261009_nid_exam_source_review.sql`. Existing facts and rules were preserved. No fee, award amount, seat or personal eligibility was inferred. Coverage is again 37 active claims, four verified listings and 31 pending candidates. The script is confined to existing pilot facts, refuses changed windows/source assertions and does not bulk-publish candidates. National expansion remains incomplete.


## Expansion and research, 19 October 2026

Six more current NSP cards were audited and published for scheme identity and general application window only: Pragati, Saksham and Swanath technical diploma listings, plus pre-matric, post-matric and top-class disability listings. A strict reviewed manifest pins exact names/card hashes and refuses changed or expired data. Existing pilot claims were rechecked. Current coverage: 44 active claims, 10 verified scholarship listings, 25 pending candidates and 12 checked monitors. National eligibility/benefit/fee/recognition and complete-route coverage remains incomplete.

An on-demand AI research panel now retrieves official current-cycle source excerpts for missing exam/admissions information. Research does not promote claims or silently alter saved roadmaps. See OFFICIAL_AI_RESEARCH.md.
