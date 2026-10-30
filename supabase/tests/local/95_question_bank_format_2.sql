-- Question bank format 2: unit powers, topic order, figure paths and storage access,
-- self-checked answers. Runs after 90_ (Chloe's service consent is restored here).

insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'service', 'v1', 'online_form',
        'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'form-response-95');

-- ---------------------------------------------------------------------------
-- 1. Marking like the bank pages
-- ---------------------------------------------------------------------------
select test.expect((app.answer_numbers('54 cm²') = '{54}')::int, 1, 'marking: cm² is not a number');
select test.expect((app.answer_numbers('24 cm2 and 8 m3') = '{24,8}')::int, 1, 'marking: cm2 / m3 written plainly are units too');
select test.expect((app.answer_numbers('12 345 people') = '{12345}')::int, 1, 'marking: spaces in thousands still join');
select test.expect((app.answer_numbers('1 500/1000') = '{1,500,1000}')::int, 1, 'marking: a fraction after a space is not a thousands group');
select test.expect(app.answer_part_matches('54 cm²', '54')::int, 1, 'marking: "54" is right for 54 cm²');
select test.expect(app.answer_part_matches('0.36 kg', '.36')::int, 1, 'marking: ".36" is 0.36, as on the bank page');
select test.expect((app.answer_numbers('33°–35°') = '{33,35}')::int, 1, 'marking: a dash between numbers is not a minus sign');
select test.expect((app.answer_numbers('-5 and (−3)') = '{-5,-3}')::int, 1, 'marking: real negative numbers still count');
select test.expect(app.answer_part_matches('3 2/7', '3 2/7')::int, 1, 'marking: mixed numbers');
select test.expect(app.answer_part_matches('÷', ' ÷ ')::int, 1, 'marking: a symbol answer');
select test.expect(app.answer_part_matches('÷', '×')::int, 0, 'marking: the wrong symbol');
select test.expect(app.mark_answer('{"kind":"self"}', '{"self":true}')::int, 1, 'marking: a self-check the student got right');
select test.expect(app.mark_answer('{"kind":"self"}', '{"self":false}')::int, 0, 'marking: and one they got wrong');
select test.expect(app.mark_answer('{"kind":"self"}', '{"parts":["x"]}')::int, 0, 'marking: self-checks need a yes or no');

-- ---------------------------------------------------------------------------
-- 2. Import: topic order and figure paths
-- ---------------------------------------------------------------------------
create function test.fig() returns text language sql as $$
  select 'centres/a0000000-0000-0000-0000-000000000000/question-bank/images/c0000000-0000-0000-0000-000000000001/' || repeat('a', 64) || '.png'
$$;
create function test.sol() returns text language sql as $$
  select 'centres/a0000000-0000-0000-0000-000000000000/question-bank/images/c0000000-0000-0000-0000-000000000001/solutions/' || repeat('b', 64) || '.png'
$$;
create function test.selfq(p_ref text, p_path text) returns jsonb language sql as $$
  select jsonb_build_object('ref', p_ref, 'group', p_ref, 'section', 1, 'difficulty', 1, 'strategy', null, 'marks', null, 'source', 'Product D',
    'content', jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'rich', jsonb_build_array('Draw it.')),
                                                              jsonb_build_object('type', 'image', 'path', p_path, 'width', 300)),
                                  'choices', null, 'parts', '[""]'::jsonb, 'self_check', 'draw'),
    'key', jsonb_build_object('answer', '{"kind":"self"}'::jsonb, 'display', '["A square"]'::jsonb, 'why_not', '{}'::jsonb,
                              'steps', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'rich', '["Four equal sides."]'::jsonb),
                                                         jsonb_build_object('type', 'image', 'path', test.sol(), 'width', 200))))
$$;
select test.expect((public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Topic 7 - Drawing', 'centres/a0000000-0000-0000-0000-000000000000/question-bank/sources/d.html', repeat('7', 64),
  jsonb_build_object('position', 7, 'sections', '[{"number":1,"title":"Shapes"}]'::jsonb,
    'questions', (select jsonb_agg(test.selfq('Q000' || n, test.fig())) from generate_series(1, 5) n))) ->> 'added')::int, 5,
  'import: a format 2 topic is loaded');
