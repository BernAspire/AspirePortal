-- Scheduling: timetable upload, clash constraints, rosters, bookings, attendance, the
-- live-tutorial join link and who can see what. Runs after 40_ (Chloe has an active
-- Primary 6 Science programme and service consent).

-- Day of the week of tomorrow, so the weekly classes have a session tomorrow and none today.
create function test.dow() returns int language sql as $$ select extract(isodow from current_date + 1)::int $$;

create function test.timetable() returns jsonb language sql as $$
  select jsonb_build_object(
    'classes', jsonb_build_array(
      jsonb_build_object('code', 'P6SCI-SAT', 'course_id', 'c0000000-0000-0000-0000-000000000001', 'kind', 'physical_tutorial',
        'branch', 'a main', 'room', 'Room 1', 'teacher', 'Ms Lim', 'weekday', test.dow(), 'start_time', '10:00',
        'duration', 120, 'first_date', current_date - 14, 'last_date', current_date + 30, 'capacity', 2),
      jsonb_build_object('code', 'P6SCI-LIVE', 'course_id', 'c0000000-0000-0000-0000-000000000001', 'kind', 'live_tutorial',
        'teacher', 'Mr Ong', 'weekday', test.dow(), 'start_time', '19:00', 'duration', 60,
        'first_date', current_date - 14, 'last_date', current_date + 30, 'meeting_url', 'https://zoom.us/j/111')),
    'roster', jsonb_build_array(
      jsonb_build_object('class', 'P6SCI-SAT', 'client_code', '820f'),
      jsonb_build_object('class', 'P6SCI-SAT', 'client_code', '821G'),
      jsonb_build_object('class', 'P6SCI-LIVE', 'client_code', '820F')),
    'one_offs', jsonb_build_array(
      jsonb_build_object('code', 'COACH-1', 'course_id', 'c0000000-0000-0000-0000-000000000001', 'kind', 'academic_coaching',
        'branch', 'A Main', 'room', 'Room 2', 'teacher', 'Mr Tan', 'date', current_date + 3, 'start_time', '15:00',
        'duration', 60, 'students', jsonb_build_array('820F')),
      jsonb_build_object('code', 'COACH-PAST', 'course_id', 'c0000000-0000-0000-0000-000000000001', 'kind', 'academic_coaching',
        'branch', 'A Main', 'teacher', 'Mr Tan', 'date', current_date - 2, 'start_time', '15:00',
        'duration', 60, 'students', jsonb_build_array('820F'))),
    'cancellations', jsonb_build_array(
      jsonb_build_object('class', 'P6SCI-SAT', 'date', current_date + 8, 'reason', 'Public holiday')),
    'attendance', jsonb_build_array(
      jsonb_build_object('session', 'COACH-PAST', 'date', current_date - 2, 'client_code', '820F', 'status', 'late', 'note', '10 min late'))
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Upload
-- ---------------------------------------------------------------------------
select test.expect((public.apply_timetable('a0000000-0000-0000-0000-000000000000', test.timetable()) ->> 'classes')::bigint, 2,
  'upload: two classes created');
select test.expect((select count(*) from public.class_sessions s join public.classes c on c.id = s.class_id where c.code = 'P6SCI-SAT'), 5,
  'upload: weekly class has one session per week from tomorrow to the last date (past weeks not created)');
select test.expect((select count(*) from public.class_sessions s join public.classes c on c.id = s.class_id
  where c.code = 'P6SCI-SAT' and (s.starts_at at time zone 'Asia/Singapore')::time = '10:00'), 5,
  'upload: session times are Singapore local time');
select test.expect((select count(*) from public.rooms where centre_id = 'a0000000-0000-0000-0000-000000000000'), 2,
  'upload: rooms are created on first use');
select test.expect((select count(*) from public.bookings b join public.class_sessions s on s.id = b.session_id
  join public.classes c on c.id = s.class_id where c.code = 'P6SCI-SAT'), 10,
  'upload: both rostered students are booked into every upcoming session');
select test.expect((select count(*) from public.class_sessions where status = 'cancelled' and cancel_reason = 'Public holiday'), 1,
  'upload: cancellation applied');
select test.expect((select count(*) from public.attendance_records a join public.bookings b on b.id = a.booking_id
  join public.class_sessions s on s.id = b.session_id where s.code = 'COACH-PAST' and a.status = 'late'), 1,
  'upload: attendance recorded for a past session');
select test.expect((select count(*) from public.audit_log where entity = 'attendance_records'), 1,
  'upload: attendance is audit-logged');

-- Re-uploading the same file changes nothing; moving the class time replaces upcoming sessions.
select public.apply_timetable('a0000000-0000-0000-0000-000000000000', test.timetable());
select test.expect((select count(*) from public.class_sessions where centre_id = 'a0000000-0000-0000-0000-000000000000'), 12,
  'upload: re-uploading is idempotent (5 + 5 weekly, 2 one-offs)');
select public.apply_timetable('a0000000-0000-0000-0000-000000000000',
  jsonb_set(test.timetable() - 'cancellations', '{classes,0,start_time}', '"09:00"'));
select test.expect((select count(*) from public.class_sessions s join public.classes c on c.id = s.class_id
  where c.code = 'P6SCI-SAT' and (s.starts_at at time zone 'Asia/Singapore')::time = '09:00'), 5,
  'upload: changing the time replaces upcoming sessions');
select test.expect((select count(*) from public.class_sessions where status = 'cancelled'), 0,
  'upload: a cancellation removed from the sheet is lifted');
select test.expect((select count(*) from public.bookings b join public.class_sessions s on s.id = b.session_id
  join public.classes c on c.id = s.class_id where c.code = 'P6SCI-SAT'), 10,
  'upload: bookings follow the new sessions');
select public.apply_timetable('a0000000-0000-0000-0000-000000000000', test.timetable());

-- Removing a student from the roster removes their upcoming bookings only.
select public.apply_timetable('a0000000-0000-0000-0000-000000000000', jsonb_build_object('roster', jsonb_build_array(
  jsonb_build_object('class', 'P6SCI-SAT', 'client_code', '820F'))));
select test.expect((select count(*) from public.bookings where student_id = 'a4000000-0000-0000-0000-000000000001'), 0,
  'roster: a student taken off the roster loses upcoming bookings');
select public.apply_timetable('a0000000-0000-0000-0000-000000000000', test.timetable());

-- Centre B uses the same teacher name and time: no clash across centres.
select public.apply_timetable('b0000000-0000-0000-0000-000000000000', jsonb_build_object(
  'classes', jsonb_build_array(jsonb_build_object('code', 'B-SCI', 'course_id', 'c0000000-0000-0000-0000-000000000001',
    'kind', 'physical_tutorial', 'branch', 'B Main', 'room', 'Room 1', 'teacher', 'Ms Lim', 'weekday', test.dow(),
    'start_time', '10:00', 'duration', 120, 'first_date', current_date, 'last_date', current_date + 30)),
  'roster', jsonb_build_array(jsonb_build_object('class', 'B-SCI', 'client_code', '820F'))));
select test.expect((select count(*) from public.bookings where student_id = 'b4000000-0000-0000-0000-000000000000'), 5,
  'upload: centre B client code 820F is centre B''s student, not Chloe');

-- ---------------------------------------------------------------------------
-- 2. Rejected uploads (whole upload rolls back)
-- ---------------------------------------------------------------------------
select test.expect_error($q$select public.apply_timetable('a0000000-0000-0000-0000-000000000000', jsonb_build_object('one_offs', jsonb_build_array(
  jsonb_build_object('code', 'CLASH-ROOM', 'course_id', 'c0000000-0000-0000-0000-000000000001', 'kind', 'academic_coaching',
    'branch', 'A Main', 'room', 'room 1', 'teacher', 'Mr Wee', 'date', current_date + 1, 'start_time', '11:00', 'duration', 60))))$q$,
  'P0001', 'clash: the same room cannot hold two sessions at once');
select test.expect_error($q$select public.apply_timetable('a0000000-0000-0000-0000-000000000000', jsonb_build_object('one_offs', jsonb_build_array(
  jsonb_build_object('code', 'CLASH-TEACHER', 'course_id', 'c0000000-0000-0000-0000-000000000001', 'kind', 'live_tutorial',
    'teacher', 'MS LIM', 'date', current_date + 1, 'start_time', '10:30', 'duration', 30))))$q$,
  'P0001', 'clash: the same teacher cannot teach two sessions at once');
select test.expect_error($q$insert into public.class_sessions (centre_id, code, course_id, kind, branch_id, room_id, teacher_name, starts_at, ends_at)
  select 'a0000000-0000-0000-0000-000000000000', 'RAW', 'c0000000-0000-0000-0000-000000000001', 'physical_tutorial',
         s.branch_id, s.room_id, 'Someone', s.starts_at + interval '30 minutes', s.ends_at
  from public.class_sessions s join public.classes c on c.id = s.class_id where c.code = 'P6SCI-SAT' limit 1$q$,
  '23P01', 'clash: the database constraint holds even outside the upload function');
select test.expect_error($q$select public.apply_timetable('a0000000-0000-0000-0000-000000000000', jsonb_build_object('roster', jsonb_build_array(
  jsonb_build_object('class', 'P6SCI-SAT', 'client_code', '820F'), jsonb_build_object('class', 'P6SCI-SAT', 'client_code', '821G'),
  jsonb_build_object('class', 'P6SCI-SAT', 'client_code', '900A'))))$q$,
  'P0001', 'capacity: a class cannot be booked beyond its seats');
select test.expect((select count(*) from public.class_enrolments e join public.classes c on c.id = e.class_id where c.code = 'P6SCI-SAT'), 2,
  'capacity: the rejected upload changed nothing');
select test.expect_error($q$select public.apply_timetable('a0000000-0000-0000-0000-000000000000', jsonb_set(test.timetable(), '{classes,0,branch}', '"Nowhere"'))$q$,
  'P0001', 'upload: unknown branch is rejected');
select test.expect_error($q$select public.apply_timetable('a0000000-0000-0000-0000-000000000000', jsonb_build_object('roster', jsonb_build_array(
  jsonb_build_object('class', 'P6SCI-SAT', 'client_code', 'ZZZ9'))))$q$,
  'P0001', 'upload: unknown client code is rejected');
select test.expect_error($q$select public.apply_timetable('a0000000-0000-0000-0000-000000000000', jsonb_build_object('attendance', jsonb_build_array(
  jsonb_build_object('session', 'COACH-1', 'date', current_date + 3, 'client_code', '820F', 'status', 'present'))))$q$,
  'P0001', 'attendance: cannot be taken before the session starts');
select test.expect_error($q$insert into public.bookings (centre_id, session_id, student_id)
  select 'a0000000-0000-0000-0000-000000000000', s.id, 'b4000000-0000-0000-0000-000000000000'
  from public.class_sessions s where s.code = 'COACH-1'$q$,
  '23503', 'bookings: composite FK blocks booking a centre B student into a centre A session');

-- ---------------------------------------------------------------------------
-- 3. Who sees what
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');  -- Chloe, student A
set local role authenticated;
select test.expect((select count(*) from public.class_sessions), 12, 'student A sees her 12 booked sessions');
select test.expect((select count(*) from public.class_sessions where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0,
  'student A sees no centre B sessions');
select test.expect((select count(*) from public.classes), 2, 'student A sees her two classes');
select test.expect((select count(*) from public.bookings where student_id <> 'a4000000-0000-0000-0000-000000000000'), 0,
  'student A sees no one else''s bookings');
select test.expect((select count(*) from public.attendance_records), 1, 'student A sees her attendance');
select test.expect((select count(*) from public.rooms), 2, 'student A sees her centre''s rooms');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$select meeting_url from public.class_sessions limit 1$q$, '42501', 'meeting links are not readable as a column');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$select public.apply_timetable('a0000000-0000-0000-0000-000000000000', '{}')$q$, '42501',
  'students cannot run the timetable upload');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect(test.rows_changed($q$update public.class_sessions set status = 'cancelled'$q$), 0, 'students cannot change sessions');
