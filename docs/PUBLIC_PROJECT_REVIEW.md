# Public project review experience

Updated 4 November 2026.

The homepage at https://www.manyfolds.in prioritises a no-account walkthrough for visitors evaluating the student-built project. The creator credit is intentionally "a student-built project", as requested.

## Public journey

- `/demo`: three fictional student profiles, editable subject interests, real rule-based exploration results with explanations, an illustrative four-stage roadmap, a deliberate sample review and an editable task checklist. All state stays in memory and resets on reload. It makes no private-record or live AI requests.
- `/project` (also `/about`): the problem, implemented workflow, engineering choices, stack, public source repository and current pilot scope.
- Homepage examples link directly to the corresponding demo profile. The branching-logo opening animation lasts about 1.7 seconds, plays once per tab session, and has a Skip button and Escape dismissal. Focusing the page dismisses it, and reduced-motion users bypass it. Staff sign-in remains available.
- Public information pages share navigation, typography, accessible focus states and a responsive layout. Resource worksheet downloads remain available.

The sample roadmap is explicitly labelled illustrative rather than live AI output. The private staff workspace remains the place for saved records and actual AI generation/review. No adoption, admissions success or impact metrics have been invented.

## Validation

- `npm test`: recommendation, storage isolation, interaction, auth, roadmap architecture, programme validation and new public-demo checks passed.
- `npm run lint` and `npm run build`: passed.
- React server-render checks: all three demo profiles, an invalid profile parameter, the project page and the main public information pages rendered successfully.
- Intro render checks cover first visit, returning session, reduced motion and disabled session storage. The main demo link remains present in each case.
- `npm run test:production`: public deep links, protected API responses, catalogue access, readiness, static assets, private-file denial, cross-origin write rejection and secret-free bundle checks passed.
- Browser visual/manual click-through remains unverified for this release: the browser access host and native computer-use connection were unavailable. Responsive CSS and render checks are not a substitute for that visual check.

This release improves the public project experience. It does not represent completion of every original product feature or commercial operation. Email delivery and commercial hosting arrangements remain separately owned launch work. The unfinished UG admissions module is preserved on `wip/ug-admissions-20261104`, outside this release.
