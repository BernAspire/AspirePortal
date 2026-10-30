-- Rewards: XP awarded by triggers, append-only ledger, streaks and badges. Runs after 60_
-- (Chloe's consent was withdrawn at the end of 60_; it is restored here).

insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'service', 'v1', 'online_form',
        'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'form-response-70');

-- A topic with 12 one-question groups, all answered by option 1.
select public.import_question_bank('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
  'Rewards topic', 'centres/a0000000-0000-0000-0000-000000000000/question-bank/sources/r.html', repeat('9', 64),
  jsonb_build_object('sections', '[{"number":1,"title":"Mixed"}]'::jsonb,
    'questions', (select jsonb_agg(test.q('r' || n, 'g' || n, 1, 1, 'Question ' || n,
                    '{"answer":{"kind":"choice","correct":1},"display":"(1)","why_not":{},"steps":["…"]}', '["yes","no"]')) from generate_series(1, 12) n)));

create function test.chloe_xp() returns bigint language sql as $$
  select coalesce(sum(amount), 0) from public.xp_ledger where student_id = 'a4000000-0000-0000-0000-000000000000'
$$;
create table test.xp (name text primary key, v bigint);
insert into test.xp values ('before', test.chloe_xp());

-- ---------------------------------------------------------------------------
-- 1. Practice sets
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into test.ids values ('r10', public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'manual',
  (select array_agg(s.id) from public.question_sections s join public.question_topics t on t.id = s.topic_id where t.title = 'Rewards topic'), null, 10));
select count(public.submit_practice_answer((select id from test.ids where name = 'r10'), n, '{"choice":1}')) from generate_series(1, 10) n;
commit;
select test.expect((select amount from public.xp_ledger where reason = 'practice_set' and source_id = (select id from test.ids where name = 'r10')), 2,
  'xp: a finished 10-question set earns 2 XP');
select test.expect((select count(*) from public.xp_ledger where reason = 'practice_accuracy' and source_id = (select id from test.ids where name = 'r10')), 1,
  'xp: 80%+ correct earns the 1 XP bonus');

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
insert into test.ids values ('r5', public.start_practice('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'manual',
  (select array_agg(s.id) from public.question_sections s join public.question_topics t on t.id = s.topic_id where t.title = 'Rewards topic'), null, 5));
select count(public.submit_practice_answer((select id from test.ids where name = 'r5'), n, case when n <= 3 then '{"choice":1}' else '{"choice":2}' end::jsonb))
from generate_series(1, 5) n;
select test.expect((select count(*) from public.xp_ledger where source_id = (select id from test.ids where name = 'r5')), 1,
  'xp: a 5-question set at 60% earns 1 XP and no bonus');
-- Answering again changes nothing.
select count(public.submit_practice_answer((select id from test.ids where name = 'r5'), 1, '{"choice":1}'));
select test.expect((select count(*) from public.xp_ledger where source_id = (select id from test.ids where name = 'r5')), 1,
  'xp: re-submitting an answer does not award again');
commit;

select test.expect((select count(*) from public.xp_ledger where student_id = 'a4000000-0000-0000-0000-000000000000' and reason = 'streak_bonus'
  and activity_date = (now() at time zone 'Asia/Singapore')::date), 1, 'streak: one bonus per day, however much is done');

-- ---------------------------------------------------------------------------
-- 2. Lesson parts (once per part)
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
update public.lesson_progress set status = 'started', completed_at = null where lesson_part_id = 'd2000000-0000-0000-0000-000000000003';
update public.lesson_progress set status = 'completed', completed_at = now() where lesson_part_id = 'd2000000-0000-0000-0000-000000000003';
update public.lesson_progress set status = 'started', completed_at = null where lesson_part_id = 'd2000000-0000-0000-0000-000000000003';
update public.lesson_progress set status = 'completed', completed_at = now() where lesson_part_id = 'd2000000-0000-0000-0000-000000000003';
commit;
select test.expect((select count(*) from public.xp_ledger where reason = 'lesson_part' and source_id = 'd2000000-0000-0000-0000-000000000003'), 1,
  'xp: finishing a lesson part twice earns XP once');

-- ---------------------------------------------------------------------------
-- 3. The ledger is append-only and only the family and staff read it
-- ---------------------------------------------------------------------------
select test.expect_error($q$update public.xp_ledger set amount = 100$q$, '42501', 'ledger: rows cannot be changed');
select test.expect_error($q$delete from public.xp_ledger$q$, '42501', 'ledger: rows cannot be deleted');

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect_error($q$insert into public.xp_ledger (centre_id, student_id, reason, amount, activity_date)
  values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'adjustment', 500, current_date)$q$, '42501',
  'ledger: students cannot give themselves XP');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- Michelle, guardian
set local role authenticated;
select test.expect(((select count(*) from public.xp_ledger where student_id = 'a4000000-0000-0000-0000-000000000000') > 0)::int, 1,
  'ledger: the guardian sees her child''s XP');
select test.expect((public.my_rewards('a0000000-0000-0000-0000-000000000000') is null)::int, 1, 'rewards: guardians get no student rewards of their own');
commit;

begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');  -- Jayden, centre B
set local role authenticated;
select test.expect((select count(*) from public.xp_ledger where centre_id = 'a0000000-0000-0000-0000-000000000000'), 0, 'ledger: centre B sees no centre A XP');
select test.expect((public.my_rewards('a0000000-0000-0000-0000-000000000000') is null)::int, 1, 'rewards: centre B student gets nothing for centre A');
commit;

-- ---------------------------------------------------------------------------
-- 4. Derived totals, streaks and badges
-- ---------------------------------------------------------------------------
-- Six earlier days in a row, ending yesterday (written as the migration owner).
insert into public.xp_ledger (centre_id, student_id, reason, amount, note, activity_date, created_at)
select 'a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'streak_bonus', 1, 'Streak bonus',
       (now() at time zone 'Asia/Singapore')::date - n, now() - make_interval(days => n)
from generate_series(1, 6) n;
-- And an older 3-day run with a gap.
insert into public.xp_ledger (centre_id, student_id, reason, amount, note, activity_date, created_at)
select 'a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'streak_bonus', 1, 'Streak bonus',
       (now() at time zone 'Asia/Singapore')::date - n, now() - make_interval(days => n)
from generate_series(10, 12) n;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
create temp table rw as select public.my_rewards('a0000000-0000-0000-0000-000000000000') as r;
select test.expect((select (r ->> 'total_xp')::bigint from rw), test.chloe_xp(), 'rewards: total XP is the ledger sum');
select test.expect((select (r ->> 'current_streak')::bigint from rw), 7, 'streak: today plus six days in a row');
select test.expect((select (r ->> 'best_streak')::bigint from rw), 7, 'streak: best run');
select test.expect((select (r #>> '{badges,week_warrior}')::boolean::int from rw), 1, 'badges: Week Warrior at a 7-day streak');
select test.expect((select (r #>> '{badges,first_steps}')::boolean::int from rw), 1, 'badges: First Steps after a finished practice');
select test.expect((select (r #>> '{badges,sharp_shooter}')::boolean::int from rw), 1, 'badges: Sharp Shooter for 90%+ in a 10-question set');
select test.expect((select jsonb_array_length(r -> 'recent') from rw), 10, 'rewards: the ten most recent XP entries');
commit;

select 'ALL REWARDS TESTS PASSED' as result;
