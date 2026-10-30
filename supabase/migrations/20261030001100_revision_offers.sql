-- Smart Revision part 2: "Recommended for you" (ADR 0010).
-- The centre lists offers (e.g. an intensive revision programme) tagged with the question-bank
-- sub-topics they cover. A student sees an offer only when one of its sub-topics is weak for them
-- and their guardian has given marketing consent. Students never see a price or a payment step.

create table public.revision_offers (
  id           uuid not null default gen_random_uuid(),
  centre_id    uuid not null references public.centres (id) on delete restrict,
  course_id    uuid not null references public.courses (id),
  title        text not null check (length(trim(title)) between 1 and 80),
  description  text check (length(description) <= 300),
  starts_on    date,
  ends_on      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index revision_offers_title_uq on public.revision_offers (centre_id, course_id, lower(title));
create trigger revision_offers_course_check before insert or update of course_id, centre_id on public.revision_offers
  for each row execute function app.check_lesson_course();

create table public.revision_offer_sections (
  centre_id   uuid not null,
  offer_id    uuid not null,
  section_id  uuid not null,
  primary key (centre_id, offer_id, section_id),
  foreign key (centre_id, offer_id) references public.revision_offers (centre_id, id) on delete cascade,
  foreign key (centre_id, section_id) references public.question_sections (centre_id, id) on delete cascade
);
create index revision_offer_sections_section_idx on public.revision_offer_sections (centre_id, section_id);

-- ---------------------------------------------------------------------------
-- Loading offers (service role, from the timetable spreadsheet's Offers sheet).
-- p_offers = [{course_id, title, description, topic, sections: [1, 3] or [], starts_on, ends_on}]
-- Listing a course's offers replaces that course's offers; other courses are untouched.
-- An unknown topic or sub-topic number fails the whole load, so nothing half-applies.
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
  v_missing int;
begin
  if jsonb_typeof(p_offers) is distinct from 'array' then
    raise exception 'offers must be a list' using errcode = '22023';
  end if;

  delete from public.revision_offers o
   where o.centre_id = p_centre
     and o.course_id in (select (y ->> 'course_id')::uuid from jsonb_array_elements(p_offers) y)
     and not exists (select 1 from jsonb_array_elements(p_offers) y
                     where (y ->> 'course_id')::uuid = o.course_id and lower(trim(y ->> 'title')) = lower(o.title));

  for x in select * from jsonb_array_elements(p_offers) loop
    select t.id into v_topic from public.question_topics t
     where t.centre_id = p_centre and t.course_id = (x ->> 'course_id')::uuid and lower(t.title) = lower(trim(x ->> 'topic'));
    if v_topic is null then
      raise exception 'Offer "%": no question bank topic "%" for this course. Import the question bank first or fix the topic name.',
        x ->> 'title', x ->> 'topic' using errcode = '22023';
    end if;

    insert into public.revision_offers (centre_id, course_id, title, description, starts_on, ends_on)
    values (p_centre, (x ->> 'course_id')::uuid, trim(x ->> 'title'), nullif(trim(x ->> 'description'), ''),
            (x ->> 'starts_on')::date, (x ->> 'ends_on')::date)
    on conflict (centre_id, course_id, lower(title)) do update
      set title = excluded.title, description = excluded.description, starts_on = excluded.starts_on,
          ends_on = excluded.ends_on, updated_at = now()
    returning id into v_offer;

    delete from public.revision_offer_sections s where s.centre_id = p_centre and s.offer_id = v_offer;
    if coalesce(jsonb_array_length(x -> 'sections'), 0) = 0 then
      insert into public.revision_offer_sections (centre_id, offer_id, section_id)
      select p_centre, v_offer, s.id from public.question_sections s where s.centre_id = p_centre and s.topic_id = v_topic;
    else
      select count(*) into v_missing
        from jsonb_array_elements_text(x -> 'sections') n
       where not exists (select 1 from public.question_sections s
                         where s.centre_id = p_centre and s.topic_id = v_topic and s.number = n::int);
      if v_missing > 0 then
        raise exception 'Offer "%": topic "%" has no sub-topic numbered %.', x ->> 'title', x ->> 'topic',
          (select string_agg(n, ', ') from jsonb_array_elements_text(x -> 'sections') n
            where not exists (select 1 from public.question_sections s
                              where s.centre_id = p_centre and s.topic_id = v_topic and s.number = n::int))
          using errcode = '22023';
      end if;
      insert into public.revision_offer_sections (centre_id, offer_id, section_id)
      select distinct p_centre, v_offer, s.id
        from jsonb_array_elements_text(x -> 'sections') n
        join public.question_sections s on s.centre_id = p_centre and s.topic_id = v_topic and s.number = n::int
      on conflict do nothing;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.apply_revision_offers(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_revision_offers(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- What the signed-in student may be shown: current offers for courses they can learn, each with
-- the sub-topics it covers. Nothing at all without the guardian's marketing consent. The app
-- shows only offers that match one of the student's weak sub-topics.
-- ---------------------------------------------------------------------------
create or replace function public.my_revision_offers(p_centre uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student uuid := app.my_student_id(p_centre);
  v_today date := (now() at time zone 'Asia/Singapore')::date;
begin
  if v_student is null or not app.has_consent(p_centre, v_student, 'marketing') then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'course_id', o.course_id, 'title', o.title, 'description', o.description,
             'section_ids', (select coalesce(jsonb_agg(s.section_id), '[]'::jsonb) from public.revision_offer_sections s
                              where s.centre_id = o.centre_id and s.offer_id = o.id))
           order by o.title)
    from public.revision_offers o
    where o.centre_id = p_centre
      and (o.starts_on is null or o.starts_on <= v_today)
      and (o.ends_on is null or o.ends_on >= v_today)
      and app.has_course_access(v_student, o.course_id)
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