select test.expect(test.rows_changed($q$delete from public.bookings$q$), 0, 'students cannot delete bookings');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$insert into public.bookings (centre_id, session_id, student_id)
  select 'a0000000-0000-0000-0000-000000000000', s.id, 'a4000000-0000-0000-0000-000000000000' from public.class_sessions s
  where s.code = 'COACH-PAST'$q$, '42501', 'students cannot book themselves');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- Michelle, guardian of Chloe and Ethan
set local role authenticated;
select test.expect((select count(*) from public.bookings), 17, 'guardian sees both children''s bookings (12 + 5)');
select test.expect((select count(*) from public.class_sessions), 12, 'guardian sees the sessions of both children');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000005');  -- Grace, guardian of Aaron (no classes)
set local role authenticated;
select test.expect((select count(*) from public.class_sessions), 0, 'another family sees no sessions');
select test.expect((select count(*) from public.classes), 0, 'another family sees no classes');
select test.expect((select count(*) from public.attendance_records), 0, 'another family sees no attendance');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000004');  -- teacher: access via sessions comes later
set local role authenticated;
select test.expect((select count(*) from public.class_sessions), 0, 'teachers see no sessions yet');
commit;

begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');  -- Jayden, centre B
set local role authenticated;
select test.expect((select count(*) from public.class_sessions), 5, 'student B sees only centre B sessions');
select test.expect((select count(*) from public.attendance_records), 0, 'student B sees no centre A attendance');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');  -- owner A
set local role authenticated;
select test.expect((select count(*) from public.class_sessions), 12, 'staff A see every centre A session');
select test.expect((select count(*) from public.class_sessions where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0,
  'staff A see no centre B sessions');
commit;

-- ---------------------------------------------------------------------------
-- 4. Live-tutorial join link
-- ---------------------------------------------------------------------------
select public.apply_timetable('a0000000-0000-0000-0000-000000000000', jsonb_build_object('one_offs', jsonb_build_array(
  jsonb_build_object('code', 'LIVE-NOW', 'course_id', 'c0000000-0000-0000-0000-000000000001', 'kind', 'live_tutorial',
    'teacher', 'Mr Ong', 'date', ((now() - interval '5 minutes') at time zone 'Asia/Singapore')::date,
    'start_time', to_char((now() - interval '5 minutes') at time zone 'Asia/Singapore', 'HH24:MI'), 'duration', 60,
    'meeting_url', 'https://zoom.us/j/222', 'students', jsonb_build_array('820F')))));

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.class_sessions s where s.code = 'LIVE-NOW'
  and public.session_join_url(s.id) = 'https://zoom.us/j/222'), 1, 'join: a booked, entitled student gets the link during the session');
select test.expect((select count(*) from public.class_sessions s join public.classes c on c.id = s.class_id
  where c.code = 'P6SCI-LIVE' and public.session_join_url(s.id) is not null), 0, 'join: no link for sessions that have not opened yet');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect((select count(*) from public.class_sessions s where s.code = 'LIVE-NOW' and public.session_join_url(s.id) is not null), 1,
  'join: the guardian can open the link for their child');
commit;

begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from (select public.session_join_url(s.id) u from public.class_sessions s where s.code = 'LIVE-NOW') x
  where x.u is not null), 0, 'join: other students get no link');
commit;

update public.programme_enrolments set valid_until = current_date - 1 where student_id = 'a4000000-0000-0000-0000-000000000000';
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.class_sessions s where s.code = 'LIVE-NOW' and public.session_join_url(s.id) is not null), 0,
  'join: no link once the programme has expired (rule 12)');
commit;
update public.programme_enrolments set valid_until = current_date + 60 where student_id = 'a4000000-0000-0000-0000-000000000000';

select 'ALL SCHEDULING TESTS PASSED' as result;
