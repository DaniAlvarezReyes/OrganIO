#!/usr/bin/env bash
# Pruebas de integración de la capa de datos de la app contra la base real (RLS incluida):
# Postgres + migraciones + PostgREST + supabase-js, con JWT de prueba firmados en el test.
# Requisitos: psql/createdb (Postgres 15+) y el binario `postgrest` en el PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${ORGANIO_IT_DB:-organio_it}"
SECRET="it-secret-$(date +%s)-0123456789abcdefghijklmnop"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
WORK="$(mktemp -d)"

dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
"${PSQL[@]}" -f "$ROOT/scripts/db-ci/supabase_stub.sql" >/dev/null
for m in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$m" >/dev/null; done
"${PSQL[@]}" -c "insert into private.signup_allowlist values ('a@it.dev'), ('b@it.dev');
  insert into auth.users (id, email) values
    ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@it.dev'),
    ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@it.dev');" >/dev/null

PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:5432/$DB" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" \
PGRST_SERVER_PORT=3100 PGRST_LOG_LEVEL=crit postgrest >"$WORK/postgrest.log" 2>&1 &
PGRST_PID=$!
PGRST_URL=http://127.0.0.1:3100 PROXY_PORT=54399 node "$ROOT/scripts/it/proxy.mjs" &
PROXY_PID=$!
trap 'kill $PGRST_PID $PROXY_PID 2>/dev/null || true; rm -rf "$WORK"' EXIT

for _ in $(seq 1 50); do curl -sf http://127.0.0.1:3100/ >/dev/null && break; sleep 0.2; done

cd "$ROOT/apps/app"
ORGANIO_IT_REQUIRED=1 ORGANIO_IT_URL=http://127.0.0.1:54399 ORGANIO_IT_JWT_SECRET="$SECRET" TZ=Europe/Madrid npx vitest run tests/
