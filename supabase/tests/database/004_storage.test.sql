-- Almacenamiento de imágenes: carpeta por usuario, solo sobre tareas propias,
-- nombres estrictos, ficheros inmutables y coherencia con la tabla attachments.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(15);

insert into private.signup_allowlist (email) values ('a@test.dev'), ('b@test.dev');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.dev'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@test.dev');
insert into public.tasks (id, user_id, title) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Tarea de A'),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Tarea de B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('attachments', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.jpg') $$,
  'A sube una imagen a su carpeta y a su tarea'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('attachments', 'bbbbbbbb-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002.jpg') $$,
  '42501', null, 'A no puede subir a la carpeta de B'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('attachments', 'aaaaaaaa-0000-4000-8000-00000000000a/b0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000003.jpg') $$,
  '42501', null, 'A no puede subir asociado a una tarea de B aunque use su carpeta'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('attachments', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000001/../../x.jpg') $$,
  '42501', null, 'Nombres con recorrido de rutas rechazados'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('attachments', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000004.exe') $$,
  '42501', null, 'Extensiones no permitidas rechazadas'
);
select is_empty(
  $$ update storage.objects set name = name || 'x' where bucket_id = 'attachments' returning id $$,
  'Los ficheros son inmutables'
);
select lives_ok(
  $$ insert into public.attachments (task_id, storage_path, mime_type, size_bytes) values
     ('a0000000-0000-4000-8000-000000000001',
      'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.jpg',
      'image/jpeg', 120000) $$,
  'A registra el adjunto con la ruta coherente'
);
select throws_ok(
  $$ insert into public.attachments (task_id, storage_path, mime_type, size_bytes) values
     ('a0000000-0000-4000-8000-000000000001',
      'bbbbbbbb-0000-4000-8000-00000000000b/a0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000005.jpg',
      'image/jpeg', 120000) $$,
  '23514', null, 'Un adjunto no puede apuntar a la carpeta de otro usuario'
);
select throws_ok(
  $$ insert into public.attachments (task_id, storage_path, mime_type, size_bytes) values
     ('a0000000-0000-4000-8000-000000000001',
      'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000006.jpg',
      'application/pdf', 120000) $$,
  '23514', null, 'Tipo MIME no permitido en la tabla'
);

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 0, 'B no ve las imágenes de A');
-- protect_delete es un disparador POR SENTENCIA (FOR EACH STATEMENT): salta antes de que la
-- RLS filtre ninguna fila, así que revienta igual aunque la sentencia no fuera a borrar nada.
-- Este error solo demuestra el guardarraíl, no que la RLS impida a B borrar ficheros de A.
select throws_ok(
  $$ delete from storage.objects where bucket_id = 'attachments' returning id $$,
  '42501', null,
  'Storage bloquea el borrado directo por SQL sobre attachments (protect_delete)'
);

-- protect_delete es un guardarraíl contra borrados accidentales, no una barrera de seguridad:
-- se levanta con el GUC storage.allow_delete_query, que cualquier rol (authenticated incluido)
-- puede fijar en su sesión (comprobado en la base local real y en el stub). La barrera es la RLS,
-- y con el guardarraíl levantado se prueba de verdad.
set local storage.allow_delete_query = 'true';
select is_empty(
  $$ delete from storage.objects where bucket_id = 'attachments' returning id $$,
  'Con el guardarraíl levantado, la RLS impide que B borre las imágenes de A'
);
-- Lo anterior se sostiene aunque attachments_delete_own estuviera mal: un DELETE con WHERE o
-- RETURNING aplica también las políticas de SELECT, y B no ve las filas de A. Un DELETE sin WHERE
-- ni RETURNING solo pasa por la política de DELETE, así que aísla esa política (comprobado:
-- con `using (true)` esta prueba falla y la anterior no).
select lives_ok($$ delete from storage.objects $$, 'B lanza un borrado sin filtro (solo cuenta la política de DELETE)');
-- Se cuenta fuera de la RLS (rol de la sesión, postgres, con BYPASSRLS en Supabase y en el stub):
-- lo que de verdad sigue almacenado, sin depender de ninguna política de SELECT.
reset role;
select is(
  (select count(*)::int from storage.objects
   where name = 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.jpg'),
  1,
  'La política de DELETE, por sí sola, impide que B borre las imágenes de A'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
-- Control: la misma sentencia, como A, sí borra. Sin esto, las pruebas anteriores pasarían también
-- si no hubiera nada que borrar o si el borrado fallara por otro motivo.
select results_eq(
  $$ delete from storage.objects where bucket_id = 'attachments' returning name $$,
  $$ values ('aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.jpg') $$,
  'Con el guardarraíl levantado, A sí borra su propia imagen'
);

select * from finish();
rollback;
