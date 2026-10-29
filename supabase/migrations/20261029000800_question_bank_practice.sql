-- Question bank (topics, sections, questions with immutable versions and separate answer
-- keys) and Practice (sessions, items, attempts). See ADR 0007 and
-- docs/question-bank-discovery.md.
--
-- Students can read question content for courses an active programme covers today
-- (rule 12) but never the answer keys: answers are marked inside the database by
-- public.submit_practice_answer(), which only then returns the answer and worked steps.
-- Students write nothing directly; practice sessions and attempts are created by
-- security-definer functions that check entitlement and consent.

create type public.question_status as enum ('active', 'retired');
create type public.practice_mode as enum ('adaptive', 'manual');

-- ---------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------
create table public.question_topics (
  id          uuid not null default gen_random_uuid(),
  centre_id   uuid not null references public.centres (id) on delete restrict,
  course_id   uuid not null references public.courses (id),
  title       text not null check (length(title) between 1 and 120),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id)
);
create unique index question_topics_title_uq on public.question_topics (centre_id, course_id, lower(title));

create table public.question_sections (
  id          uuid not null default gen_random_uuid(),
  centre_id   uuid not null,
  topic_id    uuid not null,
  number      integer not null check (number between 1 and 999),
  title       text not null check (length(title) between 1 and 200),
  created_at  timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, topic_id, id),
  unique (centre_id, topic_id, number),
  foreign key (centre_id, topic_id) references public.question_topics (centre_id, id) on delete cascade
);

create table public.questions (
  id               uuid not null default gen_random_uuid(),
  centre_id        uuid not null,
  course_id        uuid not null references public.courses (id),
  topic_id         uuid not null,
  section_id       uuid not null,
  external_ref     text not null check (length(external_ref) between 1 and 40),
  group_ref        text not null check (length(group_ref) between 1 and 40),
  difficulty       smallint not null check (difficulty between 1 and 3),
  strategy         text check (strategy is null or length(strategy) <= 80),
  marks            smallint check (marks is null or marks between 1 and 20),
  source_ref       text check (source_ref is null or length(source_ref) <= 200),
  current_version  integer not null default 1 check (current_version >= 1),
  status           public.question_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, topic_id, external_ref),
  foreign key (centre_id, topic_id) references public.question_topics (centre_id, id),
  foreign key (centre_id, topic_id, section_id) references public.question_sections (centre_id, topic_id, id)
);
create index questions_pick_idx on public.questions (centre_id, course_id, status, section_id, difficulty);
create index questions_group_idx on public.questions (centre_id, topic_id, group_ref);

-- What students see. Immutable: a change creates a new version.
create table public.question_versions (
  centre_id    uuid not null,
  question_id  uuid not null,
  version      integer not null check (version >= 1),
  content      jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (centre_id, question_id, version),
  foreign key (centre_id, question_id) references public.questions (centre_id, id) on delete cascade
);

-- Answers, explanations and worked steps. Never readable by students.
create table public.question_keys (
  centre_id    uuid not null,
  question_id  uuid not null,
  version      integer not null,
  key          jsonb not null,
  primary key (centre_id, question_id, version),
  foreign key (centre_id, question_id, version) references public.question_versions (centre_id, question_id, version) on delete cascade
);

create table public.question_imports (
  id             uuid not null default gen_random_uuid(),
  centre_id      uuid not null references public.centres (id) on delete restrict,
  topic_id       uuid not null,
  source_path    text not null check (source_path like 'centres/' || centre_id::text || '/%'),
  source_sha256  text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  counts         jsonb not null,
  imported_at    timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  foreign key (centre_id, topic_id) references public.question_topics (centre_id, id)
);

