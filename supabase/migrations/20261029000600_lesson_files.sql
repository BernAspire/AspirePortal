-- Lesson files: page images, download permission, and the private Storage bucket.
--
-- Slides and worksheets are converted to PDF and rendered to one image per page when the
-- centre imports them. Students see the page images; the original PDF can be fetched only
-- when the part is marked downloadable (e.g. a worksheet to print). Slides stay
-- view-only: the database refuses a student's request for their PDF.
--
-- lesson_parts.pages is an ordered array of
--   {"path": "centres/<centre>/lessons/<lesson>/<part>/<n>.webp",
--    "role": "page" | "solution",
--    "title": "Q1 · Worked Solution"}          -- title optional
-- 'solution' pages are worked solutions the viewer keeps behind "Show worked solution".

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
create or replace function app.valid_part_pages(p_centre uuid, p_pages jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v_page jsonb;
  v_path text;
begin
  if jsonb_typeof(p_pages) <> 'array' then return false; end if;
  if jsonb_array_length(p_pages) not between 1 and 1000 then return false; end if;
  for v_page in select * from jsonb_array_elements(p_pages) loop
    if jsonb_typeof(v_page) <> 'object' then return false; end if;
    v_path := v_page ->> 'path';
    if v_path is null
       or v_path not like 'centres/' || p_centre::text || '/%'
       or v_path ~ '(^|/)\.\.(/|$)'
       or length(v_path) > 512 then
      return false;
    end if;
    if coalesce(v_page ->> 'role', '') not in ('page', 'solution') then return false; end if;
    if v_page ? 'title' and (jsonb_typeof(v_page -> 'title') <> 'string' or length(v_page ->> 'title') > 200) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.lesson_parts
  add column pages        jsonb,
  add column downloadable boolean not null default false,
  add constraint lesson_parts_pages_valid check (pages is null or app.valid_part_pages(centre_id, pages)),
  add constraint lesson_parts_pages_document check (pages is null or kind = 'document');

create index lesson_parts_file_path_idx on public.lesson_parts (file_path) where file_path is not null;
create index lesson_parts_pages_idx on public.lesson_parts using gin (pages jsonb_path_ops);

comment on column public.lesson_parts.pages is 'Rendered page images, in order; role "solution" pages are hidden until the student asks.';
comment on column public.lesson_parts.downloadable is 'Whether students may download the original PDF (worksheets yes, slides no).';

-- Where the student got to in a multi-page part.
alter table public.lesson_progress
  add column last_page integer check (last_page is null or last_page between 1 and 1000);
grant update (last_page) on public.lesson_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Who may read a file in the lesson-files bucket
-- ---------------------------------------------------------------------------
create or replace function app.can_read_lesson_file(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lesson_parts p
    where (p.pages @> jsonb_build_array(jsonb_build_object('path', p_name)) or p.file_path = p_name)
      and (
        app.is_staff(p.centre_id)
        or (
          app.can_learn_lesson(p.centre_id, p.lesson_id)
          and (
            p.pages @> jsonb_build_array(jsonb_build_object('path', p_name))
            or (p.file_path = p_name and p.downloadable)
          )
        )
      )
  );
$$;

revoke all on function app.valid_part_pages(uuid, jsonb) from public;
revoke all on function app.can_read_lesson_file(text) from public;
grant execute on function app.valid_part_pages(uuid, jsonb) to authenticated, service_role;
grant execute on function app.can_read_lesson_file(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Private bucket. Only the import job (service role) writes; nobody lists it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-files', 'lesson-files', false, 52428800,
        array['application/pdf', 'image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy lesson_files_read on storage.objects for select to authenticated
  using (bucket_id = 'lesson-files' and app.can_read_lesson_file(name));

-- The inbox the centre drops PowerPoint and Word files into for the import job.
insert into storage.buckets (id, name, public, file_size_limit)
values ('lesson-inbox', 'lesson-inbox', false, 104857600)
on conflict (id) do nothing;
