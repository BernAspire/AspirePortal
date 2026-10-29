-- Question bank and Practice: marking rules, import/versioning, who can read what, and the
-- practice functions. Runs after 50_ (Chloe has an active Primary 6 Science programme and
-- service consent; 50_ ends with her enrolment restored).

-- ---------------------------------------------------------------------------
-- 1. Marking (same rules as the centre's original page)
-- ---------------------------------------------------------------------------
select test.expect(cardinality(app.answer_numbers('503 618')), 1, 'numbers: a spaced thousands group is one number');
select test.expect((app.answer_numbers('2 615 039'))[1]::bigint, 2615039, 'numbers: millions with two spaces');
select test.expect((app.answer_numbers('$1,234.50 and 7 kg') = array[1234.50, 7]::numeric[])::int, 1, 'numbers: commas, decimals and units');
select test.expect(app.answer_part_matches('198 kg', '198')::int, 1, 'marking: units are not needed');
select test.expect(app.answer_part_matches('$6', '6 dollars')::int, 1, 'marking: currency words are ignored');
select test.expect(app.answer_part_matches('198 kg', '189 kg')::int, 0, 'marking: a wrong number is wrong');
select test.expect(app.answer_part_matches('6 372 041', '6372041')::int, 1, 'marking: spaces in numbers are optional');
select test.expect(app.answer_part_matches('Six million, seventy-two thousand', 'six million seventy two thousand')::int, 1,
  'marking: worded answers ignore case, spaces and punctuation');
select test.expect(app.answer_part_matches('Four hundred and five', 'four hundred five')::int, 1, 'marking: "and" is optional');
select test.expect(app.answer_part_matches('198 kg', '')::int, 0, 'marking: an empty answer is wrong');
select test.expect(app.answer_part_matches('−5 °C', '5')::int, 0, 'marking: the sign of a negative number counts');
select test.expect(app.answer_part_matches('−5 °C', '-5')::int, 1, 'marking: either minus sign works');
select test.expect(app.answer_part_matches('3-4 days', '3 4')::int, 1, 'marking: a dash between numbers is not a minus');
select test.expect(has_function_privilege('authenticated', 'app.practice_result(uuid, uuid, int)', 'execute')::int, 0,
  'keys: the result helper is not callable by signed-in users');
select test.expect(app.mark_answer('{"kind":"choice","correct":2}', '{"choice":2}')::int, 1, 'marking: the right option');
select test.expect(app.mark_answer('{"kind":"choice","correct":2}', '{"choice":3}')::int, 0, 'marking: a wrong option');
select test.expect(app.mark_answer('{"kind":"text","parts":[{"label":"a","text":"6 372 041"},{"label":"b","text":"405"}]}',
  '{"parts":["6372041","405"]}')::int, 1, 'marking: two-part answers need both parts');
select test.expect(app.mark_answer('{"kind":"text","parts":[{"label":"a","text":"6 372 041"},{"label":"b","text":"405"}]}',
  '{"parts":["6372041"]}')::int, 0, 'marking: a missing part is wrong');

-- ---------------------------------------------------------------------------
-- 2. Import and versions
-- ---------------------------------------------------------------------------
create function test.q(p_ref text, p_group text, p_section int, p_difficulty int, p_text text, p_key jsonb, p_choices jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object('ref', p_ref, 'group', p_group, 'section', p_section, 'difficulty', p_difficulty,
    'strategy', null, 'marks', null, 'source', 'Test School 2022 SA2',
    'content', jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', p_text)),
                                  'choices', p_choices,
                                  'parts', case when p_key #>> '{answer,kind}' = 'text'
                                                then (select jsonb_agg(x -> 'label') from jsonb_array_elements(p_key #> '{answer,parts}') x)
                                                else '[""]' end),
    'key', p_key);
$$;
create function test.bank(p_extra_text text default '') returns jsonb language sql as $$
  select jsonb_build_object(
    'sections', '[{"number":1,"title":"Heat"},{"number":2,"title":"Light"}]'::jsonb,
    'questions', jsonb_build_array(
      test.q('1.1a', '1.1', 1, 1, 'Which is a good conductor of heat?' || p_extra_text,
             '{"answer":{"kind":"choice","correct":2},"display":"(2) Metal","why_not":{"1":"Wood is a poor conductor."},"steps":["Metals conduct heat well."]}',
             '["Wood","Metal","Plastic","Air"]'),
      test.q('1.1b', '1.1', 1, 1, 'Which is a poor conductor of heat?',
             '{"answer":{"kind":"choice","correct":1},"display":"(1) Wood","why_not":{},"steps":["Wood is an insulator."]}',
             '["Wood","Copper","Iron","Steel"]'),
      test.q('1.2a', '1.2', 1, 2, 'A pot heats by 15 °C every 2 min. How much in 8 min?',
             '{"answer":{"kind":"text","parts":[{"label":"","text":"60 °C"}]},"display":"60 °C","steps":["8 ÷ 2 = 4","4 × 15 = 60"]}'),
      test.q('2.1a', '2.1', 2, 3, '(a) Name the light source. (b) How many mirrors?',
             '{"answer":{"kind":"text","parts":[{"label":"a","text":"The Sun"},{"label":"b","text":"3"}]},"display":"(a) The Sun (b) 3","steps":["…"]}')));
$$;

select test.expect((public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Energy', 'centres/a0000000-0000-0000-0000-000000000000/question-bank/sources/x.html', repeat('a', 64), test.bank()) ->> 'added')::bigint, 4,
  'import: four questions added');
select test.expect((public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'energy', 'centres/a0000000-0000-0000-0000-000000000000/question-bank/sources/x.html', repeat('a', 64), test.bank()) ->> 'unchanged')::bigint, 4,
  'import: re-importing the same file changes nothing (topic names ignore case)');
select test.expect((public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Energy', 'centres/a0000000-0000-0000-0000-000000000000/question-bank/sources/y.html', repeat('b', 64), test.bank(' (Choose one.)')) ->> 'changed')::bigint, 1,
  'import: an edited question gets a new version');
select test.expect((select current_version from public.questions where external_ref = '1.1a'), 2, 'import: current version moves to 2');
select test.expect((select count(*) from public.question_versions v join public.questions q on q.id = v.question_id where q.external_ref = '1.1a'), 2,
  'import: the old version is kept');
select test.expect_error($q$update public.question_versions set content = content where version = 1$q$, '42501', 'versions are immutable');
select test.expect_error($q$select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'Energy',
  'centres/a0000000-0000-0000-0000-000000000000/x.html', repeat('c', 64), '{"sections":[]}')$q$, 'P0001', 'import: a file with no questions changes nothing');
select test.expect_error($q$select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'Bad',
  'centres/a0000000-0000-0000-0000-000000000000/x.html', repeat('c', 64),
  jsonb_build_object('sections', '[{"number":1,"title":"S"}]'::jsonb, 'questions', jsonb_build_array(
    test.q('9a', '9', 1, 1, 'x', '{"answer":{"kind":"maybe"},"steps":[]}'))))$q$, '23514', 'import: a malformed answer key is refused');
select test.expect_error($q$select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'Bad',
  'centres/b0000000-0000-0000-0000-000000000000/x.html', repeat('c', 64), test.bank())$q$, '23514', 'import: the source file must be in the centre''s own folder');

-- Centre B has its own bank on the same platform course.
select public.import_question_bank('b0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Energy', 'centres/b0000000-0000-0000-0000-000000000000/question-bank/sources/b.html', repeat('d', 64), test.bank());
insert into public.programme_courses (centre_id, programme_id, course_id) values
  ('b0000000-0000-0000-0000-000000000000', 'b5000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001');
insert into public.programme_enrolments (centre_id, programme_id, student_id, valid_from, valid_until) values
  ('b0000000-0000-0000-0000-000000000000', 'b5000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000000', current_date - 1, current_date + 30);

-- ---------------------------------------------------------------------------
-- 3. Who can read what
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');  -- Chloe
set local role authenticated;
select test.expect((select count(*) from public.questions), 4, 'student A reads her centre''s questions for her course');
select test.expect((select count(*) from public.question_versions), 5, 'student A reads question content (both versions of the edited one)');
select test.expect((select count(*) from public.question_keys), 0, 'student A cannot read answer keys');
select test.expect((select count(*) from public.questions where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0,
  'student A cannot read centre B questions');
select test.expect((select count(*) from public.question_imports), 0, 'student A cannot see imports');
select test.expect((select sum(questions) from public.practice_question_counts('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001'))::bigint, 4,
  'counts: student A counts her centre''s active questions');
select test.expect((select count(*) from public.practice_question_counts('b0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001')), 0,
  'counts: student A counts nothing in centre B (RLS applies)');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000005');  -- Grace: her child has no programme
set local role authenticated;
select test.expect((select count(*) from public.questions), 0, 'a family without a programme reads no questions');
commit;

begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');  -- Jayden, centre B
set local role authenticated;
select test.expect((select count(*) from public.questions where centre_id = 'a0000000-0000-0000-0000-000000000000'), 0,
  'student B cannot read centre A questions');
select test.expect((select count(*) from public.questions), 4, 'student B reads his own centre''s bank');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');  -- owner A
set local role authenticated;
select test.expect((select count(*) from public.question_keys where centre_id = 'a0000000-0000-0000-0000-000000000000'), 5, 'staff read their keys');
select test.expect((select count(*) from public.question_keys where centre_id = 'b0000000-0000-0000-0000-000000000000'), 0, 'staff cannot read another centre''s keys');
commit;

-- ---------------------------------------------------------------------------
-- 4. Practice
-- ---------------------------------------------------------------------------
create table test.ids (name text primary key, id uuid);
grant all on test.ids to authenticated;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into test.ids values ('s1', public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'manual', null, null, 10));
select test.expect((select count(*) from public.practice_items where session_id = (select id from test.ids where name = 's1')), 3,
  'practice: one question per group (1.1a/1.1b are variants), so 3 of 4');
select test.expect((select count(distinct q.group_ref) from public.practice_items i join public.questions q on q.id = i.question_id
  where i.session_id = (select id from test.ids where name = 's1')), 3, 'practice: no two variants of the same group');
insert into test.ids values ('s2', public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'adaptive', null, array[3], 5));
select test.expect((select count(*) from public.practice_items i join public.questions q on q.id = i.question_id
  where i.session_id = (select id from test.ids where name = 's2') and q.difficulty <> 3), 0, 'practice: difficulty filter holds');
