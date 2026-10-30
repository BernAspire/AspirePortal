-- Rewards: XP ledger, streaks and badges. See ADR 0008.
--
-- XP is an append-only ledger (CLAUDE.md data rules). Rows are written only by triggers
-- on learning activity, never by students. Totals, levels, streaks and badges are
-- derived when read (public.my_rewards), never stored as editable numbers.
--
-- Owner decisions (30 Oct 2026), as in the Aspire Online mockup:
--   finished practice set: +1 / +2 / +3 XP for 5 / 10 / 15 questions really answered (not "Show the answer"),
--     +1 more at 80%+ correct; at most 10 practice XP per student per day
--   finished lesson part:  +1 XP (once per part)
--   first activity of a Singapore day (practice answer or finished lesson part): +1 streak bonus
--   levels: 100 XP each (computed in the app, modules/engagement)

create type public.xp_reason as enum ('practice_set', 'practice_accuracy', 'lesson_part', 'streak_bonus', 'adjustment');

create table public.xp_ledger (
  id             uuid not null default gen_random_uuid(),
  centre_id      uuid not null,
  student_id     uuid not null,
  reason         public.xp_reason not null,
  amount         integer not null check (amount <> 0 and amount between -1000 and 1000),
  source_id      uuid,
  note           text check (note is null or length(note) <= 200),
  activity_date  date not null,
  created_at     timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  check (reason = 'adjustment' or amount > 0),
  foreign key (centre_id, student_id) references public.students (centre_id, id)
);
create index xp_ledger_student_idx on public.xp_ledger (centre_id, student_id, created_at desc);
-- Each source earns its XP once; one streak bonus per student per day.
create unique index xp_ledger_source_uq on public.xp_ledger (centre_id, student_id, reason, source_id)
  where source_id is not null;
create unique index xp_ledger_streak_uq on public.xp_ledger (centre_id, student_id, activity_date)
  where reason = 'streak_bonus';

create trigger xp_ledger_append_only before update or delete on public.xp_ledger
  for each row execute function app.reject_change();

alter table public.xp_ledger enable row level security;
alter table public.xp_ledger force row level security;
create policy xp_ledger_select on public.xp_ledger for select to authenticated
  using ((select app.is_staff(centre_id)) or student_id in (select app.family_student_ids(centre_id)));
revoke insert, update, delete on public.xp_ledger from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Awarding (security definer: students never write the ledger themselves)
-- ---------------------------------------------------------------------------
create or replace function app.award_streak(p_centre uuid, p_student uuid, p_at timestamptz)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.xp_ledger (centre_id, student_id, reason, amount, note, activity_date)
  values (p_centre, p_student, 'streak_bonus', 1, 'Streak bonus', (p_at at time zone 'Asia/Singapore')::date)
  on conflict (centre_id, student_id, activity_date) where reason = 'streak_bonus' do nothing;
$$;

-- A practice set finishes: XP by size, bonus for 80%+.
create or replace function app.award_practice_set()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_total int; v_answered int; v_correct int; v_xp int; v_today_xp int;
  v_day date := (now() at time zone 'Asia/Singapore')::date;
begin
  select count(*) into v_total from public.practice_items i where i.centre_id = new.centre_id and i.session_id = new.id;
  -- Only questions really answered count ("Show the answer" earns nothing).
  select count(*) filter (where not a.gave_up), count(*) filter (where a.correct) into v_answered, v_correct
    from public.practice_attempts a where a.centre_id = new.centre_id and a.session_id = new.id;
  v_xp := least(v_answered / 5, 3);
  -- At most 10 practice XP per student per day, so repeating sets can't be farmed.
  select coalesce(sum(x.amount), 0) into v_today_xp from public.xp_ledger x
   where x.centre_id = new.centre_id and x.student_id = new.student_id and x.activity_date = v_day
     and x.reason in ('practice_set', 'practice_accuracy');
  v_xp := least(v_xp, greatest(10 - v_today_xp, 0));
  if v_xp > 0 then
    insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date)
    values (new.centre_id, new.student_id, 'practice_set', v_xp, new.id,
            format('Practice completed · %s/%s correct', v_correct, v_total), v_day)
    on conflict (centre_id, student_id, reason, source_id) where source_id is not null do nothing;
    if v_correct * 5 >= v_total * 4 and v_today_xp + v_xp < 10 then
      insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date)
      values (new.centre_id, new.student_id, 'practice_accuracy', 1, new.id, '80% or more correct', v_day)
      on conflict (centre_id, student_id, reason, source_id) where source_id is not null do nothing;
    end if;
  end if;
  return null;
