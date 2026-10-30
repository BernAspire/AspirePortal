-- Smart Revision: spaced intervals, confidence, bookmarks, exam dates and Before-Exam Mode.
-- Runs after 70_ (Chloe has practised the "Rewards topic" sub-topic and has consent).

-- ---------------------------------------------------------------------------
-- 1. Interval rules
-- ---------------------------------------------------------------------------
select test.expect(app.next_interval(0, 10, 9, false), 1, 'interval: a good first review comes back in 1 day');
select test.expect(app.next_interval(1, 10, 8, false), 3, 'interval: good again climbs to 3 days');
select test.expect(app.next_interval(30, 5, 5, false), 60, 'interval: tops out at 60 days');
select test.expect(app.next_interval(60, 5, 5, false), 60, 'interval: stays at 60');
select test.expect(app.next_interval(7, 5, 3, false), 7, 'interval: middling keeps the interval');
select test.expect(app.next_interval(14, 5, 1, false), 1, 'interval: weak comes back tomorrow');
select test.expect(app.next_interval(7, 10, 10, true), 7, 'interval: Before-Exam Mode halves it (14 → 7)');
select test.expect(app.next_interval(0, 10, 10, true), 1, 'interval: never below 1 day');

-- ---------------------------------------------------------------------------
-- 2. Practice feeds the schedule
-- ---------------------------------------------------------------------------
create function test.mixed() returns uuid language sql as $$
  select s.id from public.question_sections s join public.question_topics t on t.id = s.topic_id
  where t.title = 'Rewards topic' and t.centre_id = 'a0000000-0000-0000-0000-000000000000'
$$;
select test.expect(((select count(*) from public.revision_reviews where section_id = test.mixed()) > 0)::int, 1,
  'schedule: finished practice sets are recorded as reviews of their sub-topics');
select test.expect((select count(*) from public.revision_states where section_id = test.mixed() and due_on > current_date - 1), 1,
  'schedule: the sub-topic has a next review date');
select test.expect_error($q$update public.revision_reviews set correct = 0$q$, '42501', 'reviews are append-only');

-- ---------------------------------------------------------------------------
-- 3. Confidence
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select public.set_topic_confidence('a0000000-0000-0000-0000-000000000000', test.mixed(), 4);
select test.expect((select confidence from public.revision_states where section_id = test.mixed()), 4, 'confidence: the student rates a sub-topic');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$select public.set_topic_confidence('a0000000-0000-0000-0000-000000000000', test.mixed(), 9)$q$, '22023', 'confidence: 1–5 only');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$update public.revision_states set due_on = current_date + 300$q$, '42501', 'schedule: students cannot move their own due dates');
commit;
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$select public.set_topic_confidence('a0000000-0000-0000-0000-000000000000', test.mixed(), 3)$q$, '42501',
  'confidence: centre B cannot rate a centre A sub-topic');
select test.expect((select count(*) from public.revision_states where centre_id = 'a0000000-0000-0000-0000-000000000000'), 0,
  'schedule: centre B sees no centre A revision');
commit;

-- ---------------------------------------------------------------------------
-- 4. Bookmarks
-- ---------------------------------------------------------------------------
insert into test.ids select 'bq', id from public.questions where centre_id = 'b0000000-0000-0000-0000-000000000000' limit 1;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into public.question_bookmarks (centre_id, student_id, question_id)
select 'a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', q.id from public.questions q where q.external_ref = 'r3';
select test.expect((select count(*) from public.question_bookmarks), 1, 'bookmarks: a student bookmarks a question');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$insert into public.question_bookmarks (centre_id, student_id, question_id)
  values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', (select id from test.ids where name = 'bq'))$q$,
  '42501', 'bookmarks: not on another centre''s questions');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$insert into public.question_bookmarks (centre_id, student_id, question_id)
  select 'a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', q.id from public.questions q where q.external_ref = 'r4'$q$,
  '42501', 'bookmarks: not for a brother''s account');
select test.expect_error($q$update public.question_bookmarks set resolved_at = now()$q$, '42501',
  'bookmarks: students cannot mark them resolved by hand');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into test.ids values ('bm', public.start_bookmark_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', null));
select test.expect((select count(*) from public.practice_items where session_id = (select id from test.ids where name = 'bm')), 1,
  'bookmarks: practising bookmarks gives exactly the bookmarked questions');
select count(public.submit_practice_answer((select id from test.ids where name = 'bm'), 1, '{"choice":1}'));
select test.expect((select count(*) from public.question_bookmarks where resolved_at is not null), 1, 'bookmarks: a right answer resolves the bookmark');
select test.expect_error($q$select public.start_bookmark_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', null)$q$,
  'P0002', 'bookmarks: nothing left to practise');
commit;

begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.question_bookmarks), 0, 'bookmarks: centre B sees none of centre A''s');
commit;

