-- =============================================================================
-- OrganIO · Esquema principal
--
-- Principios de seguridad aplicados en este fichero:
--   1. RLS en TODAS las tablas expuestas, con una política por operación y solo para
--      el rol `authenticated`. El rol `anon` no tiene privilegios sobre ninguna tabla.
--   2. Privilegios por columna: el cliente solo puede escribir las columnas que le
--      corresponden (nunca user_id, plan, last_progress_at, marcas de tiempo…).
--   3. Claves foráneas compuestas (task_id, user_id) → es imposible colgar una
--      subtarea, nota o adjunto de una tarea de otro usuario, aunque se conozca su id.
--   4. Funciones SECURITY DEFINER con search_path vacío y EXECUTE revocado a PUBLIC.
--   5. Lo que el servidor calcula (historial, progreso, vector de búsqueda) lo escriben
--      disparadores; el cliente no puede falsearlo.
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- Supabase concede por defecto privilegios a anon/authenticated sobre objetos nuevos
-- de `public`. Los retiramos y concedemos después lo mínimo, tabla a tabla.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tipos y configuración de búsqueda en español sin acentos
-- -----------------------------------------------------------------------------
create type public.task_status as enum ('inbox', 'todo', 'in_progress', 'blocked', 'done', 'discarded');
create type public.task_source as enum ('app', 'share', 'widget', 'shortcut', 'notification', 'bot', 'email');
create type public.plan_tier as enum ('free', 'pro');

create text search configuration public.es_unaccent (copy = pg_catalog.spanish);
alter text search configuration public.es_unaccent
  alter mapping for hword, hword_part, word with extensions.unaccent, spanish_stem;

-- -----------------------------------------------------------------------------
-- Configuración interna (no expuesta por la API)
-- -----------------------------------------------------------------------------
create table private.settings (
  key text primary key,
  value text not null
);
insert into private.settings (key, value) values
  ('signup_mode', 'invite_only');   -- 'invite_only' | 'open'  → cambiar a 'open' al comercializar

create table private.signup_allowlist (
  email text primary key check (email = lower(email))
);

create table private.app_features (
  key text primary key,
  enabled boolean not null default false,
  min_plan public.plan_tier not null default 'free',
  note text
);
-- Sincronizado con packages/core/src/features.ts. Se encienden a medida que se entrega cada parte.
insert into private.app_features (key, enabled, note) values
  ('email_otp_login', true,  'Entrega 2'),
  ('web_app',         true,  'Entrega 2'),
  ('tasks',           true,  'Entrega 2'),
  ('quick_capture',   true,  'Entrega 2'),
  ('task_details',    true,  'Entrega 3'),
  ('search',          true,  'Entrega 3'),
  ('telegram_bot',    false, 'Entrega 4 · requiere token de BotFather'),
  ('stale_nudges',    false, 'Entrega 4'),
  ('ai_subtasks',     false, 'Entrega 5 · requiere ANTHROPIC_API_KEY'),
  ('routines',        false, 'Entrega 6'),
  ('google_calendar', false, 'Entrega 7 · requiere proyecto de Google Cloud'),
  ('google_sign_in',  false, 'Entrega 7 · requiere cliente OAuth de Google'),
  ('share_capture',   false, 'Entrega 8 · app nativa'),
  ('widgets',         false, 'Entrega 8 · requiere Apple Developer Program'),
  ('app_lock',        false, 'Entrega 8 · app nativa'),
  ('push_notifications', false, 'Entrega 8 · en iPhone requiere Apple Developer Program'),
  ('apple_sign_in',   false, 'Entrega 8 · requiere Apple Developer Program'),
  ('semantic_search', false, 'Posterior'),
  ('whatsapp_bot',    false, 'Posterior · requiere WhatsApp Business verificado'),
  ('email_capture',   false, 'Posterior'),
  ('subscriptions',   false, 'Comercialización');

create table private.plan_limits (
  plan public.plan_tier primary key,
  ai_requests_per_day integer not null check (ai_requests_per_day >= 0)
);
insert into private.plan_limits (plan, ai_requests_per_day) values ('free', 30), ('pro', 200);

create or replace function private.plan_rank(p public.plan_tier)
returns integer language sql immutable set search_path = '' as $$
  select case p when 'free' then 0 when 'pro' then 1 end
