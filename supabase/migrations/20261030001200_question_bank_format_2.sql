-- Question bank format 2 (docs/question-bank-discovery.md, ADR 0011): figures in private
-- storage, topic order, self-checked answers, and marking that ignores unit powers (cm², m³).

-- ---------------------------------------------------------------------------
-- Content shapes: format 2 adds rich text (fractions), figures, up to 8 answer boxes and
-- self-checked answers. Format 1 content stays valid.
-- ---------------------------------------------------------------------------
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
         or (b ->> 'type' = 'paragraph' and jsonb_typeof(b -> 'rich') = 'array' and length(b ->> 'rich') <= 20000)
         or (b ->> 'type' = 'table' and jsonb_typeof(b -> 'rows') = 'array' and jsonb_array_length(b -> 'rows') between 1 and 50)
         or (b ->> 'type' = 'image' and jsonb_typeof(b -> 'path') = 'string' and jsonb_typeof(b -> 'width') = 'number'
             and (b ->> 'width')::numeric between 1 and 2000
             and not exists (select 1 from jsonb_object_keys(b) k where k not in ('type', 'path', 'width')))
       ))
     and (p -> 'choices' is null or jsonb_typeof(p -> 'choices') = 'null'
          or (jsonb_typeof(p -> 'choices') = 'array' and jsonb_array_length(p -> 'choices') between 2 and 6))
     and jsonb_typeof(p -> 'parts') = 'array' and jsonb_array_length(p -> 'parts') between 1 and 8;
$$;

