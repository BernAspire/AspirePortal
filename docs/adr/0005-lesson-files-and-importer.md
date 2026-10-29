# ADR 0005: Lesson files as page images, imported by a GitHub job

Date: 29 Oct 2026 · Status: proposed (accepted on merge)

Context: the centre's lessons are PowerPoint decks built for live online classes (questions followed by worked-solution slides, warm-ups with answer slides, a "Class Rules" slide) and Word worksheets. The owner decided on 29 Oct 2026:
- worksheets can be downloaded, slides are view-only;
- class-rules slides are hidden automatically;
- courses run about 40 weekly lessons;
- videos come later.

## Decision

- **Page images, not raw files.** Each slide and worksheet page is rendered once, at import, to a WebP image: 1600 px wide for slides, 1240 px for A4 pages. Students see images, so slides work on every phone with no PDF viewer, and a slide deck is never sent whole. The original PDF is fetchable only when the part is `downloadable` (worksheets), enforced by the Storage policy `lesson_files_read` through `app.can_read_lesson_file`, not just hidden in the UI. Someone can still screenshot a slide; this stops casual copying of whole decks, not determined copying.
- **Worked solutions.** A slide whose title says "Worked Solution" or ends with "Answer" is marked `solution`. The viewer shows "Show worked solution" first. This is a teaching nudge, not a secret: the image is available to the student.
- **Importer as a job.** `scripts/lesson_import/import_lessons.py` runs in `.github/workflows/import-lessons.yml` and does the following:
  - reads files from the private `lesson-inbox` bucket;
  - groups them by name (`P5 - Mathematics - Worksheet 01 - Title[ - Questions].pptx|docx|pdf`);
  - converts them with LibreOffice and renders pages with Poppler;
  - uploads to `lesson-files` under `centres/{centre_id}/lessons/{lesson_id}/…`;
  - creates or updates the course, lesson (position = week) and parts.

  It uses the service-role key, as a job, and sets `centre_id` on every row (rule 5). The pure naming rules have unit tests in CI. The app never sees the service key.
- **Progress.** `lesson_progress.last_page` records the furthest page reached. The server decides completion (last page reached) and never moves backwards. Writes still require consent on record (ADR 0004). If consent is missing, the viewer says progress isn't being saved, instead of failing silently.

## Consequences

- **Converting files runs on GitHub, not Vercel.** Importing needs LibreOffice, which Vercel can't run, hence the GitHub job. A staff upload screen can trigger the same job later.
- **Fonts.** Rendering fidelity depends on the fonts installed in the job (Inter, Liberation and Carlito for Times New Roman and Calibri, Noto Color Emoji).
- **Re-importing.** Importing a week again replaces its parts. Old page images beyond the new page count stay in Storage but are no longer referenced, so nobody can read them.
