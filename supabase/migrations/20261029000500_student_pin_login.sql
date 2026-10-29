-- Student sign-in with a username and PIN.
--
-- A student login is a Supabase Auth user whose email is "<username>@<student domain>"
-- (an address that never receives mail) and whose password is the PIN. The centre creates
-- it; students never see the email form.
--
-- A 6-digit PIN is guessable without limits, so failed attempts are counted per username
-- and the username is locked for 15 minutes after 5 failures in 15 minutes. The counters
-- live in the private app schema, which the API cannot read or write directly.
--
-- Only two functions are exposed:
--   app.pin_login_locked(username)   anyone: is this username locked right now?
--   app.record_pin_failure(username) anyone: count a failed attempt (only for real usernames)
--   app.clear_pin_failures()         signed-in student: reset their own counter after success
-- Clearing is tied to the signed-in user, so nobody can unlock someone else's username.

create or replace function app.student_login_domain()
returns text
language sql immutable
set search_path = ''
as $$ select 'students.aspireportal.invalid'::text $$;

create table app.pin_attempts (
  username           extensions.citext primary key,
  failed_count       integer not null default 0 check (failed_count >= 0),
  window_started_at  timestamptz not null default now(),
  locked_until       timestamptz
);
revoke all on app.pin_attempts from public, anon, authenticated;

-- Usernames: 3–32 characters, lower-case letters, digits, dot, dash or underscore,
-- starting with a letter or digit.
create or replace function app.is_valid_username(p_username text)
returns boolean
language sql immutable
set search_path = ''
as $$ select p_username ~ '^[a-z0-9][a-z0-9._-]{2,31}$' $$;

create or replace function app.pin_login_locked(p_username text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select a.locked_until > now() from app.pin_attempts a where a.username = lower(p_username)),
    false
  );
$$;

create or replace function app.record_pin_failure(p_username text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_username text := lower(coalesce(p_username, ''));
begin
  -- Ignore malformed or unknown usernames, so the table cannot be filled with junk.
  -- Returns nothing either way, so callers learn nothing about which usernames exist.
  if not app.is_valid_username(v_username) then
    return;
  end if;
  if not exists (
    select 1 from auth.users u where u.email = v_username || '@' || app.student_login_domain()
  ) then
    return;
  end if;

  insert into app.pin_attempts as a (username, failed_count, window_started_at)
  values (v_username, 1, now())
  on conflict (username) do update set
    failed_count = case
      when a.window_started_at < now() - interval '15 minutes' then 1
      else a.failed_count + 1
    end,
    window_started_at = case
      when a.window_started_at < now() - interval '15 minutes' then now()
      else a.window_started_at
    end;

  update app.pin_attempts a
     set locked_until = now() + interval '15 minutes',
         failed_count = 0,
         window_started_at = now()
   where a.username = v_username and a.failed_count >= 5;
end;
$$;

create or replace function app.clear_pin_failures()
returns void
language sql volatile security definer
set search_path = ''
as $$
  delete from app.pin_attempts a
  using auth.users u
  where u.id = auth.uid()
    and u.email = a.username || '@' || app.student_login_domain();
$$;

revoke all on function app.student_login_domain() from public;
revoke all on function app.is_valid_username(text) from public;
revoke all on function app.pin_login_locked(text) from public;
revoke all on function app.record_pin_failure(text) from public;
revoke all on function app.clear_pin_failures() from public;

grant execute on function app.pin_login_locked(text) to anon, authenticated, service_role;
grant execute on function app.record_pin_failure(text) to anon, authenticated, service_role;
grant execute on function app.clear_pin_failures() to authenticated, service_role;
grant execute on function app.student_login_domain() to anon, authenticated, service_role;
grant execute on function app.is_valid_username(text) to anon, authenticated, service_role;

-- The API reaches these through thin public wrappers (PostgREST exposes only the public
-- schema). They run as their owner, so callers never need access to the app schema.
create or replace function public.pin_login_locked(p_username text)
returns boolean language sql stable security definer set search_path = ''
as $$ select app.pin_login_locked(p_username) $$;

create or replace function public.record_pin_failure(p_username text)
returns void language sql volatile security definer set search_path = ''
as $$ select app.record_pin_failure(p_username) $$;

create or replace function public.clear_pin_failures()
returns void language sql volatile security definer set search_path = ''
as $$ select app.clear_pin_failures() $$;

revoke all on function public.pin_login_locked(text) from public, anon, authenticated;
revoke all on function public.record_pin_failure(text) from public, anon, authenticated;
revoke all on function public.clear_pin_failures() from public, anon, authenticated;
grant execute on function public.pin_login_locked(text) to anon, authenticated;
grant execute on function public.record_pin_failure(text) to anon, authenticated;
grant execute on function public.clear_pin_failures() to authenticated;
