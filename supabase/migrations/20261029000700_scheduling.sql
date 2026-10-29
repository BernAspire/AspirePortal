-- Scheduling: rooms, classes (weekly templates), sessions (dated occurrences), class
-- rosters, bookings (a student's seat in a session) and attendance.
--
-- Until the admin portal exists, staff fill a spreadsheet and a GitHub job calls
-- public.apply_timetable() with the service-role key (CLAUDE.md rule 5). Students and
-- guardians only read, through RLS.
--
-- Room and teacher clashes are stopped by exclusion constraints, not only by app checks.
-- Live-tutorial meeting links are not readable as columns: public.session_join_url()
-- hands them out only to booked, entitled students around the session time (rule 12).

create type public.session_kind as enum ('physical_tutorial', 'live_tutorial', 'academic_coaching');
create type public.session_status as enum ('scheduled', 'cancelled');
create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');

-- ---------------------------------------------------------------------------
-- Rooms (belong to a branch)
-- ---------------------------------------------------------------------------
create table public.rooms (
  id          uuid not null default gen_random_uuid(),
  centre_id   uuid not null references public.centres (id) on delete restrict,
  branch_id   uuid not null,
  name        text not null check (length(name) between 1 and 60),
  capacity    integer check (capacity is null or capacity > 0),
  status      public.record_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, branch_id, id),
  foreign key (centre_id, branch_id) references public.branches (centre_id, id)
);
create unique index rooms_name_uq on public.rooms (centre_id, branch_id, lower(name));

-- ---------------------------------------------------------------------------
-- Classes: the recurring weekly template that generates sessions
-- ---------------------------------------------------------------------------
create table public.classes (
  id                uuid not null default gen_random_uuid(),
  centre_id         uuid not null references public.centres (id) on delete restrict,
  code              text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  course_id         uuid not null references public.courses (id),
  kind              public.session_kind not null,
  branch_id         uuid,
  room_id           uuid,
  teacher_name      text not null check (length(teacher_name) between 1 and 120),
  teacher_user_id   uuid references auth.users (id),
  weekday           smallint not null check (weekday between 1 and 7),  -- ISO: 1 = Monday
  start_time        time not null,
  duration_minutes  integer not null check (duration_minutes between 15 and 480),
  first_date        date not null,
  last_date         date not null,
  capacity          integer check (capacity is null or capacity > 0),
  meeting_url       text check (meeting_url is null or (meeting_url ~ '^https://[^\s]+$' and length(meeting_url) <= 500)),
  status            public.record_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, code),
  check (last_date >= first_date and last_date <= first_date + 400),
  check (kind <> 'physical_tutorial' or branch_id is not null),
  check (room_id is null or branch_id is not null),
  foreign key (centre_id, branch_id) references public.branches (centre_id, id),
  foreign key (centre_id, branch_id, room_id) references public.rooms (centre_id, branch_id, id)
);
comment on table public.classes is 'Recurring weekly class (e.g. P5 Maths, Sat 9am). Generates class_sessions.';

