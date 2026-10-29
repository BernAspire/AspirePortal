# ADR 0004: E-learning tables, offline consent, and student username + PIN sign-in

Date: 29 Oct 2026 · Status: proposed (accepted on merge)

Decided with the owner on 29 Oct 2026: the centre's existing lessons and notes must be readable in the portal; consent collected by an online form is acceptable for the pilot; students sign in with a username and PIN; the question bank waits.

## Decision

**Lessons.** `course_lessons` (per course, ordered, draft/published/archived) and `lesson_parts` (video, reading, document, link). Each part kind carries only its own content, enforced by a check constraint. Videos come only from YouTube or Vimeo. Documents are Storage paths under `centres/{centre_id}/`, and `..` is rejected. A lesson may use a platform course or one of its own centre's courses, never another centre's.

**Who sees lessons.** Staff manage everything in their centre. Students, and their guardians, see a lesson only when it is published *and* an enrolment valid today covers its course (`app.can_learn_course`, built on `app.has_course_access`). When the programme expires, the lessons disappear.

**Progress.** `lesson_progress` holds one row per student per part. A student can write only their own row, for a part they can see, and only once a `service` consent is on record (`app.can_record_progress`). After a withdrawal, no new progress is recorded. Students may update only status, completion time and time spent, and nobody deletes progress through the API. Guardians read their children's progress. Teachers see none until session-based access exists. Lesson content changes are audit-logged. Progress is learning activity, not a personal-data edit, so it is not.

**Offline consent.** `consents` gains `method` (portal, online_form, paper), `given_by_guardian_id`, `recorded_by` and `evidence_ref`. Front-desk staff, admins and owners can record online-form consent for a guardian and that guardian's own child. They record it in their own name and must give a reference to the form response. Teachers cannot record consent, and neither can students. Guardians can still consent in the portal later, unchanged. Staff can record a withdrawal.

**Student sign-in.** A student is a normal Supabase Auth user whose email is `<username>@students.aspireportal.invalid`, an address that can never receive mail, and whose password is the PIN. The `.invalid` ending is reserved for this purpose, so it cannot belong to anyone. Parents and staff keep the email code.

**PIN brute-force protection.** Failed attempts are counted per username in `app.pin_attempts`, which the API cannot read. Five failures within 15 minutes lock the username for 15 minutes. Only three functions are exposed:
- `pin_login_locked` reports whether a username is locked.
- `record_pin_failure` counts a failed attempt. It ignores unknown or malformed usernames, so it neither stores junk nor reveals which usernames exist.
- `clear_pin_failures` can be called only by the signed-in user, for themselves, so nobody can unlock someone else.

## Consequences

- **Lockout as a nuisance tool.** Someone who knows a username can keep it locked by failing on purpose. A 15-minute lock limits the nuisance, and a centre can reset the PIN.
- **PIN length.** Supabase's minimum password length must stay at 6 or above, so PINs are at least 6 digits.
- **Content loading.** There are no authoring screens in S1: lessons are imported from files by the centre's content loader (next PR), and document files go to a private Storage bucket served through short-lived signed URLs. The bucket and its Storage policies come with that PR, since the local test database has no Storage schema.
- **Check before merging.** Confirm that Supabase accepts a user with a `.invalid` email address, by creating one test student in the dashboard. If it doesn't, only `app.student_login_domain()` changes.
