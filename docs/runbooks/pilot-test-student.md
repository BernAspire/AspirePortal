# Create a test student for trying the portal

Until the admin portal exists, test accounts are set up by hand. Use made-up details only: no real student data in a test setup (CLAUDE.md, PDPA).

## 1. Create the login

Supabase dashboard → **Authentication → Users → Add user → Create new user**. Enter an email inbox you can read (e.g. `you+student1@yourdomain.com`), leave the password blank, and tick **Auto Confirm User**. Copy the new user's **UID**.

## 2. Create the centre, student and programme

Supabase dashboard → **SQL Editor → New query**. Paste the script below, replace `PASTE-USER-UID-HERE` with the UID from step 1, and run it. It is safe to run once; running it again will fail on duplicate slugs and change nothing.

```sql
begin;

-- Fixed ids so the rows are easy to find and remove later.
insert into public.centres (id, slug, name)
values ('7e570000-0000-4000-8000-000000000001', 'test-centre', 'Test Centre');

insert into public.branches (id, centre_id, name)
values ('7e570000-0000-4000-8000-000000000002', '7e570000-0000-4000-8000-000000000001', 'Test Branch');

insert into public.subjects (id, centre_id, code, name)
values ('7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-000000000001', 'SCI', 'Science');

insert into public.levels (id, centre_id, code, name, stage)
values ('7e570000-0000-4000-8000-000000000004', '7e570000-0000-4000-8000-000000000001', 'P6', 'Primary 6', 'primary');

insert into public.courses (id, centre_id, subject_id, level_id, name)
values ('7e570000-0000-4000-8000-000000000005', '7e570000-0000-4000-8000-000000000001',
        '7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-000000000004', 'Primary 6 Science');

insert into public.households (id, centre_id, name)
values ('7e570000-0000-4000-8000-000000000006', '7e570000-0000-4000-8000-000000000001', 'Test family');

insert into public.students (id, centre_id, household_id, user_id, full_name, preferred_name, level_id, client_code)
values ('7e570000-0000-4000-8000-000000000007', '7e570000-0000-4000-8000-000000000001',
        '7e570000-0000-4000-8000-000000000006', 'PASTE-USER-UID-HERE',
        'Test Student', 'Tess', '7e570000-0000-4000-8000-000000000004', 'TEST1');

insert into public.centre_memberships (centre_id, user_id, role, status)
values ('7e570000-0000-4000-8000-000000000001', 'PASTE-USER-UID-HERE', 'student', 'active');

insert into public.programmes (id, centre_id, name, kind)
values ('7e570000-0000-4000-8000-000000000008', '7e570000-0000-4000-8000-000000000001',
        'P6 Science E-learning', 'e_learning');

insert into public.programme_courses (centre_id, programme_id, course_id)
values ('7e570000-0000-4000-8000-000000000001', '7e570000-0000-4000-8000-000000000008',
        '7e570000-0000-4000-8000-000000000005');

insert into public.programme_enrolments (centre_id, programme_id, student_id, valid_from, valid_until)
values ('7e570000-0000-4000-8000-000000000001', '7e570000-0000-4000-8000-000000000008',
        '7e570000-0000-4000-8000-000000000007',
        (now() at time zone 'Asia/Singapore')::date,
        (now() at time zone 'Asia/Singapore')::date + 90);

insert into public.student_courses (centre_id, student_id, course_id, is_current)
values ('7e570000-0000-4000-8000-000000000001', '7e570000-0000-4000-8000-000000000007',
        '7e570000-0000-4000-8000-000000000005', true);

commit;
```

## 3. Sign in

Open the portal, choose **Sign in**, and enter the email from step 1. Type the code from the email. You should land on the student home page with "Hi, Tess" and one course card, **Primary 6 Science**, with access for 90 days.

## What you should see in other cases

| Change | Expected result |
| --- | --- |
| Set the enrolment's `valid_until` to yesterday | "No active programmes" |
| Set the membership `status` to `suspended` | "Nothing to show yet" page |
| Sign in with an email that has no account | Same "we've emailed a code" message; no email arrives |