-- ---------------------------------------------------------------------------
-- 5. Exam dates and Before-Exam Mode
-- ---------------------------------------------------------------------------
select test.expect(public.apply_exam_dates('a0000000-0000-0000-0000-000000000000',
  jsonb_build_array(jsonb_build_object('course_id', 'c0000000-0000-0000-0000-000000000001', 'name', 'SA2', 'exam_on', current_date + 20))), 1,
  'exams: the centre''s exam date is loaded');

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.exam_dates where name = 'SA2'), 1, 'exams: the student sees the centre''s exam for her course');
insert into public.exam_dates (centre_id, course_id, student_id, name, exam_on)
values ('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000000', 'School WA3', current_date + 10);
select public.set_exam_mode('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  (select id from public.exam_dates where name = 'SA2'));
create temp table rv as select public.my_revision('a0000000-0000-0000-0000-000000000000') as r;
select test.expect((select jsonb_array_length(r -> 'exams') from rv), 2, 'exams: centre and own exams listed');
select test.expect((select count(*) from rv, jsonb_array_elements(r -> 'exams') e where (e ->> 'active')::boolean and e ->> 'name' = 'SA2'), 1,
  'exam mode: on for SA2');
select test.expect((select count(*) from rv, jsonb_array_elements(r -> 'sections') s where (s ->> 'section_id')::uuid = test.mixed()
  and (s ->> 'confidence')::int = 4 and (s ->> 'bookmarks_resolved')::int = 1), 1, 'revision: sub-topic with confidence and bookmarks');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$insert into public.exam_dates (centre_id, course_id, student_id, name, exam_on)
  values ('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000000', 'Old', current_date - 1)$q$,
  '42501', 'exams: a past date is refused');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$insert into public.revision_exam_modes (centre_id, student_id, course_id, exam_id)
  select 'a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', id
  from public.exam_dates limit 1$q$, '42501', 'exam mode: only through set_exam_mode');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$insert into public.exam_dates (centre_id, course_id, student_id, name, exam_on)
  values ('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', null, 'Fake centre exam', current_date + 5)$q$,
  '42501', 'exams: a student cannot create a centre-wide exam');
select test.expect(test.rows_changed($q$delete from public.exam_dates where student_id is null$q$), 0, 'exams: a student cannot delete the centre''s exams');
commit;

begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.exam_dates where centre_id = 'a0000000-0000-0000-0000-000000000000'), 0, 'exams: centre B sees none of centre A''s');
select test.expect((public.my_revision('a0000000-0000-0000-0000-000000000000') is null)::int, 1, 'revision: centre B gets nothing for centre A');
select test.expect_error($q$select public.set_exam_mode('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', null)$q$,
  '42501', 'exam mode: centre B cannot switch it for centre A');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect((public.my_revision('a0000000-0000-0000-0000-000000000000') is null)::int, 1, 'revision: guardians get no revision of their own');
select test.expect((select count(*) from public.exam_dates where name = 'School WA3'), 1, 'exams: the guardian sees her child''s own exam');
commit;

select test.expect((app.active_exam('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000',
  'c0000000-0000-0000-0000-000000000001') = current_date + 20)::int, 1, 'exam mode: counts down to SA2');

-- Re-loading the centre's exams without SA2 removes it, and the mode with it.
select public.apply_exam_dates('a0000000-0000-0000-0000-000000000000',
  jsonb_build_array(jsonb_build_object('course_id', 'c0000000-0000-0000-0000-000000000001', 'name', 'Prelim', 'exam_on', current_date + 30)));
select test.expect((select count(*) from public.exam_dates where name = 'SA2'), 0, 'exams: a centre exam no longer listed is removed');
select test.expect((select count(*) from public.revision_exam_modes), 0, 'exam mode: ends when its exam is removed');
select test.expect((select count(*) from public.exam_dates where name = 'School WA3'), 1, 'exams: the student''s own exam is untouched');

select 'ALL REVISION TESTS PASSED' as result;