create or replace function app.valid_question_key(p jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and (
       (p #>> '{answer,kind}' = 'choice' and jsonb_typeof(p #> '{answer,correct}') = 'number')
       or (p #>> '{answer,kind}' = 'text' and jsonb_typeof(p #> '{answer,parts}') = 'array'
           and jsonb_array_length(p #> '{answer,parts}') between 1 and 8)
       or (p #>> '{answer,kind}' = 'self')
     )
     and jsonb_typeof(p -> 'steps') = 'array';
$$;

-- ---------------------------------------------------------------------------
-- Marking
-- ---------------------------------------------------------------------------
-- Numbers in an answer, in order. As the bank pages: "cm2"/"m³" don't count as numbers,
-- "12 345" is one number unless a "/" follows (so "1 500/1000" stays three numbers), and
-- ".36" is 0.36. A minus sign makes a number negative only at the start or after a space or
-- "(" ("-5", "(−3)"), never between numbers ("33°–35°" is 33 and 35).
create or replace function app.answer_numbers(p text)
returns numeric[]
language sql immutable
set search_path = ''
as $$
  with norm as (
    select regexp_replace(regexp_replace(regexp_replace(translate(coalesce(p, ''), '−–', '--'),
             '(?<![a-z])(mm|cm|km|m)[23²³](?![0-9])', '\1', 'g'),
             '(\d)[ ,](?=\d{3}(?![0-9/]))', '\1', 'g'), '(\d)[ ,](?=\d{3}(?![0-9/]))', '\1', 'g') as s
  )
  select coalesce(array_agg(m.v[1]::numeric order by m.n), '{}')
  from norm, regexp_matches(norm.s, '((?:(?<![^\s(])-)?\d*\.?\d+)', 'g') with ordinality as m(v, n);
$$;

-- One answer box: numbers must match in order; answers without numbers compare letters; an
-- answer that is only a symbol (e.g. "÷") compares the symbols, ignoring spaces.
create or replace function app.answer_part_matches(p_expected text, p_given text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case
    when coalesce(trim(p_given), '') = '' then false
    when cardinality(app.answer_numbers(p_expected)) > 0 then app.answer_numbers(p_given) = app.answer_numbers(p_expected)
    when app.answer_letters(p_expected) <> '' then app.answer_letters(p_given) = app.answer_letters(p_expected)
    else regexp_replace(p_given, '\s', '', 'g') = regexp_replace(p_expected, '\s', '', 'g')
  end;
$$;

-- p_answer is key->'answer'; p_response is {"choice": n}, {"parts": [...]} or, for answers the
-- student checks against the worked solution, {"self": true|false}.
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
    when 'self' then coalesce(jsonb_typeof(p_response -> 'self') = 'boolean' and (p_response ->> 'self')::boolean, false)
    else false
  end;
$$;

-- Marks an answer ({"choice": n}, {"parts": [...]}, {"self": bool} or {"gave_up": true}) and
-- records it. Answering the same item twice returns the first result.
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
    -- Only the answer shape this question takes, of sensible size.
    if v_key #>> '{answer,kind}' = 'choice' then
      select jsonb_array_length(v.content -> 'choices') into v_choices from public.question_versions v
      where v.centre_id = v_centre and v.question_id = v_question and v.version = v_version;
      if jsonb_typeof(p_response -> 'choice') is distinct from 'number' or (p_response ->> 'choice')::numeric not between 1 and v_choices
         or (p_response ->> 'choice')::numeric <> trunc((p_response ->> 'choice')::numeric) then
        raise exception 'choose one of the options' using errcode = '22023';
      end if;
      p_response := jsonb_build_object('choice', (p_response ->> 'choice')::int);
    elsif v_key #>> '{answer,kind}' = 'self' then
      if jsonb_typeof(p_response -> 'self') is distinct from 'boolean' then
        raise exception 'say whether you got it right' using errcode = '22023';
      end if;
      p_response := jsonb_build_object('self', (p_response ->> 'self')::boolean);
    else
      if jsonb_typeof(p_response -> 'parts') is distinct from 'array' or jsonb_array_length(p_response -> 'parts') > 8
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

-- The worked solution of a self-checked question, so the student can compare before saying
-- whether they got it right. Only for self-checked questions in the student's own session.
create or replace function public.practice_solution(p_session uuid, p_position int)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_centre uuid; v_student uuid; v_course uuid; v_key jsonb;
begin
  select s.centre_id, s.student_id, s.course_id into v_centre, v_student, v_course
  from public.practice_sessions s where s.id = p_session;
  if v_student is null or v_student is distinct from app.my_student_id(v_centre) then
    raise exception 'not your practice session' using errcode = '42501';
  end if;
  if not app.has_course_access(v_student, v_course) or not app.has_consent(v_centre, v_student, 'service') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select k.key into v_key
  from public.practice_items i
  join public.question_keys k on k.centre_id = i.centre_id and k.question_id = i.question_id and k.version = i.question_version
  where i.centre_id = v_centre and i.session_id = p_session and i.position = p_position;
  if v_key is null or v_key #>> '{answer,kind}' is distinct from 'self' then
    raise exception 'this question is marked automatically' using errcode = '22023';
  end if;
  return jsonb_build_object('display', v_key -> 'display', 'steps', v_key -> 'steps');
end;
$$;
revoke all on function public.practice_solution(uuid, int) from public, anon;
grant execute on function public.practice_solution(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Import: topic order ("Topic 3 - …" → 3) and figures that must live in this centre's
-- and course's own folder.
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
  v_bad text;
  v_prefix text := 'centres/' || p_centre || '/question-bank/images/' || p_course || '/';
  v_added int := 0; v_changed int := 0; v_same int := 0; v_retired int := 0;
begin
  if jsonb_typeof(p_data -> 'questions') is distinct from 'array' or jsonb_array_length(p_data -> 'questions') = 0 then
    raise exception 'The file has no questions; nothing was changed.';
  end if;
  if p_data ? 'position' and (jsonb_typeof(p_data -> 'position') <> 'number' or (p_data ->> 'position')::numeric not between 0 and 999) then
    raise exception 'Topic position must be 0–999.';
  end if;
  insert into public.question_topics (centre_id, course_id, title, position)
  values (p_centre, p_course, trim(p_topic), coalesce((p_data ->> 'position')::int, 0))
  on conflict (centre_id, course_id, lower(title)) do update
    set updated_at = now(),
        position = case when p_data ? 'position' then excluded.position else public.question_topics.position end
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
    -- Figures (image blocks) must point into this centre's and course's figure folder; figures in
    -- answer keys (worked solutions) into its solutions/ folder, which students can't open early.
    select string_agg(p #>> '{}', ', ') into v_bad
      from (select p from jsonb_path_query(r.content, 'lax $.**.path') p
             where jsonb_typeof(p) <> 'string' or (p #>> '{}') !~ ('^' || v_prefix || '[0-9a-f]{64}\.(png|jpg)$')
            union all
            select p from jsonb_path_query(r.key, 'lax $.**.path') p
             where jsonb_typeof(p) <> 'string' or (p #>> '{}') !~ ('^' || v_prefix || 'solutions/[0-9a-f]{64}\.(png|jpg)$')) x;
    if v_bad is not null then raise exception 'Question %: figure path not allowed: %', r.ref, v_bad; end if;

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
-- Figures: private bucket at centres/{centre}/question-bank/images/{course}/{sha}.{ext}.
-- Question figures: the centre's staff and families whose programme covers the course today
-- (rule 12). Worked-solution figures (…/{course}/solutions/…): staff, and a student only for a
-- question in their own practice that they have answered, or that is self-checked (they open
-- its solution to mark it). Only the import job writes.
-- ---------------------------------------------------------------------------
create or replace function app.can_read_question_image(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(p_name,
    '^centres/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/question-bank/images/'
    || '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(solutions/)?[0-9a-f]{64}\.(png|jpg)$');
  v_centre uuid; v_course uuid; v_student uuid;
begin
  if m is null then return false; end if;
  v_centre := m[1]::uuid; v_course := m[2]::uuid;
  if app.is_staff(v_centre) then return true; end if;
  if m[3] is null then return app.can_learn_course(v_centre, v_course); end if;
  v_student := app.my_student_id(v_centre);
  if v_student is null or not app.has_course_access(v_student, v_course) then return false; end if;
  return exists (
    select 1
    from public.practice_sessions s
    join public.practice_items i on i.centre_id = s.centre_id and i.session_id = s.id
    join public.question_keys k on k.centre_id = i.centre_id and k.question_id = i.question_id and k.version = i.question_version
    where s.centre_id = v_centre and s.student_id = v_student and s.course_id = v_course
      and (k.key #>> '{answer,kind}' = 'self'
           or exists (select 1 from public.practice_attempts a
                      where a.centre_id = i.centre_id and a.session_id = i.session_id and a.position = i.position))
      and strpos(k.key::text, '"' || p_name || '"') > 0);
end;
$$;
revoke all on function app.can_read_question_image(text) from public;
grant execute on function app.can_read_question_image(text) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', false, 2000000, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy question_images_read on storage.objects for select to authenticated
  using (bucket_id = 'question-images' and app.can_read_question_image(name));
