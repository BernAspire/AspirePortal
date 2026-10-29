-- Tenant-isolation and role tests. Run by scripts/test-db-local.sh after the shim and
-- all migrations. Any failed expectation raises an exception and stops the run.

create schema test;
grant usage on schema test to anon, authenticated;

create function test.expect(actual bigint, expected bigint, label text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % (expected %, got %)', label, expected, actual;
  end if;
  raise notice 'ok - %', label;
end;
$$;
grant execute on function test.expect(bigint, bigint, text) to anon, authenticated;

create function test.login(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function test.login(uuid) to anon, authenticated;

-- Runs a write statement as the current role and returns how many rows it changed.
create function test.rows_changed(p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function test.rows_changed(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Every table in public has RLS enabled AND forced, and at least one policy.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname, c.relrowsecurity, c.relforcerowsecurity,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    if not r.relrowsecurity or not r.relforcerowsecurity or r.policies = 0 then
      raise exception 'FAIL: table public.% must have RLS enabled, forced and at least one policy', r.relname;
    end if;
  end loop;
  raise notice 'ok - every public table has forced RLS and policies';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Seed two centres with users in every relevant role (as the migration owner).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner.a@example.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'guardian.a@example.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'student.a@example.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'teacher.a@example.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'guardian2.a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'owner.b@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'student.b@example.test'),
  ('cccccccc-0000-0000-0000-000000000001', 'platform@example.test');

insert into public.platform_admins (user_id) values ('cccccccc-0000-0000-0000-000000000001');

insert into public.centres (id, slug, name) values
  ('a0000000-0000-0000-0000-000000000000', 'centre-a', 'Centre A'),
  ('b0000000-0000-0000-0000-000000000000', 'centre-b', 'Centre B');

insert into public.branches (id, centre_id, name) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'A Main'),
  ('b1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'B Main');

insert into public.centre_memberships (centre_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner', 'active'),
  ('a0000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'guardian', 'active'),
  ('a0000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'student', 'active'),
  ('a0000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'guardian', 'active'),
  ('b0000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner', 'active'),
  ('b0000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000003', 'student', 'active');

insert into public.subjects (id, code, name) values ('51000000-0000-0000-0000-000000000000', 'SCI', 'Science');
insert into public.levels (id, code, name, stage) values ('1e000000-0000-0000-0000-000000000000', 'P6', 'Primary 6', 'primary');
insert into public.courses (id, subject_id, level_id, name) values
  ('c0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000000', '1e000000-0000-0000-0000-000000000000', 'Primary 6 Science'),
  ('c0000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000000', '1e000000-0000-0000-0000-000000000000', 'Primary 6 Science Extension');

insert into public.households (id, centre_id, name) values
  ('a2000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'Tan family'),
  ('a2000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000000', 'Lee family'),
  ('b2000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'Wong family');

insert into public.guardians (id, centre_id, household_id, user_id, full_name) values
  ('a3000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Michelle Tan'),
  ('a3000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000005', 'Grace Lee');

insert into public.students (id, centre_id, household_id, user_id, full_name, client_code, default_branch_id) values
  ('a4000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'Chloe Tan', '820F', 'a1000000-0000-0000-0000-000000000000'),
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', null, 'Ethan Tan', '821G', null),
  ('a4000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000009', null, 'Aaron Lee', '900A', null),
  ('b4000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000003', 'Jayden Wong', '820F', null);

insert into public.guardian_students (centre_id, guardian_id, student_id, is_primary) values
  ('a0000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', true),
  ('a0000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000009', 'a4000000-0000-0000-0000-000000000009', true);

insert into public.programmes (id, centre_id, name, kind) values
  ('a5000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'E-Learning Science', 'e_learning'),
  ('b5000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'B E-Learning', 'e_learning');
insert into public.programme_courses (centre_id, programme_id, course_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001');
insert into public.programme_enrolments (centre_id, programme_id, student_id, valid_from, valid_until) values
  ('a0000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', current_date - 30, current_date + 60);
insert into public.student_courses (centre_id, student_id, course_id, is_current) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', true),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', false);

-- ---------------------------------------------------------------------------
-- 3. Composite foreign keys stop cross-centre links even for privileged code.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.guardian_students (centre_id, guardian_id, student_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000000');
    raise exception 'FAIL: linked a Centre A guardian to a Centre B student';
  exception when foreign_key_violation then
    raise notice 'ok - composite FK blocks cross-centre guardian link';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Anonymous visitors see nothing.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select test.expect((select count(*) from public.centres), 0, 'anon sees no centres');
select test.expect((select count(*) from public.students), 0, 'anon sees no students');
commit;

-- ---------------------------------------------------------------------------
-- 5. Centre A owner: everything in A, nothing in B.
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;
select test.expect((select count(*) from public.centres), 1, 'owner A sees only centre A');
select test.expect((select count(*) from public.students), 3, 'owner A sees the 3 students in A');
select test.expect((select count(*) from public.students where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0, 'owner A sees no B students');
select test.expect((select count(*) from public.programmes), 1, 'owner A sees only A programmes');
select test.expect((select (count(*) > 0)::int from public.audit_log where centre_id = 'a0000000-0000-0000-0000-000000000000'), 1, 'owner A can read A audit log');
select test.expect((select count(*) from public.audit_log where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0, 'owner A cannot read B audit log');
select test.expect(test.rows_changed($q$update public.students set school = 'X' where centre_id = 'b0000000-0000-0000-0000-000000000000'$q$), 0, 'owner A cannot update B students');
commit;

do $$
begin
  perform test.login('aaaaaaaa-0000-0000-0000-000000000001');
  set local role authenticated;
  begin
    insert into public.students (centre_id, household_id, full_name, client_code)
    values ('b0000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000000', 'Intruder', 'ZZZ1');
    raise exception 'FAIL: owner A inserted a student into centre B';
  exception when insufficient_privilege then
    raise notice 'ok - owner A cannot insert into centre B';
  end;
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Guardian A: own household and children only.
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect((select count(*) from public.students), 2, 'guardian A sees only her 2 children');
select test.expect((select count(*) from public.households), 1, 'guardian A sees only her household');
select test.expect((select count(*) from public.guardians), 1, 'guardian A sees only her own guardian record');
select test.expect((select count(*) from public.audit_log), 0, 'guardian A cannot read the audit log');
select test.expect(test.rows_changed($q$update public.students set school = 'X'$q$), 0, 'guardian A cannot edit student records');
select test.expect((select count(*) from public.programme_enrolments), 1, 'guardian A sees her child''s enrolment');
commit;

-- ---------------------------------------------------------------------------
-- 7. Another guardian in the same centre cannot see the Tan children.
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000005');
set local role authenticated;
select test.expect((select count(*) from public.students), 1, 'guardian Lee sees only Aaron');
select test.expect((select count(*) from public.students where full_name like '%Tan'), 0, 'guardian Lee cannot see Tan children');
commit;

-- ---------------------------------------------------------------------------
-- 8. Student A: only herself; can switch to a course she is entitled to, not to another.
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.students), 1, 'student A sees only herself');
select test.expect((select count(*) from public.guardians), 0, 'student A sees no guardian records');
select test.expect((select count(*) from public.student_courses), 2, 'student A sees her course list');
select test.expect((select app.has_course_access('a4000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001'))::int, 1, 'student A has access to P6 Science');
select test.expect((select app.has_course_access('a4000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002'))::int, 0, 'student A has no access to the extension course');
commit;

do $$
begin
  perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
  set local role authenticated;
  begin
    update public.student_courses set is_current = true where course_id = 'c0000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: student switched to a course without an active programme';
  exception when insufficient_privilege then
    raise notice 'ok - student cannot switch to a course she is not enrolled in';
  end;
  begin
    update public.student_courses set course_id = 'c0000000-0000-0000-0000-000000000002' where is_current;
    raise exception 'FAIL: student changed a column other than is_current';
  exception when insufficient_privilege then
    raise notice 'ok - student can only change is_current';
  end;
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Teacher A has no access to student records yet (granted per session in a later phase).
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set local role authenticated;
select test.expect((select count(*) from public.students), 0, 'teacher A sees no students until assigned sessions exist');
select test.expect((select count(*) from public.centres), 1, 'teacher A sees centre A');
commit;

-- ---------------------------------------------------------------------------
-- 10. Centre B student sees only Centre B data, even with the same client code as Chloe.
-- ---------------------------------------------------------------------------
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.students), 1, 'student B sees only himself');
select test.expect((select count(*) from public.students where centre_id = 'a0000000-0000-0000-0000-000000000000'), 0, 'student B sees nothing in centre A');
select test.expect((select count(*) from public.centres), 1, 'student B sees only centre B');
commit;

-- ---------------------------------------------------------------------------
-- 11. Suspending a centre cuts off its members.
-- ---------------------------------------------------------------------------
update public.centres set status = 'suspended' where id = 'b0000000-0000-0000-0000-000000000000';
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set local role authenticated;
select test.expect((select count(*) from public.students), 0, 'owner of a suspended centre sees no students');
commit;
update public.centres set status = 'active' where id = 'b0000000-0000-0000-0000-000000000000';

-- ---------------------------------------------------------------------------
-- 12. Consent: guardian records consent for her own child only.
-- ---------------------------------------------------------------------------
do $$
begin
  perform test.login('aaaaaaaa-0000-0000-0000-000000000002');
  set local role authenticated;
  insert into public.consents (centre_id, student_id, purpose, policy_version, given_by_user_id)
  values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'ai_tutor', 'v1', 'aaaaaaaa-0000-0000-0000-000000000002');
  raise notice 'ok - guardian A records AI tutor consent for her child';
  begin
    insert into public.consents (centre_id, student_id, purpose, policy_version, given_by_user_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000009', 'ai_tutor', 'v1', 'aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'FAIL: guardian A gave consent for another family''s child';
  exception when insufficient_privilege then
    raise notice 'ok - guardian A cannot give consent for another child';
  end;
  reset role;
end;
$$;

select 'ALL TENANT ISOLATION TESTS PASSED' as result;
