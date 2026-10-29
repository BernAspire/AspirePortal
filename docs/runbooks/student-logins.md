# Student logins: username and PIN

Students sign in on the **Student** tab with a username and a PIN of 6–8 digits. Parents and staff use the **Parent or staff** tab (emailed code). Until the admin portal exists, logins are set up in the Supabase dashboard.

Behind the scenes, a student login is a Supabase user whose email is `<username>@students.aspireportal.invalid`. That address can never receive mail, and the student never sees it. The PIN is that user's password. After 5 wrong PINs within 15 minutes the username locks for 15 minutes; a correct sign-in clears it.

**Usernames:** 3–32 characters, lower-case letters, digits, dots, dashes or underscores, starting with a letter or digit. They must be unique across the whole platform, so a pattern like `tan.wm.aspire` avoids clashes. **PINs:** 6–8 digits, not obvious (avoid 123456, birthdays).

## 1. Create the login

Supabase → **Authentication → Users → Add user → Create new user**:
- **Email:** `<username>@students.aspireportal.invalid`, e.g. `tess.tan@students.aspireportal.invalid`
- **Password:** the PIN
- Tick **Auto Confirm User**, then click **Create user**.

## 2. Link it to a student

Supabase → **SQL Editor**. Change the first four lines, then run:

```sql
do $$
declare
  v_username  text := 'tess.tan';     -- the username from step 1
  v_full_name text := 'Tess Tan';     -- the student's name
  v_level     text := 'P5';           -- P1–P6, S1–S5, JC1, JC2
  v_centre    text := 'test-centre';  -- centre slug
  c uuid; v_user uuid; v_level_id uuid;
  v_household uuid := gen_random_uuid();
  v_student   uuid := gen_random_uuid();
begin
  select id into c from public.centres where slug = v_centre;
  if c is null then raise exception 'No centre with slug %', v_centre; end if;
  select id into v_user from auth.users where email = lower(v_username) || '@students.aspireportal.invalid';
  if v_user is null then
    raise exception 'Create the login first: Authentication → Users → Add user with email %@students.aspireportal.invalid', lower(v_username);
  end if;
  select id into v_level_id from public.levels where code = v_level and (centre_id = c or centre_id is null) limit 1;

  insert into public.households (id, centre_id, name) values (v_household, c, v_full_name || ' family');
  insert into public.students (id, centre_id, household_id, user_id, full_name, level_id, client_code)
    values (v_student, c, v_household, v_user, v_full_name, v_level_id, upper(substr(md5(random()::text), 1, 6)));
  insert into public.centre_memberships (centre_id, user_id, role, status) values (c, v_user, 'student', 'active');
  raise notice 'Linked % to new student % in %.', lower(v_username), v_full_name, v_centre;
end $$;
```

The student can now sign in, but sees no courses until they have a programme. Programmes and the parent's consent are set up as in `import-lessons.md` (until the admin portal does this).

## Reset a PIN

Supabase → **SQL Editor**. Change the two values, then run:

```sql
update auth.users
   set encrypted_password = extensions.crypt('654321', extensions.gen_salt('bf')),  -- the new PIN
       updated_at = now()
 where email = 'tess.tan@students.aspireportal.invalid';                            -- the username
delete from app.pin_attempts where username = 'tess.tan';                           -- clears any lock
```

"UPDATE 1" means it worked. "UPDATE 0" means no login has that username.

## Unlock without changing the PIN

```sql
delete from app.pin_attempts where username = 'tess.tan';
```

## Test student with username and PIN

You already created `test.student@students.aspireportal.invalid` with PIN `123456`. This script makes it a second test student, **Sam**, in the Test Centre, with Primary 5 Mathematics for 90 days and a test parent's consent. Run it after Week 01 has been imported.

```sql
do $$
declare
  c        uuid := '7e570000-0000-4000-8000-000000000001';  -- Test Centre
  v_user   uuid;
  family   uuid := gen_random_uuid();
  sam      uuid := gen_random_uuid();
  parent   uuid := gen_random_uuid();
  prog     uuid := gen_random_uuid();
  course   uuid;
  v_level  uuid;
begin
  select id into v_user from auth.users where email = 'test.student@students.aspireportal.invalid';
  if v_user is null then raise exception 'Create test.student@students.aspireportal.invalid first (PIN 123456).'; end if;
  select id into course from public.courses where name = 'Primary 5 Mathematics' and (centre_id = c or centre_id is null) limit 1;
  if course is null then raise exception 'Import a Primary 5 Mathematics lesson first.'; end if;
  select c2.level_id into v_level from public.courses c2 where c2.id = course;

  insert into public.households (id, centre_id, name) values (family, c, 'Sam test family');
  insert into public.students (id, centre_id, household_id, user_id, full_name, preferred_name, level_id, client_code)
    values (sam, c, family, v_user, 'Sam Test', 'Sam', v_level, 'TEST2');
  insert into public.centre_memberships (centre_id, user_id, role, status) values (c, v_user, 'student', 'active');

  insert into public.programmes (id, centre_id, name, kind) values (prog, c, 'P5 Mathematics E-learning (Sam)', 'e_learning');
  insert into public.programme_courses (centre_id, programme_id, course_id) values (c, prog, course);
  insert into public.programme_enrolments (centre_id, programme_id, student_id, valid_from, valid_until)
    values (c, prog, sam, (now() at time zone 'Asia/Singapore')::date, (now() at time zone 'Asia/Singapore')::date + 90);
  insert into public.student_courses (centre_id, student_id, course_id, is_current) values (c, sam, course, true);

  insert into public.guardians (id, centre_id, household_id, full_name) values (parent, c, family, 'Sam Test Parent');
  insert into public.guardian_students (centre_id, guardian_id, student_id, is_primary) values (c, parent, sam, true);
  insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
    values (c, sam, 'service', 'pilot-v1', 'online_form', parent, v_user, 'TEST-FORM-0002');

  raise notice 'Sam can sign in on the Student tab: username test.student, PIN 123456.';
end $$;
```
