-- Smart Revision part 2: "Recommended for you" (ADR 0010).
-- The centre lists offers (e.g. an intensive revision programme) for a question-bank topic, either
-- the whole topic or some of its sub-topics. A student sees an offer only when one of those
-- sub-topics is weak for them and their guardian has given marketing consent. Students never see
-- a price or a payment step.

create table public.revision_offers (
  id           uuid not null default gen_random_uuid(),
  centre_id    uuid not null references public.centres (id) on delete restrict,
  course_id    uuid not null references public.courses (id),
  topic_id     uuid not null,
  whole_topic  boolean not null default false,   -- true: every sub-topic of the topic, now and later
  title        text not null check (length(trim(title)) between 1 and 80),
  description  text check (length(description) <= 300),
  starts_on    date,
  ends_on      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, id, topic_id),
  foreign key (centre_id, topic_id) references public.question_topics (centre_id, id) on delete cascade,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index revision_offers_title_uq on public.revision_offers (centre_id, course_id, lower(title));
create trigger revision_offers_course_check before insert or update of course_id, centre_id on public.revision_offers
  for each row execute function app.check_lesson_course();

-- The offer's topic must belong to the offer's course.
create or replace function app.check_offer_topic()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.question_topics t
                 where t.centre_id = new.centre_id and t.id = new.topic_id and t.course_id = new.course_id) then
    raise exception 'the offer''s topic is not part of its course' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function app.check_offer_topic() from public, authenticated;
create trigger revision_offers_topic_check before insert or update of course_id, topic_id on public.revision_offers
  for each row execute function app.check_offer_topic();

-- Chosen sub-topics (only when whole_topic is false). The composite keys make sure every
-- sub-topic belongs to the offer's own topic.
create table public.revision_offer_sections (
  centre_id   uuid not null,
  offer_id    uuid not null,
  topic_id    uuid not null,
  section_id  uuid not null,
  primary key (centre_id, offer_id, section_id),
  foreign key (centre_id, offer_id, topic_id) references public.revision_offers (centre_id, id, topic_id) on delete cascade,
  foreign key (centre_id, topic_id, section_id) references public.question_sections (centre_id, topic_id, id) on delete cascade
);
create index revision_offer_sections_section_idx on public.revision_offer_sections (centre_id, section_id);

