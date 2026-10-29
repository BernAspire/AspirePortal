# ADR 0001: Shared-schema tenancy enforced by Postgres row-level security

Date: 29 Oct 2026 · Status: accepted

## Decision

All centres share one Supabase database and one schema. Every tenant table has `centre_id`, `unique (centre_id, id)` and composite foreign keys, and every table in `public` has RLS enabled and forced. Access is decided by `centre_memberships` through helper functions in the private `app` schema.

## Why

One database is cheapest to run and gives one migration path. Isolation enforced by the database still holds when application code has a bug. Composite foreign keys make cross-centre links impossible even for privileged code.

## Consequences

- New tables must follow the pattern and add isolation tests in `supabase/tests/local/`; CI fails if any `public` table lacks forced RLS or policies.
- Teachers get access to student records only through sessions they teach (added with scheduling).
- Branch is a scope inside a centre, not a separate tenant.
