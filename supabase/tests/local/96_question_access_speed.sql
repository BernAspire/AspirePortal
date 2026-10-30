-- The set-based access check gives the same answers as the per-row one (rule 12).
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from app.my_learnable_courses() where centre_id = 'a0000000-0000-0000-0000-000000000000'
  and course_id = 'c0000000-0000-0000-0000-000000000001'), 1, 'access: the student can learn her course');
select test.expect((select count(*) from app.my_learnable_courses() l where not app.can_learn_course(l.centre_id, l.course_id)), 0,
  'access: the set matches the per-row rule');
commit;
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect((select count(*) from app.my_learnable_courses() where course_id = 'c0000000-0000-0000-0000-000000000001'), 1,
  'access: her guardian too');
commit;
begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from app.my_learnable_courses() where centre_id = 'a0000000-0000-0000-0000-000000000000'), 0,
  'access: centre B gets no centre A courses');
select test.expect((select count(*) from public.question_versions where centre_id = 'a0000000-0000-0000-0000-000000000000'), 0,
  'access: nor centre A question versions');
commit;
begin;
update public.programme_enrolments set valid_until = current_date - 1, valid_from = current_date - 30
 where student_id = 'a4000000-0000-0000-0000-000000000000';
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from app.my_learnable_courses()), 0, 'access: an expired programme gives no courses');
select test.expect((select count(*) from public.questions), 0, 'access: and no questions');
rollback;
select test.expect((select count(*) from public.practice_question_counts('a0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001')), 0,
  'access: counts need a signed-in learner or staff');

select 'ALL QUESTION ACCESS TESTS PASSED' as result;
