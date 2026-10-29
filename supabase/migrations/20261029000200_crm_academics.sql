-- CRM (households, guardians, students), academic catalogue (subjects, levels, courses),
-- programmes and entitlements, and consent records. Composite foreign keys keep every
-- link inside one centre.

create type public.student_status as enum ('lead', 'trial', 'active', 'paused', 'withdrawn');
create type public.level_stage as enum ('primary', 'secondary', 'jc', 'other');
create type public.programme_kind as enum ('e_learning', 'physical_lecture', 'live_tutorial', 'academic_coaching');
create type public.enrolment_source as enum ('staff', 'purchase', 'trial');
create type public.consent_purpose as enum ('service', 'ai_tutor', 'marketing', 'leagues');

-- ---------------------------------------------------------------------------
-- Academic catalogue. centre_id null = platform default shared with every centre.
-- ---------------------------------------------------------------------------
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid references public.centres (id) on delete restrict,
  code        text not null check (code ~ '^[A-Z0-9_]{2,24}$'),
  name        text not null,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index subjects_code_uq on public.subjects (coalesce(centre_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

create table public.levels (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid references public.centres (id) on delete restrict,
  code        text not null check (code ~ '^[A-Z0-9_]{2,24}$'),
  name        text not null,
  stage       public.level_stage not null,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index levels_code_uq on public.levels (coalesce(centre_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid references public.centres (id) on delete restrict,
  subject_id  uuid not null references public.subjects (id),
  level_id    uuid not null references public.levels (id),
  name        text not null,
  status      public.record_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index courses_subject_level_idx on public.courses (subject_id, level_id);

-- ---------------------------------------------------------------------------
-- Households, guardians, students
-- ---------------------------------------------------------------------------
create table public.households (
  id             uuid not null default gen_random_uuid(),
  centre_id      uuid not null references public.centres (id) on delete restrict,
  name           text not null,
  billing_email  extensions.citext,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  primary key (id),
  unique (centre_id, id)
);

create table public.guardians (
  id            uuid not null default gen_random_uuid(),
  centre_id     uuid not null,
  household_id  uuid not null,
  user_id       uuid references auth.users (id) on delete set null,
  full_name     text not null check (length(full_name) between 1 and 120),
  email         extensions.citext,
  phone         text,
  relationship  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  primary key (id),
  unique (centre_id, id),
  foreign key (centre_id, household_id) references public.households (centre_id, id)
);
create index guardians_user_idx on public.guardians (user_id) where user_id is not null;

create table public.students (
  id                 uuid not null default gen_random_uuid(),
  centre_id          uuid not null,
  household_id       uuid not null,
  user_id            uuid references auth.users (id) on delete set null,
  full_name          text not null check (length(full_name) between 1 and 120),
  preferred_name     text,
  date_of_birth      date,
  school             text,
  level_id           uuid references public.levels (id),
  default_branch_id  uuid,
  client_code        text not null check (client_code ~ '^[A-Z0-9]{3,8}$'),
  status             public.student_status not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, client_code),
  foreign key (centre_id, household_id) references public.households (centre_id, id),
  foreign key (centre_id, default_branch_id) references public.branches (centre_id, id)
);
create index students_user_idx on public.students (user_id) where user_id is not null;
comment on column public.students.date_of_birth is 'Used to apply the under-13 guardian-consent rule. Never collect NRIC.';

create table public.guardian_students (
  centre_id    uuid not null,
  guardian_id  uuid not null,
  student_id   uuid not null,
  can_book     boolean not null default true,
  can_pay      boolean not null default true,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (centre_id, guardian_id, student_id),
  foreign key (centre_id, guardian_id) references public.guardians (centre_id, id) on delete cascade,
  foreign key (centre_id, student_id) references public.students (centre_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Programmes (what families buy) and entitlements
-- ---------------------------------------------------------------------------
create table public.programmes (
  id                     uuid not null default gen_random_uuid(),
  centre_id              uuid not null references public.centres (id) on delete restrict,
  name                   text not null,
  kind                   public.programme_kind not null,
  default_validity_days  integer check (default_validity_days is null or default_validity_days > 0),
  price_cents            bigint check (price_cents is null or price_cents >= 0),
  currency               char(3) not null default 'SGD',
  status                 public.record_status not null default 'active',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id)
);

create table public.programme_courses (
  centre_id     uuid not null,
  programme_id  uuid not null,
  course_id     uuid not null references public.courses (id),
  primary key (centre_id, programme_id, course_id),
  foreign key (centre_id, programme_id) references public.programmes (centre_id, id) on delete cascade
);

create table public.programme_enrolments (
  id            uuid not null default gen_random_uuid(),
  centre_id     uuid not null,
  programme_id  uuid not null,
  student_id    uuid not null,
  valid_from    date not null,
  valid_until   date not null,
  source        public.enrolment_source not null default 'staff',
  assigned_by   uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  check (valid_until >= valid_from),
  foreign key (centre_id, programme_id) references public.programmes (centre_id, id),
  foreign key (centre_id, student_id) references public.students (centre_id, id)
);
create index programme_enrolments_student_idx on public.programme_enrolments (centre_id, student_id, valid_until);

create table public.student_courses (
  centre_id   uuid not null,
  student_id  uuid not null,
  course_id   uuid not null references public.courses (id),
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (centre_id, student_id, course_id),
  foreign key (centre_id, student_id) references public.students (centre_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Consent (PDPA). Rows are never deleted; withdrawal sets withdrawn_at.
-- ---------------------------------------------------------------------------
create table public.consents (
  id                uuid not null default gen_random_uuid(),
  centre_id         uuid not null references public.centres (id) on delete restrict,
  student_id        uuid,
  guardian_id       uuid,
  purpose           public.consent_purpose not null,
  policy_version    text not null,
  given_by_user_id  uuid not null references auth.users (id),
  given_at          timestamptz not null default now(),
  withdrawn_at      timestamptz,
  primary key (id),
  unique (centre_id, id),
  check (student_id is not null or guardian_id is not null),
  foreign key (centre_id, student_id) references public.students (centre_id, id),
  foreign key (centre_id, guardian_id) references public.guardians (centre_id, id)
);
create index consents_student_idx on public.consents (centre_id, student_id, purpose);

-- ---------------------------------------------------------------------------
-- Helper functions for family and student access
-- ---------------------------------------------------------------------------
create or replace function app.my_guardian_ids(p_centre uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select g.id from public.guardians g
  where g.centre_id = p_centre and g.user_id = auth.uid() and g.deleted_at is null
    and app.has_role(p_centre, array['guardian']::public.membership_role[]);
$$;

create or replace function app.guardian_student_ids(p_centre uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select gs.student_id
  from public.guardian_students gs
  join public.guardians g on g.centre_id = gs.centre_id and g.id = gs.guardian_id
  where gs.centre_id = p_centre and g.user_id = auth.uid() and g.deleted_at is null
    and app.has_role(p_centre, array['guardian']::public.membership_role[]);
$$;

create or replace function app.my_student_ids(p_centre uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select s.id from public.students s
  where s.centre_id = p_centre and s.user_id = auth.uid() and s.deleted_at is null
    and app.has_role(p_centre, array['student']::public.membership_role[]);
$$;

create or replace function app.can_see_student(p_centre uuid, p_student uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_staff(p_centre)
      or p_student in (select app.my_student_ids(p_centre))
      or p_student in (select app.guardian_student_ids(p_centre));
$$;

-- Entitlement: an active programme enrolment today that includes the course.
create or replace function app.has_course_access(p_student uuid, p_course uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.programme_enrolments pe
    join public.programme_courses pc on pc.centre_id = pe.centre_id and pc.programme_id = pe.programme_id
    join public.programmes p on p.centre_id = pe.centre_id and p.id = pe.programme_id
    where pe.student_id = p_student
      and pc.course_id = p_course
      and p.status = 'active'
      and (now() at time zone 'Asia/Singapore')::date between pe.valid_from and pe.valid_until
      and app.can_see_student(pe.centre_id, p_student)
  );
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger courses_touch before update on public.courses for each row execute function app.touch_updated_at();
create trigger households_touch before update on public.households for each row execute function app.touch_updated_at();
create trigger guardians_touch before update on public.guardians for each row execute function app.touch_updated_at();
create trigger students_touch before update on public.students for each row execute function app.touch_updated_at();
create trigger programmes_touch before update on public.programmes for each row execute function app.touch_updated_at();

create trigger guardians_audit after insert or update or delete on public.guardians for each row execute function app.audit_row();
create trigger students_audit after insert or update or delete on public.students for each row execute function app.audit_row();
create trigger guardian_students_audit after insert or update or delete on public.guardian_students for each row execute function app.audit_row();
create trigger programme_enrolments_audit after insert or update or delete on public.programme_enrolments for each row execute function app.audit_row();
create trigger consents_audit after insert or update or delete on public.consents for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.subjects enable row level security;           alter table public.subjects force row level security;
alter table public.levels enable row level security;             alter table public.levels force row level security;
alter table public.courses enable row level security;            alter table public.courses force row level security;
alter table public.households enable row level security;         alter table public.households force row level security;
alter table public.guardians enable row level security;          alter table public.guardians force row level security;
alter table public.students enable row level security;           alter table public.students force row level security;
alter table public.guardian_students enable row level security;  alter table public.guardian_students force row level security;
alter table public.programmes enable row level security;         alter table public.programmes force row level security;
alter table public.programme_courses enable row level security;  alter table public.programme_courses force row level security;
alter table public.programme_enrolments enable row level security; alter table public.programme_enrolments force row level security;
alter table public.student_courses enable row level security;    alter table public.student_courses force row level security;
alter table public.consents enable row level security;           alter table public.consents force row level security;

-- Catalogue: platform rows readable by any signed-in user; centre rows by members.
create policy subjects_select on public.subjects for select to authenticated
  using (centre_id is null or (select app.is_member(centre_id)));
create policy subjects_write on public.subjects for all to authenticated
  using (case when centre_id is null then (select app.is_platform_admin()) else (select app.is_centre_admin(centre_id)) end)
  with check (case when centre_id is null then (select app.is_platform_admin()) else (select app.is_centre_admin(centre_id)) end);

create policy levels_select on public.levels for select to authenticated
  using (centre_id is null or (select app.is_member(centre_id)));
create policy levels_write on public.levels for all to authenticated
  using (case when centre_id is null then (select app.is_platform_admin()) else (select app.is_centre_admin(centre_id)) end)
  with check (case when centre_id is null then (select app.is_platform_admin()) else (select app.is_centre_admin(centre_id)) end);

create policy courses_select on public.courses for select to authenticated
  using (centre_id is null or (select app.is_member(centre_id)));
create policy courses_write on public.courses for all to authenticated
  using (case when centre_id is null then (select app.is_platform_admin()) else (select app.is_centre_admin(centre_id)) end)
  with check (case when centre_id is null then (select app.is_platform_admin()) else (select app.is_centre_admin(centre_id)) end);

-- Households
create policy households_staff on public.households for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy households_guardian_select on public.households for select to authenticated
  using (deleted_at is null and id in (
    select g.household_id from public.guardians g
    where g.centre_id = households.centre_id and g.id in (select app.my_guardian_ids(households.centre_id))));

-- Guardians
create policy guardians_staff on public.guardians for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy guardians_self_select on public.guardians for select to authenticated
  using (deleted_at is null and id in (select app.my_guardian_ids(centre_id)));

-- Students
create policy students_staff on public.students for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy students_family_select on public.students for select to authenticated
  using (deleted_at is null and (
    id in (select app.my_student_ids(centre_id)) or id in (select app.guardian_student_ids(centre_id))));

-- Guardian-student links
create policy guardian_students_staff on public.guardian_students for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy guardian_students_guardian_select on public.guardian_students for select to authenticated
  using (guardian_id in (select app.my_guardian_ids(centre_id)));

-- Programmes
create policy programmes_select on public.programmes for select to authenticated
  using ((select app.is_member(centre_id)));
create policy programmes_write on public.programmes for all to authenticated
  using ((select app.is_centre_admin(centre_id))) with check ((select app.is_centre_admin(centre_id)));

create policy programme_courses_select on public.programme_courses for select to authenticated
  using ((select app.is_member(centre_id)));
create policy programme_courses_write on public.programme_courses for all to authenticated
  using ((select app.is_centre_admin(centre_id))) with check ((select app.is_centre_admin(centre_id)));

-- Enrolments
create policy programme_enrolments_staff on public.programme_enrolments for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy programme_enrolments_family_select on public.programme_enrolments for select to authenticated
  using (student_id in (select app.my_student_ids(centre_id)) or student_id in (select app.guardian_student_ids(centre_id)));

-- Student courses: staff manage; a student may switch their own current course (is_current only).
create policy student_courses_staff on public.student_courses for all to authenticated
  using ((select app.is_staff(centre_id))) with check ((select app.is_staff(centre_id)));
create policy student_courses_family_select on public.student_courses for select to authenticated
  using (student_id in (select app.my_student_ids(centre_id)) or student_id in (select app.guardian_student_ids(centre_id)));
create policy student_courses_student_switch on public.student_courses for update to authenticated
  using (student_id in (select app.my_student_ids(centre_id)))
  with check (student_id in (select app.my_student_ids(centre_id)) and (select app.has_course_access(student_id, course_id)));

-- Consents: staff read; guardians read their own and record or withdraw consent they give.
create policy consents_staff_select on public.consents for select to authenticated
  using ((select app.is_staff(centre_id)));
create policy consents_guardian_select on public.consents for select to authenticated
  using (given_by_user_id = (select auth.uid()));
create policy consents_guardian_insert on public.consents for insert to authenticated
  with check (
    given_by_user_id = (select auth.uid())
    and withdrawn_at is null
    and (guardian_id is null or guardian_id in (select app.my_guardian_ids(centre_id)))
    and (student_id is null or student_id in (select app.guardian_student_ids(centre_id)))
  );
create policy consents_guardian_withdraw on public.consents for update to authenticated
  using (given_by_user_id = (select auth.uid()) and withdrawn_at is null)
  with check (given_by_user_id = (select auth.uid()));

-- Column-level limits on what non-staff updates can touch.
revoke update on public.student_courses from authenticated;
grant update (is_current) on public.student_courses to authenticated;
revoke update on public.consents from authenticated;
grant update (withdrawn_at) on public.consents to authenticated;
revoke delete on public.consents from authenticated;
