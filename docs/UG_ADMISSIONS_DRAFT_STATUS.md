# UG application tracking draft

Snapshot preserved on `wip/ug-admissions-20261104` while the public project-review experience is prioritised. This branch is not the production release.

The October 28 implementation adds scoped application records, checklist and source-review gates, follow-ups, timeline/calendar/search/notification links, a public-source register, expanded research subjects, health/readiness scripts and a synthetic recovery drill. Its database migration and reviewed source updates were applied to the intended Manyfolds database. No real student applications were entered or sent to colleges.

Targeted UG and synthetic restore checks passed. The full release run contained failures in onboarding and planning during temporary database interruptions; connection handling was subsequently changed, but final regression verification and deployment were not completed. Research answer version 3 and fee-source safeguards also need their final regression run. The local browser fixture was exercised with synthetic records at desktop and mobile widths.

The user will arrange SMTP and commercial hosting. Managed backup metadata showed no backups; the synthetic restore drill does not establish disaster recovery. Finish and verify these points before calling this branch launch-ready. Do not promote old scholarship dates or unavailable source pages to current verified data.
