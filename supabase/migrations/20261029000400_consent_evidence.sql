-- Consent recorded outside the portal (pilot: an online form; later also paper).
--
-- Until the parent portal exists, guardians give consent through an online form and the
-- centre records it. Each such row says how it was given, by which guardian, who
-- recorded it, and a reference to the form response, so it can be evidenced later.
-- Portal consent (method 'portal') keeps working as before: the guardian is signed in
-- and is the one inserting the row.

create type public.consent_method as enum ('portal', 'online_form', 'paper');

alter table public.consents
  add column method               public.consent_method not null default 'portal',
  add column given_by_guardian_id uuid,
  add column recorded_by          uuid references auth.users (id),
  add column evidence_ref         text check (evidence_ref is null or length(evidence_ref) between 1 and 200),
  alter column given_by_user_id drop not null,
  add constraint consents_given_by_guardian_fk
    foreign key (centre_id, given_by_guardian_id) references public.guardians (centre_id, id),
  -- Someone identifiable gave it: a signed-in user, or a guardian on record.
  add constraint consents_giver check (given_by_user_id is not null or given_by_guardian_id is not null),
  -- Portal consent is always given by the signed-in user.
  add constraint consents_portal_giver check (method <> 'portal' or given_by_user_id is not null),
  -- Offline consent names the guardian, who recorded it and the evidence.
  add constraint consents_offline_evidence check (
    method = 'portal'
    or (given_by_guardian_id is not null and recorded_by is not null and evidence_ref is not null)
  );

-- Guardians may only insert portal consent for themselves (unchanged otherwise).
drop policy consents_guardian_insert on public.consents;
create policy consents_guardian_insert on public.consents for insert to authenticated
  with check (
    method = 'portal'
    and given_by_user_id = (select auth.uid())
    and withdrawn_at is null
    and (guardian_id is null or guardian_id in (select app.my_guardian_ids(centre_id)))
    and (student_id is null or student_id in (select app.guardian_student_ids(centre_id)))
  );

-- Centre staff record offline consent for a guardian and that guardian's own child.
create policy consents_staff_record on public.consents for insert to authenticated
  with check (
    (select app.is_staff(centre_id))
    and method <> 'portal'
    and recorded_by = (select auth.uid())
    and withdrawn_at is null
    and given_by_user_id is null
    and (student_id is null or exists (
      select 1 from public.guardian_students gs
      where gs.centre_id = consents.centre_id
        and gs.guardian_id = consents.given_by_guardian_id
        and gs.student_id = consents.student_id
    ))
  );

-- Centre staff may record a withdrawal (e.g. a guardian asks by phone). Only withdrawn_at
-- is updatable for authenticated users (granted in the CRM migration).
create policy consents_staff_withdraw on public.consents for update to authenticated
  using ((select app.is_staff(centre_id)) and withdrawn_at is null)
  with check ((select app.is_staff(centre_id)));

comment on column public.consents.method is 'How consent was given: in the portal, through the centre''s online form, or on paper.';
comment on column public.consents.evidence_ref is 'Reference to the form response or document that evidences offline consent.';
