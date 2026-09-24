-- Almacenamiento de imágenes: carpeta por usuario, solo sobre tareas propias,
-- nombres estrictos, ficheros inmutables y coherencia con la tabla attachments.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(11);

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
-- Por eso este error no demuestra que la RLS impida a B borrar ficheros de A en concreto:
-- esa cobertura vive en 001_structure.test.sql (la política sigue existiendo con la forma
-- correcta) y en T4 (borrado real contra el cliente de Storage, con RLS ya sin este bloqueo).
select throws_ok(
  $$ delete from storage.objects where bucket_id = 'attachments' returning id $$,
  '42501', null,
  'Storage bloquea el borrado directo por SQL sobre attachments (protect_delete)'
);

select * from finish();
rollback;