commit;

-- Answer every item of s1 as Chloe: the 2-part one right, the others wrong / given up.
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
create temp table r as
select i.position, q.external_ref,
       public.submit_practice_answer(i.session_id, i.position,
         case when q.external_ref = '2.1a' then '{"parts":["the sun","3 mirrors"]}'::jsonb
              when q.external_ref = '1.2a' then '{"gave_up":true}'::jsonb
              else '{"choice":4}'::jsonb end) as result
from public.practice_items i join public.questions q on q.id = i.question_id
where i.session_id = (select id from test.ids where name = 's1');
select test.expect((select count(*) from r where external_ref = '2.1a' and (result ->> 'correct')::boolean), 1, 'submit: a right two-part answer is marked right');
select test.expect((select count(*) from r where external_ref = '1.2a' and (result ->> 'gave_up')::boolean and not (result ->> 'correct')::boolean), 1,
  'submit: giving up counts as not correct');
select test.expect((select count(*) from r where external_ref like '1.1%' and not (result ->> 'correct')::boolean and result -> 'steps' is not null), 1,
  'submit: a wrong option is marked wrong and the worked steps come back');
select test.expect((select count(*) from r where result -> 'answer' is null), 0, 'submit: the answer is revealed after answering');
select test.expect((select count(*) from public.practice_sessions where id = (select id from test.ids where name = 's1') and finished_at is not null), 1,
  'submit: the session finishes when every item is answered');
