-- Student portal reads. Runs after 10_tenant_isolation.sql (reuses its seed and test
-- helpers). Each query mirrors one the app makes for sign-in routing and the student
-- home page, run as the signed-in user so RLS applies.

-- Extra seed (as the migration owner): an enrolment for Chloe's brother Ethan, and one
-- for Jayden in Centre B, so "can't see other students' enrolments" is a real check.
insert into public.programme_enrolments (centre_id, programme_id, student_id, valid_from, valid_until) values
  ('a0000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', current_date - 1, current_date + 1),
  ('b0000000-0000-0000-0000-000000000000', 'b5000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000000', current_date - 1, current_date + 1);
-- An expired enrolment for Chloe in the same programme: must not count as access.
insert into public.programme_enrolments (centre_id, programme_id, student_id, valid_from, valid_until) values
  ('a0000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', current_date - 400, current_date - 35);

create function test.sg_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Singapore')::date $$;
grant execute on function test.sg_today() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Student A (Chloe): everything the home page needs, and nothing more.
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;

-- getMyMemberships
select test.expect((select count(*) from public.centre_memberships
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000003' and status = 'active' and role = 'student'), 1,
  'portal: student A reads her own student membership');
select test.expect((select count(*) from public.centre_memberships), 1,
  'portal: student A sees no other memberships');
select test.expect((select count(*) from public.centres
  where id in ('a0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000')), 1,
  'portal: student A reads centre A, not centre B, even when asking for both');

-- getMyStudent
select test.expect((select count(*) from public.students
  where centre_id = 'a0000000-0000-0000-0000-000000000000'
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000003' and deleted_at is null), 1,
  'portal: student A reads her own student record');

-- getActiveEntitlements
select test.expect((select count(*) from public.programme_enrolments
  where centre_id = 'a0000000-0000-0000-0000-000000000000'
    and student_id = 'a4000000-0000-0000-0000-000000000000'
    and valid_from <= test.sg_today() and valid_until >= test.sg_today()), 1,
  'portal: student A reads only her enrolment valid today (expired one excluded)');
select test.expect((select count(*) from public.programme_enrolments
  where student_id = 'a4000000-0000-0000-0000-000000000001'), 0,
  'portal: student A cannot read her brother''s enrolment');
select test.expect((select count(*) from public.programme_enrolments
  where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0,
  'portal: student A cannot read centre B enrolments');
select test.expect((select count(*) from public.programmes
  where centre_id = 'a0000000-0000-0000-0000-000000000000'
    and id in ('a5000000-0000-0000-0000-000000000000')), 1,
  'portal: student A reads her programme');
select test.expect((select count(*) from public.programmes
  where id = 'b5000000-0000-0000-0000-000000000000'), 0,
  'portal: student A cannot read a centre B programme by id');
select test.expect((select count(*) from public.programme_courses
  where centre_id = 'a0000000-0000-0000-0000-000000000000'
    and programme_id in ('a5000000-0000-0000-0000-000000000000')), 1,
  'portal: student A reads the courses in her programme');

-- getCourses, getLevelName, getStudentCourses
select test.expect((select count(*) from public.courses
  where id in ('c0000000-0000-0000-0000-000000000001')), 1,
  'portal: student A reads course names');
select test.expect((select count(*) from public.levels
  where id = '1e000000-0000-0000-0000-000000000000'), 1,
  'portal: student A reads level names');
select test.expect((select count(*) from public.student_courses
  where centre_id = 'a0000000-0000-0000-0000-000000000000'
    and student_id = 'a4000000-0000-0000-0000-000000000000'), 2,
  'portal: student A reads her course placements');
commit;

-- ---------------------------------------------------------------------------
-- 2. A guardian has no student record of her own, so the portal shows no-access.
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect((select count(*) from public.centre_memberships
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000002' and status = 'active' and role = 'student'), 0,
  'portal: guardian A has no student membership');
select test.expect((select count(*) from public.students
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0,
  'portal: guardian A has no student record linked to her login');
commit;

-- ---------------------------------------------------------------------------
-- 3. Student B (Jayden) asking for Centre A rows by id gets nothing.
-- ---------------------------------------------------------------------------
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.students
  where centre_id = 'a0000000-0000-0000-0000-000000000000'
    and user_id = 'bbbbbbbb-0000-0000-0000-000000000003'), 0,
  'portal: student B finds no student record in centre A');
select test.expect((select count(*) from public.programmes
  where centre_id = 'a0000000-0000-0000-0000-000000000000'), 0,
  'portal: student B reads no centre A programmes');
select test.expect((select count(*) from public.programme_enrolments
  where centre_id = 'b0000000-0000-0000-0000-000000000000'
    and valid_from <= test.sg_today() and valid_until >= test.sg_today()), 1,
  'portal: student B reads his own enrolment in centre B');
commit;

-- ---------------------------------------------------------------------------
-- 4. A suspended student membership loses access.
-- ---------------------------------------------------------------------------
update public.centre_memberships set status = 'suspended'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000003';
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.centre_memberships
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000003' and status = 'active'), 0,
  'portal: suspended student has no active membership');
select test.expect((select count(*) from public.students), 0,
  'portal: suspended student can no longer read her record');
select test.expect((select count(*) from public.programme_enrolments), 0,
  'portal: suspended student can no longer read enrolments');
commit;
update public.centre_memberships set status = 'active'
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000003';

select 'ALL STUDENT PORTAL READ TESTS PASSED' as result;