-- ---------------------------------------------------------------------------
-- Loading offers (service role, from the timetable spreadsheet's Offers sheet).
-- p_offers = [{course_id, title, description, topic, sections: [1, 3] or [], starts_on, ends_on}]
-- Listing a course's offers replaces that course's offers; other courses are untouched.
-- Any problem (unknown topic or sub-topic, a title listed twice) fails the whole load.
-- ---------------------------------------------------------------------------
create or replace function public.apply_revision_offers(p_centre uuid, p_offers jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare
  x jsonb;
  v_offer uuid;
  v_topic uuid;
  v_n int := 0;
  v_bad text;
begin
  if jsonb_typeof(p_offers) is distinct from 'array' then
    raise exception 'offers must be a list' using errcode = '22023';
  end if;
  select string_agg(d.title, ', ') into v_bad from (
    select min(trim(y ->> 'title')) as title from jsonb_array_elements(p_offers) y
    group by (y ->> 'course_id'), lower(trim(y ->> 'title')) having count(*) > 1
  ) d;
  if v_bad is not null then
    raise exception 'Offer listed twice for the same course: %', v_bad using errcode = '22023';
  end if;

  delete from public.revision_offers o
   where o.centre_id = p_centre
     and o.course_id in (select (y ->> 'course_id')::uuid from jsonb_array_elements(p_offers) y)
     and not exists (select 1 from jsonb_array_elements(p_offers) y
                     where (y ->> 'course_id')::uuid = o.course_id and lower(trim(y ->> 'title')) = lower(o.title));

  for x in select * from jsonb_array_elements(p_offers) loop
    if jsonb_typeof(coalesce(x -> 'sections', '[]'::jsonb)) <> 'array' then
      raise exception 'Offer "%": sub-topics must be a list of numbers', x ->> 'title' using errcode = '22023';
    end if;
    select t.id into v_topic from public.question_topics t
     where t.centre_id = p_centre and t.course_id = (x ->> 'course_id')::uuid and lower(t.title) = lower(trim(x ->> 'topic'));
    if v_topic is null then
      raise exception 'Offer "%": no question bank topic "%" for this course. Import the question bank first or fix the topic name.',
        x ->> 'title', x ->> 'topic' using errcode = '22023';
    end if;
    select string_agg(n, ', ') into v_bad
      from jsonb_array_elements_text(coalesce(x -> 'sections', '[]'::jsonb)) n
     where n !~ '^\d{1,3}$'
        or not exists (select 1 from public.question_sections s
                       where s.centre_id = p_centre and s.topic_id = v_topic and s.number = n::int);
    if v_bad is not null then
      raise exception 'Offer "%": topic "%" has no sub-topic numbered %.', x ->> 'title', x ->> 'topic', v_bad using errcode = '22023';
    end if;

    insert into public.revision_offers (centre_id, course_id, topic_id, whole_topic, title, description, starts_on, ends_on)
    values (p_centre, (x ->> 'course_id')::uuid, v_topic, coalesce(jsonb_array_length(x -> 'sections'), 0) = 0,
            trim(x ->> 'title'), nullif(trim(x ->> 'description'), ''), (x ->> 'starts_on')::date, (x ->> 'ends_on')::date)
    on conflict (centre_id, course_id, lower(title)) do update
      set title = excluded.title, description = excluded.description, starts_on = excluded.starts_on,
          ends_on = excluded.ends_on, topic_id = excluded.topic_id, whole_topic = excluded.whole_topic, updated_at = now()
    returning id into v_offer;

    delete from public.revision_offer_sections s where s.centre_id = p_centre and s.offer_id = v_offer;
    insert into public.revision_offer_sections (centre_id, offer_id, topic_id, section_id)
    select distinct p_centre, v_offer, v_topic, s.id
      from jsonb_array_elements_text(coalesce(x -> 'sections', '[]'::jsonb)) n
      join public.question_sections s on s.centre_id = p_centre and s.topic_id = v_topic and s.number = n::int;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.apply_revision_offers(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_revision_offers(uuid, jsonb) to service_role;

-- One spreadsheet, one transaction: the timetable, then exam dates and offers when the file lists
-- any. If any part fails, nothing from the file is saved.
create or replace function public.apply_timetable_file(p_centre uuid, p_data jsonb, p_exams jsonb, p_offers jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_out jsonb;
begin
  v_out := public.apply_timetable(p_centre, p_data);
  v_out := v_out || jsonb_build_object(
    'exams', case when jsonb_array_length(coalesce(p_exams, '[]'::jsonb)) > 0 then public.apply_exam_dates(p_centre, p_exams) else 0 end,
    'offers', case when jsonb_array_length(coalesce(p_offers, '[]'::jsonb)) > 0 then public.apply_revision_offers(p_centre, p_offers) else 0 end);
  return v_out;
end;
$$;
revoke all on function public.apply_timetable_file(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_timetable_file(uuid, jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- What the signed-in student is shown: current offers for courses they can learn that cover at
-- least one of their weak sub-topics (same rule as ADR 0009: 3+ recent answers under 70% right,
-- or confidence of 2 stars or fewer). Nothing at all without the guardian's marketing consent.
-- ---------------------------------------------------------------------------
create or replace function public.my_revision_offers(p_centre uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student uuid := app.my_student_id(p_centre);
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  v_weak uuid[];
begin
  if v_student is null or not app.has_consent(p_centre, v_student, 'marketing') then
    return '[]'::jsonb;
  end if;
  select coalesce(array_agg((s ->> 'section_id')::uuid), '{}') into v_weak
    from jsonb_array_elements(coalesce(public.my_revision(p_centre) -> 'sections', '[]'::jsonb)) s
   where ((s ->> 'tried')::int >= 3 and round((s ->> 'correct')::numeric * 100 / (s ->> 'tried')::int) < 70)
      or coalesce((s ->> 'confidence')::int, 5) <= 2;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'course_id', o.course_id, 'title', o.title,
                                        'description', o.description, 'section_ids', to_jsonb(c.ids))
           order by o.title)
    from public.revision_offers o
    cross join lateral (
      select array_agg(sec.id) as ids from public.question_sections sec
      where sec.centre_id = o.centre_id and sec.topic_id = o.topic_id
        and (o.whole_topic or exists (select 1 from public.revision_offer_sections os
                                      where os.centre_id = o.centre_id and os.offer_id = o.id and os.section_id = sec.id))
    ) c
    where o.centre_id = p_centre
      and (o.starts_on is null or o.starts_on <= v_today)
      and (o.ends_on is null or o.ends_on >= v_today)
      and app.has_course_access(v_student, o.course_id)
      and c.ids && v_weak
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.my_revision_offers(uuid) from public, anon;
grant execute on function public.my_revision_offers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security: staff read and manage their centre's offers. Students and guardians have
-- no direct access; students see offers only through my_revision_offers() (consent-gated).
-- ---------------------------------------------------------------------------
alter table public.revision_offers enable row level security;          alter table public.revision_offers force row level security;
alter table public.revision_offer_sections enable row level security;  alter table public.revision_offer_sections force row level security;

create policy revision_offers_staff on public.revision_offers for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy revision_offer_sections_staff on public.revision_offer_sections for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