select test.expect((select (public.submit_practice_answer((select id from test.ids where name = 's1'), r.position, '{"parts":["x","y"]}') ->> 'correct')::boolean::int
  from r where external_ref = '2.1a'), 1, 'submit: answering again returns the first result');
select test.expect(jsonb_array_length(public.practice_results((select id from test.ids where name = 's1'))), 3, 'results: all three come back for the student');
select test.expect((select count(*) from public.practice_section_stats('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001')), 2,
  'stats: accuracy per section for the student');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$select public.submit_practice_answer((select id from test.ids where name = 's2'), 1, '{"choice":99}')$q$, '22023',
  'submit: an answer in the wrong shape is refused');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into test.ids values ('s3', public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'manual', (select array_agg(id) from public.question_sections where title = 'Heat' and centre_id = 'a0000000-0000-0000-0000-000000000000'), array[1], 5));
select test.expect_error($q$select public.submit_practice_answer((select id from test.ids where name = 's3'), 1, '{"choice":9}')$q$, '22023',
  'submit: an option number out of range is refused');
select test.expect_error($q$select public.submit_practice_answer((select id from test.ids where name = 's3'), 1, '{"choice":1.5}')$q$, '22023',
  'submit: an option number must be whole');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$insert into public.practice_attempts (centre_id, student_id, session_id, position, question_id, question_version, correct)
  select i.centre_id, 'a4000000-0000-0000-0000-000000000000', i.session_id, i.position, i.question_id, i.question_version, true
  from public.practice_items i where i.session_id = (select id from test.ids where name = 's2') limit 1$q$, '42501', 'students cannot write attempts directly');
