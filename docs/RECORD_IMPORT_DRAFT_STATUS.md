# Unfinished record import draft

Preserved on `wip/record-imports-20261028` for continued development. This is not a release-ready feature and is not part of main.

The three draft files define preview, apply and rollback handling for class/staff assignments, guardians, academics and historical sessions. The handler is not wired into the application, there is no completed UI or dedicated integration suite, and `20261023_record_imports.sql` has not been applied.

Before any integration:

- Validate mapping objects, null rows and unique entry identifiers before hashing or accessing row fields.
- Detect semantic duplicates within a batch, including differing marks for the same academic record and session rows with differing sources.
- Review idempotent replay scope, profile history and rollback guards with current schema constraints.
- Implement the upload/mapping/review UI with permissions and unsaved-change protection.
- Add synthetic cross-school, caseload, role, conflict, duplicate, history, idempotency and rollback tests for every import type.
- Verify the migration in a transaction, then apply only through the intended release procedure.

Do not describe these imports as implemented or enable them in production until the above work is completed and reviewed.
