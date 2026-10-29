-- Lesson files: page images, downloadable PDFs and Storage access. Runs after 30_.
-- 30_ left Chloe's enrolment expired and her consent withdrawn; restore both here.

update public.programme_enrolments set valid_from = current_date - 30, valid_until = current_date + 60
 where student_id = 'a4000000-0000-0000-0000-000000000000';
insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'service', 'v1', 'online_form',
        'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'form-response-43');

-- Slides for Chloe's published lesson: 2 pages (one a worked solution), view-only PDF.
update public.lesson_parts
   set pages = '[{"path":"centres/a0000000-0000-0000-0000-000000000000/lessons/l1/slides/1.webp","role":"page","title":"Q1 · Easy"},
                 {"path":"centres/a0000000-0000-0000-0000-000000000000/lessons/l1/slides/2.webp","role":"solution","title":"Q1 · Worked Solution"}]',
       downloadable = false
 where id = 'd2000000-0000-0000-0000-000000000003';

-- A page in the draft lesson, and one in centre B.
insert into public.lesson_parts (id, centre_id, lesson_id, position, kind, title, file_path, pages) values
  ('d2000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000002', 2, 'document', 'Draft slides',
   'centres/a0000000-0000-0000-0000-000000000000/lessons/l2/slides.pdf',
   '[{"path":"centres/a0000000-0000-0000-0000-000000000000/lessons/l2/slides/1.webp","role":"page"}]'),
  ('d2000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-0000000000b1', 2, 'document', 'B slides',
   'centres/b0000000-0000-0000-0000-000000000000/lessons/b1/slides.pdf',
   '[{"path":"centres/b0000000-0000-0000-0000-000000000000/lessons/b1/slides/1.webp","role":"page"}]');

insert into storage.objects (bucket_id, name) values
  ('lesson-files', 'centres/a0000000-0000-0000-0000-000000000000/lessons/heat.pdf'),
  ('lesson-files', 'centres/a0000000-0000-0000-0000-000000000000/lessons/l1/slides/1.webp'),
  ('lesson-files', 'centres/a0000000-0000-0000-0000-000000000000/lessons/l1/slides/2.webp'),
  ('lesson-files', 'centres/a0000000-0000-0000-0000-000000000000/lessons/l2/slides.pdf'),
  ('lesson-files', 'centres/a0000000-0000-0000-0000-000000000000/lessons/l2/slides/1.webp'),
  ('lesson-files', 'centres/a0000000-0000-0000-0000-000000000000/lessons/orphan.webp'),
  ('lesson-files', 'centres/b0000000-0000-0000-0000-000000000000/lessons/b1/slides/1.webp'),
  ('lesson-inbox', 'P5 - Mathematics - Worksheet 01 - Numbers to 10 Million.pptx');

-- ---------------------------------------------------------------------------
-- 1. Page lists are validated even for privileged code
-- ---------------------------------------------------------------------------
select test.expect_error($q$update public.lesson_parts set pages = '[{"path":"centres/b0000000-0000-0000-0000-000000000000/x.webp","role":"page"}]'
  where id = 'd2000000-0000-0000-0000-000000000003'$q$, '23514', 'pages: must be under the centre''s own prefix');
select test.expect_error($q$update public.lesson_parts set pages = '[{"path":"centres/a0000000-0000-0000-0000-000000000000/../b/x.webp","role":"page"}]'
  where id = 'd2000000-0000-0000-0000-000000000003'$q$, '23514', 'pages: no ".." in paths');
select test.expect_error($q$update public.lesson_parts set pages = '[{"path":"centres/a0000000-0000-0000-0000-000000000000/x.webp","role":"answer"}]'
  where id = 'd2000000-0000-0000-0000-000000000003'$q$, '23514', 'pages: role must be page or solution');
select test.expect_error($q$update public.lesson_parts set pages = '[]'
  where id = 'd2000000-0000-0000-0000-000000000003'$q$, '23514', 'pages: at least one page');
select test.expect_error($q$update public.lesson_parts set pages = '[{"path":"centres/a0000000-0000-0000-0000-000000000000/x.webp","role":"page"}]'
  where id = 'd2000000-0000-0000-0000-000000000001'$q$, '23514', 'pages: only document parts have pages');

-- ---------------------------------------------------------------------------
-- 2. Who can read which files
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from storage.objects where bucket_id = 'lesson-files' and name like '%/l1/slides/%'), 2,
  'files: student A reads both page images of her lesson, solution included');
select test.expect((select count(*) from storage.objects where name like '%/heat.pdf'), 0,
  'files: student A cannot fetch the slides PDF (view-only)');
select test.expect((select count(*) from storage.objects where name like '%/l2/%'), 0,
  'files: student A cannot read files of a draft lesson');
select test.expect((select count(*) from storage.objects where name like 'centres/b0000000%'), 0,
  'files: student A cannot read centre B files');
select test.expect((select count(*) from storage.objects where name like '%/orphan.webp'), 0,
  'files: files not attached to any lesson are unreadable');
select test.expect((select count(*) from storage.objects where bucket_id = 'lesson-inbox'), 0,
  'files: students cannot see the import inbox');
commit;

update public.lesson_parts set downloadable = true where id = 'd2000000-0000-0000-0000-000000000003';
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect((select count(*) from storage.objects where name like '%/heat.pdf'), 1,
  'files: student A can download the PDF once the part is downloadable');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect((select count(*) from storage.objects where name like '%/l1/slides/%'), 2,
  'files: Chloe''s guardian can view her lesson pages');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000005');
set local role authenticated;
select test.expect((select count(*) from storage.objects where bucket_id = 'lesson-files'), 0,
  'files: another family''s guardian sees no lesson files');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;
select test.expect((select count(*) from storage.objects where name like 'centres/a0000000%' and name not like '%orphan%'), 5,
  'files: owner A reads every attached file in centre A, drafts and PDFs included');
select test.expect((select count(*) from storage.objects where name like 'centres/b0000000%'), 0,
  'files: owner A reads nothing in centre B');
commit;

begin;
set local role anon;
select test.expect((select count(*) from storage.objects), 0, 'files: signed-out visitors read nothing');
commit;

-- Students cannot upload or replace files.
select test.expect_error($q$
  do $d$ begin
    perform test.login('aaaaaaaa-0000-0000-0000-000000000003');
    set local role authenticated;
    insert into storage.objects (bucket_id, name) values ('lesson-files', 'centres/a0000000-0000-0000-0000-000000000000/lessons/l1/slides/9.webp');
  end $d$$q$, '42501', 'files: students cannot upload');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Last page reached
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect(test.rows_changed($q$insert into public.lesson_progress (centre_id, student_id, lesson_part_id, last_page)
  values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000003', 1)$q$),
  1, 'progress: student A starts the slides at page 1');
select test.expect(test.rows_changed($q$update public.lesson_progress set last_page = 2
  where lesson_part_id = 'd2000000-0000-0000-0000-000000000003'$q$),
  1, 'progress: student A records reaching page 2');
commit;

select 'ALL LESSON FILE TESTS PASSED' as result;
