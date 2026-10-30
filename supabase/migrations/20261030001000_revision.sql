-- Smart Revision: spaced reviews per sub-topic (question section), the student's own
-- confidence rating, exam dates (centre-wide and the student's own), Before-Exam Mode,
-- and question bookmarks. See ADR 0009.
--
-- Owner decisions (30 Oct 2026): topics are sub-topics (question sections); exam dates
-- come from both the centre and the student; revision materials come later.

-- ---------------------------------------------------------------------------
-- Spaced reviews
-- ---------------------------------------------------------------------------
-- One row per student per sub-topic: when it is next due and how confident they feel.
create table public.revision_states (
  centre_id         uuid not null,
  student_id        uuid not null,
  section_id        uuid not null,
  confidence        smallint check (confidence is null or confidence between 1 and 5),
  interval_days     integer not null default 0 check (interval_days between 0 and 365),
  due_on            date,
  last_reviewed_at  timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (centre_id, student_id, section_id),
  foreign key (centre_id, student_id) references public.students (centre_id, id),
  foreign key (centre_id, section_id) references public.question_sections (centre_id, id) on delete cascade
);

-- Append-only: each finished practice set reviews the sub-topics it covered.
create table public.revision_reviews (
  id             uuid not null default gen_random_uuid(),
  centre_id      uuid not null,
  student_id     uuid not null,
  section_id     uuid not null,
  session_id     uuid not null,
  answered       integer not null check (answered > 0),
  correct        integer not null check (correct between 0 and answered),
  interval_days  integer not null,
  reviewed_on    date not null,
  created_at     timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, session_id, section_id),
  foreign key (centre_id, student_id) references public.students (centre_id, id),
  foreign key (centre_id, section_id) references public.question_sections (centre_id, id) on delete cascade,
  foreign key (centre_id, session_id) references public.practice_sessions (centre_id, id)
);
create index revision_reviews_student_idx on public.revision_reviews (centre_id, student_id, reviewed_on desc);
create trigger revision_reviews_append_only before update or delete on public.revision_reviews
  for each row execute function app.reject_change();

-- ---------------------------------------------------------------------------
-- Exam dates and Before-Exam Mode
-- ---------------------------------------------------------------------------
create table public.exam_dates (
  id          uuid not null default gen_random_uuid(),
  centre_id   uuid not null references public.centres (id) on delete restrict,
  course_id   uuid not null references public.courses (id),
  student_id  uuid,                 -- null: set by the centre for everyone on the course
  name        text not null check (length(trim(name)) between 1 and 80),
  exam_on     date not null,
  created_at  timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  foreign key (centre_id, student_id) references public.students (centre_id, id)
);
create unique index exam_dates_centre_uq on public.exam_dates (centre_id, course_id, lower(name)) where student_id is null;
create index exam_dates_course_idx on public.exam_dates (centre_id, course_id, exam_on);
create trigger exam_dates_course_check before insert or update of course_id, centre_id on public.exam_dates
  for each row execute function app.check_lesson_course();

