-- Rewards: XP ledger, streaks and badges. See ADR 0008.
--
-- XP is an append-only ledger (CLAUDE.md data rules). Rows are written only by triggers
-- on learning activity, never by students. Totals, levels, streaks and badges are
-- derived when read (public.my_rewards), never stored as editable numbers.
--
-- Owner decisions (30 Oct 2026), as in the Aspire Online mockup:
--   finished practice set: +1 / +2 / +3 XP for 5 / 10 / 15 questions, +1 more at 80%+ correct
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
  v_total int; v_correct int; v_xp int;
begin
  select count(*) into v_total from public.practice_items i where i.centre_id = new.centre_id and i.session_id = new.id;
  select count(*) filter (where a.correct) into v_correct
    from public.practice_attempts a where a.centre_id = new.centre_id and a.session_id = new.id;
  v_xp := least(v_total / 5, 3);
  if v_xp > 0 then
    insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date)
    values (new.centre_id, new.student_id, 'practice_set', v_xp, new.id,
            format('Practice completed · %s/%s correct', v_correct, v_total), (new.finished_at at time zone 'Asia/Singapore')::date)
    on conflict (centre_id, student_id, reason, source_id) where source_id is not null do nothing;
    if v_correct * 5 >= v_total * 4 then
      insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date)
      values (new.centre_id, new.student_id, 'practice_accuracy', 1, new.id, '80% or more correct',
              (new.finished_at at time zone 'Asia/Singapore')::date)
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
           left('Lesson part completed: ' || p.title, 200), (new.completed_at at time zone 'Asia/Singapore')::date
    from public.lesson_parts p where p.centre_id = new.centre_id and p.id = new.lesson_part_id
    on conflict (centre_id, student_id, reason, source_id) where source_id is not null do nothing;
    perform app.award_streak(new.centre_id, new.student_id, new.completed_at);
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
    select distinct x.activity_date as d from ledger x where x.reason = 'streak_bonus'
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
select s.centre_id, s.student_id, 'practice_set', least(t.total / 5, 3), s.id,
       format('Practice completed · %s/%s correct', t.correct, t.total), (s.finished_at at time zone 'Asia/Singapore')::date, s.finished_at
from public.practice_sessions s
cross join lateral (
  select (select count(*) from public.practice_items i where i.centre_id = s.centre_id and i.session_id = s.id)::int as total,
         (select count(*) from public.practice_attempts a where a.centre_id = s.centre_id and a.session_id = s.id and a.correct)::int as correct
) t
where s.finished_at is not null and t.total >= 5
on conflict do nothing;

insert into public.xp_ledger (centre_id, student_id, reason, amount, source_id, note, activity_date, created_at)
select s.centre_id, s.student_id, 'practice_accuracy', 1, s.id, '80% or more correct', (s.finished_at at time zone 'Asia/Singapore')::date, s.finished_at
from public.practice_sessions s
cross join lateral (
  select (select count(*) from public.practice_items i where i.centre_id = s.centre_id and i.session_id = s.id)::int as total,
         (select count(*) from public.practice_attempts a where a.centre_id = s.centre_id and a.session_id = s.id and a.correct)::int as correct
) t
where s.finished_at is not null and t.total >= 5 and t.correct * 5 >= t.total * 4
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
