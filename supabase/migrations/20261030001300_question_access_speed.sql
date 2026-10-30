-- Faster question access checks. With 13 topics (about 6,000 questions) the per-row policy check
-- `app.can_learn_course(centre_id, course_id)` ran once per question and the topic list took
-- over 8 seconds, past Supabase's statement timeout for signed-in users. The same rule (rule 12:
-- an active programme valid today, for the student or a guardian's child) is now computed once
-- per query as a set of (centre, course) pairs.

create or replace function app.my_learnable_courses()
returns table (centre_id uuid, course_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select distinct m.centre_id, pc.course_id
  from (select distinct cm.centre_id from public.centre_memberships cm
        where cm.user_id = auth.uid() and cm.status = 'active') m
  cross join lateral (
    select app.my_student_ids(m.centre_id) as student_id
    union
    select app.guardian_student_ids(m.centre_id)
  ) s
  join public.programme_enrolments pe on pe.centre_id = m.centre_id and pe.student_id = s.student_id
  join public.programme_courses pc on pc.centre_id = pe.centre_id and pc.programme_id = pe.programme_id
  join public.programmes p on p.centre_id = pe.centre_id and p.id = pe.programme_id
  where p.status = 'active'
    and (now() at time zone 'Asia/Singapore')::date between pe.valid_from and pe.valid_until
    and app.can_see_student(pe.centre_id, pe.student_id);
$$;
revoke all on function app.my_learnable_courses() from public;
grant execute on function app.my_learnable_courses() to authenticated, service_role;

-- Centres where the signed-in user is staff, computed once per query.
create or replace function app.my_staff_centre_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct cm.centre_id from public.centre_memberships cm
  where cm.user_id = auth.uid() and app.is_staff(cm.centre_id);
$$;
revoke all on function app.my_staff_centre_ids() from public;
grant execute on function app.my_staff_centre_ids() to authenticated, service_role;

drop policy questions_staff on public.questions;
create policy questions_staff on public.questions for all to authenticated
  using (centre_id in (select app.my_staff_centre_ids())) with check (centre_id in (select app.my_staff_centre_ids()));
drop policy questions_learner_select on public.questions;
create policy questions_learner_select on public.questions for select to authenticated
  using ((centre_id, course_id) in (select l.centre_id, l.course_id from app.my_learnable_courses() l)
         and (status = 'active' or (select app.in_my_practice(centre_id, id))));

-- Section counts for the practice set-up page: one entitlement check, then a plain count.
create or replace function public.practice_question_counts(p_centre uuid, p_course uuid)
returns table (section_id uuid, difficulty smallint, questions bigint)
language sql stable security definer
set search_path = ''
as $$
  select q.section_id, q.difficulty, count(*)
  from public.questions q
  where q.centre_id = p_centre and q.course_id = p_course and q.status = 'active'
    and (app.is_staff(p_centre) or app.can_learn_course(p_centre, p_course))
  group by q.section_id, q.difficulty;
$$;
revoke all on function public.practice_question_counts(uuid, uuid) from public, anon;
grant execute on function public.practice_question_counts(uuid, uuid) to authenticated;

-- The same for topics, sub-topics and question versions (same rules as before, computed once).
drop policy question_topics_staff on public.question_topics;
create policy question_topics_staff on public.question_topics for all to authenticated
  using (centre_id in (select app.my_staff_centre_ids())) with check (centre_id in (select app.my_staff_centre_ids()));
drop policy question_topics_learner_select on public.question_topics;
create policy question_topics_learner_select on public.question_topics for select to authenticated
  using ((centre_id, course_id) in (select l.centre_id, l.course_id from app.my_learnable_courses() l));

drop policy question_sections_staff on public.question_sections;
create policy question_sections_staff on public.question_sections for all to authenticated
  using (centre_id in (select app.my_staff_centre_ids())) with check (centre_id in (select app.my_staff_centre_ids()));
drop policy question_sections_learner_select on public.question_sections;
create policy question_sections_learner_select on public.question_sections for select to authenticated
  using ((centre_id, topic_id) in (
    select t.centre_id, t.id from public.question_topics t
    where (t.centre_id, t.course_id) in (select l.centre_id, l.course_id from app.my_learnable_courses() l)));

drop policy question_versions_staff on public.question_versions;
create policy question_versions_staff on public.question_versions for all to authenticated
  using (centre_id in (select app.my_staff_centre_ids())) with check (centre_id in (select app.my_staff_centre_ids()));
drop policy question_versions_learner_select on public.question_versions;
create policy question_versions_learner_select on public.question_versions for select to authenticated
  using ((centre_id, question_id) in (
    select q.centre_id, q.id from public.questions q
    where (q.centre_id, q.course_id) in (select l.centre_id, l.course_id from app.my_learnable_courses() l)));
