# 0009 · Smart Revision: spaced reviews, weak topics, Before-Exam Mode, bookmarks

Date: 30 Oct 2026 · Status: accepted pending owner approval of the migration (PR)

## Context

The Aspire Online mockup and the owner's recording show a Smart Revision area with five tabs: Revision Home (today's tasks, upcoming spaced reviews, week stats, weak topics), Weak Topics, Before-Exam Mode, Bookmark Review and Revision Materials. Everything is built on the question bank and practice (ADR 0007).

## Decisions (owner, 30 Oct 2026)

1. **Topic level = sub-topic.** Revision tracks question-bank sections (e.g. "1.4 Rounding off"), not whole topics.
2. **Spaced reviews.** Each finished practice set records one append-only `revision_reviews` row per sub-topic it covered and updates `revision_states` (interval, next due date) through a trigger on `practice_sessions`. Ladder: 1, 3, 7, 14, 30, 60 days. 80%+ correct climbs one step; under 50% comes back tomorrow; in between keeps the interval. Before-Exam Mode halves the interval (at least 1 day). Students cannot edit due dates; they only rate their confidence (1–5 stars) through `set_topic_confidence`.
3. **Weak sub-topic** (computed in `modules/revision`): at least 3 of the latest 20 answers and accuracy under 70% ("Critical" under 50%), or a confidence of 2 stars or fewer.
4. **Exam dates: both.** Staff load centre exams per course from a new **Exams** sheet in the timetable spreadsheet (`apply_exam_dates`, service role; reloading a course replaces its upcoming centre exams). Students can add their own school exams (today up to two years ahead, only for courses they can learn) and remove them. `exam_dates.student_id` is null for centre exams.
5. **Before-Exam Mode** is one row per student and course in `revision_exam_modes`, changed only through `set_exam_mode` (switches off the old exam and on the new one in one transaction). It ends automatically when its exam is removed. The page shows days left, a daily target (weak sub-topics ÷ days left, 1–5) and prioritised sub-topics.
6. **Bookmarks.** Students bookmark questions in the practice runner (`question_bookmarks`, own rows only, only questions they can read). "Practise bookmarks" builds a set of up to 15 bookmarked questions (`start_bookmark_practice`); a correct answer marks the bookmark resolved (trigger on `practice_attempts`).
7. **Revision Materials: later.** The tab exists and says materials are coming.
8. **Offers ("Recommended for you")** are a separate PR. The owner asked for them to be shown to students with no payment; that needs its own ADR and an update to the CLAUDE.md PDPA line, and will keep the guardian marketing-consent check.

## Hardening (from independent review)

- A sub-topic moves up the ladder only when it is due (or new) and the set had at least 3 of its questions. Extra practice before the due date can bring a weak sub-topic back sooner, never push it further out. The state row is locked while it is updated.
- With Before-Exam Mode on, reviews are never scheduled on or after the exam day; switching the mode on brings later reviews forward to the day before.
- Confidence ratings, bookmarks and own exams need the guardian's service consent, like practice. Confidence uses the student's own course access.
- Bookmarks change only through `set_bookmark`, which can re-open a resolved bookmark.
- `revision_reviews` rejects deletes as well as updates. `app.active_exam` and `app.section_course` are no longer callable by signed-in users.
- Loading exam dates ends Before-Exam Mode on exams that have passed or whose date the centre moved, and ignores a name listed twice.

## Module boundaries

`start_bookmark_practice` writes practice tables, and the `schedule_reviews` / `resolve_bookmark` triggers react to practice tables. These are database functions owned by the revision migration; the app-level rule (a module writes only its own tables) still holds because the revision module's TypeScript writes only revision tables and calls practice through `modules/practice`. Practice itself knows nothing about revision.

## Consequences

- Revision data appears only after a student finishes practice sets; brand-new students see empty states.
- Interval rules live in `app.next_interval`; changing them affects future reviews only.
- `revision_reviews` is append-only and should be aggregated before any retention purge, like `learning_events`.