end;
$$;
create trigger practice_sessions_award after update of finished_at on public.practice_sessions
  for each row when (old.finished_at is null and new.finished_at is not null)
  execute function app.award_practice_set();

create or replace function app.award_practice_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.award_streak(new.centre_id, new.student_id, new.created_at);
  return null;
end;
$$;
create trigger practice_attempts_award after insert on public.practice_attempts
  for each row execute function app.award_practice_activity();

-- The database, not the browser, decides when a part was completed.
create or replace function app.stamp_lesson_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    new.completed_at := case when tg_op = 'UPDATE' and old.status = 'completed' then old.completed_at else now() end;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger lesson_progress_stamp before insert or update on public.lesson_progress
  for each row execute function app.stamp_lesson_completion();

-- A lesson part is finished for the first time.
create or replace function app.award_lesson_part()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date)
    select new.centre_id, new.student_id, 'lesson_part', 1, new.lesson_part_id,
           left('Lesson part completed: ' || p.title, 200), (now() at time zone 'Asia/Singapore')::date
    from public.lesson_parts p where p.centre_id = new.centre_id and p.id = new.lesson_part_id
    on conflict (centre_id, student_id, reason, source_id) where source_id is not null do nothing;
    perform app.award_streak(new.centre_id, new.student_id, now());
  end if;
  return null;
end;
$$;
create trigger lesson_progress_award after insert or update of status on public.lesson_progress
  for each row execute function app.award_lesson_part();

-- ---------------------------------------------------------------------------
-- Reading rewards: totals, streaks and badges are derived here
-- ---------------------------------------------------------------------------
-- The signed-in student's rewards in a centre (null if the caller isn't a student there).
create or replace function public.my_rewards(p_centre uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select app.my_student_id(p_centre) as id),
  today as (select (now() at time zone 'Asia/Singapore')::date as d),
  ledger as (
    select x.* from public.xp_ledger x, me where x.centre_id = p_centre and x.student_id = me.id
  ),
  days as (
    select distinct x.activity_date as d from ledger x, today t where x.reason = 'streak_bonus' and x.activity_date <= t.d
  ),
  runs as (
    select min(d) as first_day, max(d) as last_day, count(*) as len
    from (select d, d - (row_number() over (order by d))::int as grp from days) g
    group by grp
  ),
  finished as (
    select s.id,
           (select count(*) from public.practice_items i where i.centre_id = s.centre_id and i.session_id = s.id) as total,
           (select count(*) from public.practice_attempts a where a.centre_id = s.centre_id and a.session_id = s.id and a.correct) as correct
    from public.practice_sessions s, me
    where s.centre_id = p_centre and s.student_id = me.id and s.finished_at is not null
  ),
  section_attempts as (
    select q.section_id, a.correct,
           row_number() over (partition by q.section_id order by a.created_at) as n_first,
           row_number() over (partition by q.section_id order by a.created_at desc) as n_last
    from public.practice_attempts a
    join public.questions q on q.centre_id = a.centre_id and q.id = a.question_id, me
    where a.centre_id = p_centre and a.student_id = me.id
  ),
  comeback as (
    -- A section where the first 5 answers were under 50% right and the latest 5 are 80%+ right
    -- (at least 10 answers, so the two windows don't overlap).
    select 1 from section_attempts
    group by section_id
    having count(*) >= 10
       and avg(case when n_first <= 5 then (correct)::int end) < 0.5
       and avg(case when n_last <= 5 then (correct)::int end) >= 0.8
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'total_xp', coalesce((select sum(amount) from ledger), 0),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'amount', r.amount, 'note', r.note, 'at', r.created_at)
                                         order by r.created_at desc)
                        from (select * from ledger order by created_at desc limit 10) r), '[]'::jsonb),
    'current_streak', coalesce((select r.len from runs r, today t where r.last_day >= t.d - 1 order by r.last_day desc limit 1), 0),
    'best_streak', coalesce((select max(len) from runs), 0),
    'active_today', exists (select 1 from days, today where days.d = today.d),
    'recent_days', coalesce((select jsonb_agg(to_char(days.d, 'YYYY-MM-DD') order by days.d) from days, today where days.d > today.d - 28), '[]'::jsonb),
    'badges', jsonb_build_object(
      'first_steps', exists (select 1 from finished),
      'week_warrior', coalesce((select max(len) from runs), 0) >= 7,
      'sharp_shooter', exists (select 1 from finished f where f.total >= 10 and f.correct * 10 >= f.total * 9),
      'comeback', exists (select 1 from comeback)
    ),
    'practice_sets', (select count(*) from finished)
  ) end;