$$;

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.normalize_tags(input text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  result text[] := '{}';
  t text;
begin
  if input is null then
    return result;
  end if;
  foreach t in array input loop
    t := lower(btrim(t));
    if t = '' then
      continue;
    end if;
    if t !~ '^[a-z0-9áéíóúüñ_-]{1,32}$' then
      raise exception 'Etiqueta no válida: %', left(t, 40) using errcode = '22023';
    end if;
    if not t = any (result) then
      result := result || t;
    end if;
  end loop;
  if cardinality(result) > 20 then
    raise exception 'Máximo 20 etiquetas por tarea' using errcode = '22023';
  end if;
  return result;
end;
$$;

-- Misma tabla que packages/core/src/status.ts (TRANSITIONS)
create or replace function private.is_valid_transition(from_s public.task_status, to_s public.task_status)
returns boolean language sql immutable set search_path = '' as $$
  select from_s = to_s or (from_s, to_s) in (
    ('inbox', 'todo'), ('inbox', 'in_progress'), ('inbox', 'done'), ('inbox', 'discarded'),
    ('todo', 'inbox'), ('todo', 'in_progress'), ('todo', 'done'), ('todo', 'discarded'),
    ('in_progress', 'todo'), ('in_progress', 'blocked'), ('in_progress', 'done'), ('in_progress', 'discarded'),
    ('blocked', 'todo'), ('blocked', 'in_progress'), ('blocked', 'discarded'),
    ('done', 'todo'),
    ('discarded', 'todo')
  )
$$;

-- -----------------------------------------------------------------------------
-- Perfiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'Europe/Madrid' check (char_length(timezone) between 1 and 64),
  nudge_hour smallint not null default 9 check (nudge_hour between 0 and 23),
  stale_days_default smallint not null default 7 check (stale_days_default between 1 and 90),
  plan public.plan_tier not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.validate_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria no válida: %', left(new.timezone, 64) using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_validate before insert or update of timezone on public.profiles
  for each row execute function private.validate_profile();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Alta de usuarios: solo por invitación mientras signup_mode = 'invite_only'
create or replace function private.enforce_signup_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  mode text;
begin
  select value into mode from private.settings where key = 'signup_mode';
  if coalesce(mode, 'invite_only') = 'invite_only'
     and not exists (select 1 from private.signup_allowlist a where a.email = lower(new.email)) then
    raise exception 'signup_not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_before_insert before insert on auth.users
  for each row execute function private.enforce_signup_policy();
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Tareas
-- -----------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 10000),
  status public.task_status not null default 'inbox',
  priority smallint not null default 0 check (priority between 0 and 3),
  due_at timestamptz,
  due_has_time boolean not null default false,
  tags text[] not null default '{}',
  source public.task_source not null default 'app',
  stale_after_days smallint check (stale_after_days between 1 and 90),
  snoozed_until timestamptz,
  last_progress_at timestamptz not null default now(),
  completed_at timestamptz,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index tasks_user_status_idx on public.tasks (user_id, status, updated_at desc);
create index tasks_user_due_idx on public.tasks (user_id, due_at) where due_at is not null;
create index tasks_stale_idx on public.tasks (last_progress_at)
  where status in ('inbox', 'todo', 'in_progress', 'blocked');
create index tasks_search_idx on public.tasks using gin (search_vector);
create index tasks_tags_idx on public.tasks using gin (tags);

-- SECURITY DEFINER: llama a funciones de `private`, esquema al que el cliente no tiene acceso.
-- Solo transforma la fila NEW que ya ha pasado RLS; no lee ni escribe otras filas.
create or replace function private.tasks_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.title := btrim(new.title);
  new.tags := private.normalize_tags(new.tags);

  if tg_op = 'UPDATE' then
    if not private.is_valid_transition(old.status, new.status) then
      raise exception 'Transición no permitida: % → %', old.status, new.status using errcode = '22023';
    end if;
    if new.status is distinct from old.status then
      new.last_progress_at := now();
      new.snoozed_until := null;
      new.completed_at := case when new.status = 'done' then now() else null end;
    end if;
  else
    new.last_progress_at := now();
    new.completed_at := case when new.status = 'done' then now() else null end;
  end if;

  new.search_vector :=
    setweight(to_tsvector('public.es_unaccent', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('public.es_unaccent', array_to_string(new.tags, ' ')), 'A') ||
    setweight(to_tsvector('public.es_unaccent', coalesce(new.description, '')), 'B');
  return new;
end;
$$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function private.tasks_before_write();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Subtareas, notas, adjuntos
-- -----------------------------------------------------------------------------
create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  task_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  done boolean not null default false,
  done_at timestamptz,
  position integer not null default 0 check (position between 0 and 10000),
  estimated_minutes smallint check (estimated_minutes between 1 and 1440),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  calendar_event_id text check (char_length(calendar_event_id) <= 1024),
  suggested_by_ai boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  check (scheduled_end is null or (scheduled_start is not null and scheduled_end > scheduled_start))
);
create index subtasks_task_idx on public.subtasks (task_id, position);

