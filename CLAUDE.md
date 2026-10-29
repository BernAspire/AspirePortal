# CLAUDE.md — Tuition Centre CRM

All-in-one, multi-tenant platform for Singapore tuition centres: CRM, scheduling, billing, question bank,
worksheets, e-learning, practice, mock exams, revision, gamification and an AI tutor with teacher escalation.
Piloted at Aspire Hub (multiple branches). Greenfield build: nothing is migrated. The "Aspire Online" screen
recording is a mockup and serves as the student-portal design target. Built for many centres from day one.
Full plan (PRD, architecture, schema, security, gap analysis, roadmap): see the "Tuition Centre CRM — Product & Technical Plan" doc.

## Vocabulary (use these words exactly)

- **Centre** = the tenant (an organisation, e.g. Aspire Hub). **Branch** = a physical location of a centre.
- **Programme** = what a family buys access to (e-learning, physical lecture, live tutorial, academic coaching), with a validity period.
- **Course** = subject × level (e.g. Primary 6 Science).
- **Lesson** = an e-learning unit inside a course, made of **parts**. Never use "lesson" for a timetabled class.
- **Session** = a dated, scheduled occurrence (physical tutorial, live tutorial, academic coaching). **Class** = the recurring template that generates sessions.
- **Booking** = a student's seat in a session.