select test.expect((select position from public.question_topics where title = 'Topic 7 - Drawing'), 7, 'import: "Topic 7" is listed seventh');
select test.expect_error($q$select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Topic 8 - Bad', 'x', repeat('8', 64), jsonb_build_object('sections', '[{"number":1,"title":"S"}]'::jsonb,
  'questions', jsonb_build_array(test.selfq('Q1', 'centres/b0000000-0000-0000-0000-000000000000/question-bank/images/c0000000-0000-0000-0000-000000000001/' || repeat('a', 64) || '.png'))))$q$,
  'P0001', 'import: figures must be in this centre''s folder');
select test.expect_error($q$select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Topic 8 - Bad', 'x', repeat('8', 64), jsonb_build_object('sections', '[{"number":1,"title":"S"}]'::jsonb,
  'questions', jsonb_build_array(test.selfq('Q1', '../../etc/passwd'))))$q$,
  'P0001', 'import: no odd figure paths');
select test.expect_error($q$select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Topic 8 - Bad', 'x', repeat('8', 64), jsonb_build_object('sections', '[{"number":1,"title":"S"}]'::jsonb,
  'questions', jsonb_build_array(test.selfq('Q1', test.sol()))))$q$,
  'P0001', 'import: worked-solution figures can''t be used in question text');
select test.expect_error($q$select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Topic 8 - Bad', 'x', repeat('8', 64), jsonb_build_object('sections', '[{"number":1,"title":"S"}]'::jsonb,
  'questions', jsonb_build_array(jsonb_set(test.selfq('Q1', test.fig()), '{content,blocks,1,src}', '"https://evil.test/x.png"'))))$q$,
  '23514', 'import: a figure can''t carry its own link');
select test.expect((select count(*) from public.question_topics where title = 'Topic 8 - Bad'), 0, 'import: a refused file saves nothing');

-- ---------------------------------------------------------------------------
-- 3. Who can open figures
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect(app.can_read_question_image(test.fig())::int, 1, 'figures: the student on the course can open them');
select test.expect(app.can_read_question_image('centres/a0000000-0000-0000-0000-000000000000/question-bank/sources/' || repeat('a', 64) || '.png')::int, 0,
  'figures: only the figure folder');
select test.expect(app.can_read_question_image('centres/------------------------------------/question-bank/images/c0000000-0000-0000-0000-000000000001/' || repeat('a', 64) || '.png')::int, 0,
  'figures: an odd name is refused, not an error');
select test.expect(app.can_read_question_image(test.sol())::int, 0, 'figures: worked-solution figures stay closed before practising');
commit;
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect(app.can_read_question_image(test.fig())::int, 0, 'figures: centre B cannot open centre A''s');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;
select test.expect(app.can_read_question_image(test.fig())::int, 1, 'figures: centre staff can open them');
commit;

-- ---------------------------------------------------------------------------
-- 4. Self-checked questions
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into test.ids values ('sc', public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'manual',
  (select array_agg(s.id) from public.question_sections s join public.question_topics t on t.id = s.topic_id where t.title = 'Topic 7 - Drawing'), null, 5));
select test.expect((public.practice_solution((select id from test.ids where name = 'sc'), 1) -> 'steps' -> 0 -> 'rich' ->> 0 = 'Four equal sides.')::int, 1,
  'self-check: the student sees the worked solution first');
select test.expect(app.can_read_question_image(test.sol())::int, 1, 'figures: and its figures');
select test.expect_error($q$select public.submit_practice_answer((select id from test.ids where name = 'sc'), 1, '{"parts":["square"]}')$q$, '22023',
  'self-check: needs "I got it right" or "I got it wrong"');
select test.expect((public.submit_practice_answer((select id from test.ids where name = 'sc'), 1, '{"self":true}') ->> 'correct')::boolean::int, 1,
  'self-check: "I got it right" counts as right');
select test.expect((public.submit_practice_answer((select id from test.ids where name = 'sc'), 2, '{"self":false}') ->> 'correct')::boolean::int, 0,
  'self-check: "I got it wrong" counts as wrong');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into test.ids values ('auto', public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'manual',
  (select array_agg(s.id) from public.question_sections s join public.question_topics t on t.id = s.topic_id where t.title = 'Rewards topic'), null, 5));
select test.expect_error($q$select public.practice_solution((select id from test.ids where name = 'auto'), 1)$q$, '22023',
  'self-check: answers of automatically marked questions stay hidden until answered');
commit;
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$select public.practice_solution((select id from test.ids where name = 'sc'), 3)$q$, '42501',
  'self-check: not from someone else''s session');
select test.expect(app.can_read_question_image(test.sol())::int, 0, 'figures: centre B cannot open centre A''s worked solutions');
commit;

select 'ALL QUESTION BANK FORMAT 2 TESTS PASSED' as result;
