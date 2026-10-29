# Load question banks into Practice

Each question bank page (the HTML file made for one topic, e.g. Whole Numbers) becomes a topic in the portal. Students see its questions under **Learn → Practice** for courses their programme covers.

## Name the file

```
P5 - Mathematics - Whole Numbers.html
```

Level (P1–P6, S1–S5, JC1, JC2), subject, then the topic name, separated by " - ". The course (e.g. Primary 5 Mathematics) is created the first time it's needed. Importing a file with the same level, subject and topic again **updates** that topic:
- new questions are added;
- edited questions get a new version (answers students gave earlier stay linked to the version they saw);
- questions no longer in the file are retired (students stop getting them; history is kept).

Use the bank's own HTML file (the download from where it was made). A page saved from the browser with "Save as" does not contain the questions and will be refused.

## Each time

1. **Upload.** In Supabase, go to **Storage → question-inbox → Upload files**. Top level, not in a folder.
2. **Run.** In GitHub, go to **Actions → Import question bank → Run workflow**, enter the centre's slug (`test-centre` for the test centre) and click **Run workflow**.
3. **Check.** The run shows, per file, how many questions were added, changed, unchanged and retired, or the problems to fix (by question id). If anything is wrong, nothing from that file is saved. Processed files move to `question-inbox/done/<date>/`, failed ones to `failed/<date>/`. The original file is kept in the private `question-sources` bucket.

The job uses the same GitHub secrets as the other imports (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Try it with the test student

1. Rename the Whole Numbers bank file to `P5 - Mathematics - Whole Numbers.html`.
2. Upload it to `question-inbox` and run the job with centre `test-centre`. Expect `1440 added`.
3. Sign in as Sam (`test.student`, PIN `123456`; he has Primary 5 Mathematics) and open **Learn → Practice**. Choose Adaptive or Manual, a difficulty and 5, 10 or 15 questions, then **Start practice**.

## How answers are marked

The same way as the original page: multiple choice by option; written answers compare the numbers in order (spaces or commas in numbers, units and `$` don't matter), and worded answers compare letters ignoring case, spaces, punctuation and "and". Two-part answers need both parts right. Marking happens in the database, so the answers are never sent to the student's browser before they answer.

## Check a file without uploading (optional, for developers)

```
cd scripts/question_import
python3 import_bank.py check "P5 - Mathematics - Whole Numbers.html"
```
