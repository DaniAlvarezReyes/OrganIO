#!/usr/bin/env bash
# Aplica las migraciones sobre una base limpia y ejecuta las pruebas pgTAP.
# Uso: scripts/test-db.sh            (necesita psql, createdb y pg_prove en el PATH)
# Con Docker y la CLI de Supabase, lo equivalente es: supabase db reset && supabase test db
set -euo pipefail

DB="${ORGANIO_TEST_DB:-organio_test}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"

"${PSQL[@]}" -f "$ROOT/scripts/db-ci/supabase_stub.sql" >/dev/null
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$migration")"
  "${PSQL[@]}" -f "$migration" >/dev/null
done

pg_prove -d "$DB" --ext .sql -r "$ROOT/supabase/tests/database"
