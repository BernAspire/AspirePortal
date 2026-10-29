# ADR 0003: Email code sign-in and the active centre

Date: 29 Oct 2026 · Status: proposed (accepted on merge)

## Decision

- **Sign-in is a 6-digit code sent by email** (Supabase email OTP), entered on the same page. No passwords, no magic links, so it works when the email is opened on a different device from the portal.
- **Invite-only.** The app calls Supabase with `shouldCreateUser: false`, and self sign-up is turned off in Supabase. Centres create accounts.
- **No account discovery.** The response to "send me a code" is the same whether or not the email has an account. Only rate limits and outages are reported differently, so users aren't told a code is coming when Supabase is down.
- **Active centre** is remembered in an `httpOnly` cookie (`aspire_centre`). It is honoured only if it names a centre where the user has an active membership at the time of the request, and only for the portal's role (a student portal ignores a centre where the user is only a guardian). With one centre there is nothing to choose; with several, `/centres` asks. RLS remains the boundary; the cookie only narrows what the UI shows. This replaces the JWT `active_centre_id` claim for now, which would need a Supabase custom access-token hook; that can come later without changing pages.
- **Routing:** `/start` sends a signed-in user to their portal. Only the student portal exists; other roles see `/no-access`. The proxy redirects signed-out visitors away from portal paths early, but every page and action checks again on the server.
- **Reads** go through module `queries.ts` files with the user's session. Each query is a simple filter (no PostgREST embedding), results are validated with Zod, and pure functions in `service.ts` combine them. `supabase/tests/local/20_student_portal_reads.sql` runs the same reads as a student login to prove RLS allows them and blocks other students and centres.
- **Forms:** the sign-in forms use React `useActionState` with server-side Zod validation rather than react-hook-form. They have one or two fields and work without JavaScript this way. react-hook-form stays the choice for larger forms.

## Consequences

- Supabase's email template must include `{{ .Token }}` and a real SMTP sender is needed before the pilot (`docs/runbooks/supabase-auth-setup.md`).
- Students need an email address of their own. A login is one email, and one student record per centre links to it.
- Personal data is never put in cache keys: reads are memoised per request only (`React.cache`), not with `use cache`.
