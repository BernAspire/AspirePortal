# Create a test student for trying the portal

Until the admin portal exists, test accounts are set up by hand. Use made-up details only: no real student data in a test setup (CLAUDE.md, PDPA).

## 1. Create the login

Supabase dashboard → **Authentication → Users → Add user → Create new user**. Enter an email inbox you can read, leave the password blank, tick **Auto Confirm User**, and click **Create user**.

## 2. Create the centre, student and programme

Supabase dashboard → **SQL Editor → New query**. Paste the script below, change `you@example.com` on the first line to the email from step 1, and click **Run**. It finds the login by email, so there is no ID to copy. It can be run once; a second run stops with a duplicate error and changes nothing.

```sql
do $$
declare
  v_email text := 'you@example.com';  -- ← change to your Gmail address
  v_user  uuid;
  c uuid := '7e570000-0000-4000-8000-000000000001';  -- Test Centre
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No login found for %. Create it first under Authentication → Users.', v_email;
  end if;

  insert into public.centres (id, slug, name) values (c, 'test-centre', 'Test Centre');
  insert into public.branches (id, centre_id, name) values ('7e570000-0000-4000-8000-000000000002', c, 'Test Branch');
  insert into public.subjects (id, centre_id, code, name) values ('7e570000-0000-4000-8000-000000000003', c, 'SCI', 'Science');
  insert into public.levels (id, centre_id, code, name, stage) values ('7e570000-0000-4000-8000-000000000004', c, 'P6', 'Primary 6', 'primary');
  insert into public.courses (id, centre_id, subject_id, level_id, name)
    values ('7e570000-0000-4000-8000-000000000005', c, '7e570000-0000-4000-8000-000000000003', '7e570000-0000-4000-8000-000000000004', 'Primary 6 Science');
  insert into public.households (id, centre_id, name) values ('7e570000-0000-4000-8000-000000000006', c, 'Test family');
  insert into public.students (id, centre_id, household_id, user_id, full_name, preferred_name, level_id, client_code)
    values ('7e570000-0000-4000-8000-000000000007', c, '7e570000-0000-4000-8000-000000000006', v_user,
            'Test Student', 'Tess', '7e570000-0000-4000-8000-000000000004', 'TEST1');
  insert into public.centre_memberships (centre_id, user_id, role, status) values (c, v_user, 'student', 'active');
  insert into public.programmes (id, centre_id, name, kind) values ('7e570000-0000-4000-8000-000000000008', c, 'P6 Science E-learning', 'e_learning');
  insert into public.programme_courses (centre_id, programme_id, course_id)
    values (c, '7e570000-0000-4000-8000-000000000008', '7e570000-0000-4000-8000-000000000005');
  insert into public.programme_enrolments (centre_id, programme_id, student_id, valid_from, valid_until)
    values (c, '7e570000-0000-4000-8000-000000000008', '7e570000-0000-4000-8000-000000000007',
            (now() at time zone 'Asia/Singapore')::date, (now() at time zone 'Asia/Singapore')::date + 90);
  insert into public.student_courses (centre_id, student_id, course_id, is_current)
    values (c, '7e570000-0000-4000-8000-000000000007', '7e570000-0000-4000-8000-000000000005', true);

  raise notice 'Test student "Tess" created for %', v_email;
end $$;
```

## 3. Sign in

Open the portal, choose **Sign in**, and enter the email from step 1. Type the code from the email. You should land on the student home page with "Hi, Tess" and one course card, **Primary 6 Science**, with access for 90 days.

## What you should see in other cases

| Change | Expected result |
| --- | --- |
| Set the enrolment's `valid_until` to yesterday | "No active programmes" |
| Set the membership `status` to `suspended` | "Nothing to show yet" page |
| Sign in with an email that has no account | Same "we've emailed a code" message; no email arrives |
