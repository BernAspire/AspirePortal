# Aspire Portal

All-in-one platform for Singapore tuition centres, piloted at Aspire Hub. This repository currently holds the **student portal track**: the shared foundation (centres, branches, people, programmes, courses) and, next, the student learning portal.

Project rules for anyone writing code here, including Claude, are in [CLAUDE.md](CLAUDE.md).

## What is here now

| Path | What it is |
| --- | --- |
| `supabase/migrations/` | Database schema. The only way the schema changes. Every table has row-level security (RLS). |
| `supabase/tests/local/` | Tenant-isolation tests: prove one centre, family or student can never see another's data. |
| `scripts/test-db-local.sh` | Runs all migrations and tests on a throwaway local Postgres database. |
| `.github/workflows/db-tests.yml` | Runs the same tests on every push and pull request. |
| `.github/workflows/db-deploy.yml` | Applies new migrations to Supabase when they reach `main` (after the secrets below are set). |

## One-time setup (owner)

### 1. Let GitHub deploy the database to Supabase

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret | Where to find it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → your avatar → **Account → Access tokens → Generate new token** |
| `SUPABASE_PROJECT_ID` | Supabase project → **Project Settings → General → Project ID** |
| `SUPABASE_DB_PASSWORD` | The database password you set when creating the project (reset it under **Project Settings → Database** if needed) |

Never paste these values into chat, issues or code.

### 2. Connect Vercel (after the app is added)

In Vercel: **Add New → Project → Import** this repository. Set the region to Singapore (`sin1`). Add environment variables from Supabase **Project Settings → API**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The service-role key is added later, only when a server feature needs it, and only in Vercel.

## Running the database tests locally

Requires Postgres 16 or later.

```bash
PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/test-db-local.sh
```
