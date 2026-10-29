-- S1 E-learning: lessons (per course), their parts, and each student's progress.
--
-- Access rules:
--   * Staff of the centre manage lessons and parts and read all progress.
--   * Students (and their guardians) read PUBLISHED lessons of a course only while an
--     active programme enrolment covers that course today (CLAUDE.md rule 12).
--   * A student records progress only for parts they can read, and only once a
--     'service' consent is on record for them (CLAUDE.md PDPA: guardian consent before
--     any data beyond enrolment basics, defaulting to consent for all students).
--   * Progress rows are never deleted through the API.

create type public.lesson_status as enum ('draft', 'published', 'archived');
create type public.lesson_part_kind as enum ('video', 'reading', 'document', 'link');
create type public.progress_status as enum ('started', 'completed');

-- ---------------------------------------------------------------------------
-- Lessons
-- ---------------------------------------------------------------------------
create table public.course_lessons (
  id          uuid not null default gen_random_uuid(),
  centre_id   uuid not null references public.centres (id) on delete restrict,
  course_id   uuid not null references public.courses (id),
  position    integer not null check (position > 0),
  title       text not null check (length(title) between 1 and 200),
  summary     text check (summary is null or length(summary) <= 1000),
  status      public.lesson_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, course_id, position) deferrable initially immediate
);
create index course_lessons_course_idx on public.course_lessons (centre_id, course_id, position);
comment on table public.course_lessons is 'E-learning lesson in a course, e.g. "Lesson 3: Heat Energy". Not a timetabled session.';

-- A lesson may use a platform course (centre_id null) or one of its own centre's courses.
create or replace function app.check_lesson_course()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.courses c
    where c.id = new.course_id and (c.centre_id is null or c.centre_id = new.centre_id)
  ) then
    raise exception 'course % is not available to centre %', new.course_id, new.centre_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger course_lessons_course_check
  before insert or update of course_id, centre_id on public.course_lessons
  for each row execute function app.check_lesson_course();

-- ---------------------------------------------------------------------------
-- Lesson parts: a video, a reading (Markdown text), a document (file in Storage) or a link
-- ---------------------------------------------------------------------------
create table public.lesson_parts (
  id          uuid not null default gen_random_uuid(),
  centre_id   uuid not null,
  lesson_id   uuid not null,
  position    integer not null check (position > 0),
  kind        public.lesson_part_kind not null,
  title       text not null check (length(title) between 1 and 200),
  body_md     text check (body_md is null or length(body_md) <= 100000),
  video_url   text,
  link_url    text,
  file_path   text,
  duration_s  integer check (duration_s is null or duration_s between 1 and 86400),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, lesson_id, position) deferrable initially immediate,
  foreign key (centre_id, lesson_id) references public.course_lessons (centre_id, id) on delete cascade,
  -- Each kind carries exactly the content it needs.
  constraint lesson_parts_content check (
    case kind
      when 'video'    then video_url is not null and body_md is null and link_url is null and file_path is null
      when 'reading'  then body_md   is not null and video_url is null and link_url is null and file_path is null
      when 'document' then file_path is not null and video_url is null and link_url is null
      when 'link'     then link_url  is not null and video_url is null and file_path is null
    end
  ),
  -- Videos only from hosts the portal embeds; links must be https.
  constraint lesson_parts_video_host check (
    video_url is null
    or video_url ~ '^https://(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com)/'
  ),
  constraint lesson_parts_link_https check (link_url is null or link_url ~ '^https://'),
  -- Files live under the centre's own Storage prefix (CLAUDE.md rule 8), no path tricks.
  constraint lesson_parts_file_path check (
    file_path is null
    or (file_path like 'centres/' || centre_id::text || '/%' and file_path !~ '(^|/)\.\.(/|$)')
  )
);
create index lesson_parts_lesson_idx on public.lesson_parts (centre_id, lesson_id, position);

