-- S1 tests: e-learning access, consent gating of progress, offline consent recording,
-- and the student PIN lockout. Runs after 10_ and 20_ (reuses their seed and helpers).
--
-- Seed recap: Chloe (student A, user ...003) has an active programme covering course
-- c...001 (P6 Science), not c...002. Michelle (guardian A, ...002) is Chloe's and Ethan's
-- guardian. Grace Lee (...005) is Aaron's guardian. Jayden is a student in centre B.

-- Raises unless the statement fails with the expected SQLSTATE.
create function test.expect_error(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then
      raise notice 'ok - %', p_label;
      return;
    end if;
    raise exception 'FAIL: % (expected SQLSTATE %, got % %)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', p_label;
end;
$$;
grant execute on function test.expect_error(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed (as the migration owner)
-- ---------------------------------------------------------------------------
insert into public.courses (id, centre_id, subject_id, level_id, name) values
  ('c0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000000',
   '51000000-0000-0000-0000-000000000000', '1e000000-0000-0000-0000-000000000000', 'Centre B private course');

insert into public.course_lessons (id, centre_id, course_id, position, title, status) values
  ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 1, 'Heat energy', 'published'),
  ('d1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 2, 'Light (draft)', 'draft'),
  ('d1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 1, 'Extension lesson', 'published'),
  ('d1000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 1, 'Centre B heat lesson', 'published');

insert into public.lesson_parts (id, centre_id, lesson_id, position, kind, title, video_url, body_md, file_path) values
  ('d2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 1, 'video', 'How heat moves', 'https://www.youtube.com/watch?v=abc', null, null),
  ('d2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 2, 'reading', 'Conductors', null, '# Conductors', null),
  ('d2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 3, 'document', 'Notes PDF', null, null, 'centres/a0000000-0000-0000-0000-000000000000/lessons/heat.pdf'),
  ('d2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000002', 1, 'reading', 'Draft part', null, 'draft', null),
  ('d2000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000003', 1, 'reading', 'Extension part', null, 'ext', null),
  ('d2000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-0000000000b1', 1, 'reading', 'Centre B part', null, 'b', null);

-- ---------------------------------------------------------------------------
-- 1. Constraints hold even for privileged code
-- ---------------------------------------------------------------------------
select test.expect_error($q$insert into public.course_lessons (centre_id, course_id, position, title)
  values ('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-0000000000b1', 9, 'x')$q$,
  '23503', 'lesson: centre A cannot use centre B''s private course');
select test.expect_error($q$insert into public.lesson_parts (centre_id, lesson_id, position, kind, title, video_url)
  values ('a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 9, 'video', 'x', 'https://evil.example/v.mp4')$q$,
  '23514', 'part: video only from YouTube or Vimeo');
select test.expect_error($q$insert into public.lesson_parts (centre_id, lesson_id, position, kind, title, file_path)
  values ('a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 9, 'document', 'x', 'centres/b0000000-0000-0000-0000-000000000000/x.pdf')$q$,
  '23514', 'part: file must be under the centre''s own Storage prefix');
select test.expect_error($q$insert into public.lesson_parts (centre_id, lesson_id, position, kind, title, file_path)
  values ('a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 9, 'document', 'x', 'centres/a0000000-0000-0000-0000-000000000000/../b/x.pdf')$q$,
  '23514', 'part: no ".." in file paths');
select test.expect_error($q$insert into public.lesson_parts (centre_id, lesson_id, position, kind, title, video_url, body_md)
  values ('a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 9, 'video', 'x', 'https://youtu.be/x', 'extra')$q$,
  '23514', 'part: each kind carries only its own content');
select test.expect_error($q$insert into public.lesson_parts (centre_id, lesson_id, position, kind, title, body_md)
  values ('b0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 9, 'reading', 'x', 'y')$q$,
  '23503', 'part: cannot attach to another centre''s lesson');

-- ---------------------------------------------------------------------------
-- 2. Chloe reads only published lessons of courses she is entitled to, in her centre
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.course_lessons), 1, 'elearning: student A sees only the published lesson she is entitled to');
select test.expect((select count(*) from public.course_lessons where status = 'draft'), 0, 'elearning: student A sees no draft lessons');
select test.expect((select count(*) from public.course_lessons where course_id = 'c0000000-0000-0000-0000-000000000002'), 0, 'elearning: student A sees no lessons for a course outside her programmes');
select test.expect((select count(*) from public.course_lessons where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0, 'elearning: student A sees no centre B lessons for the same course');
select test.expect((select count(*) from public.lesson_parts), 3, 'elearning: student A sees the 3 parts of her lesson only');
select test.expect(test.rows_changed($q$update public.course_lessons set title = 'hacked'$q$), 0, 'elearning: student A cannot edit lessons');
commit;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    insert into public.course_lessons (centre_id, course_id, position, title)
    values ('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 7, 'mine');
  end $d$$q$, '42501', 'elearning: student A cannot create lessons');
reset role;

-- Guardians see what their children may learn; a guardian of another child does not.
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect((select count(*) from public.course_lessons), 1, 'elearning: Chloe''s guardian sees the lesson Chloe may learn');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000005');
set local role authenticated;
select test.expect((select count(*) from public.course_lessons), 0, 'elearning: Aaron''s guardian sees no lessons (Aaron has no programme)');
commit;

-- Staff see every lesson in their centre, drafts included; nothing from the other centre.
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;
select test.expect((select count(*) from public.course_lessons), 3, 'elearning: owner A sees all 3 centre A lessons');
select test.expect((select count(*) from public.lesson_parts where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0, 'elearning: owner A sees no centre B parts');
commit;

-- Jayden (centre B) has a programme with no courses: nothing to learn, nothing from A.
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.course_lessons), 0, 'elearning: student B sees no lessons without an entitled course');
commit;

-- ---------------------------------------------------------------------------
-- 3. Progress needs consent on record
-- ---------------------------------------------------------------------------
select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    insert into public.lesson_progress (centre_id, student_id, lesson_part_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000001');
  end $d$$q$, '42501', 'consent: no progress is saved before service consent is recorded');
reset role;

-- Staff record consent from the centre's online form.
select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000001');
    set local role authenticated;
    insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000009', 'service', 'v1', 'online_form',
            'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'form-123');
  end $d$$q$, '42501', 'consent: staff cannot record Michelle''s consent for a child who is not hers');
reset role;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000001');
    set local role authenticated;
    insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'service', 'v1', 'online_form',
            'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'form-123');
  end $d$$q$, '42501', 'consent: staff must record consent in their own name');
reset role;

select test.expect_error($q$
  insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by)
  values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'service', 'v1', 'online_form',
          'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001')$q$,
  '23514', 'consent: offline consent must carry an evidence reference');

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000004');
    set local role authenticated;
    insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'service', 'v1', 'online_form',
            'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'form-123');
  end $d$$q$, '42501', 'consent: a teacher (not front-desk staff) cannot record consent');
reset role;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_user_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'service', 'v1', 'portal',
            'aaaaaaaa-0000-0000-0000-000000000003');
  end $d$$q$, '42501', 'consent: a student cannot consent for herself');
reset role;

do $$
begin
  perform test.login('aaaaaaaa-0000-0000-0000-000000000001');
  set local role authenticated;
  insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
  values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'service', 'v1', 'online_form',
          'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'form-response-42');
  raise notice 'ok - consent: owner A records Michelle''s online-form consent for Chloe';
  reset role;
end;
$$;

-- With consent, Chloe saves progress on her own lesson, and only there.
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect(test.rows_changed($q$insert into public.lesson_progress (centre_id, student_id, lesson_part_id)
  values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000001')$q$),
  1, 'progress: student A starts a part once consent is on record');
select test.expect(test.rows_changed($q$update public.lesson_progress set status = 'completed', completed_at = now(), seconds_spent = 360
  where lesson_part_id = 'd2000000-0000-0000-0000-000000000001'$q$),
  1, 'progress: student A completes the part');
commit;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    delete from public.lesson_progress;
  end $d$$q$, '42501', 'progress: student A cannot delete progress');
reset role;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    update public.lesson_progress set student_id = 'a4000000-0000-0000-0000-000000000001';
  end $d$$q$, '42501', 'progress: student A cannot move progress to another student');
reset role;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    insert into public.lesson_progress (centre_id, student_id, lesson_part_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000005');
  end $d$$q$, '42501', 'progress: not on a course outside her programmes');
reset role;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    insert into public.lesson_progress (centre_id, student_id, lesson_part_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000004');
  end $d$$q$, '42501', 'progress: not on a draft lesson');
reset role;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    insert into public.lesson_progress (centre_id, student_id, lesson_part_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001');
  end $d$$q$, '42501', 'progress: not on behalf of her brother');
reset role;

select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000002');
    set local role authenticated;
    insert into public.lesson_progress (centre_id, student_id, lesson_part_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000002');
  end $d$$q$, '42501', 'progress: a guardian cannot record progress for her child');
reset role;

-- Who can read progress.
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect((select count(*) from public.lesson_progress), 1, 'progress: Chloe''s guardian sees her progress');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000005');
set local role authenticated;
select test.expect((select count(*) from public.lesson_progress), 0, 'progress: another guardian sees none');
commit;
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set local role authenticated;
select test.expect((select count(*) from public.lesson_progress), 0, 'progress: owner B sees none of centre A''s progress');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set local role authenticated;
select test.expect((select count(*) from public.lesson_progress), 0, 'progress: teacher A sees none until assigned sessions exist');
commit;

-- Withdrawing consent stops further progress (existing rows stay for the record).
do $$
begin
  perform test.login('aaaaaaaa-0000-0000-0000-000000000001');
  set local role authenticated;
  update public.consents set withdrawn_at = now()
   where student_id = 'a4000000-0000-0000-0000-000000000000' and purpose = 'service';
  raise notice 'ok - consent: owner A records a withdrawal';
  reset role;
end;
$$;
select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    insert into public.lesson_progress (centre_id, student_id, lesson_part_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000002');
  end $d$$q$, '42501', 'consent: no new progress after consent is withdrawn');
reset role;

-- Access ends with the programme.
update public.programme_enrolments set valid_until = current_date - 2, valid_from = current_date - 30
 where student_id = 'a4000000-0000-0000-0000-000000000000';
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.course_lessons), 0, 'elearning: lessons disappear when the programme has expired');
select test.expect((select count(*) from public.lesson_parts), 0, 'elearning: parts disappear when the programme has expired');
commit;

