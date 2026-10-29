-- Core tenancy: centres, branches, profiles, memberships, platform admins, audit log.
-- Every tenant table carries centre_id and is protected by row-level security (RLS).
-- Helper functions live in the private `app` schema and are called as (select app.fn(...))
-- so Postgres evaluates them once per statement.

create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.membership_role as enum ('owner', 'admin', 'staff', 'teacher', 'guardian', 'student');
create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.record_status as enum ('active', 'suspended', 'archived');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Centres (the tenant) and branches (locations inside a centre)
-- ---------------------------------------------------------------------------
create table public.centres (
  id              uuid primary key default gen_random_uuid(),
  slug            extensions.citext not null unique
                  check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  name            text not null check (length(name) between 1 and 120),
  uen             text,
  gst_registered  boolean not null default false,
  gst_rate_bp     integer not null default 900 check (gst_rate_bp between 0 and 10000), -- basis points, 900 = 9%
  timezone        text not null default 'Asia/Singapore',
  currency        char(3) not null default 'SGD',
  status          public.record_status not null default 'active',
  settings        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.centres is 'Tenant. Each tuition centre (organisation) is one row.';

create table public.branches (
  id           uuid not null default gen_random_uuid(),
  centre_id    uuid not null references public.centres (id) on delete restrict,
  name         text not null check (length(name) between 1 and 120),
  address      text,
  postal_code  text check (postal_code is null or postal_code ~ '^[0-9]{6}$'),
  phone        text,
  status       public.record_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id)
);
create index branches_centre_idx on public.branches (centre_id);

-- ---------------------------------------------------------------------------
-- People: one profile per login; memberships give roles inside a centre
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (full_name is null or length(full_name) <= 120),
  phone       text,
  locale      text not null default 'en-SG',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
comment on table public.platform_admins is 'Super-admins. Not writable through the API; managed by migration or service role only.';

create table public.centre_memberships (
  id          uuid not null default gen_random_uuid(),
  centre_id   uuid not null references public.centres (id) on delete restrict,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.membership_role not null,
  status      public.membership_status not null default 'invited',
  branch_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (id),
  unique (centre_id, id),
  unique (centre_id, user_id, role),
  foreign key (centre_id, branch_id) references public.branches (centre_id, id)
);
create index centre_memberships_user_idx on public.centre_memberships (user_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  centre_id   uuid references public.centres (id) on delete restrict,
  actor_id    uuid,
  action      text not null check (action in ('insert', 'update', 'delete')),
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
create index audit_log_centre_at_idx on public.audit_log (centre_id, at desc);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer, fixed search_path, stable)
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

create or replace function app.has_role(p_centre uuid, p_roles public.membership_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.centre_memberships m
    join public.centres c on c.id = m.centre_id
    where m.centre_id = p_centre
      and m.user_id = auth.uid()
      and m.status = 'active'
      and c.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create or replace function app.is_member(p_centre uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.has_role(p_centre, enum_range(null::public.membership_role));
$$;

create or replace function app.is_staff(p_centre uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.has_role(p_centre, array['owner', 'admin', 'staff']::public.membership_role[]);
$$;

create or replace function app.is_centre_admin(p_centre uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.has_role(p_centre, array['owner', 'admin']::public.membership_role[]);
$$;

-- Users who share a centre with the caller, where the caller is staff there.
create or replace function app.staff_can_see_user(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.centre_memberships target
    where target.user_id = p_user
      and app.is_staff(target.centre_id)
  );
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit trigger
-- ---------------------------------------------------------------------------
create or replace function app.audit_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_centre uuid := case
    when tg_table_name = 'centres' then (v_row ->> 'id')::uuid
    else nullif(v_row ->> 'centre_id', '')::uuid
  end;
begin
  insert into public.audit_log (centre_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_centre,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger centres_touch before update on public.centres for each row execute function app.touch_updated_at();
create trigger branches_touch before update on public.branches for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();
create trigger memberships_touch before update on public.centre_memberships for each row execute function app.touch_updated_at();

create trigger centres_audit after insert or update or delete on public.centres for each row execute function app.audit_row();
create trigger memberships_audit after insert or update or delete on public.centre_memberships for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.centres enable row level security;
alter table public.centres force row level security;
alter table public.branches enable row level security;
alter table public.branches force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
alter table public.centre_memberships enable row level security;
alter table public.centre_memberships force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- centres
create policy centres_select on public.centres for select to authenticated
  using ((select app.is_member(id)) or (select app.is_platform_admin()));
create policy centres_update on public.centres for update to authenticated
  using ((select app.is_centre_admin(id)))
  with check ((select app.is_centre_admin(id)));
create policy centres_insert on public.centres for insert to authenticated
  with check ((select app.is_platform_admin()));

-- branches
create policy branches_select on public.branches for select to authenticated
  using ((select app.is_member(centre_id)));
create policy branches_write on public.branches for all to authenticated
  using ((select app.is_centre_admin(centre_id)))
  with check ((select app.is_centre_admin(centre_id)));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select app.staff_can_see_user(id)));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- platform_admins: a user may only see whether they are one
create policy platform_admins_select_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- centre_memberships
create policy memberships_select on public.centre_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_staff(centre_id)));
create policy memberships_write on public.centre_memberships for all to authenticated
  using ((select app.is_centre_admin(centre_id)))
  with check ((select app.is_centre_admin(centre_id)));

-- audit_log: read-only for centre owners/admins; rows are written by the trigger only
create policy audit_log_select on public.audit_log for select to authenticated
  using (centre_id is not null and (select app.is_centre_admin(centre_id)));

revoke insert, update, delete on public.audit_log from authenticated, anon;
revoke all on public.platform_admins from anon;
revoke insert, update, delete on public.platform_admins from authenticated;