-- Before-Exam Mode, switched on by the student for one course and one exam.
create table public.revision_exam_modes (
  centre_id     uuid not null,
  student_id    uuid not null,
  course_id     uuid not null references public.courses (id),
  exam_id       uuid not null,
  activated_at  timestamptz not null default now(),
  primary key (centre_id, student_id, course_id),
  foreign key (centre_id, student_id) references public.students (centre_id, id),
  foreign key (centre_id, exam_id) references public.exam_dates (centre_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Bookmarks
-- ---------------------------------------------------------------------------
create table public.question_bookmarks (
  centre_id    uuid not null,
  student_id   uuid not null,
  question_id  uuid not null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  primary key (centre_id, student_id, question_id),
  foreign key (centre_id, student_id) references public.students (centre_id, id),
  foreign key (centre_id, question_id) references public.questions (centre_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.section_course(p_centre uuid, p_section uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select t.course_id from public.question_sections s
  join public.question_topics t on t.centre_id = s.centre_id and t.id = s.topic_id
  where s.centre_id = p_centre and s.id = p_section;
$$;

-- The exam this student is counting down to for a course (Before-Exam Mode), if any.
create or replace function app.active_exam(p_centre uuid, p_student uuid, p_course uuid)
returns date
language sql stable security definer
set search_path = ''
as $$
  select e.exam_on
  from public.revision_exam_modes m
  join public.exam_dates e on e.centre_id = m.centre_id and e.id = m.exam_id
  where m.centre_id = p_centre and m.student_id = p_student and m.course_id = p_course
    and e.exam_on >= (now() at time zone 'Asia/Singapore')::date;
$$;

-- Next review interval in days. Good (80%+) climbs the ladder 1, 3, 7, 14, 30, 60; middling
-- keeps the interval; weak (under 50%) comes back tomorrow. Before-Exam Mode halves it.
create or replace function app.next_interval(p_current int, p_answered int, p_correct int, p_exam_mode boolean)
returns int
language sql immutable
set search_path = ''
as $$
  select case when p_exam_mode then greatest(1, ceil(n / 2.0)::int) else n end
  from (
    select case
      when p_correct * 5 >= p_answered * 4 then coalesce((select min(x) from unnest(array[1, 3, 7, 14, 30, 60]) x where x > p_current), 60)
      when p_correct * 2 >= p_answered then greatest(1, p_current)
      else 1
    end as n
  ) v;
$$;

-- Explicit grants only: a blanket grant on schema app would re-open functions that
-- earlier migrations deliberately closed (e.g. app.practice_result, the XP awarders).
revoke all on function app.section_course(uuid, uuid) from public;
revoke all on function app.active_exam(uuid, uuid, uuid) from public;
revoke all on function app.next_interval(int, int, int, boolean) from public;
-- section_course and active_exam are only used inside the security-definer functions below.
grant execute on function app.next_interval(int, int, int, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers: practice feeds revision
-- ---------------------------------------------------------------------------
create or replace function app.schedule_reviews()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  v_day date := (now() at time zone 'Asia/Singapore')::date;
  v_exam date := app.active_exam(new.centre_id, new.student_id, new.course_id);
  v_cur int;
  v_due date;
  v_calc int;
  v_next int;
  v_next_due date;
begin
  for r in
    select q.section_id, count(*)::int as answered, count(*) filter (where a.correct)::int as correct
    from public.practice_attempts a
    join public.questions q on q.centre_id = a.centre_id and q.id = a.question_id
    where a.centre_id = new.centre_id and a.session_id = new.id
    group by q.section_id
  loop
    -- Lock the student's row for this sub-topic so two sets finishing together don't lose a step.
    insert into public.revision_states (centre_id, student_id, section_id)
    values (new.centre_id, new.student_id, r.section_id)
    on conflict (centre_id, student_id, section_id) do nothing;
    select coalesce(s.interval_days, 0), s.due_on into v_cur, v_due
      from public.revision_states s
     where s.centre_id = new.centre_id and s.student_id = new.student_id and s.section_id = r.section_id
       for update;

    v_calc := app.next_interval(v_cur, r.answered, r.correct, v_exam is not null);
    if r.answered >= 3 and (v_due is null or v_due <= v_day) then
      -- A real review of a sub-topic that is due (or new): move along the ladder.
      v_next := v_calc;  v_next_due := v_day + v_calc;
    elsif v_cur = 0 then
      -- First, very short practice: look again tomorrow.
      v_next := 1;  v_next_due := v_day + 1;
    elsif v_calc < v_cur then
      -- Extra practice before it was due only ever brings a weak sub-topic back sooner.
      v_next := v_calc;  v_next_due := least(v_due, v_day + v_calc);
    else
      -- Practising early or with very few questions doesn't push the review further out.
      v_next := v_cur;  v_next_due := v_due;
    end if;
    if v_exam is not null and v_exam > v_day then v_next_due := least(v_next_due, v_exam - 1); end if;
    v_next_due := greatest(v_next_due, v_day + 1);

    update public.revision_states s
       set interval_days = v_next, due_on = v_next_due, last_reviewed_at = now(), updated_at = now()
     where s.centre_id = new.centre_id and s.student_id = new.student_id and s.section_id = r.section_id;

    insert into public.revision_reviews (centre_id, student_id, section_id, session_id, answered, correct, interval_days, reviewed_on)
    values (new.centre_id, new.student_id, r.section_id, new.id, r.answered, r.correct, v_next, v_day)
    on conflict (centre_id, session_id, section_id) do nothing;
  end loop;
  return null;
end;
$$;
create trigger practice_sessions_schedule after update of finished_at on public.practice_sessions
  for each row when (old.finished_at is null and new.finished_at is not null)
  execute function app.schedule_reviews();

-- A right answer to a bookmarked question resolves the bookmark.
create or replace function app.resolve_bookmark()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.correct then
    update public.question_bookmarks b set resolved_at = now()
     where b.centre_id = new.centre_id and b.student_id = new.student_id and b.question_id = new.question_id
       and b.resolved_at is null;
  end if;
  return null;
end;
$$;
create trigger practice_attempts_resolve_bookmark after insert on public.practice_attempts
  for each row execute function app.resolve_bookmark();

revoke all on function app.schedule_reviews() from public, authenticated;
revoke all on function app.resolve_bookmark() from public, authenticated;

-- ---------------------------------------------------------------------------
-- Functions the student portal calls
-- ---------------------------------------------------------------------------
-- How confident the student feels about a sub-topic (1–5), or null to clear it.
create or replace function public.set_topic_confidence(p_centre uuid, p_section uuid, p_confidence int)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_student uuid := app.my_student_id(p_centre);
begin
  if v_student is null or not app.has_course_access(v_student, app.section_course(p_centre, p_section)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not app.has_consent(p_centre, v_student, 'service') then
    raise exception 'consent required' using errcode = '42501', hint = 'consent';
  end if;
  if p_confidence is not null and p_confidence not between 1 and 5 then
    raise exception 'confidence must be 1–5' using errcode = '22023';
  end if;
  insert into public.revision_states (centre_id, student_id, section_id, confidence)
  values (p_centre, v_student, p_section, p_confidence)
  on conflict (centre_id, student_id, section_id) do update set confidence = excluded.confidence, updated_at = now();
end;
$$;

-- Before-Exam Mode on for one exam (one per course), or off when p_exam is null. One transaction.
create or replace function public.set_exam_mode(p_centre uuid, p_course uuid, p_exam uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_student uuid := app.my_student_id(p_centre);
begin
  if v_student is null or not app.has_course_access(v_student, p_course) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.revision_exam_modes m where m.centre_id = p_centre and m.student_id = v_student and m.course_id = p_course;
  if p_exam is not null then
    if not exists (select 1 from public.exam_dates e
                   where e.centre_id = p_centre and e.id = p_exam and e.course_id = p_course
                     and (e.student_id is null or e.student_id = v_student)
                     and e.exam_on >= (now() at time zone 'Asia/Singapore')::date) then
      raise exception 'no such upcoming exam for this course' using errcode = '22023';
    end if;
    insert into public.revision_exam_modes (centre_id, student_id, course_id, exam_id) values (p_centre, v_student, p_course, p_exam);
    -- Reviews scheduled after the exam come forward to the day before it.
    update public.revision_states s
       set due_on = greatest(e.exam_on - 1, (now() at time zone 'Asia/Singapore')::date), updated_at = now()
      from public.exam_dates e
     where e.centre_id = p_centre and e.id = p_exam
       and s.centre_id = p_centre and s.student_id = v_student and s.due_on >= e.exam_on
       and app.section_course(p_centre, s.section_id) = p_course;
  end if;
end;
$$;

-- Bookmarks a question (again, if an earlier bookmark was resolved) or removes the bookmark.
create or replace function public.set_bookmark(p_centre uuid, p_question uuid, p_on boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_student uuid := app.my_student_id(p_centre);
begin
  if v_student is null then raise exception 'not a student of this centre' using errcode = '42501'; end if;
  if not p_on then
    delete from public.question_bookmarks b where b.centre_id = p_centre and b.student_id = v_student and b.question_id = p_question;
    return;
  end if;
  if not app.has_consent(p_centre, v_student, 'service') then
    raise exception 'consent required' using errcode = '42501', hint = 'consent';
  end if;
  if not exists (select 1 from public.questions q
                 where q.centre_id = p_centre and q.id = p_question and q.status = 'active'
                   and app.has_course_access(v_student, q.course_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.question_bookmarks (centre_id, student_id, question_id)
  values (p_centre, v_student, p_question)
  on conflict (centre_id, student_id, question_id) do update set resolved_at = null, created_at = now();
end;
$$;

-- Starts a practice set from the student's unresolved bookmarks (optionally one sub-topic).
create or replace function public.start_bookmark_practice(p_centre uuid, p_course uuid, p_section uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student uuid := app.my_student_id(p_centre);
  v_session uuid := gen_random_uuid();
  v_n int;
begin
  if v_student is null then raise exception 'not a student of this centre' using errcode = '42501'; end if;
  if not app.has_course_access(v_student, p_course) then
    raise exception 'no active programme for this course' using errcode = '42501';
  end if;
  if not app.has_consent(p_centre, v_student, 'service') then
    raise exception 'consent required' using errcode = '42501', hint = 'consent';
  end if;
  insert into public.practice_sessions (id, centre_id, student_id, course_id, mode, settings)
  values (v_session, p_centre, v_student, p_course, 'manual', jsonb_build_object('source', 'bookmarks', 'section', p_section));
  insert into public.practice_items (centre_id, session_id, position, question_id, question_version)
  select p_centre, v_session, row_number() over (order by b.created_at), q.id, q.current_version
  from public.question_bookmarks b
  join public.questions q on q.centre_id = b.centre_id and q.id = b.question_id
  where b.centre_id = p_centre and b.student_id = v_student and b.resolved_at is null
    and q.course_id = p_course and q.status = 'active' and (p_section is null or q.section_id = p_section)
  order by b.created_at
  limit 15;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'no bookmarked questions to practise' using errcode = 'P0002'; end if;
  return v_session;
end;
$$;

-- Everything Smart Revision shows, for the signed-in student: one row per sub-topic of the
-- courses their programme covers today, their upcoming exams, and this week's reviews.
create or replace function public.my_revision(p_centre uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with me as (select app.my_student_id(p_centre) as id),
  today as (select (now() at time zone 'Asia/Singapore')::date as d),
  courses as (
    select distinct pc.course_id
    from public.programme_enrolments pe
    join public.programme_courses pc on pc.centre_id = pe.centre_id and pc.programme_id = pe.programme_id
    join public.programmes p on p.centre_id = pe.centre_id and p.id = pe.programme_id, me, today
    where pe.centre_id = p_centre and pe.student_id = me.id and p.status = 'active'
      and today.d between pe.valid_from and pe.valid_until
  ),
  sections as (
    select s.id, s.title, s.number, t.title as topic, t.course_id
    from public.question_sections s
    join public.question_topics t on t.centre_id = s.centre_id and t.id = s.topic_id
    where s.centre_id = p_centre and t.course_id in (select course_id from courses)
      and exists (select 1 from public.questions q where q.centre_id = s.centre_id and q.section_id = s.id and q.status = 'active')
  ),
  recent as (  -- the latest 20 answers per sub-topic
    select q.section_id, a.correct, a.created_at,
           row_number() over (partition by q.section_id order by a.created_at desc) as n
    from public.practice_attempts a
    join public.questions q on q.centre_id = a.centre_id and q.id = a.question_id, me
    where a.centre_id = p_centre and a.student_id = me.id
  ),
  stats as (
    select section_id, count(*) filter (where n <= 20) as tried, count(*) filter (where n <= 20 and correct) as correct,
           max(created_at) as last_attempted_at
    from recent group by section_id
  ),
  marks as (
    select q.section_id, count(*) filter (where b.resolved_at is null) as unresolved, count(*) filter (where b.resolved_at is not null) as resolved
    from public.question_bookmarks b
    join public.questions q on q.centre_id = b.centre_id and q.id = b.question_id, me
    where b.centre_id = p_centre and b.student_id = me.id
    group by q.section_id
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'today', (select to_char(d, 'YYYY-MM-DD') from today),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section_id', s.id, 'title', s.title, 'number', s.number, 'topic', s.topic, 'course_id', s.course_id,
        'tried', coalesce(st.tried, 0), 'correct', coalesce(st.correct, 0), 'last_attempted_at', st.last_attempted_at,
        'confidence', rs.confidence, 'interval_days', rs.interval_days, 'due_on', rs.due_on,
        'last_reviewed_at', rs.last_reviewed_at,
        'bookmarks_unresolved', coalesce(m.unresolved, 0), 'bookmarks_resolved', coalesce(m.resolved, 0)) order by s.course_id, s.topic, s.number)
      from sections s
      left join stats st on st.section_id = s.id
      left join public.revision_states rs on rs.centre_id = p_centre and rs.student_id = (select id from me) and rs.section_id = s.id
      left join marks m on m.section_id = s.id), '[]'::jsonb),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'course_id', e.course_id, 'name', e.name, 'exam_on', e.exam_on, 'own', e.student_id is not null,
        'active', exists (select 1 from public.revision_exam_modes m2 where m2.centre_id = p_centre and m2.student_id = (select id from me) and m2.exam_id = e.id))
        order by e.exam_on)
      from public.exam_dates e, today
      where e.centre_id = p_centre and e.course_id in (select course_id from courses) and e.exam_on >= today.d
        and (e.student_id is null or e.student_id = (select id from me))), '[]'::jsonb),
    'review_days', coalesce((
      select jsonb_agg(distinct to_char(r.reviewed_on, 'YYYY-MM-DD'))
      from public.revision_reviews r, today
      where r.centre_id = p_centre and r.student_id = (select id from me) and r.reviewed_on > today.d - 60), '[]'::jsonb),
    'week_reviews', coalesce((
      select jsonb_agg(jsonb_build_object('section_id', r.section_id, 'answered', r.answered, 'correct', r.correct, 'on', r.reviewed_on))
      from public.revision_reviews r, today
      where r.centre_id = p_centre and r.student_id = (select id from me)
        and r.reviewed_on >= today.d - ((extract(isodow from today.d)::int) - 1)), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.set_topic_confidence(uuid, uuid, int) from public, anon;
revoke all on function public.start_bookmark_practice(uuid, uuid, uuid) from public, anon;
revoke all on function public.my_revision(uuid) from public, anon;
revoke all on function public.set_exam_mode(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_bookmark(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_bookmark(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_exam_mode(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_topic_confidence(uuid, uuid, int) to authenticated;
grant execute on function public.start_bookmark_practice(uuid, uuid, uuid) to authenticated;
grant execute on function public.my_revision(uuid) to authenticated;

-- Centre exam dates from the timetable spreadsheet's "Exams" sheet (service role only).
-- Each row is upserted by course and exam name; upcoming centre exams for the same courses
-- that are no longer listed are removed (students who chose them leave Before-Exam Mode).
-- p_exams = [{course_id, name, exam_on}]
create or replace function public.apply_exam_dates(p_centre uuid, p_exams jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare v_n int;
begin
  -- Before-Exam Mode ends once its exam has passed, and when the centre moves the exam's date
  -- (so last year's mode never switches itself back on for next year's exam).
  delete from public.revision_exam_modes m
   using public.exam_dates e
   where m.centre_id = p_centre and e.centre_id = m.centre_id and e.id = m.exam_id
     and (e.exam_on < (now() at time zone 'Asia/Singapore')::date
          or (e.student_id is null and exists (
                select 1 from jsonb_array_elements(p_exams) x
                where (x ->> 'course_id')::uuid = e.course_id and lower(trim(x ->> 'name')) = lower(e.name)
                  and (x ->> 'exam_on')::date <> e.exam_on)));
  delete from public.exam_dates e
   where e.centre_id = p_centre and e.student_id is null
     and e.exam_on >= (now() at time zone 'Asia/Singapore')::date
     and e.course_id in (select (x ->> 'course_id')::uuid from jsonb_array_elements(p_exams) x)
     and not exists (select 1 from jsonb_array_elements(p_exams) x
                     where (x ->> 'course_id')::uuid = e.course_id and lower(trim(x ->> 'name')) = lower(e.name));
  insert into public.exam_dates (centre_id, course_id, name, exam_on)
  select distinct on ((x ->> 'course_id')::uuid, lower(trim(x ->> 'name')))
         p_centre, (x ->> 'course_id')::uuid, trim(x ->> 'name'), (x ->> 'exam_on')::date
  from jsonb_array_elements(p_exams) x
  order by (x ->> 'course_id')::uuid, lower(trim(x ->> 'name'))
  on conflict (centre_id, course_id, lower(name)) where student_id is null do update set exam_on = excluded.exam_on;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.apply_exam_dates(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_exam_dates(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.revision_states enable row level security;      alter table public.revision_states force row level security;
alter table public.revision_reviews enable row level security;     alter table public.revision_reviews force row level security;
alter table public.exam_dates enable row level security;           alter table public.exam_dates force row level security;
alter table public.revision_exam_modes enable row level security;  alter table public.revision_exam_modes force row level security;
alter table public.question_bookmarks enable row level security;   alter table public.question_bookmarks force row level security;

-- Revision state and history: read by the family and staff; written only by the functions above.
create policy revision_states_select on public.revision_states for select to authenticated
  using ((select app.is_staff(centre_id)) or student_id in (select app.family_student_ids(centre_id)));
create policy revision_reviews_select on public.revision_reviews for select to authenticated
  using ((select app.is_staff(centre_id)) or student_id in (select app.family_student_ids(centre_id)));
revoke insert, update, delete on public.revision_states, public.revision_reviews from anon, authenticated;

-- Exam dates: staff manage; families read the centre's for their courses and their own;
-- a student adds and removes their own for courses they're entitled to.
create policy exam_dates_staff on public.exam_dates for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy exam_dates_family_select on public.exam_dates for select to authenticated
  using ((student_id is null and (select app.can_learn_course(centre_id, course_id)))
         or student_id in (select app.family_student_ids(centre_id)));
create policy exam_dates_student_insert on public.exam_dates for insert to authenticated
  with check (student_id = (select app.my_student_id(centre_id))
              and (select app.has_course_access(student_id, course_id))
              and (select app.has_consent(centre_id, student_id, 'service'))
              and exam_on >= (now() at time zone 'Asia/Singapore')::date
              and exam_on <= (now() at time zone 'Asia/Singapore')::date + 730);
create policy exam_dates_student_delete on public.exam_dates for delete to authenticated
  using (student_id = (select app.my_student_id(centre_id)));
revoke update on public.exam_dates from authenticated;

-- Before-Exam Mode: read by the family and staff; switched only through set_exam_mode().
create policy revision_exam_modes_select on public.revision_exam_modes for select to authenticated
  using ((select app.is_staff(centre_id)) or student_id in (select app.family_student_ids(centre_id)));
revoke insert, update, delete on public.revision_exam_modes from anon, authenticated;

-- Bookmarks: read by the family and staff; the student changes their own only through set_bookmark().
create policy question_bookmarks_select on public.question_bookmarks for select to authenticated
  using ((select app.is_staff(centre_id)) or student_id in (select app.family_student_ids(centre_id)));
-- Added, re-opened and removed only through set_bookmark().
revoke insert, update, delete on public.question_bookmarks from anon, authenticated;
