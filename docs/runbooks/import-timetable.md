# Load the timetable, student lists and attendance

Until the admin portal exists, staff keep the timetable in a spreadsheet. A GitHub job reads it and updates the portal. Students then see their classes under **Classes**: My Classes, Tutorials (with a Join button for live tutorials), Calendar and Attendance, and exam dates in **Smart Revision**.

## The spreadsheet

Start from `docs/templates/timetable-template.xlsx` (in GitHub, open the file and click **Download raw file**). The **How to use** sheet explains every column. In short:

| Sheet | One row per | Notes |
|---|---|---|
| **Classes** | weekly class | Class code, level + subject (e.g. P5 + Mathematics), type, branch, room, teacher, day, start time, duration, first and last date, seats, meeting link |
| **Students** | student in a class | Class code + the student's client code. A class listed here gets exactly these students. |
| **One-off sessions** | single session | e.g. academic coaching; client codes separated by commas |
| **Cancellations** | cancelled session | Class code + date (e.g. public holidays) |
| **Attendance** | student at a session | Present, Late, Absent or Excused; only for sessions that have started |
| **Exams** | exam for a course | Level, subject, exam name and date, e.g. P6 · Mathematics · PSLE · 26/9/2027. Students see it in Smart Revision → Before-Exam Mode. |
| **Offers** | programme to recommend | Level, subject, offer name, short description, question bank topic, sub-topic numbers (blank = whole topic), optional From / Until dates. Shown in Smart Revision → "Recommended for you". |

Rules worth knowing:
- **Each upload that lists a class replaces its upcoming sessions.** Past sessions, their bookings and attendance never change.
- **To stop a class,** set its Last date and upload again. **To lift a cancellation,** delete the row and upload again.
- **Leave a sheet empty** if you have nothing for it; a class you don't list keeps its current sessions and students.
- **A whole file succeeds or fails together.** If anything is wrong, nothing from that file is saved and the run lists the problems by sheet and row.
- Branch names must match the portal's branches. Rooms are created the first time they appear.
- The database refuses a room or a teacher in two sessions at the same time, and more students than the class's Seats.
- Times are Singapore time.
- **Exams:** listing a course's exams replaces its upcoming centre exams (one removed from the sheet disappears for students, and any Before-Exam Mode on it ends). Leave the sheet empty to keep them. Students' own exams are never touched.
- **Offers:** a student sees an offer only if one of its sub-topics is weak for them **and** their guardian gave marketing consent. Students never see a price or a way to pay. The topic must already be in the question bank (import it first). Listing a course's offers replaces that course's offers. **To stop an offer,** set its Until date (removing its row only works while another offer for that course is still listed). Prices and fees in the text are refused.

## Each time

1. **Upload the file.** In Supabase, go to **Storage → timetable-inbox → Upload files**. Put it at the top level, not in a folder. Several files are processed in name order (e.g. `01-term1.xlsx`, `02-attendance-week3.xlsx`).
2. **Run the import.** In GitHub, go to **Actions → Import timetable → Run workflow**, enter the centre's slug (`test-centre` for the test centre) and click **Run workflow**.
3. **Check the result.** Open the run when it turns green or red. Each file shows `✓` with what changed, or `✗` with the problems to fix. Processed files move to `timetable-inbox/done/<date>/`; failed ones to `failed/<date>/`.

The job uses the same two GitHub secrets as the lesson import (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; see `import-lessons.md`).

## Try it with the test student

This uses Sam (client code `TEST2`, username `test.student`, see `student-logins.md`).

1. **Make sure the Test Centre has a branch called "Main".** In **Supabase → SQL Editor**, run:

   ```sql
   insert into public.branches (centre_id, name)
   select '7e570000-0000-4000-8000-000000000001', 'Main'
   where not exists (
     select 1 from public.branches
     where centre_id = '7e570000-0000-4000-8000-000000000001' and lower(name) = 'main');
   ```

2. **Upload** `docs/templates/timetable-example-test-centre.xlsx` to the `timetable-inbox` bucket and **run** the import with centre `test-centre`. It adds:
   - a Saturday 9:00 am physical tutorial (P5 Mathematics, Main, Room 1), cancelled on 26 Dec;
   - a Wednesday 7:30 pm live tutorial with a Google Meet link;
   - a one-off academic coaching session on Thu 12 Nov, 4:00 pm.
3. **Sign in as Sam** and open **Classes → My Classes**, **Calendar** and **Tutorials**. The Join button appears 15 minutes before the live tutorial starts.
4. **Attendance:** after a session has started, add rows to the Attendance sheet (e.g. `TEST-P5MA-SAT | 7/11/2026 | TEST2 | Present`), upload and run again. It shows under **Classes → Attendance**.

## Check a file without uploading (optional, for developers)

```
cd scripts/timetable_import
pip install openpyxl
python3 import_timetable.py check path/to/file.xlsx
```