create or replace function private.subtasks_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title);
  if tg_op = 'INSERT' or new.done is distinct from old.done then
    new.done_at := case when new.done then now() else null end;
  end if;
  return new;
end;
$$;
create trigger subtasks_before_write before insert or update on public.subtasks
  for each row execute function private.subtasks_before_write();
create trigger subtasks_updated_at before update on public.subtasks
  for each row execute function private.set_updated_at();

create table public.task_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  task_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  search_vector tsvector generated always as (to_tsvector('public.es_unaccent', body)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index task_notes_task_idx on public.task_notes (task_id, created_at desc);
create index task_notes_search_idx on public.task_notes using gin (search_vector);
create trigger task_notes_updated_at before update on public.task_notes
  for each row execute function private.set_updated_at();

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  task_id uuid not null,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  width integer check (width between 1 and 20000),
  height integer check (height between 1 and 20000),
  created_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  -- La ruta en Storage debe ser <user_id>/<task_id>/<fichero>: coherente con las políticas del bucket
  check (
    split_part(storage_path, '/', 1) = user_id::text
    and split_part(storage_path, '/', 2) = task_id::text
    and split_part(storage_path, '/', 3) ~ '^[a-f0-9-]{36}\.(jpg|png|webp|heic)$'
    and split_part(storage_path, '/', 4) = ''
  )
);
create index attachments_task_idx on public.attachments (task_id, created_at);

-- -----------------------------------------------------------------------------
-- Historial de actividad (solo lo escriben disparadores del servidor)
-- -----------------------------------------------------------------------------
create table public.task_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid not null,
  kind text not null check (kind in (
    'created', 'status_changed', 'subtask_done', 'note_added', 'attachment_added', 'progress_reported', 'nudged'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index task_events_task_idx on public.task_events (task_id, created_at desc);

create or replace function private.log_event(p_user uuid, p_task uuid, p_kind text, p_payload jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.task_events (user_id, task_id, kind, payload) values (p_user, p_task, p_kind, p_payload);
$$;

create or replace function private.bump_progress(p_task uuid)
returns void language sql security definer set search_path = '' as $$
  update public.tasks set last_progress_at = now() where id = p_task;
$$;

create or replace function private.tasks_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_event(new.user_id, new.id, 'created', jsonb_build_object('source', new.source));
  elsif new.status is distinct from old.status then
    perform private.log_event(new.user_id, new.id, 'status_changed',
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;
create trigger tasks_after_write after insert or update of status on public.tasks
  for each row execute function private.tasks_after_write();

-- Cualquier avance en hijos actualiza last_progress_at de la tarea. Es SECURITY DEFINER porque el
-- cliente no tiene permiso de escritura sobre esa columna; la clave compuesta ya garantiza que la
-- tarea es del mismo usuario que la fila que dispara.
create or replace function private.children_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'subtasks' then
    if new.done and (tg_op = 'INSERT' or not old.done) then
      perform private.bump_progress(new.task_id);
      perform private.log_event(new.user_id, new.task_id, 'subtask_done',
        jsonb_build_object('subtask_id', new.id, 'title', left(new.title, 200)));
    end if;
  elsif tg_table_name = 'task_notes' then
    perform private.bump_progress(new.task_id);
    perform private.log_event(new.user_id, new.task_id, 'note_added', jsonb_build_object('note_id', new.id));
  elsif tg_table_name = 'attachments' then
    perform private.bump_progress(new.task_id);
    perform private.log_event(new.user_id, new.task_id, 'attachment_added', jsonb_build_object('attachment_id', new.id));
  end if;
  return null;
end;
$$;
create trigger subtasks_after_write after insert or update of done on public.subtasks
  for each row execute function private.children_after_write();
create trigger task_notes_after_insert after insert on public.task_notes
  for each row execute function private.children_after_write();
create trigger attachments_after_insert after insert on public.attachments
  for each row execute function private.children_after_write();

-- -----------------------------------------------------------------------------
-- Rutinas (fase 2: esquema listo, interfaz en la siguiente iteración)
-- -----------------------------------------------------------------------------
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  rrule text not null check (rrule ~ '^(RRULE:)?FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+-]+)*$' and char_length(rrule) <= 500),
  remind_at time,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create trigger routines_updated_at before update on public.routines
  for each row execute function private.set_updated_at();

create table public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  routine_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now(),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade
);

create table public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  routine_id uuid not null,
  occurrence_date date not null,
  completed_step_ids uuid[] not null default '{}' check (cardinality(completed_step_ids) <= 1000),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (routine_id, occurrence_date),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade
);

create or replace function private.routine_runs_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.completed is distinct from old.completed then
    new.completed_at := case when new.completed then now() else null end;
  end if;
  return new;
end;
$$;
create trigger routine_runs_before_write before insert or update on public.routine_runs
  for each row execute function private.routine_runs_before_write();

-- -----------------------------------------------------------------------------
-- Notificaciones push y avisos enviados
-- -----------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$'),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.nudges (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid not null,
  kind text not null default 'stale' check (kind in ('stale', 'due')),
  sent_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index nudges_task_idx on public.nudges (task_id, sent_at desc);

-- Telegram: vínculo chat ↔ usuario. Solo lo crea el bot (service_role) tras validar un
-- código de un solo uso generado desde la app. El usuario puede verlo y desvincularlo.
create table public.telegram_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chat_id bigint not null unique,
  username text check (char_length(username) <= 64),
  linked_at timestamptz not null default now()
);

-- Códigos de vinculación: se guarda solo el hash SHA-256, caducan a los 10 minutos.
create table private.telegram_link_codes (
  code_hash bytea primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index telegram_link_codes_user_idx on private.telegram_link_codes (user_id);

create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (user_id, day)
);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.task_notes enable row level security;
alter table public.attachments enable row level security;
alter table public.task_events enable row level security;
alter table public.routines enable row level security;
alter table public.routine_steps enable row level security;
alter table public.routine_runs enable row level security;
alter table public.push_tokens enable row level security;
alter table public.nudges enable row level security;
alter table public.ai_usage enable row level security;
alter table public.telegram_links enable row level security;

-- Perfiles: leer y actualizar el propio. El alta la hace el disparador; el borrado, la cascada desde auth.
create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Tablas de datos del usuario: CRUD completo sobre lo propio
do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'subtasks', 'task_notes', 'attachments', 'routines', 'routine_steps', 'routine_runs'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete', t);
  end loop;
end;
$$;

-- Tablas que el cliente solo puede leer (las escribe el servidor)
create policy task_events_select on public.task_events for select to authenticated using ((select auth.uid()) = user_id);
create policy nudges_select on public.nudges for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_usage_select on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);
create policy push_tokens_select on public.push_tokens for select to authenticated using ((select auth.uid()) = user_id);
create policy push_tokens_delete on public.push_tokens for delete to authenticated using ((select auth.uid()) = user_id);
create policy telegram_links_select on public.telegram_links for select to authenticated using ((select auth.uid()) = user_id);
create policy telegram_links_delete on public.telegram_links for delete to authenticated using ((select auth.uid()) = user_id);