> Status: BUILDING. Approved 29 Oct 2026: the student portal (plus the foundation it needs) is built in this repo with Claude; other portals are decided later.
> Current phase: **S1 — Learn (student-portal track)**
> Done: Phase 0 foundation (tenancy, RLS, sign-in, student shell in the Aspire Online design); S1 schema (lessons, online-form consent, PIN lockout, lesson files); lesson importer (PowerPoint/Word → page images, GitHub job); Learn page, lesson viewer with hidden worked solutions, progress, Continue learning; student username + PIN sign-in (logins set up via `docs/runbooks/student-logins.md`).
> Next: import real lessons via `docs/runbooks/import-lessons.md`; domain email sender before real users; question bank (waiting on the bank's source file).

---

## Stack

- Next.js (App Router) + TypeScript (`strict: true`, no `any`)
- Tailwind CSS + shadcn/ui (Radix). Use existing shadcn components before writing new ones.
- Supabase: Postgres, Auth, Storage, Cron, Queues — **Singapore region**
- Vercel — functions pinned to `sin1`
- Payments: Stripe Connect, direct charges on the centre's connected account (PayNow + cards), behind a `PaymentProvider` interface
- Validation: Zod. Forms: react-hook-form. Dates: `@date-fns/tz`. Recurrence: `rrule`.
- Maths: KaTeX (+ mhchem) server-side; MathJax 3 SVG fallback only if discovery requires it
- PDFs: HTML + print CSS → headless Chromium, behind a `PdfRenderer` interface
- Tests: Vitest (unit), pgTAP (database/RLS), Playwright (end-to-end, PDF, visual regression)

## Repository layout

```
src/
  app/
    (marketing)/               public pages
    (auth)/                    sign-in, start (portal routing), centre picker, no-access
    student/ (admin, teacher, parent later)   one top-level segment per portal
    platform/                  super-admin console
    api/                       route handlers: webhooks, jobs only
  modules/
    <module>/                  core, crm, academics, programmes, scheduling, bookings,
                               attendance, billing, payments, question-bank, worksheets,
                               elearning, practice, assessments, revision, coaching,
                               engagement, tutor, notifications, reporting, platform
      actions.ts               server actions (public write API)
      queries.ts               server-side reads (public read API)
      service.ts               domain logic, no framework imports
      schema.ts                Zod schemas and types
      components/              module UI
      index.ts                 the ONLY file other modules may import from
  lib/
    supabase/                  server/browser clients, proxy session refresh, generated types
    auth/                      routing rules, active centre, session (requirePortal, requireUser)
    money.ts                   cents helpers, GST
    time.ts                    Asia/Singapore helpers
  components/ui/               shadcn components
supabase/
  migrations/                  the only way the schema changes
  tests/                       pgTAP tests (RLS, constraints)
  seed.sql                     two fake centres + users of every role
tests/e2e/                     Playwright
docs/                          ADRs, discovery report, runbooks
```

## Non-negotiable rules

### Tenancy and security
1. Every tenant table has `centre_id uuid not null`, `unique (centre_id, id)`, and composite foreign keys `(centre_id, x_id) → x(centre_id, id)`.
2. Every table in `public` has RLS **enabled and forced**. A new table without policies fails CI.
3. Policies use helper functions in the `app` schema (`app.is_member`, `app.has_role`, `app.is_staff`, `app.is_centre_admin`, `app.guardian_student_ids`, `app.my_student_ids`, `app.can_see_student`, `app.has_course_access`; teacher access via sessions comes later), called as `(select app.fn(...))`. Every new table must get a section in `supabase/tests/local/` proving cross-tenant denial.
4. Membership in `centre_memberships` is the source of truth. The JWT `active_centre_id` claim only narrows scope; never trust a role sent from the client.
5. User-initiated reads and writes use the user's Supabase session so RLS applies. The service-role key is used **only** in webhooks, jobs and the PDF worker, in files importing `server-only`, and those code paths must set `centre_id` explicitly.
6. Every server action: authenticate → Zod-validate → capability check → single transaction → audit row → outbox event.
7. Never compute prices, totals or credits from client input. Recompute on the server from database rows.
8. Storage paths start with `centres/{centre_id}/`. Buckets are private; serve files via short-lived signed URLs.
9. Imported question HTML is sanitised against an allowlist before storage. Never render unsanitised HTML; never use `dangerouslySetInnerHTML` on anything except renderer output.
10. No tenant-specific code (`if (centre.slug === ...)`). Differences are centre settings validated by Zod.
11. Branch is a scope inside a centre, not a tenant. Tables that belong to a place (rooms, classes, sessions) carry `branch_id`; RLS isolation stays at `centre_id`.
12. Every learning feature (lessons, practice, mock exams, revision, live tutorials, AI tutor) checks an active `programme_enrolments` row (valid today) for the student and course before serving content.

### Data rules
- Money: integer cents (`bigint`) + `currency`. No floats, ever. GST computed per line, rounded half-up to the cent.
- Time: store `timestamptz` (UTC); display and compute business rules in `Asia/Singapore`.
- Ledgers (`credit_ledger`, `payments`, `audit_log`, `webhook_events`, `xp_ledger`, `learning_events`, `tutor_messages`) are append-only. Fix mistakes with new rows. Balances, levels and totals are derived, never stored as editable numbers.
- Tutorial and lesson credits are tracked per subject/programme (`credit_ledger.subject_id`, `programme_id`).
- Practice and exam answers record the `question_version` they were given, so marking and history stay correct after a question is edited.
- Invoice/receipt numbers come from `document_sequences` inside the issuing transaction (gap-free per centre).
- Lesson clashes are prevented by exclusion constraints, not only by app checks.
- Webhooks are idempotent (`webhook_events.event_id` unique) and are the only path that marks an invoice paid.

### PDPA
- Collect only fields a feature needs. **Never collect NRIC numbers.**
- Students under 13: guardian consent recorded in `consents` before any data beyond enrolment basics. Default to guardian consent for all students.
- Personal data edits, consent changes, role changes and money events are audit-logged.
- Deletion = soft delete, then anonymisation by the retention job. Financial records follow the retention schedule.
- Never log personal data (names, emails, phones, DOB) to console, Sentry or analytics.
- No production data in dev or staging. Use `seed.sql`.
- Offers and recommendations are shown to guardians only, never to students, and only with guardian marketing consent.
- Leagues and any ranking between students are opt-in and show nicknames only.
- Raw `learning_events` are purged by the retention job after the retention period; keep only aggregates.

### AI tutor
- All Anthropic API calls happen server-side in `modules/tutor`; the API key never reaches the browser.
- Prompts include only the student's message, the question/solution or lesson content, course name and recent thread. Never send names, contact details, school, client code or other personal data.
- The tutor gives hints before steps and never just the final answer; it stays on schoolwork.
- Escalate to the class teacher when the student asks, confidence is low, the question is unsolved after N turns (centre setting), or a safety filter flags the message. Distress or harm-related messages escalate immediately.
- Check guardian opt-in, programme entitlement and the daily limit before every call. Record tokens per message for cost tracking.
- Look up current model names, prices and data terms in Anthropic's documentation when building; do not hard-code assumptions from this file.

### Modules
- A module writes only its own tables. Other modules call its `index.ts` exports.
- Cross-module side effects go through the outbox (`notifications`, domain events), written in the same transaction.

## Question bank

- Do **not** assume the structure of the existing HTML question bank. Any importer work starts from `docs/question-bank-discovery.md`, produced in Phase 5a from real files.
- Canonical content is structured JSON blocks; original HTML is kept for traceability.
- One renderer (`modules/question-bank/render`) serves both screen and PDF. Any change to it must pass the golden-set visual regression test.

## Commands

Package manager: pnpm (version pinned in `package.json`). Node 22+.

```
pnpm install
pnpm dev                 # Next.js dev server (needs .env.local, see .env.example)
pnpm typecheck           # next typegen + tsc
pnpm lint                # ESLint, zero warnings allowed
pnpm test                # Vitest unit tests (run with TZ=UTC)
pnpm build               # production build
pnpm test:e2e            # Playwright smoke tests against `pnpm start` (run `pnpm build` first)
PGHOST=/tmp PGPORT=54329 PGUSER=postgres pnpm test:db   # migrations + RLS tests on a local Postgres 16
python3 -m unittest -q   # in scripts/lesson_import: importer naming rules
python3 scripts/lesson_import/import_lessons.py build --out ./out FILES   # convert lessons locally (needs LibreOffice, Poppler, python-pptx, Pillow)
```

Local DB tests use `supabase/tests/local/00_supabase_shim.sql` to stand in for Supabase's `auth` schema and roles. It is never applied to Supabase. CI runs the same script (`.github/workflows/db-tests.yml`); `.github/workflows/db-deploy.yml` pushes migrations to Supabase once the repository secrets are set. `.github/workflows/app-ci.yml` runs typecheck, lint, unit tests, build and the Playwright smoke test on every pull request.

Planned:

```
pnpm db:types            # regenerate Supabase types after a migration
supabase migration new <name>
```

App notes (see ADR 0002): Next.js 16 with Cache Components; middleware is `src/proxy.ts` and only refreshes the session; anything reading cookies renders inside `<Suspense>`. Read the bundled guides in `node_modules/next/dist/docs/` before using a Next.js API you are unsure of (see `AGENTS.md`).

## Definition of done (every change)

- [ ] Typecheck, lint, unit tests pass
- [ ] New/changed tables: migration + RLS policies + pgTAP tests, including a cross-tenant denial test
- [ ] New server action: Zod schema, capability check, audit entry, test
- [ ] UI: works at 375 px width; keyboard accessible; loading and error states
- [ ] Money or booking logic: tests for each policy edge case (cut-off times, expiry, partial payments)
- [ ] No secrets, no personal data in logs, no `any`

## Working with Claude

- This file binds everyone who writes code here: the vendor team's developers and any Claude Code session. The client owns the repository and all cloud accounts.
- Every pull request is reviewed by the client's independent technical reviewer before merge to `main`.
- Work one roadmap phase at a time; confirm scope before starting a phase.
- Propose schema changes as a migration diff and wait for approval before applying.
- When a requirement is ambiguous (especially fees, cancellation policy, or question bank format), ask rather than guess.
- Record significant decisions as short ADRs in `docs/adr/NNNN-title.md`.
- Keep this file current: update "Current phase" and commands as they change.