-- ---------------------------------------------------------------------------
-- Sessions: dated occurrences, from a class or one-off (e.g. academic coaching)
-- ---------------------------------------------------------------------------
create table public.class_sessions (
  id               uuid not null default gen_random_uuid(),
  centre_id        uuid not null references public.centres (id) on delete restrict,
  class_id         uuid,
  code             text check (code is null or code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  course_id        uuid not null references public.courses (id),
  kind             public.session_kind not null,
  branch_id        uuid,
  room_id          uuid,
  teacher_name     text not null check (length(teacher_name) between 1 and 120),
  teacher_user_id  uuid references auth.users (id),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  capacity         integer check (capacity is null or capacity > 0),
  meeting_url      text check (meeting_url is null or (meeting_url ~ '^https://[^\s]+$' and length(meeting_url) <= 500)),
  status           public.session_status not null default 'scheduled',
  cancel_reason    text check (cancel_reason is null or length(cancel_reason) <= 200),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, class_id, starts_at),
  unique (centre_id, code),
  check ((class_id is null) <> (code is null)),           -- from a class, or a one-off with its own code
  check (ends_at > starts_at and ends_at <= starts_at + interval '8 hours'),
  check (kind <> 'physical_tutorial' or branch_id is not null),
  check (room_id is null or branch_id is not null),
  check (status = 'cancelled' or cancel_reason is null),
  foreign key (centre_id, class_id) references public.classes (centre_id, id) on delete cascade,
  foreign key (centre_id, branch_id) references public.branches (centre_id, id),
  foreign key (centre_id, branch_id, room_id) references public.rooms (centre_id, branch_id, id),
  constraint class_sessions_room_clash exclude using gist (
    room_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled' and room_id is not null) deferrable initially immediate,
  constraint class_sessions_teacher_clash exclude using gist (
    centre_id with =, lower(teacher_name) with =, tstzrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled') deferrable initially immediate
);
create index class_sessions_centre_time_idx on public.class_sessions (centre_id, starts_at);
comment on table public.class_sessions is 'A dated, scheduled occurrence (physical tutorial, live tutorial, academic coaching).';

-- ---------------------------------------------------------------------------
-- Rosters and bookings
-- ---------------------------------------------------------------------------
create table public.class_enrolments (
  centre_id   uuid not null,
  class_id    uuid not null,
  student_id  uuid not null,
  from_date   date not null,
  until_date  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (centre_id, class_id, student_id),
  check (until_date is null or until_date >= from_date),
  foreign key (centre_id, class_id) references public.classes (centre_id, id) on delete cascade,
  foreign key (centre_id, student_id) references public.students (centre_id, id)
);
create index class_enrolments_student_idx on public.class_enrolments (centre_id, student_id);

create table public.bookings (
  id          uuid not null default gen_random_uuid(),
  centre_id   uuid not null,
  session_id  uuid not null,
  student_id  uuid not null,
  created_at  timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, session_id, student_id),
  foreign key (centre_id, session_id) references public.class_sessions (centre_id, id) on delete cascade,
  foreign key (centre_id, student_id) references public.students (centre_id, id)
);
create index bookings_student_idx on public.bookings (centre_id, student_id);
comment on table public.bookings is 'A student''s seat in a session.';

create table public.attendance_records (
  centre_id   uuid not null,
  booking_id  uuid not null,
  status      public.attendance_status not null,
  note        text check (note is null or length(note) <= 500),
  marked_by   uuid references auth.users (id),
  marked_at   timestamptz not null default now(),
  primary key (centre_id, booking_id),
  -- restrict: a booking with attendance can't disappear when a timetable is re-uploaded
  foreign key (centre_id, booking_id) references public.bookings (centre_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
-- Courses may be platform-wide or the centre's own (same rule as lessons).
create trigger classes_course_check before insert or update of course_id, centre_id on public.classes
  for each row execute function app.check_lesson_course();
create trigger class_sessions_course_check before insert or update of course_id, centre_id on public.class_sessions
  for each row execute function app.check_lesson_course();

-- A linked teacher login must be a teacher (or staff) of the same centre.
create or replace function app.check_teacher_member()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.teacher_user_id is not null and not exists (
    select 1 from public.centre_memberships m
    where m.centre_id = new.centre_id and m.user_id = new.teacher_user_id
      and m.role in ('teacher', 'staff', 'admin', 'owner')
  ) then
    raise exception 'teacher % is not a member of centre %', new.teacher_user_id, new.centre_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;
create trigger classes_teacher_check before insert or update of teacher_user_id, centre_id on public.classes
  for each row execute function app.check_teacher_member();
create trigger class_sessions_teacher_check before insert or update of teacher_user_id, centre_id on public.class_sessions
  for each row execute function app.check_teacher_member();

-- Attendance can only be taken once a session has started, and never for a cancelled one.
create or replace function app.check_attendance_session()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_starts timestamptz;
  v_status public.session_status;
begin
  select s.starts_at, s.status into v_starts, v_status
  from public.bookings b
  join public.class_sessions s on s.centre_id = b.centre_id and s.id = b.session_id
  where b.centre_id = new.centre_id and b.id = new.booking_id;
  if v_status = 'cancelled' then
    raise exception 'attendance cannot be taken for a cancelled session' using errcode = 'check_violation';
  end if;
  if v_starts > now() then
    raise exception 'attendance cannot be taken before the session starts' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger attendance_records_session_check before insert or update on public.attendance_records
  for each row execute function app.check_attendance_session();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
-- Students the caller may see as family: themselves (student) or their children (guardian).
create or replace function app.family_student_ids(p_centre uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select app.my_student_ids(p_centre)
  union
  select app.guardian_student_ids(p_centre);
$$;

create or replace function app.can_see_session(p_centre uuid, p_session uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_staff(p_centre)
      or exists (
        select 1 from public.bookings b
        where b.centre_id = p_centre and b.session_id = p_session
          and b.student_id in (select app.family_student_ids(p_centre))
      );
$$;

create or replace function app.can_see_class(p_centre uuid, p_class uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_staff(p_centre)
      or exists (
        select 1 from public.class_enrolments e
        where e.centre_id = p_centre and e.class_id = p_class
          and e.student_id in (select app.family_student_ids(p_centre))
      );
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Live-tutorial join link: booked + entitled family, from 15 minutes before the start
-- until the end; staff any time. Returns null otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.session_join_url(p_session uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select s.meeting_url
  from public.class_sessions s
  where s.id = p_session
    and s.kind = 'live_tutorial'
    and s.status = 'scheduled'
    and (
      app.is_staff(s.centre_id)
      or (
        now() between s.starts_at - interval '15 minutes' and s.ends_at
        and exists (
          select 1 from public.bookings b
          where b.centre_id = s.centre_id and b.session_id = s.id
            and b.student_id in (select app.family_student_ids(s.centre_id))
            and app.has_course_access(b.student_id, s.course_id)
        )
      )
    );
$$;
revoke all on function public.session_join_url(uuid) from public, anon;
grant execute on function public.session_join_url(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Timetable upload (service role only). One call = one transaction: any error rolls
-- back the whole upload. Each class listed replaces its own future sessions; each
-- class listed in the roster replaces its own roster. Past sessions, bookings and
-- attendance are never changed by a re-upload.
--
-- p_data = {
--   "classes":       [{code, course_id, kind, branch, room, teacher, weekday, start_time,
--                      duration, first_date, last_date, capacity, meeting_url}],
--   "roster":        [{class, client_code, from_date, until_date}],
--   "one_offs":      [{code, course_id, kind, branch, room, teacher, date, start_time,
--                      duration, capacity, meeting_url, students: [client_code]}],
--   "cancellations": [{class, date, reason}],
--   "attendance":    [{session, date, client_code, status, note}]
-- }
-- ---------------------------------------------------------------------------
create or replace function public.apply_timetable(p_centre uuid, p_data jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tz        text;
  v_now       timestamptz := now();
  v_today     date;
  r           record;
  v_branch    uuid;
  v_room      uuid;
  v_class     uuid;
  v_session   uuid;
  v_student   uuid;
  v_booking   uuid;
  v_touched   uuid[] := '{}';
  v_rostered  uuid[] := '{}';
  v_n_classes int := 0; v_n_sessions int := 0; v_n_removed int := 0; v_n_one_offs int := 0;
  v_n_cancel  int := 0; v_n_roster int := 0; v_n_attend int := 0; v_n_bookings int := 0;
  v_count     int;
  v_clash     text;
begin
  select c.timezone into v_tz from public.centres c where c.id = p_centre;
  if v_tz is null then raise exception 'No centre with id %', p_centre; end if;
  v_today := (v_now at time zone v_tz)::date;

  -- Clashes are checked once at the end, so two classes can swap rooms or teachers in one upload.
  set constraints public.class_sessions_room_clash, public.class_sessions_teacher_clash deferred;

  -- 1. Classes ---------------------------------------------------------------
  for r in
    select * from jsonb_to_recordset(coalesce(p_data -> 'classes', '[]')) as x(
      code text, course_id uuid, kind public.session_kind, branch text, room text, teacher text,
      weekday int, start_time time, duration int, first_date date, last_date date, capacity int, meeting_url text)
  loop
    v_branch := null; v_room := null;
    if r.branch is not null then
      select b.id into v_branch from public.branches b where b.centre_id = p_centre and lower(b.name) = lower(trim(r.branch));
      if v_branch is null then raise exception 'Class %: no branch named "%"', r.code, r.branch; end if;
    end if;
    if r.room is not null then
      if v_branch is null then raise exception 'Class %: a room needs a branch', r.code; end if;
      insert into public.rooms (centre_id, branch_id, name) values (p_centre, v_branch, trim(r.room))
        on conflict (centre_id, branch_id, lower(name)) do nothing;
      select rm.id into v_room from public.rooms rm where rm.centre_id = p_centre and rm.branch_id = v_branch and lower(rm.name) = lower(trim(r.room));
    end if;

    if exists (select 1 from public.class_sessions s where s.centre_id = p_centre and s.code = r.code) then
      raise exception 'Class %: this code is already used by a one-off session', r.code;
    end if;
    insert into public.classes as c (centre_id, code, course_id, kind, branch_id, room_id, teacher_name, weekday,
                                     start_time, duration_minutes, first_date, last_date, capacity, meeting_url, status)
    values (p_centre, r.code, r.course_id, r.kind, v_branch, v_room, trim(r.teacher), r.weekday,
            r.start_time, r.duration, r.first_date, r.last_date, r.capacity, r.meeting_url, 'active')
    on conflict (centre_id, code) do update set
      course_id = excluded.course_id, kind = excluded.kind, branch_id = excluded.branch_id, room_id = excluded.room_id,
      teacher_name = excluded.teacher_name, weekday = excluded.weekday, start_time = excluded.start_time,
      duration_minutes = excluded.duration_minutes, first_date = excluded.first_date, last_date = excluded.last_date,
      capacity = excluded.capacity, meeting_url = excluded.meeting_url, status = 'active'
    returning c.id into v_class;
    v_touched := v_touched || v_class;
    v_n_classes := v_n_classes + 1;

    -- Future sessions no longer in the timetable go (with their bookings).
    begin
      with wanted as (
        select ((d::date + r.start_time) at time zone v_tz) as starts_at
        from generate_series(r.first_date, r.last_date, interval '1 day') d
        where extract(isodow from d) = r.weekday
      )
      delete from public.class_sessions s
      where s.centre_id = p_centre and s.class_id = v_class and s.starts_at > v_now
        and s.starts_at not in (select w.starts_at from wanted w);
      get diagnostics v_count = row_count;
      v_n_removed := v_n_removed + v_count;
    exception when foreign_key_violation then
      raise exception 'Class %: a future session that would be removed already has attendance', r.code;
    end;

    -- Upcoming sessions: create or update; status resets so the Cancellations sheet decides.
      insert into public.class_sessions as s (centre_id, class_id, course_id, kind, branch_id, room_id, teacher_name,
                                              starts_at, ends_at, capacity, meeting_url, status, cancel_reason)
      select p_centre, v_class, r.course_id, r.kind, v_branch, v_room, trim(r.teacher),
             t.starts_at, t.starts_at + make_interval(mins => r.duration), r.capacity, r.meeting_url, 'scheduled', null
      from (
        select ((d::date + r.start_time) at time zone v_tz) as starts_at
        from generate_series(r.first_date, r.last_date, interval '1 day') d
        where extract(isodow from d) = r.weekday
      ) t
      where t.starts_at > v_now
      on conflict (centre_id, class_id, starts_at) do update set
        course_id = excluded.course_id, kind = excluded.kind, branch_id = excluded.branch_id, room_id = excluded.room_id,
        teacher_name = excluded.teacher_name, ends_at = excluded.ends_at, capacity = excluded.capacity,
        meeting_url = excluded.meeting_url, status = 'scheduled', cancel_reason = null;
      get diagnostics v_count = row_count;
      v_n_sessions := v_n_sessions + v_count;
  end loop;

  -- 2. Rosters (each class listed here gets exactly these students) -----------
  for r in
    select distinct x.class from jsonb_to_recordset(coalesce(p_data -> 'roster', '[]')) as x(class text)
  loop
    select c.id into v_class from public.classes c where c.centre_id = p_centre and c.code = r.class;
    if v_class is null then raise exception 'Roster: no class with code "%"', r.class; end if;
    delete from public.class_enrolments e where e.centre_id = p_centre and e.class_id = v_class;
    v_rostered := v_rostered || v_class;
    v_touched := v_touched || v_class;
  end loop;

  for r in
    select * from jsonb_to_recordset(coalesce(p_data -> 'roster', '[]')) as x(
      class text, client_code text, from_date date, until_date date)
  loop
    select c.id into v_class from public.classes c where c.centre_id = p_centre and c.code = r.class;
    select s.id into v_student from public.students s
      where s.centre_id = p_centre and s.client_code = upper(trim(r.client_code)) and s.deleted_at is null;
    if v_student is null then raise exception 'Roster %: no student with client code "%"', r.class, r.client_code; end if;
    insert into public.class_enrolments (centre_id, class_id, student_id, from_date, until_date)
    values (p_centre, v_class, v_student, coalesce(r.from_date, v_today), r.until_date)
    on conflict (centre_id, class_id, student_id) do update set from_date = excluded.from_date, until_date = excluded.until_date;
    v_n_roster := v_n_roster + 1;
  end loop;

  -- 3. Bookings for upcoming sessions of every class touched follow the roster ----
  begin
    delete from public.bookings b
    using public.class_sessions s
    where s.centre_id = b.centre_id and s.id = b.session_id
      and b.centre_id = p_centre and s.class_id = any (v_touched) and s.starts_at > v_now
      and not exists (
        select 1 from public.class_enrolments e
        where e.centre_id = p_centre and e.class_id = s.class_id and e.student_id = b.student_id
          and (s.starts_at at time zone v_tz)::date between e.from_date and coalesce(e.until_date, 'infinity'::date)
      );
  exception when foreign_key_violation then
    raise exception 'Roster: a future booking that would be removed already has attendance';
  end;

  insert into public.bookings (centre_id, session_id, student_id)
  select p_centre, s.id, e.student_id
  from public.class_sessions s
  join public.class_enrolments e on e.centre_id = s.centre_id and e.class_id = s.class_id
  where s.centre_id = p_centre and s.class_id = any (v_touched) and s.starts_at > v_now
    and (s.starts_at at time zone v_tz)::date between e.from_date and coalesce(e.until_date, 'infinity'::date)
  on conflict (centre_id, session_id, student_id) do nothing;
  get diagnostics v_count = row_count;
  v_n_bookings := v_n_bookings + v_count;

  -- 4. One-off sessions (e.g. academic coaching) --------------------------------
  for r in
    select * from jsonb_to_recordset(coalesce(p_data -> 'one_offs', '[]')) as x(
      code text, course_id uuid, kind public.session_kind, branch text, room text, teacher text,
      date date, start_time time, duration int, capacity int, meeting_url text, students jsonb)
  loop
    v_branch := null; v_room := null;
    if r.branch is not null then
      select b.id into v_branch from public.branches b where b.centre_id = p_centre and lower(b.name) = lower(trim(r.branch));
      if v_branch is null then raise exception 'One-off %: no branch named "%"', r.code, r.branch; end if;
    end if;
    if r.room is not null then
      if v_branch is null then raise exception 'One-off %: a room needs a branch', r.code; end if;
      insert into public.rooms (centre_id, branch_id, name) values (p_centre, v_branch, trim(r.room))
        on conflict (centre_id, branch_id, lower(name)) do nothing;
      select rm.id into v_room from public.rooms rm where rm.centre_id = p_centre and rm.branch_id = v_branch and lower(rm.name) = lower(trim(r.room));
    end if;

    if exists (select 1 from public.classes c where c.centre_id = p_centre and c.code = r.code) then
      raise exception 'One-off %: this code is already used by a weekly class', r.code;
    end if;
    -- A one-off that has already started is history: a re-upload leaves it as it is.
    v_session := null;
    select s.id into v_session from public.class_sessions s
     where s.centre_id = p_centre and s.code = r.code and s.starts_at <= v_now;
    if v_session is not null then
      v_n_one_offs := v_n_one_offs + 1;
      continue;
    end if;
      insert into public.class_sessions as s (centre_id, code, course_id, kind, branch_id, room_id, teacher_name,
                                              starts_at, ends_at, capacity, meeting_url, status)
      values (p_centre, r.code, r.course_id, r.kind, v_branch, v_room, trim(r.teacher),
              (r.date + r.start_time) at time zone v_tz,
              ((r.date + r.start_time) at time zone v_tz) + make_interval(mins => r.duration),
              r.capacity, r.meeting_url, 'scheduled')
      on conflict (centre_id, code) do update set
        course_id = excluded.course_id, kind = excluded.kind, branch_id = excluded.branch_id, room_id = excluded.room_id,
        teacher_name = excluded.teacher_name, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
        capacity = excluded.capacity, meeting_url = excluded.meeting_url, status = 'scheduled', cancel_reason = null
      returning s.id into v_session;
    v_n_one_offs := v_n_one_offs + 1;

    if (select s.starts_at from public.class_sessions s where s.id = v_session) > v_now then
      begin
        delete from public.bookings b
        where b.centre_id = p_centre and b.session_id = v_session
          and b.student_id not in (
            select st.id from public.students st
            where st.centre_id = p_centre
              and st.client_code in (select upper(trim(j)) from jsonb_array_elements_text(coalesce(r.students, '[]')) j));
      exception when foreign_key_violation then
        raise exception 'One-off %: a booking that would be removed already has attendance', r.code;
      end;
    end if;
    for v_student in
      select (select st.id from public.students st
               where st.centre_id = p_centre and st.client_code = upper(trim(j)) and st.deleted_at is null)
      from jsonb_array_elements_text(coalesce(r.students, '[]')) j
    loop
      if v_student is null then raise exception 'One-off %: a client code in Students was not found', r.code; end if;
      insert into public.bookings (centre_id, session_id, student_id) values (p_centre, v_session, v_student)
        on conflict (centre_id, session_id, student_id) do nothing;
      get diagnostics v_count = row_count;
      v_n_bookings := v_n_bookings + v_count;
    end loop;
  end loop;

  -- 5. Cancellations ---------------------------------------------------------------
  for r in
    select * from jsonb_to_recordset(coalesce(p_data -> 'cancellations', '[]')) as x(class text, date date, reason text)
  loop
    update public.class_sessions s
       set status = 'cancelled', cancel_reason = nullif(trim(coalesce(r.reason, '')), '')
      from public.classes c
     where c.centre_id = p_centre and c.code = r.class
       and s.centre_id = p_centre and s.class_id = c.id
       and (s.starts_at at time zone v_tz)::date = r.date and s.starts_at > v_now;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      update public.class_sessions s
         set status = 'cancelled', cancel_reason = nullif(trim(coalesce(r.reason, '')), '')
       where s.centre_id = p_centre and s.code = r.class and (s.starts_at at time zone v_tz)::date = r.date
         and s.starts_at > v_now;
      get diagnostics v_count = row_count;
    end if;
    -- A session that has already started is history: an old cancellation row is ignored.
    if v_count = 0 and not exists (
      select 1 from public.class_sessions s left join public.classes c on c.centre_id = s.centre_id and c.id = s.class_id
       where s.centre_id = p_centre and (c.code = r.class or s.code = r.class) and (s.starts_at at time zone v_tz)::date = r.date
    ) then
      raise exception 'Cancellation: no session of "%" on %', r.class, r.date;
    end if;
    v_n_cancel := v_n_cancel + v_count;
  end loop;

  -- 6. Attendance (a walk-in or make-up gets a booking) ----------------------------
  for r in
    select * from jsonb_to_recordset(coalesce(p_data -> 'attendance', '[]')) as x(
      session text, date date, client_code text, status public.attendance_status, note text)
  loop
    select s.id into v_session
      from public.class_sessions s
      left join public.classes c on c.centre_id = s.centre_id and c.id = s.class_id
     where s.centre_id = p_centre and (c.code = r.session or s.code = r.session)
       and (s.starts_at at time zone v_tz)::date = r.date
     limit 1;
    if v_session is null then raise exception 'Attendance: no session of "%" on %', r.session, r.date; end if;
    select st.id into v_student from public.students st
      where st.centre_id = p_centre and st.client_code = upper(trim(r.client_code)) and st.deleted_at is null;
    if v_student is null then raise exception 'Attendance %: no student with client code "%"', r.session, r.client_code; end if;

    insert into public.bookings (centre_id, session_id, student_id) values (p_centre, v_session, v_student)
      on conflict (centre_id, session_id, student_id) do nothing;
    select b.id into v_booking from public.bookings b
      where b.centre_id = p_centre and b.session_id = v_session and b.student_id = v_student;

    begin
      insert into public.attendance_records (centre_id, booking_id, status, note)
      values (p_centre, v_booking, r.status, nullif(trim(coalesce(r.note, '')), ''))
      on conflict (centre_id, booking_id) do update set status = excluded.status, note = excluded.note, marked_at = now();
    exception when check_violation then
      raise exception 'Attendance % on % for %: %', r.session, r.date, r.client_code, sqlerrm;
    end;
    v_n_attend := v_n_attend + 1;
  end loop;

  -- 7. Seats: no upcoming session may have more bookings than its capacity --------
  select s.id into v_session
    from public.class_sessions s
    join public.bookings b on b.centre_id = s.centre_id and b.session_id = s.id
   where s.centre_id = p_centre and s.capacity is not null and s.starts_at > v_now and s.status = 'scheduled'
   group by s.id, s.capacity
  having count(*) > s.capacity
   limit 1;
  if v_session is not null then
    raise exception 'Too many students: a session on % has more bookings than its capacity',
      (select to_char(s.starts_at at time zone v_tz, 'YYYY-MM-DD HH24:MI') from public.class_sessions s where s.id = v_session);
  end if;

  begin
    set constraints public.class_sessions_room_clash, public.class_sessions_teacher_clash immediate;
  exception when exclusion_violation then
    -- Name the first clash so staff can find it in the spreadsheet.
    select format('%s and %s on %s (%s)',
                  coalesce(ca.code, a.code), coalesce(cb.code, b.code),
                  to_char(a.starts_at at time zone v_tz, 'DD/MM/YYYY HH24:MI'),
                  case when a.room_id = b.room_id then 'same room' else 'same teacher, ' || a.teacher_name end)
      into v_clash
      from public.class_sessions a
      join public.class_sessions b on b.centre_id = a.centre_id and b.id > a.id
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
       and (a.room_id = b.room_id or lower(a.teacher_name) = lower(b.teacher_name))
      left join public.classes ca on ca.centre_id = a.centre_id and ca.id = a.class_id
      left join public.classes cb on cb.centre_id = b.centre_id and cb.id = b.class_id
     where a.centre_id = p_centre and a.status = 'scheduled' and b.status = 'scheduled'
     order by a.starts_at
     limit 1;
    raise exception 'Clash: % are at the same time. Change one of them and upload again.', coalesce(v_clash, 'two sessions');
  end;

  return jsonb_build_object(
    'classes', v_n_classes, 'sessions_upserted', v_n_sessions, 'sessions_removed', v_n_removed,
    'roster_rows', v_n_roster, 'one_offs', v_n_one_offs, 'bookings_added', v_n_bookings,
    'cancellations', v_n_cancel, 'attendance', v_n_attend);
end;
$$;
revoke all on function public.apply_timetable(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_timetable(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger rooms_touch before update on public.rooms for each row execute function app.touch_updated_at();
create trigger classes_touch before update on public.classes for each row execute function app.touch_updated_at();
create trigger class_sessions_touch before update on public.class_sessions for each row execute function app.touch_updated_at();
create trigger class_enrolments_touch before update on public.class_enrolments for each row execute function app.touch_updated_at();

create trigger classes_audit after insert or update or delete on public.classes for each row execute function app.audit_row();
create trigger class_enrolments_audit after insert or update or delete on public.class_enrolments for each row execute function app.audit_row();
create trigger attendance_records_audit after insert or update or delete on public.attendance_records for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Row-level security. Staff manage everything; families read their own.
-- ---------------------------------------------------------------------------
alter table public.rooms enable row level security;              alter table public.rooms force row level security;
alter table public.classes enable row level security;            alter table public.classes force row level security;
alter table public.class_sessions enable row level security;     alter table public.class_sessions force row level security;
alter table public.class_enrolments enable row level security;   alter table public.class_enrolments force row level security;
alter table public.bookings enable row level security;           alter table public.bookings force row level security;
alter table public.attendance_records enable row level security; alter table public.attendance_records force row level security;

create policy rooms_select on public.rooms for select to authenticated
  using ((select app.is_member(centre_id)));
create policy rooms_staff on public.rooms for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));

create policy classes_staff on public.classes for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy classes_family_select on public.classes for select to authenticated
  using ((select app.can_see_class(centre_id, id)));

create policy class_sessions_staff on public.class_sessions for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy class_sessions_family_select on public.class_sessions for select to authenticated
  using ((select app.can_see_session(centre_id, id)));

create policy class_enrolments_staff on public.class_enrolments for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy class_enrolments_family_select on public.class_enrolments for select to authenticated
  using (student_id in (select app.family_student_ids(centre_id)));

create policy bookings_staff on public.bookings for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy bookings_family_select on public.bookings for select to authenticated
  using (student_id in (select app.family_student_ids(centre_id)));

create policy attendance_records_staff on public.attendance_records for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy attendance_records_family_select on public.attendance_records for select to authenticated
  using (booking_id in (
    select b.id from public.bookings b
    where b.centre_id = attendance_records.centre_id and b.student_id in (select app.family_student_ids(attendance_records.centre_id))));

-- Meeting links are never readable as columns, only through session_join_url().
revoke select on public.classes from anon, authenticated;
grant select (id, centre_id, code, course_id, kind, branch_id, room_id, teacher_name, teacher_user_id, weekday, start_time,
              duration_minutes, first_date, last_date, capacity, status, created_at, updated_at)
  on public.classes to authenticated;
revoke select on public.class_sessions from anon, authenticated;
grant select (id, centre_id, class_id, code, course_id, kind, branch_id, room_id, teacher_name, teacher_user_id, starts_at,
              ends_at, capacity, status, cancel_reason, created_at, updated_at)
  on public.class_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: timetable spreadsheets waiting for the import job (private, service role only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('timetable-inbox', 'timetable-inbox', false, 10485760)
on conflict (id) do nothing;