commit;
select test.expect_error($q$update public.practice_attempts set correct = true$q$, '42501', 'attempts are append-only, even for the owner');

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- Michelle (guardian)
set local role authenticated;
select test.expect((select count(*) from public.practice_attempts), 3, 'guardian sees her child''s attempts');
select test.expect_error($q$select public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'manual', null, null, 5)$q$,
  '42501', 'guardians cannot start practice for the child');
commit;

begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');  -- Jayden, centre B
set local role authenticated;
select test.expect((select count(*) from public.practice_attempts), 0, 'student B sees no centre A attempts');
select test.expect(jsonb_array_length(public.practice_results((select id from test.ids where name = 's1'))), 0, 'student B gets no results for a centre A session');
select test.expect_error($q$select public.submit_practice_answer((select id from test.ids where name = 's2'), 1, '{"choice":1}')$q$, '42501',
  'student B cannot answer a centre A session');
select test.expect_error($q$select public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'manual', null, null, 5)$q$,
  '42501', 'student B cannot practise from centre A''s bank');
commit;

-- A second topic reusing the same group codes is still picked (groups are per topic).
select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Forces', 'centres/a0000000-0000-0000-0000-000000000000/question-bank/sources/f.html', repeat('e', 64), test.bank());
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into test.ids values ('s4', public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'manual', null, null, 30));
select test.expect((select count(*) from public.practice_items where session_id = (select id from test.ids where name = 's4')), 6,
  'practice: group codes repeat across topics without hiding questions (3 groups × 2 topics)');
commit;
-- Retiring "Forces" keeps its questions readable inside the session that gave them.
select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Forces', 'centres/a0000000-0000-0000-0000-000000000000/question-bank/sources/f2.html', repeat('f', 64),
  jsonb_set(test.bank(), '{questions}', (test.bank() -> 'questions') - 0 - 0 - 0));
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.practice_items i join public.questions q on q.id = i.question_id
  where i.session_id = (select id from test.ids where name = 's4')), 6, 'retired: questions already given in a session stay readable');
select test.expect((select count(*) from public.questions q join public.question_topics t on t.id = q.topic_id
  where t.title = 'Forces' and q.status = 'retired' and q.id not in (select question_id from public.practice_items)), 0,
  'retired: retired questions not given to the student are hidden');
commit;

-- Entitlement and consent (rule 12; PDPA)
update public.programme_enrolments set valid_until = current_date - 1 where student_id = 'a4000000-0000-0000-0000-000000000000';
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from public.questions), 0, 'expired programme: no questions');
select test.expect_error($q$select public.submit_practice_answer((select id from test.ids where name = 's2'), 1, '{"choice":1}')$q$, '42501',
  'expired programme: cannot keep answering an old session');
commit;
update public.programme_enrolments set valid_until = current_date + 60 where student_id = 'a4000000-0000-0000-0000-000000000000';
update public.consents set withdrawn_at = now() where student_id = 'a4000000-0000-0000-0000-000000000000' and withdrawn_at is null;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$select public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'manual', null, null, 5)$q$,
  '42501', 'no consent on record: practice cannot start');
commit;

select 'ALL QUESTION BANK TESTS PASSED' as result;
