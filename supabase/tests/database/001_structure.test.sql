-- Comprobaciones estructurales. Si una migración futura crea una tabla sin RLS, concede
-- algo a `anon` o declara una función SECURITY DEFINER sin search_path, esto falla.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(15);

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'Todas las tablas de public tienen RLS activado'
);

select is_empty(
  $$ select c.relname, p.priv from pg_class c
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
       and (has_table_privilege('anon', c.oid, p.priv)
            or (p.priv in ('SELECT', 'INSERT', 'UPDATE') and has_any_column_privilege('anon', c.oid, p.priv))) $$,
  'anon no tiene ningún privilegio sobre tablas ni columnas de public'
);

select is_empty(
  $$ select c.relname, p.priv from pg_class c
     cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and has_table_privilege('authenticated', c.oid, p.priv) $$,
  'authenticated no puede truncar, referenciar ni crear disparadores'
);

select is_empty(
  $$ select c.relname, a.attname from pg_class c
     join pg_attribute a on a.attrelid = c.oid and not a.attisdropped and a.attnum > 0
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and a.attname in ('user_id', 'plan', 'last_progress_at', 'completed_at', 'search_vector', 'created_at', 'updated_at', 'done_at', 'linked_at')
       and (has_column_privilege('authenticated', c.oid, a.attname, 'UPDATE')
            or has_column_privilege('authenticated', c.oid, a.attname, 'INSERT')) $$,
  'Las columnas gestionadas por el servidor no son escribibles por el cliente'
);

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relname in ('task_events', 'nudges', 'ai_usage', 'telegram_links', 'push_tokens')
       and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
            or has_any_column_privilege('authenticated', c.oid, 'INSERT') or has_any_column_privilege('authenticated', c.oid, 'UPDATE')) $$,
  'Historial, avisos, uso de IA y vínculos solo los escribe el servidor'
);

select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
     where p.prosecdef and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) as cfg where cfg = 'search_path=""') $$,
  'Toda función SECURITY DEFINER fija search_path vacío'
);

select is(
  array(select p.proname::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
        order by 1),
  array['get_features'],
  'anon solo puede ejecutar get_features'
);

select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname like '%\_service'
       and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')) $$,
  'Las funciones *_service no son ejecutables por clientes'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE') and not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'El esquema private no es accesible para clientes'
);

select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'private'::regnamespace
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')) $$,
  'Ninguna función de private es ejecutable por clientes'
);

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'attachments' $$,
  $$ values (false, 10485760::bigint, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']) $$,
  'El bucket de adjuntos es privado, con límite de tamaño y tipos'
);

select is(
  (select value from private.settings where key = 'signup_mode'),
  'invite_only',
  'El alta de usuarios arranca en modo solo invitación'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname in ('public', 'storage') and 'anon' = any (roles) $$,
  'Ninguna política concede acceso a anon'
);

-- El borrado real (B no puede borrar los ficheros de A) se prueba en T4 contra el cliente de
-- Storage, que es el camino que usa la app. Aquí solo se comprueba la estructura: que
-- attachments_delete_own sigue siendo DELETE/authenticated y que su USING es exactamente el
-- mismo que el de attachments_select_own. 004_storage.test.sql ya no puede probar el borrado
-- en sí (el disparador protect_delete de Storage bloquea cualquier DELETE directo por SQL
-- antes de que la RLS se evalúe), pero el SELECT con la misma condición de carpeta SÍ se
-- comprueba de forma conductual ahí ('B no ve las imágenes de A'): si ambas políticas exigen
-- literalmente la misma condición, esa prueba conductual respalda también al DELETE.
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'attachments_delete_own'
      and cmd = 'DELETE' and roles::text[] = array['authenticated']
  ),
  'attachments_delete_own es DELETE y solo para authenticated'
);
select is(
  (select qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'attachments_delete_own'),
  (select qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'attachments_select_own'),
  'attachments_delete_own exige exactamente la misma carpeta propia que attachments_select_own'
);

select * from finish();
rollback;
