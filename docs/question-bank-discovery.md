# Question bank discovery report

Phase 5a input for the question-bank importer (see CLAUDE.md, "Question bank"). Written from the real file, not assumed.

## Source examined

| | |
|---|---|
| File | `Whole_Numbers_Question_Bank.html` (733 KB, one self-contained page made as a Claude artifact) |
| Received | 29 Oct 2026, attached by the owner in the build chat |
| Scope | Primary 5 Mathematics, Term 1, topic "Whole Numbers" (the page's storage key is `ah-p5-t1-bank-v1`) |
| Stored | Not in git. The source file goes to private Storage (`centres/{centre_id}/question-bank/sources/`) when imported, for traceability. |

Only one bank file exists so far. Other topics (fractions, geometry, etc.) may differ; each new file gets a short addendum here before it is imported.

## How the file is built

The page is one HTML file with inline CSS and one `<script>`. The questions are **not** in the HTML markup: they are a single JSON literal, `const BANK = {...}`, at the top of the script. The rest of the script (about 15 KB) is the practice app: filters, quiz mode, answer checking and progress saved in the browser's `localStorage`. The only embedded image is the Aspire Hub logo.

So the importer reads `BANK` with a JSON parser (find `const BANK = `, decode one JSON value). No HTML scraping and no HTML sanitising of question text is needed for this format, because every field is plain text that the page escapes before display.

## Structure

```
BANK = {
  sections: { "1": "Numbers up to 10 million", "2": "Multiplying and dividing by 10, 100, 1000 and their multiples",
              "3": "Order of operations and brackets", "4": "Word problems" },
  items: [ ...1440 questions... ]
}
```

### Question fields

| Key | Meaning | Present | Type / values |
|---|---|---|---|
| `id` | Question id: group + variant letter, e.g. `4.35b` | all 1440 | string, unique |
| `s` | Section (subtopic) number, key into `sections` | all | 1–4 |
| `g` | Group: one source question and its variants | all | string, 288 groups of exactly 5 (`a`–`e`) |
| `src` | Source exam reference, e.g. "Ai Tong 2020 SA2 P1 Q1" | all | string; identical within a group |
| `d` | Difficulty | all | 1 Easy (460), 2 Medium (709), 3 Challenging (271); can differ within a group |
| `q` | Question text | all | plain text; `\n` = new paragraph (155 items); `[3]` = marks shown in the stem (120 items); `☐` = blank box (30) |
| `o` | Multiple-choice options | 400 | always 4 strings |
| `c` | Correct option | with `o` | 1–4 (1-based) |
| `w` | Why each wrong option is wrong | with `o` | object keyed "1"–"4", always the 3 wrong options |
| `a` | Final answer | all | text; MCQ form "(2) 400"; open answers like "198 kg", "$6"; 135 have two parts "(a) … (b) …"; a few are words (numbers written in words) |
| `k` | Worked solution steps | all | 1–6 strings; multi-part steps start "(a)"/"(b)" |
| `t` | Table shown with the question | 124 | list with one table; a table is rows of cell strings, first row is the header |
| `h` | Word-problem strategy (heuristic) | 910, section 4 only | 11 labels, e.g. "Units × value", "Constant difference (ages)", "Excess and shortage" |
| `m` | Marks | 430, section 4 only | 1–5 |

### Counts by section

| Section | Questions | MCQ | Open answer | With table | Easy / Medium / Challenging |
|---|---|---|---|---|---|
| 1 Numbers up to 10 million | 210 | 115 | 95 | 5 | 170 / 35 / 5 |
| 2 × and ÷ by 10, 100, 1000 | 120 | 55 | 65 | 0 | 100 / 20 / 0 |
| 3 Order of operations | 200 | 105 | 95 | 0 | 50 / 150 / 0 |
| 4 Word problems | 910 | 125 | 785 | 119 | 140 / 504 / 266 |
| **Total** | **1440** | **400** | **1040** | **124** | **460 / 709 / 271** |

Sources: 288 exam references from 2020 and 2022 school papers (SA1, SA2, CA1, CA2, WA1–WA3, revision papers).

### Maths and special characters

No LaTeX, MathML, images or diagrams in any question. Maths is plain Unicode: `×` `÷` `−` (true minus) `→` `≤` `≥` `ℓ` `☐`. Numbers use a thin-space style thousands separator written as a normal space ("503 618"). **KaTeX is not needed for this file**; the renderer should still support it for later topics.

### Answer checking in the current page

- MCQ: the picked option is compared with `c`.
- Open answers: split into parts on "(a)", "(b)". If the expected part contains numbers, all numbers in the student's answer must match in order (spaces/commas as thousands separators and `−`/`–` are normalised; units and `$` are ignored). Otherwise the letters are compared ignoring case, spaces, punctuation and the word "and".

The portal should keep this behaviour so marking matches what students and teachers already know, and record the `question_version` each answer was given (CLAUDE.md data rules).

## Mapping to the canonical model

| Bank | Portal |
|---|---|
| the file | one import batch, source file kept in Storage |
| topic (from file / owner) | `question_topics` under course Primary 5 Mathematics |
| `sections` | subtopics under the topic |
| `g` | a question group (the 5 variants share a source, so a quiz never shows two variants of the same group) |
| `id` | `external_ref`, unique per centre + bank, so re-importing updates instead of duplicating |
| `d`, `h`, `m`, `src` | difficulty, strategy tag, marks, source reference |
| `q`, `t` | content blocks: paragraph (with marks and box markers), table |
| `o`, `c`, `w` | choice blocks with the correct choice and a "why not" note per wrong choice |
| `a` | answer spec: MCQ choice, or 1–2 parts each with expected text and the matching rule above |
| `k` | worked-solution step blocks |

Each import creates a new `question_version` when any content field changes; older answers keep pointing at the version they were given.

## Owner decisions (29 Oct 2026)

1. **Source references** are not shown to students (changed 30 Oct 2026; kept in the database for staff). Students see the bank's question number instead, e.g. Q1.4e.
2. **Variants b–e** are the centre's own rewrites of each original question; all five may be shown to students.
3. **Other topic files** are built the same way (one `BANK` JSON per page). This file is a sample: the bank will grow to many topics across Primary 1–6 and Secondary 1–4, so the schema and importer must handle a large bank (tens of thousands of questions) with indexed filtering.
4. **No term tags.** Questions are organised by course (subject × level), topic and section only.
5. **Access** follows subscriptions: a student only sees questions for courses their active programme covers (CLAUDE.md rule 12).

---

# Format 2 (the 2026 banks, examined 30 Oct 2026)

## Source examined

13 files sent by the owner on 30 Oct 2026, one per Primary 5 Mathematics topic, titled
`P5 - Mathematics - Topic N - <name>` (Topic 1 Whole Numbers … Topic 13 Bridging). 1.6–5.8 MB each;
5,921 questions and 3,705 figures in total. All 13 share the structure below; the importer reads
both formats (`scripts/question_import/bank.py` for format 1, `bank_v2.py` for format 2).

## Structure

`const BANK = { sections, short, items, img, key, hint }`

- `sections`: code → title, e.g. `"WN-A": "Numbers to 10 Million"` (3–9 per topic). Imported as
  sub-topics numbered 1, 2, 3 … in file order (so "WN-B" is sub-topic 2, used by the Offers sheet).
- `short`: shorter titles for the page's summary cards (not imported).
- `img`: list of figures as `data:image/png;base64,…` (PNG; JPEG also accepted).
- `key`: the page's local-storage key (not imported). `hint`: typing tip under answer boxes (kept).
- `items`, one per question:

| Field | Meaning | Imported as |
|---|---|---|
| `id` | question number `Q0001`, unique in the file | question number shown to students |
| `s` | section code | sub-topic |
| `d` | 1 Foundation, 2 Standard, 3 Challenging | difficulty |
| `g` | group: the same question at different difficulties | group (adaptive practice) |
| `p` | product A / BC / D (where it came from) | kept inside `source` only; not shown (owner) |
| `src` | source line | `source_ref`; not shown (owner, 29 Oct) |
| `q` | question lines: text, or `{table: rows}` | blocks |
| `o`, `c` | 4 options and the right one (1-based), 776 questions | multiple choice |
| `a` | answer text | key (marking) and the answer shown after |
| `k` | worked-solution lines (172 questions have none) | worked steps |
| `x` | "extra practice" | tag on the question |
| `draw` | answer is drawn on paper (128) | self-checked |

## Markup inside text

- `⟦num‖den⟧` is a fraction; `3⟦2‖7⟧` a mixed number; fractions can nest (one case). Used in
  question text, options, table cells, answers and steps (8,000+ times). Stored as structured
  inline lists, e.g. `["3", {"frac": [["2"], ["7"]]}]`, and drawn as stacked fractions.
- `[[img:N:W]]` is figure N, W pixels wide. Always alone on its line. Stored in private storage
  (`question-images`, `centres/{centre}/question-bank/images/{course}/{sha256}.png`) and shown with
  short-lived signed URLs.
- A worked-step line starting with a tab, `"\tArea\t= 6 × 9"`, is an equation row; consecutive
  rows line up their equals signs. `"(a)"` alone starts a part. Tabs elsewhere become spaces.
- `"(a)\t…"` in question text starts a part.

## Answer checking in the page (ported)

The page's own script (`parts`, `same`, `isOpen`, `normNum`) decides marking; the portal marks the
same way in the database:
- answers split into boxes on `;` when labelled `(a)`…`(h)`, `(i)`…`(vi)`, or `Label: value`;
  otherwise one box (so `"(4)"` is one box expecting 4). Up to 7 boxes seen (8 allowed);
- fractions compare in text form (`3 2/7`); numbers must match in order; `cm²`, `m3` are units,
  not numbers; spaces/commas in thousands are ignored unless a `/` follows;
- answers without numbers compare letters; a symbol-only answer (`÷`) compares the symbol;
- sentence answers (the page's `isOpen`: "because", "explain", long wordy answers …) and `draw`
  questions are **self-checked**: the student sees the worked solution and says whether they got
  it right (owner, 30 Oct 2026). The page instead accepted any attempt. 195 questions in the 13 files;
  a question with any such part is self-checked as a whole.
- The page's "Mark as correct / Mark as wrong" override buttons are not carried over: automatic
  marking stays on the server.
