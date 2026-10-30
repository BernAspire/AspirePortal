-- Smart Revision "Recommended for you": centre offers tagged with sub-topics, shown to students
-- only with the guardian's marketing consent. Runs after 80_ (Chloe's service consent was withdrawn there).

-- ---------------------------------------------------------------------------
-- 1. Loading offers
-- ---------------------------------------------------------------------------
select test.expect(public.apply_revision_offers('a0000000-0000-0000-0000-000000000000', jsonb_build_array(
  jsonb_build_object('course_id', 'c0000000-0000-0000-0000-000000000001', 'title', 'Rewards Intensive', 'description', 'Two extra lessons',
                     'topic', 'rewards TOPIC', 'sections', '[]'::jsonb),
  jsonb_build_object('course_id', 'c0000000-0000-0000-0000-000000000001', 'title', 'Old Holiday Camp', 'topic', 'Rewards topic',
                     'sections', '[1]'::jsonb, 'starts_on', current_date - 60, 'ends_on', current_date - 1)
)), 2, 'offers: the centre''s offers are loaded');
select test.expect((select count(*) from public.revision_offer_sections s join public.revision_offers o on o.id = s.offer_id
  where o.title = 'Rewards Intensive' and s.section_id = test.mixed()), 1, 'offers: a blank sub-topic list covers the whole topic');
select test.expect_error($q$select public.apply_revision_offers('a0000000-0000-0000-0000-000000000000', jsonb_build_array(
  jsonb_build_object('course_id', 'c0000000-0000-0000-0000-000000000001', 'title', 'X', 'topic', 'No such topic', 'sections', '[]'::jsonb)))$q$,
  '22023', 'offers: an unknown topic fails the load');
select test.expect_error($q$select public.apply_revision_offers('a0000000-0000-0000-0000-000000000000', jsonb_build_array(
  jsonb_build_object('course_id', 'c0000000-0000-0000-0000-000000000001', 'title', 'X', 'topic', 'Rewards topic', 'sections', '[42]'::jsonb)))$q$,
  '22023', 'offers: an unknown sub-topic number fails the load');
select test.expect((select count(*) from public.revision_offers where title = 'X'), 0, 'offers: a failed load saves nothing');

-- ---------------------------------------------------------------------------
-- 2. Who sees them
-- ---------------------------------------------------------------------------
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect(jsonb_array_length(public.my_revision_offers('a0000000-0000-0000-0000-000000000000')), 0,
  'offers: none without the guardian''s marketing consent');
select test.expect((select count(*) from public.revision_offers), 0, 'offers: students cannot read the table directly');
commit;

insert into public.consents (centre_id, student_id, purpose, policy_version, method, given_by_guardian_id, recorded_by, evidence_ref)
values ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'marketing', 'v1', 'online_form',
        'a3000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'form-response-90');

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
create temp table ro as select public.my_revision_offers('a0000000-0000-0000-0000-000000000000') as r;
select test.expect(jsonb_array_length((select r from ro)), 1, 'offers: with consent, current offers only (the ended camp is hidden)');
select test.expect((((select r from ro) -> 0 -> 'section_ids') ? test.mixed()::text)::int, 1, 'offers: each offer lists the sub-topics it covers');
select test.expect((((select r from ro) -> 0) ? 'price')::int, 0, 'offers: students never get a price');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set local role authenticated;
select test.expect(jsonb_array_length(public.my_revision_offers('a0000000-0000-0000-0000-000000000000')), 0,
  'offers: a guardian gets nothing through the student function');
select test.expect((select count(*) from public.revision_offers), 0, 'offers: guardians cannot read the table directly');
commit;

begin;
select test.login('bbbbbbbb-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect(jsonb_array_length(public.my_revision_offers('a0000000-0000-0000-0000-000000000000')), 0,
  'offers: centre B gets nothing for centre A');
select test.expect((select count(*) from public.revision_offers), 0, 'offers: centre B cannot read centre A''s offers');
select test.expect(test.rows_changed($q$update public.revision_offers set title = 'hacked'$q$), 0, 'offers: centre B cannot change them');
select test.expect_error($q$select public.apply_revision_offers('a0000000-0000-0000-0000-000000000000', '[]'::jsonb)$q$, '42501',
  'offers: only the import job can load offers');
commit;

begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set local role authenticated;
select test.expect((select count(*) from public.revision_offers), 2, 'offers: centre staff see their offers');
commit;

-- Withdrawing marketing consent hides them again.
update public.consents set withdrawn_at = now() where student_id = 'a4000000-0000-0000-0000-000000000000' and purpose = 'marketing';
begin;
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set local role authenticated;
select test.expect(jsonb_array_length(public.my_revision_offers('a0000000-0000-0000-0000-000000000000')), 0,
  'offers: hidden again once marketing consent is withdrawn');
commit;

-- Reloading a course's offers replaces them.
select public.apply_revision_offers('a0000000-0000-0000-0000-000000000000', jsonb_build_array(
  jsonb_build_object('course_id', 'c0000000-0000-0000-0000-000000000001', 'title', 'rewards intensive', 'topic', 'Rewards topic', 'sections', '[1]'::jsonb)));
select test.expect((select count(*) from public.revision_offers), 1, 'offers: an offer no longer listed is removed');
select test.expect((select count(*) from public.revision_offer_sections), 1, 'offers: sub-topics follow the latest list');

select 'ALL REVISION OFFER TESTS PASSED' as result;