-- =============================================================================
-- Privilegios: nada para anon; lo mínimo, columna a columna, para authenticated
-- =============================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, timezone, nudge_hour, stale_days_default) on public.profiles to authenticated;

grant select, delete on public.tasks to authenticated;
grant insert (id, title, description, status, priority, due_at, due_has_time, tags, source, stale_after_days)
  on public.tasks to authenticated;
grant update (title, description, status, priority, due_at, due_has_time, tags, stale_after_days, snoozed_until)
  on public.tasks to authenticated;

grant select, delete on public.subtasks to authenticated;
grant insert (id, task_id, title, done, position, estimated_minutes, suggested_by_ai) on public.subtasks to authenticated;
grant update (title, done, position, estimated_minutes) on public.subtasks to authenticated;

grant select, delete on public.task_notes to authenticated;
grant insert (id, task_id, body) on public.task_notes to authenticated;
grant update (body) on public.task_notes to authenticated;

grant select, delete on public.attachments to authenticated;
grant insert (id, task_id, storage_path, mime_type, size_bytes, width, height) on public.attachments to authenticated;

grant select on public.task_events, public.nudges, public.ai_usage to authenticated;
grant select, delete on public.push_tokens to authenticated;
grant select, delete on public.telegram_links to authenticated;

grant select, delete on public.routines, public.routine_steps, public.routine_runs to authenticated;
grant insert (id, name, description, rrule, remind_at, active) on public.routines to authenticated;
grant update (name, description, rrule, remind_at, active) on public.routines to authenticated;
grant insert (id, routine_id, title, position) on public.routine_steps to authenticated;
grant update (title, position) on public.routine_steps to authenticated;
grant insert (id, routine_id, occurrence_date, completed_step_ids, completed) on public.routine_runs to authenticated;
grant update (completed_step_ids, completed) on public.routine_runs to authenticated;

-- Funciones internas: nadie las ejecuta directamente
revoke all on all functions in schema private from public, anon, authenticated;