-- Shape checks that hold for every version, whoever writes it.
create or replace function app.valid_question_content(p jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and jsonb_typeof(p -> 'blocks') = 'array' and jsonb_array_length(p -> 'blocks') between 1 and 50
     and not exists (
       select 1 from jsonb_array_elements(p -> 'blocks') b
       where not (
         (b ->> 'type' = 'paragraph' and jsonb_typeof(b -> 'text') = 'string' and length(b ->> 'text') <= 4000)
         or (b ->> 'type' = 'table' and jsonb_typeof(b -> 'rows') = 'array' and jsonb_array_length(b -> 'rows') between 1 and 50)
       ))
     and (p -> 'choices' is null or jsonb_typeof(p -> 'choices') = 'null'
          or (jsonb_typeof(p -> 'choices') = 'array' and jsonb_array_length(p -> 'choices') between 2 and 6))
     and jsonb_typeof(p -> 'parts') = 'array' and jsonb_array_length(p -> 'parts') between 1 and 6;
$$;
alter table public.question_versions add constraint question_versions_content_check check (app.valid_question_content(content));

create or replace function app.valid_question_key(p jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and (
       (p #>> '{answer,kind}' = 'choice' and jsonb_typeof(p #> '{answer,correct}') = 'number')
       or (p #>> '{answer,kind}' = 'text' and jsonb_typeof(p #> '{answer,parts}') = 'array'
           and jsonb_array_length(p #> '{answer,parts}') between 1 and 6)
     )
     and jsonb_typeof(p -> 'steps') = 'array';
$$;
alter table public.question_keys add constraint question_keys_key_check check (app.valid_question_key(key));

create trigger question_topics_course_check before insert or update of course_id, centre_id on public.question_topics
  for each row execute function app.check_lesson_course();
create trigger questions_course_check before insert or update of course_id, centre_id on public.questions
  for each row execute function app.check_lesson_course();

-- ---------------------------------------------------------------------------
-- Practice
-- ---------------------------------------------------------------------------
create table public.practice_sessions (
  id           uuid not null default gen_random_uuid(),
  centre_id    uuid not null,
  student_id   uuid not null,
  course_id    uuid not null references public.courses (id),
  mode         public.practice_mode not null,
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz,
  primary key (id),
  unique (centre_id, id),
  foreign key (centre_id, student_id) references public.students (centre_id, id)
);
create index practice_sessions_student_idx on public.practice_sessions (centre_id, student_id, created_at desc);

create table public.practice_items (
  centre_id         uuid not null,
  session_id        uuid not null,
  position          integer not null check (position between 1 and 50),
  question_id       uuid not null,
  question_version  integer not null,
  primary key (centre_id, session_id, position),
  unique (centre_id, session_id, question_id),
  foreign key (centre_id, session_id) references public.practice_sessions (centre_id, id) on delete cascade,
  foreign key (centre_id, question_id, question_version) references public.question_versions (centre_id, question_id, version)
);

-- Append-only: one attempt per item, recording the version the student was given.
create table public.practice_attempts (
  id                uuid not null default gen_random_uuid(),
  centre_id         uuid not null,
  student_id        uuid not null,
  session_id        uuid not null,
  position          integer not null,
  question_id       uuid not null,
  question_version  integer not null,
  response          jsonb,
  correct           boolean not null,
  gave_up           boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, session_id, position),
  check (not (gave_up and correct)),
  foreign key (centre_id, session_id, position) references public.practice_items (centre_id, session_id, position),
  foreign key (centre_id, student_id) references public.students (centre_id, id),
  foreign key (centre_id, question_id, question_version) references public.question_versions (centre_id, question_id, version)
);
create index practice_attempts_student_idx on public.practice_attempts (centre_id, student_id, question_id);

-- ---------------------------------------------------------------------------
-- Marking (the same rules as the centre's original question bank page)
-- ---------------------------------------------------------------------------
-- Numbers in a text, in order. "503 618" and "503,618" are one number; units are ignored.
create or replace function app.answer_numbers(p text)
returns numeric[]
language sql immutable
set search_path = ''
as $$
  with norm as (
    select regexp_replace(regexp_replace(translate(coalesce(p, ''), '−–', '--'),
             '(\d)[ ,](?=\d{3}(?!\d))', '\1', 'g'), '(\d)[ ,](?=\d{3}(?!\d))', '\1', 'g') as s
  )
  select coalesce(array_agg(m.v[1]::numeric order by m.n), '{}')
  from norm, regexp_matches(norm.s, '(\d+(?:\.\d+)?)', 'g') with ordinality as m(v, n);
$$;

create or replace function app.answer_letters(p text)
returns text
language sql immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(lower(coalesce(p, '')), '\mand\M', '', 'g'), '[^a-z]', '', 'g');
$$;

-- One answer box: numbers must match in order; answers without numbers compare letters.
create or replace function app.answer_part_matches(p_expected text, p_given text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case
    when coalesce(trim(p_given), '') = '' then false
    when cardinality(app.answer_numbers(p_expected)) > 0 then app.answer_numbers(p_given) = app.answer_numbers(p_expected)
    else app.answer_letters(p_given) = app.answer_letters(p_expected) and app.answer_letters(p_expected) <> ''
  end;
$$;

-- p_answer is key->'answer'; p_response is {"choice": n} or {"parts": ["…", …]}.
create or replace function app.mark_answer(p_answer jsonb, p_response jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case p_answer ->> 'kind'
    when 'choice' then jsonb_typeof(p_response -> 'choice') = 'number'
                       and (p_response ->> 'choice')::numeric = (p_answer ->> 'correct')::numeric
    when 'text' then jsonb_typeof(p_response -> 'parts') = 'array'
                     and jsonb_array_length(p_response -> 'parts') = jsonb_array_length(p_answer -> 'parts')
                     and not exists (
                       select 1
                       from jsonb_array_elements(p_answer -> 'parts') with ordinality e(part, n)
                       where not app.answer_part_matches(e.part ->> 'text', p_response -> 'parts' ->> (e.n::int - 1)))
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function app.can_learn_topic(p_centre uuid, p_topic uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_topics t
    where t.centre_id = p_centre and t.id = p_topic and app.can_learn_course(p_centre, t.course_id));
$$;

create or replace function app.can_read_question(p_centre uuid, p_question uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.questions q
    where q.centre_id = p_centre and q.id = p_question and app.can_learn_course(p_centre, q.course_id));
$$;

-- The caller's own student record in a centre (students only; guardians don't practise for them).
create or replace function app.my_student_id(p_centre uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select s from app.my_student_ids(p_centre) s limit 1;
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Practice functions (called with the student's session)
-- ---------------------------------------------------------------------------
-- Picks questions and creates a practice session. Adaptive mode favours the sections
-- where the student is least accurate; both modes favour questions not yet solved and
-- take at most one variant per group.
create or replace function public.start_practice(
  p_centre uuid, p_course uuid, p_mode public.practice_mode,
  p_sections uuid[], p_difficulties int[], p_count int)
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
  if p_count is null or p_count not between 1 and 30 then raise exception 'count must be 1–30' using errcode = '22023'; end if;
  if p_difficulties is not null and not (p_difficulties <@ array[1, 2, 3]) then
    raise exception 'difficulty must be 1–3' using errcode = '22023';
  end if;

  insert into public.practice_sessions (id, centre_id, student_id, course_id, mode, settings)
  values (v_session, p_centre, v_student, p_course, p_mode,
          jsonb_build_object('sections', coalesce(to_jsonb(p_sections), '[]'), 'difficulties', coalesce(to_jsonb(p_difficulties), '[]'),
                             'count', p_count));

  with accuracy as (
    select q.section_id, avg(case when a.correct then 1.0 else 0.0 end) as acc
    from public.practice_attempts a
    join public.questions q on q.centre_id = a.centre_id and q.id = a.question_id
    where a.centre_id = p_centre and a.student_id = v_student and q.course_id = p_course
    group by q.section_id
  ),
  candidates as (
    select q.id, q.group_ref, q.current_version,
           coalesce(acc.acc, 0.5) as section_acc,
           exists (select 1 from public.practice_attempts a
                   where a.centre_id = p_centre and a.student_id = v_student and a.question_id = q.id and a.correct) as solved,
           random() as r
    from public.questions q
    left join accuracy acc on acc.section_id = q.section_id
    where q.centre_id = p_centre and q.course_id = p_course and q.status = 'active'
      and (coalesce(cardinality(p_sections), 0) = 0 or q.section_id = any (p_sections))
      and (coalesce(cardinality(p_difficulties), 0) = 0 or q.difficulty = any (p_difficulties))
  ),
  one_per_group as (
    select distinct on (c.group_ref) c.* from candidates c order by c.group_ref, c.solved, c.r
  ),
  picked as (
    select g.*, row_number() over (
             order by g.solved,
                      case when p_mode = 'adaptive' then round(g.section_acc, 1) else 0 end,
                      g.r) as position
    from one_per_group g
    order by position
    limit p_count
  )
  insert into public.practice_items (centre_id, session_id, position, question_id, question_version)
  select p_centre, v_session, p.position, p.id, p.current_version from picked p;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'no questions match these choices' using errcode = 'P0002'; end if;
  return v_session;
end;
$$;

-- The result of one answered item: what the student gave, whether it was right, and
-- the answer key (only ever returned after an attempt exists).
create or replace function app.practice_result(p_centre uuid, p_session uuid, p_position int)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'position', a.position, 'correct', a.correct, 'gave_up', a.gave_up, 'response', a.response,
    'answer', k.key -> 'answer', 'display', k.key -> 'display', 'why_not', k.key -> 'why_not', 'steps', k.key -> 'steps')
  from public.practice_attempts a
  join public.question_keys k on k.centre_id = a.centre_id and k.question_id = a.question_id and k.version = a.question_version
  where a.centre_id = p_centre and a.session_id = p_session and a.position = p_position;
$$;
revoke all on function app.practice_result(uuid, uuid, int) from public, authenticated;

-- Marks an answer ({"choice": n}, {"parts": [...]} or {"gave_up": true}) and records it.
-- Answering the same item twice returns the first result.
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
  from public.practice_sessions s where s.id = p_session;
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
      if jsonb_typeof(p_response -> 'choice') is distinct from 'number' or (p_response ->> 'choice')::numeric not between 1 and v_choices then
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

-- Results of every answered item in a session (for reloading a session page).
create or replace function public.practice_results(p_session uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.practice_result(s.centre_id, s.id, a.position) order by a.position), '[]'::jsonb)
  from public.practice_sessions s
  join public.practice_attempts a on a.centre_id = s.centre_id and a.session_id = s.id
  where s.id = p_session
    and (s.student_id = app.my_student_id(s.centre_id)
         or s.student_id in (select app.guardian_student_ids(s.centre_id))
         or app.is_staff(s.centre_id));
$$;

-- Accuracy per section for the signed-in student in one course (for the setup page).
create or replace function public.practice_section_stats(p_centre uuid, p_course uuid)
returns table (section_id uuid, tried bigint, correct bigint)
language sql stable security definer
set search_path = ''
as $$
  select q.section_id, count(*), count(*) filter (where a.correct)
  from public.practice_attempts a
  join public.questions q on q.centre_id = a.centre_id and q.id = a.question_id
  where a.centre_id = p_centre and a.student_id = app.my_student_id(p_centre) and q.course_id = p_course
  group by q.section_id;
$$;

-- Active questions per section and difficulty (runs as the caller, so RLS applies).
create or replace function public.practice_question_counts(p_centre uuid, p_course uuid)
returns table (section_id uuid, difficulty smallint, questions bigint)
language sql stable
set search_path = ''
as $$
  select q.section_id, q.difficulty, count(*)
  from public.questions q
  where q.centre_id = p_centre and q.course_id = p_course and q.status = 'active'
  group by q.section_id, q.difficulty;
$$;
revoke all on function public.practice_question_counts(uuid, uuid) from public, anon;
grant execute on function public.practice_question_counts(uuid, uuid) to authenticated;

revoke all on function public.start_practice(uuid, uuid, public.practice_mode, uuid[], int[], int) from public, anon;
revoke all on function public.submit_practice_answer(uuid, int, jsonb) from public, anon;
revoke all on function public.practice_results(uuid) from public, anon;
revoke all on function public.practice_section_stats(uuid, uuid) from public, anon;
grant execute on function public.start_practice(uuid, uuid, public.practice_mode, uuid[], int[], int) to authenticated;
grant execute on function public.submit_practice_answer(uuid, int, jsonb) to authenticated;
grant execute on function public.practice_results(uuid) to authenticated;
grant execute on function public.practice_section_stats(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Import (service role only; called by the GitHub job). One transaction per file.
-- p_data = {"sections": [{number, title}],
--           "questions": [{ref, group, section, difficulty, strategy, marks, source, content, key}]}
-- A question whose content or key changed gets a new version; questions missing from
-- the file are retired (kept for history, no longer picked).
-- ---------------------------------------------------------------------------
create or replace function public.import_question_bank(
  p_centre uuid, p_course uuid, p_topic text, p_source_path text, p_sha256 text, p_data jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_topic uuid;
  r record;
  v_section uuid;
  v_q record;
  v_added int := 0; v_changed int := 0; v_same int := 0; v_retired int := 0;
begin
  insert into public.question_topics (centre_id, course_id, title)
  values (p_centre, p_course, trim(p_topic))
  on conflict (centre_id, course_id, lower(title)) do update set updated_at = now()
  returning id into v_topic;

  for r in select * from jsonb_to_recordset(p_data -> 'sections') as x(number int, title text) loop
    insert into public.question_sections (centre_id, topic_id, number, title)
    values (p_centre, v_topic, r.number, trim(r.title))
    on conflict (centre_id, topic_id, number) do update set title = excluded.title;
  end loop;

  for r in
    select * from jsonb_to_recordset(p_data -> 'questions') as x(
      ref text, "group" text, section int, difficulty int, strategy text, marks int, source text, content jsonb, key jsonb)
  loop
    select s.id into v_section from public.question_sections s
    where s.centre_id = p_centre and s.topic_id = v_topic and s.number = r.section;
    if v_section is null then raise exception 'Question %: unknown section %', r.ref, r.section; end if;

    select q.id, q.current_version, v.content, k.key into v_q
    from public.questions q
    join public.question_versions v on v.centre_id = q.centre_id and v.question_id = q.id and v.version = q.current_version
    join public.question_keys k on k.centre_id = q.centre_id and k.question_id = q.id and k.version = q.current_version
    where q.centre_id = p_centre and q.topic_id = v_topic and q.external_ref = r.ref;

    if v_q.id is null then
      insert into public.questions (centre_id, course_id, topic_id, section_id, external_ref, group_ref, difficulty, strategy, marks, source_ref)
      values (p_centre, p_course, v_topic, v_section, r.ref, r."group", r.difficulty, r.strategy, r.marks, r.source)
      returning id, current_version into v_q;
      insert into public.question_versions (centre_id, question_id, version, content) values (p_centre, v_q.id, 1, r.content);
      insert into public.question_keys (centre_id, question_id, version, key) values (p_centre, v_q.id, 1, r.key);
      v_added := v_added + 1;
    else
      update public.questions q
         set section_id = v_section, group_ref = r."group", difficulty = r.difficulty, strategy = r.strategy,
             marks = r.marks, source_ref = r.source, status = 'active',
             current_version = case when v_q.content = r.content and v_q.key = r.key then q.current_version else q.current_version + 1 end
       where q.id = v_q.id;
      if v_q.content = r.content and v_q.key = r.key then
        v_same := v_same + 1;
      else
        insert into public.question_versions (centre_id, question_id, version, content) values (p_centre, v_q.id, v_q.current_version + 1, r.content);
        insert into public.question_keys (centre_id, question_id, version, key) values (p_centre, v_q.id, v_q.current_version + 1, r.key);
        v_changed := v_changed + 1;
      end if;
    end if;
  end loop;

  update public.questions q set status = 'retired'
   where q.centre_id = p_centre and q.topic_id = v_topic and q.status = 'active'
     and q.external_ref not in (select x ->> 'ref' from jsonb_array_elements(p_data -> 'questions') x);
  get diagnostics v_retired = row_count;

  insert into public.question_imports (centre_id, topic_id, source_path, source_sha256, counts)
  values (p_centre, v_topic, p_source_path, p_sha256,
          jsonb_build_object('added', v_added, 'changed', v_changed, 'unchanged', v_same, 'retired', v_retired));

  return jsonb_build_object('topic_id', v_topic, 'added', v_added, 'changed', v_changed, 'unchanged', v_same, 'retired', v_retired);
end;
$$;
revoke all on function public.import_question_bank(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_question_bank(uuid, uuid, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger question_topics_touch before update on public.question_topics for each row execute function app.touch_updated_at();
create trigger questions_touch before update on public.questions for each row execute function app.touch_updated_at();
create trigger question_imports_audit after insert or update or delete on public.question_imports for each row execute function app.audit_row();

-- Versions, keys and attempts are history: never edited.
create or replace function app.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows cannot be changed', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;
create trigger question_versions_immutable before update on public.question_versions for each row execute function app.reject_change();
create trigger question_keys_immutable before update on public.question_keys for each row execute function app.reject_change();
create trigger practice_attempts_append_only before update or delete on public.practice_attempts for each row execute function app.reject_change();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.question_topics enable row level security;    alter table public.question_topics force row level security;
alter table public.question_sections enable row level security;  alter table public.question_sections force row level security;
alter table public.questions enable row level security;          alter table public.questions force row level security;
alter table public.question_versions enable row level security;  alter table public.question_versions force row level security;
alter table public.question_keys enable row level security;      alter table public.question_keys force row level security;
alter table public.question_imports enable row level security;   alter table public.question_imports force row level security;
alter table public.practice_sessions enable row level security;  alter table public.practice_sessions force row level security;
alter table public.practice_items enable row level security;     alter table public.practice_items force row level security;
alter table public.practice_attempts enable row level security;  alter table public.practice_attempts force row level security;

-- Content: staff manage; learners read what an active programme covers today.
create policy question_topics_staff on public.question_topics for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy question_topics_learner_select on public.question_topics for select to authenticated
  using ((select app.can_learn_course(centre_id, course_id)));

create policy question_sections_staff on public.question_sections for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy question_sections_learner_select on public.question_sections for select to authenticated
  using ((select app.can_learn_topic(centre_id, topic_id)));

create policy questions_staff on public.questions for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy questions_learner_select on public.questions for select to authenticated
  using (status = 'active' and (select app.can_learn_course(centre_id, course_id)));

create policy question_versions_staff on public.question_versions for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy question_versions_learner_select on public.question_versions for select to authenticated
  using ((select app.can_read_question(centre_id, question_id)));

-- Keys and imports: staff only.
create policy question_keys_staff on public.question_keys for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy question_imports_staff_select on public.question_imports for select to authenticated
  using ((select app.is_staff(centre_id)));

-- Practice: read-only to the family and staff; written only by the functions above.
create policy practice_sessions_select on public.practice_sessions for select to authenticated
  using ((select app.is_staff(centre_id)) or student_id in (select app.family_student_ids(centre_id)));
create policy practice_items_select on public.practice_items for select to authenticated
  using ((select app.is_staff(centre_id)) or session_id in (
    select s.id from public.practice_sessions s
    where s.centre_id = practice_items.centre_id and s.student_id in (select app.family_student_ids(practice_items.centre_id))));
create policy practice_attempts_select on public.practice_attempts for select to authenticated
  using ((select app.is_staff(centre_id)) or student_id in (select app.family_student_ids(centre_id)));

revoke insert, update, delete on public.practice_sessions, public.practice_items, public.practice_attempts from anon, authenticated;
revoke insert, update, delete on public.question_imports from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bank files waiting for import, and the originals kept for traceability
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('question-inbox', 'question-inbox', false, 20971520),
       ('question-sources', 'question-sources', false, 20971520)
on conflict (id) do nothing;
