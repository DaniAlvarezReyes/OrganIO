#!/usr/bin/env bash
# Prueba de extremo a extremo del build web: sesión iniciada, lista de tareas y captura rápida
# contra Postgres + migraciones + PostgREST. Requisitos: Postgres, `postgrest` en el PATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; DB=organio_e2e; SECRET="e2e-$(date +%s)-0123456789abcdefghijklmnopqrstuv"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
WORK="$(mktemp -d)"
dropdb --if-exists $DB >/dev/null 2>&1 || true; createdb $DB
"${PSQL[@]}" -f $ROOT/scripts/db-ci/supabase_stub.sql >/dev/null
for m in $ROOT/supabase/migrations/*.sql; do "${PSQL[@]}" -f $m >/dev/null; done
"${PSQL[@]}" -c "insert into private.signup_allowlist values ('a@it.dev');
 insert into auth.users (id,email) values ('aaaaaaaa-0000-4000-8000-00000000000a','a@it.dev');
 insert into public.tasks (user_id,title,status) values ('aaaaaaaa-0000-4000-8000-00000000000a','Tarea sembrada','todo');" >/dev/null
sign() { node -e "const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const x=b({alg:'HS256',typ:'JWT'})+'.'+b({...JSON.parse(process.argv[1]),exp:Math.floor(Date.now()/1000)+3600});console.log(x+'.'+c.createHmac('sha256',process.argv[2]).update(x).digest('base64url'))" "$1" "$SECRET"; }
ANON=$(sign '{"role":"anon"}'); USER_JWT=$(sign '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated","aud":"authenticated"}')
PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:5432/$DB" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=3101 postgrest >"$WORK/postgrest.log" 2>&1 &
P1=$!; PGRST_URL=http://127.0.0.1:3101 PROXY_PORT=54398 node $ROOT/scripts/it/proxy.mjs & P2=$!
trap 'kill $P1 $P2 2>/dev/null || true; rm -rf "$WORK"' EXIT
for _ in $(seq 1 50); do curl -sf http://127.0.0.1:3101/ >/dev/null && break; sleep 0.2; done
cd $ROOT/apps/app
EXPO_OFFLINE=1 CI=1 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 EXPO_PUBLIC_SUPABASE_KEY="$ANON" npx expo export --clear --platform web --dump-sourcemap --output-dir "$WORK/dist" >"$WORK/export.log" 2>&1 || { tail -20 "$WORK/export.log"; exit 1; }
cd $ROOT && TZ=Europe/Madrid node scripts/it/e2e-web.mjs "$WORK/dist" "$USER_JWT" aaaaaaaa-0000-4000-8000-00000000000a http://127.0.0.1:54398 "$ANON"
