# Load lessons into the portal

Lessons are the centre's own PowerPoint slides and Word (or PDF) worksheets. A GitHub job converts them, makes one image per page, hides live-class-only slides (e.g. "Class Rules"), marks worked solutions so students try first, and publishes the lesson.

## Name the files

The name says where the file goes:

```
P5 - Mathematics - Worksheet 01 - Numbers to 10 Million.pptx              → lesson slides
P5 - Mathematics - Worksheet 01 - Numbers to 10 Million - Questions.docx  → worksheet (students can download it)
```

- **Level:** P1–P6, S1–S5, JC1 or JC2.
- **Subject:** Mathematics, Science, English, Chinese, …
- **Week:** "Worksheet", "Week" or "Lesson" followed by its number. This becomes the lesson's position in the course.
- **Title:** the rest of the name.

Files with the same level, subject and week become one lesson. Importing the same week again replaces it. A course such as "Primary 5 Mathematics" is created the first time it's needed.

## One-time setup (owner)

1. **Supabase service key.** In Supabase, go to **Project Settings → API Keys** and copy the **service_role** (or **secret**) key. This key can read and change everything, so put it **only** in GitHub, never in chat, email or code.
2. **GitHub secrets.** In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add two:
   - `SUPABASE_URL`: your Project URL, e.g. `https://abcd1234.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: the key from step 1

## Each time

1. **Upload the files.** In Supabase, go to **Storage → lesson-inbox → Upload files** and add the PowerPoint and Word files. Put them at the top level of the bucket, not in a folder.
2. **Run the import.** In GitHub, go to **Actions → Import lessons → Run workflow**.
   - **Centre:** the centre's slug (`test-centre` for the test centre).
   - **Draft:** tick it if students shouldn't see the lesson yet.
   - Click **Run workflow**.
3. **Check the result.** After a few minutes the run turns green. Open it to see what happened, e.g.
   `✓ Primary 5 Mathematics · Week 1: Numbers to 10 Million (published)` with the number of slides, worked solutions and hidden slides.
   Imported files move to `lesson-inbox/done/<date>/`. Files that failed move to `failed/<date>/`, and the run says why.

Students see a lesson only while one of their programmes includes that course (see below).

## Give the test student access to Primary 5 Mathematics

After importing Week 01 into the test centre, run this once in **Supabase → SQL Editor**. It gives Tess a 90-day programme for Primary 5 Mathematics and records a test parent's consent, so her progress is saved:

```sql
do $$
declare
  c        uuid := '7e570000-0000-4000-8000-000000000001';  -- Test Centre
  tess     uuid := '7e570000-0000-4000-8000-000000000007';  -- Tess
  family   uuid := '7e570000-0000-4000-8000-000000000006';
  course   uuid;
  prog     uuid := gen_random_uuid();
  parent   uuid := gen_random_uuid();
  recorder uuid;
begin
  select id into course from public.courses
   where name = 'Primary 5 Mathematics' and (centre_id = c or centre_id is null) limit 1;
  if course is null then
    raise exception 'Import a Primary 5 Mathematics lesson first.';
  end if;
  select user_id into recorder from public.students where id = tess;

  insert into public.programmes (id, centre_id, name, kind) values (prog, c, 'P5 Mathematics E-learning', 'e_learning');
  insert into public.programme_courses (centre_id, programme_id, course_id) values (c, prog, course);
  insert into public.programme_enrolments (centre_id, programme_id, student_id, valid_from, valid_until)
    values (c, prog, tess, (now() at time zone 'Asia/Singapore')::date, (now() at time zone 'Asia/Singapore')::date + 90);

  -- A made-up parent and their online-form consent (test data only).
  insert into public.guardians (id, centre_id, household_id, full_name) values (parent, c, family, 'Test Parent');
  insert into public.guardian_students (centre_id, guardian_id, student_id, is_primary) values (c, parent, tess, true);
  insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
    values (c, tess, 'service', 'pilot-v1', 'online_form', parent, recorder, 'TEST-FORM-0001');

  raise notice 'Tess can now open Primary 5 Mathematics, and her progress will be saved.';
end $$;
```

Then sign in as Tess and choose **Learn**.