$$;
revoke all on function public.my_rewards(uuid) from public, anon;
grant execute on function public.my_rewards(uuid) to authenticated;

revoke all on function app.award_streak(uuid, uuid, timestamptz) from public, authenticated;
revoke all on function app.award_practice_set() from public, authenticated;
revoke all on function app.award_practice_activity() from public, authenticated;
revoke all on function app.award_lesson_part() from public, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: XP for learning done before this migration (same rules, once).
-- ---------------------------------------------------------------------------
insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date, created_at)
select s.centre_id, s.student_id, 'practice_set', least(t.answered / 5, 3), s.id,
       format('Practice completed · %s/%s correct', t.correct, t.total), (s.finished_at at time zone 'Asia/Singapore')::date, s.finished_at
from public.practice_sessions s
cross join lateral (
  select (select count(*) from public.practice_items i where i.centre_id = s.centre_id and i.session_id = s.id)::int as total,
         (select count(*) from public.practice_attempts a where a.centre_id = s.centre_id and a.session_id = s.id and not a.gave_up)::int as answered,
         (select count(*) from public.practice_attempts a where a.centre_id = s.centre_id and a.session_id = s.id and a.correct)::int as correct
) t
where s.finished_at is not null and t.answered >= 5
on conflict do nothing;

insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date, created_at)
select s.centre_id, s.student_id, 'practice_accuracy', 1, s.id, '80% or more correct', (s.finished_at at time zone 'Asia/Singapore')::date, s.finished_at
from public.practice_sessions s
cross join lateral (
  select (select count(*) from public.practice_items i where i.centre_id = s.centre_id and i.session_id = s.id)::int as total,
         (select count(*) from public.practice_attempts a where a.centre_id = s.centre_id and a.session_id = s.id and not a.gave_up)::int as answered,
         (select count(*) from public.practice_attempts a where a.centre_id = s.centre_id and a.session_id = s.id and a.correct)::int as correct
) t
where s.finished_at is not null and t.answered >= 5 and t.correct * 5 >= t.total * 4
on conflict do nothing;

insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date, created_at)
select lp.centre_id, lp.student_id, 'lesson_part', 1, lp.lesson_part_id, left('Lesson part completed: ' || p.title, 200),
       (lp.completed_at at time zone 'Asia/Singapore')::date, lp.completed_at
from public.lesson_progress lp
join public.lesson_parts p on p.centre_id = lp.centre_id and p.id = lp.lesson_part_id
where lp.status = 'completed'
on conflict do nothing;