-- ---------------------------------------------------------------------------
-- 4. Student PIN lockout
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'chloe.t@students.aspireportal.invalid'),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'ethan.t@students.aspireportal.invalid');

begin;
set local role anon;
select test.expect((select count(*) from (select public.record_pin_failure('chloe.t') from generate_series(1, 4)) x), 4, 'pin: four wrong PINs recorded');
select test.expect((select public.pin_login_locked('chloe.t'))::int, 0, 'pin: not locked after four failures');
select public.record_pin_failure('CHLOE.T');
select test.expect((select public.pin_login_locked('chloe.t'))::int, 1, 'pin: locked after the fifth failure (case-insensitive)');
select test.expect((select public.pin_login_locked('ethan.t'))::int, 0, 'pin: other usernames unaffected');
select public.record_pin_failure('nobody.here');
select public.record_pin_failure('x'' or 1=1 --');
commit;

select test.expect((select count(*) from app.pin_attempts where username in ('nobody.here', 'x'' or 1=1 --')), 0, 'pin: unknown or malformed usernames are not stored');

select test.expect_error($q$
  do $d$ begin set local role anon; perform count(*) from app.pin_attempts; end $d$$q$,
  '42501', 'pin: the API cannot read the attempt counters');
reset role;
select test.expect_error($q$
  do $d$ begin set local role anon; perform app.record_pin_failure('chloe.t'); end $d$$q$,
  '42501', 'pin: the API cannot call the private functions directly');
