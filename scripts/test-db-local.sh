#!/usr/bin/env bash
# Runs all migrations and the tenant-isolation tests against a throwaway database on a
# local Postgres (16+). Usage:
#   PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/test-db-local.sh
# Exits non-zero on the first failure.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="aspire_test_$$"

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }

run "$ROOT/supabase/tests/local/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  run "$f"
done
for f in "$ROOT"/supabase/tests/local/[1-9]*.sql; do
  echo "test: $(basename "$f")"
  status=0
  out="$(psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1)" || status=$?
  printf '%s\n' "$out" | grep -E 'ok - |FAIL|ERROR|PASSED' | sed -E 's/^.*NOTICE: +//' || true
  if [ "$status" -ne 0 ]; then
    echo "FAILED: $(basename "$f")" >&2
    exit "$status"
  fi
done
echo "Database tests passed."
