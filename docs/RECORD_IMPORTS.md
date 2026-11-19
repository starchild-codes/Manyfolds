# Existing-student CSV imports

Implemented 19 November 2026. Open **Students → Import CSV records**. Import the student roster first; the second panel adds records to existing student IDs. Data-entry staff can use their import workspace for roster, class and academic imports.

## Supported records and permissions

| Type | Who can import | Behaviour |
| --- | --- | --- |
| Class assignments | Guidance staff and data-entry staff, within their student scope | Replaces the class label with a configured class/section |
| Primary staff assignments | Owner, administrator, lead counsellor | Assigns one active guidance staff member from the same school, matched by sign-in email |
| Guardian information | Guidance staff, within their student scope | Appends contacts with a school/source reference; never merges existing contacts |
| Academic marks | Guidance staff and data-entry staff, within their student scope | Appends sourced results; preserves other profile sections |
| Historical sessions | Owner, administrator, lead counsellor | Records completed historical sessions with a source, attendees, reason and action/decision; does not approve a shareable summary |

The server enforces permissions and student scope again at save time. Hiding a selector option is not the access control. The import ledger, including private before-images needed for rollback, is server-only and inaccessible directly to authenticated database clients.

## Workflow

1. Download the column template for the selected type.
2. Fill the CSV using registry Student IDs. Use at most 100 rows and a file under 900 KB.
3. Upload, check detected headers and map each field to a distinct column.
4. Validate and preview the actual values. No changes are saved by preview.
5. Resolve every validation error or duplicate. Conflicting rows block the entire batch.
6. Confirm the import. Repeated confirmation of the same completed request returns its existing result.
7. Use the saved history to download a result report containing batch metadata and affected IDs. It excludes previous private profile contents.

Classes must already exist in School configuration, such as `11 A`. Academic result types are `Reported result`, `Internal assessment` and `School prediction`. Historical timestamps require a past ISO datetime with timezone, such as `2026-10-01T10:00:00+05:30`; session types follow the existing session form, such as `Initial intake` and `Follow-up`.

Academic duplicates use student, subject, term, year and result type even when marks or sources differ. Session duplicates use student, normalized title and instant even when source references or timezone spellings differ. Entry IDs must also be unique. Ambiguous records are rejected rather than merged.

## Recovery and history

Owners and administrators can roll back an unchanged batch. All affected records are checked before any restoration. A later student/profile/session edit blocks the whole rollback; imported sessions with notes or linked tasks are also preserved. Class/staff/profile restorations create new versions. Historical sessions are cancelled and retained, along with their records. The batch is marked rolled back; its audit and history remain available.

A stale preview must be regenerated. Do not repair an import by editing its JSON or reusing its ID for another batch. After an ambiguous network response, retry the same confirmation; the server checks its school, actor, type and request hash. Read-only previews may be retried after a transport failure. Uncertain ordinary writes are not automatically replayed.

Migration: `supabase/migrations/20261119_record_imports.sql`. It was tested in a rolled-back transaction before application. Regression: `npm run test:record-imports`, using synthetic schools and cleaned fixtures. The API checks and server-render checks are separate from the pending authenticated browser inspection.