-- ---------------------------------------------------------------------------
-- Progress: one row per student per part
-- ---------------------------------------------------------------------------
create table public.lesson_progress (
  centre_id       uuid not null,
  student_id      uuid not null,
  lesson_part_id  uuid not null,
  status          public.progress_status not null default 'started',
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  seconds_spent   integer not null default 0 check (seconds_spent between 0 and 604800),
  updated_at      timestamptz not null default now(),
  primary key (centre_id, student_id, lesson_part_id),
  foreign key (centre_id, student_id) references public.students (centre_id, id) on delete cascade,
  foreign key (centre_id, lesson_part_id) references public.lesson_parts (centre_id, id) on delete cascade,
  check ((status = 'completed') = (completed_at is not null))
);
create index lesson_progress_part_idx on public.lesson_progress (centre_id, lesson_part_id);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- An active (not withdrawn) consent for this student and purpose.
create or replace function app.has_consent(p_centre uuid, p_student uuid, p_purpose public.consent_purpose)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.consents c
    where c.centre_id = p_centre and c.student_id = p_student
      and c.purpose = p_purpose and c.withdrawn_at is null
  );
$$;

-- The caller is a student (or guardian of a student) in this centre who is entitled to
-- the course today.
create or replace function app.can_learn_course(p_centre uuid, p_course uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from (
      select app.my_student_ids(p_centre) as student_id
      union
      select app.guardian_student_ids(p_centre)
    ) s
    where app.has_course_access(s.student_id, p_course)
  );
$$;

-- A published lesson the caller can learn from.
create or replace function app.can_learn_lesson(p_centre uuid, p_lesson uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.course_lessons l
    where l.centre_id = p_centre and l.id = p_lesson and l.status = 'published'
      and app.can_learn_course(p_centre, l.course_id)
  );
$$;

-- A student may record progress on a part: it is their own record, they are entitled to
-- the part's course today, the lesson is published, and service consent is on record.
create or replace function app.can_record_progress(p_centre uuid, p_student uuid, p_part uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_student in (select app.my_student_ids(p_centre))
     and app.has_consent(p_centre, p_student, 'service')
     and exists (
       select 1
       from public.lesson_parts p
       join public.course_lessons l on l.centre_id = p.centre_id and l.id = p.lesson_id
       where p.centre_id = p_centre and p.id = p_part and l.status = 'published'
         and app.has_course_access(p_student, l.course_id)
     );
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger course_lessons_touch before update on public.course_lessons for each row execute function app.touch_updated_at();
create trigger lesson_parts_touch before update on public.lesson_parts for each row execute function app.touch_updated_at();
create trigger lesson_progress_touch before update on public.lesson_progress for each row execute function app.touch_updated_at();

-- Content changes are audited; progress is learning activity, not personal-data edits.
create trigger course_lessons_audit after insert or update or delete on public.course_lessons for each row execute function app.audit_row();
create trigger lesson_parts_audit after insert or update or delete on public.lesson_parts for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.course_lessons enable row level security;  alter table public.course_lessons force row level security;
alter table public.lesson_parts enable row level security;    alter table public.lesson_parts force row level security;
alter table public.lesson_progress enable row level security; alter table public.lesson_progress force row level security;

-- Lessons
create policy course_lessons_staff on public.course_lessons for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy course_lessons_learner_select on public.course_lessons for select to authenticated
  using (status = 'published' and (select app.can_learn_course(centre_id, course_id)));

-- Parts
create policy lesson_parts_staff on public.lesson_parts for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy lesson_parts_learner_select on public.lesson_parts for select to authenticated
  using ((select app.can_learn_lesson(centre_id, lesson_id)));

-- Progress
create policy lesson_progress_staff_select on public.lesson_progress for select to authenticated
  using ((select app.is_staff(centre_id)));
create policy lesson_progress_family_select on public.lesson_progress for select to authenticated
  using (student_id in (select app.my_student_ids(centre_id))
      or student_id in (select app.guardian_student_ids(centre_id)));
create policy lesson_progress_student_insert on public.lesson_progress for insert to authenticated
  with check ((select app.can_record_progress(centre_id, student_id, lesson_part_id)));
create policy lesson_progress_student_update on public.lesson_progress for update to authenticated
  using ((select app.can_record_progress(centre_id, student_id, lesson_part_id)))
  with check ((select app.can_record_progress(centre_id, student_id, lesson_part_id)));

-- Students may change only the progress fields, never move a row to another part or student.
revoke update on public.lesson_progress from authenticated;
grant update (status, completed_at, seconds_spent) on public.lesson_progress to authenticated;
revoke delete on public.lesson_progress from authenticated, anon;