reset role;
select test.expect_error($q$
  do $d$ begin set local role anon; perform public.clear_pin_failures(); end $d$$q$,
  '42501', 'pin: signed-out visitors cannot clear counters');
reset role;

-- Ethan, signed in, cannot unlock Chloe.
begin;
select test.login('aaaaaaaa-0000-0000-0000-0000000000f2');
set local role authenticated;
select public.clear_pin_failures();
select test.expect((select public.pin_login_locked('chloe.t'))::int, 1, 'pin: another student cannot unlock Chloe');
commit;

-- Chloe's counter clears only after she has signed in.
begin;
select test.login('aaaaaaaa-0000-0000-0000-0000000000f1');
set local role authenticated;
select public.clear_pin_failures();
select test.expect((select public.pin_login_locked('chloe.t'))::int, 0, 'pin: a successful sign-in clears the lock');
commit;

-- Failures older than 15 minutes don't count towards a lock.
select public.record_pin_failure('ethan.t') from generate_series(1, 4);
update app.pin_attempts set window_started_at = now() - interval '16 minutes' where username = 'ethan.t';
select public.record_pin_failure('ethan.t');
select test.expect((select failed_count from app.pin_attempts where username = 'ethan.t'), 1, 'pin: the count restarts after 15 quiet minutes');
select test.expect((select public.pin_login_locked('ethan.t'))::int, 0, 'pin: so no lock');

-- Every new table still has forced RLS (re-checked after these migrations).
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (not c.relrowsecurity or not c.relforcerowsecurity
           or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname))
  loop
    raise exception 'FAIL: table public.% must have RLS enabled, forced and at least one policy', r.relname;
  end loop;
  raise notice 'ok - every public table still has forced RLS and policies';
end;
$$;

select 'ALL S1 TESTS PASSED' as result;
