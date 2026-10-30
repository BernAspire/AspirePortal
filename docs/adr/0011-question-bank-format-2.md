# 0011 · Question bank format 2: fractions, figures, self-checked answers

Date: 30 Oct 2026 · Status: accepted pending owner approval of the migration (PR)

## Context

The owner sent 13 new Primary 5 Mathematics banks (Topic 1 – Topic 13, about 5,900 questions,
3,700 figures). They use a richer format than the first Whole Numbers bank (ADR 0007): fractions,
figures, aligned worked steps, draw-on-paper questions. Details: `docs/question-bank-discovery.md`,
"Format 2".

## Decisions (owner, 30 Oct 2026)

1. **Topic names keep "Topic N - …"** and are listed in topic order (N becomes the topic's
   position). The old "Whole Numbers" topic stays as it is; "Topic 1 - Whole Numbers" is a new topic.
2. **Self-check** for questions that can't be marked by matching (drawings, sentence answers):
   the student opens the worked solution (`practice_solution`, only for those questions, only in
   their own session) and answers "I got it right" / "I got it wrong". This counts like any answer.
3. **Product A/BC/D and the source line stay hidden** from students.

## Technical decisions

- One importer reads both formats; format 2 content uses structured inline text with fractions,
  `image` blocks with storage paths, and `equation` blocks. Format 1 content is unchanged.
- Figures go to a private `question-images` bucket at
  `centres/{centre}/question-bank/images/{course}/{sha256}.{png|jpg}` (rule 8); figures in worked
  solutions under `…/{course}/solutions/`. The import function refuses any figure path outside
  that centre's and course's folder (and solution figures outside `solutions/`), and figures can't
  carry their own link. Storage RLS: question figures for the centre's staff or anyone who can
  learn that course today (rule 12); solution figures for staff, or a student for a question in
  their own practice that they have answered or that is self-checked. Pages get 1-hour signed URLs
  made with the user's own session.
- Multiple choice written into question text becomes ordinary multiple choice (325 questions).
- Marking (database) now matches the bank pages: it ignores unit powers (`cm²`, `m3`), keeps
  "1 500/1000" as three numbers, reads ".36" as 0.36, doesn't treat a dash between numbers as a
  minus sign, compares symbol-only answers, allows up to 8 answer boxes and a `self` answer kind.
  These rules also apply to the format 1 bank.

## Consequences

- Self-checked answers can be claimed right without being right (also without opening the
  solution). They then count like any right answer: XP (capped at 10/day), bookmarks resolved,
  spaced reviews and weak topics. They are a small share of questions (208 of 5,921, about 3.5%).
- Re-importing a topic file updates it (new versions for edited questions; history kept).
