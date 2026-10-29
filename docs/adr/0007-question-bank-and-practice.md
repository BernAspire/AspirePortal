# 0007 · Question bank and Practice

Date: 29 Oct 2026 · Status: accepted pending owner approval of the migration (PR)

## Context

The centre's question banks are single HTML pages, one per topic, holding questions as a `const BANK = {...}` JSON literal (`docs/question-bank-discovery.md`). The owner decided: source lines are shown to students, variants b–e are the centre's rewrites, all banks share the format, the bank will grow to many topics across P1–6 and S1–4, no term tags, and students only see what their programme covers.

## Decisions

1. **Tables** (migration `20261029000800_question_bank_practice.sql`): `question_topics` (per course), `question_sections`, `questions` (group, difficulty, strategy, marks, source, current version, active/retired), `question_versions` (immutable student-visible content), `question_keys` (immutable answers, why-not notes and worked steps), `question_imports` (one row per file, with the source file's path and SHA-256), and `practice_sessions`, `practice_items` (the exact question version given) and `practice_attempts` (append-only). Composite foreign keys, forced RLS, indexes for picking by course/section/difficulty.
2. **Canonical content is structured JSON blocks** (paragraphs and tables, choices, answer-box labels). The bank's text is plain text, so the importer stores no HTML; the original file is kept in the private `question-sources` bucket for traceability. The renderer (`modules/question-bank/render`) renders text nodes only; a golden-set test (HTML snapshots) guards it until the PDF worker adds screenshot comparisons.
3. **Answer keys never reach students before they answer.** Students can read `question_versions` for entitled courses (rule 12) but not `question_keys`. `public.submit_practice_answer()` (security definer) checks the session is the caller's, the programme is active today and service consent is on record, marks the answer in SQL with the original page's rules (`app.mark_answer`), records the attempt with its question version, and only then returns the answer, why-not notes and steps. Re-submitting returns the first result. All 1440 Whole Numbers answers self-mark correctly in a local load.
4. **Practice sessions are created by `public.start_practice()`**: at most one variant per group; unsolved questions first; adaptive mode orders by the student's accuracy per section (untried sections count as 50%). Guardians can view their child's practice but not start or answer it.
5. **Imports** run as a GitHub job with the service-role key (rule 5) through `public.import_question_bank()`, one transaction per file. Content or key changes create a new version; missing questions are retired. Files are named `P5 - Mathematics - Whole Numbers.html` (level – subject – topic), like lesson files.
6. **Modules:** `question-bank` owns topics/sections/questions/versions/keys/imports (`index.ts` server API, `ui.ts` client-safe renderer). `practice` owns sessions/items/attempts. Practice is learning activity: not audit-logged (ADR 0004); imports are.

## Consequences

- XP, streaks and the "Daily Drop" come with gamification; Mock Exams and Smart Revision reuse these tables.
- Diagrams or maths notation in future banks need new block types (and KaTeX) plus a discovery addendum before import.
- Staff editing of questions arrives with the admin portal; until then the bank files are the source of truth.