insert into public.xp_ledger (centre_id, student_id, reason, amount, note, activity_date, created_at)
select distinct on (centre_id, student_id, d) centre_id, student_id, 'streak_bonus'::public.xp_reason, 1, 'Streak bonus', d, at
from (
  select a.centre_id, a.student_id, (a.created_at at time zone 'Asia/Singapore')::date as d, a.created_at as at from public.practice_attempts a
  union all
  select lp.centre_id, lp.student_id, (lp.completed_at at time zone 'Asia/Singapore')::date, lp.completed_at
  from public.lesson_progress lp where lp.status = 'completed'
) x
order by centre_id, student_id, d, at
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- submit_practice_answer, unchanged except that it now locks the session row first, so
-- two answers sent at the same moment can't leave a finished set unmarked (and unrewarded).
-- ---------------------------------------------------------------------------
create or replace function public.submit_practice_answer(p_session uuid, p_position int, p_response jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_centre uuid; v_student uuid; v_course uuid;
  v_question uuid; v_version int;
  v_key jsonb; v_gave_up boolean; v_correct boolean;
  v_choices int;
begin
  select s.centre_id, s.student_id, s.course_id into v_centre, v_student, v_course
  from public.practice_sessions s where s.id = p_session
  for update;  -- one answer at a time per session, so the last answer always finishes the set
  if v_student is null or v_student is distinct from app.my_student_id(v_centre) then
    raise exception 'not your practice session' using errcode = '42501';
  end if;
  if exists (select 1 from public.practice_attempts a where a.centre_id = v_centre and a.session_id = p_session and a.position = p_position) then
    return app.practice_result(v_centre, p_session, p_position);
  end if;
  if not app.has_course_access(v_student, v_course) then
    raise exception 'no active programme for this course' using errcode = '42501';
  end if;
  if not app.has_consent(v_centre, v_student, 'service') then
    raise exception 'consent required' using errcode = '42501', hint = 'consent';
  end if;

  select i.question_id, i.question_version into v_question, v_version
  from public.practice_items i where i.centre_id = v_centre and i.session_id = p_session and i.position = p_position;
  if v_question is null then raise exception 'no such question in this session' using errcode = '22023'; end if;
  select k.key into v_key from public.question_keys k
  where k.centre_id = v_centre and k.question_id = v_question and k.version = v_version;

  v_gave_up := coalesce((p_response ->> 'gave_up')::boolean, false);
  if not v_gave_up then
    -- Only the two answer shapes, of sensible size.
    if v_key #>> '{answer,kind}' = 'choice' then
      select jsonb_array_length(v.content -> 'choices') into v_choices from public.question_versions v
      where v.centre_id = v_centre and v.question_id = v_question and v.version = v_version;
      if jsonb_typeof(p_response -> 'choice') is distinct from 'number' or (p_response ->> 'choice')::numeric not between 1 and v_choices
         or (p_response ->> 'choice')::numeric <> trunc((p_response ->> 'choice')::numeric) then
        raise exception 'choose one of the options' using errcode = '22023';
      end if;
      p_response := jsonb_build_object('choice', (p_response ->> 'choice')::int);
    else
      if jsonb_typeof(p_response -> 'parts') is distinct from 'array' or jsonb_array_length(p_response -> 'parts') > 6
         or exists (select 1 from jsonb_array_elements(p_response -> 'parts') x
                    where jsonb_typeof(x) <> 'string' or length(x #>> '{}') > 200) then
        raise exception 'answer is not in the expected form' using errcode = '22023';
      end if;
      p_response := jsonb_build_object('parts', p_response -> 'parts');
    end if;
    v_correct := app.mark_answer(v_key -> 'answer', p_response);
  else
    p_response := null;
    v_correct := false;
  end if;

  insert into public.practice_attempts (centre_id, student_id, session_id, position, question_id, question_version, response, correct, gave_up)
  values (v_centre, v_student, p_session, p_position, v_question, v_version, p_response, v_correct, v_gave_up);

  update public.practice_sessions s set finished_at = now()
  where s.id = p_session and s.finished_at is null
    and not exists (
      select 1 from public.practice_items i
      where i.centre_id = v_centre and i.session_id = p_session
        and not exists (select 1 from public.practice_attempts a
                        where a.centre_id = v_centre and a.session_id = p_session and a.position = i.position));

  return app.practice_result(v_centre, p_session, p_position);
end;
$$;
