-- =============================================================================
-- Réplica mínima de lo que Supabase trae de serie, para ejecutar migraciones y
-- pruebas sobre un Postgres normal (CI, máquinas sin Docker).
--
-- NO se despliega nunca. La referencia sigue siendo `supabase start` + `supabase test db`.
-- Reproduce a propósito los privilegios por defecto de Supabase (todo concedido a
-- anon/authenticated) para demostrar que las migraciones los recortan.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- Rol con el que PostgREST se conecta y desde el que cambia al rol del JWT (pruebas de API)
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'authenticator';
  end if;
end;
$$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

grant anon, authenticated, service_role to authenticator;

grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth, storage to anon, authenticated, service_role;

-- Privilegios por defecto de Supabase en `public`
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- auth ------------------------------------------------------------------------
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- storage ---------------------------------------------------------------------
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
-- Como en Storage real (comprobado con role_table_grants y pg_class en la base local): RLS en
-- las dos tablas, cero políticas en buckets, y TODOS los privilegios también para anon. La barrera
-- es la RLS, no el GRANT: sin anon aquí, una política escrita por error `to public` pasaría en CI.
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Misma definición que Supabase
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- Storage real bloquea CUALQUIER DELETE directo por SQL sobre storage.objects (y sobre
-- storage.buckets) antes de que la RLS se evalúe, para forzar el uso de la API de Storage.
-- Misma definición que trae la imagen storage-api:v1.72.1 (verificado con pg_get_functiondef
-- sobre la base local real). Sin este disparador, pruebas escritas contra `storage.objects`
-- que asuman que un DELETE bloqueado por RLS devuelve 0 filas en silencio pasan en CI por una
-- razón que no existe en el Storage real.
create or replace function storage.protect_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') != 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      using hint = 'This prevents accidental data loss from orphaned objects.',
            errcode = '42501';
  end if;
  return null;
end;
$$;
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();
