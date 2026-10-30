# 0010 · "Recommended for you": offers shown to students, matched to weak topics

Date: 30 Oct 2026 · Status: accepted pending owner approval of the migration (PR)

## Context

The owner's Smart Revision recording shows a "Recommended for you" area. CLAUDE.md's PDPA section said offers and recommendations go to guardians only, never to students, and only with guardian marketing consent.

## Decision (owner, 30 Oct 2026)

1. **Shown to students, with no way to pay.** Owner: "show to students. but students will not be able to make payment etc". Students see the offer's name, the subject, which of their weak sub-topics it covers and a short description, then "Ask your parent or the centre about it". No price, no buy or sign-up button, no link to payment.
2. **Guardian marketing consent is still required** (owner confirmed). `public.my_revision_offers` returns nothing unless the student has an active `consents` row with purpose `marketing`. Withdrawing it hides offers immediately.
3. **Matched to weak topics** (owner's choice). Each offer is tagged with question-bank sub-topics. A student sees an offer only for a course they can learn, while it is current (optional From / Until dates), and only if at least one of its sub-topics is weak for them (ADR 0009 rule). At most two offers are shown, the closest match first.
4. **Entered by staff in the timetable spreadsheet** (new **Offers** sheet: Level, Subject, Offer, Description, Topic, Sub-topics, From date, Until date), loaded by the import job through `public.apply_revision_offers` (service role). Listing a course's offers replaces that course's offers. An unknown topic or sub-topic number fails the whole file.
5. **Access:** `revision_offers` and `revision_offer_sections` are readable and writable by staff of the centre only. Students and guardians have no direct table access; students read through the consent-gated function.

## Consequences

- CLAUDE.md's PDPA line is updated to match: offers go to guardians, and to students only as decided here, always with guardian marketing consent and never with a payment step for students.
- When the parent portal arrives, guardians can see the same offers with prices and payment, using the same tables.
- Nothing about which offers a student was shown is recorded, so no extra personal data is collected.
