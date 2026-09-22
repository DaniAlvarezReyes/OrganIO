-- Aislamiento entre usuarios: B intenta por todas las vías leer, modificar o enlazarse
-- a los datos de A. También se comprueba lo que A no puede hacer sobre lo suyo.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(24);

insert into private.signup_allowlist (email) values ('a@test.dev'), ('b@test.dev');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.dev'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@test.dev');

-- ---------------------------------------------------------------- Usuario A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.tasks (id, title, tags) values ('a0000000-0000-4000-8000-000000000001', 'Renovar el seguro del coche', array['coche']) $$,
  'A crea una tarea'
);
select lives_ok(
  $$ insert into public.subtasks (task_id, title) values ('a0000000-0000-4000-8000-000000000001', 'Pedir presupuestos') $$,
  'A crea una subtarea en su tarea'
);
select lives_ok(
  $$ insert into public.task_notes (task_id, body) values ('a0000000-0000-4000-8000-000000000001', 'Llamar a la aseguradora') $$,
  'A añade una nota'
);
select is((select user_id from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'),
  'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'El propietario se asigna solo con auth.uid()');

-- Lo que A no puede hacer sobre lo suyo
select throws_ok($$ update public.profiles set plan = 'pro' $$, '42501', null, 'A no puede subirse de plan');
select throws_ok($$ update public.tasks set last_progress_at = now() - interval '1 year' $$, '42501', null,
  'A no puede falsear la fecha de último avance');
select throws_ok($$ update public.tasks set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b' $$, '42501', null,
  'A no puede regalar una tarea a otro usuario');
select throws_ok($$ insert into public.task_events (user_id, task_id, kind) values (auth.uid(), 'a0000000-0000-4000-8000-000000000001', 'created') $$,
  '42501', null, 'A no puede escribir en el historial');
select throws_ok($$ delete from public.task_events $$, '42501', null, 'A no puede borrar el historial');
select throws_ok($$ select * from private.app_features $$, '42501', null, 'A no puede leer la configuración interna');

-- ---------------------------------------------------------------- Usuario B
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select is((select count(*)::int from public.tasks), 0, 'B no ve las tareas de A');
select is((select count(*)::int from public.subtasks), 0, 'B no ve las subtareas de A');
select is((select count(*)::int from public.task_notes), 0, 'B no ve las notas de A');
select is((select count(*)::int from public.task_events), 0, 'B no ve el historial de A');
select is((select count(*)::int from public.profiles), 1, 'B solo ve su propio perfil');
select is_empty($$ update public.tasks set title = 'hackeado' where id = 'a0000000-0000-4000-8000-000000000001' returning id $$,
  'B no puede modificar la tarea de A');
select is_empty($$ delete from public.tasks where id = 'a0000000-0000-4000-8000-000000000001' returning id $$,
  'B no puede borrar la tarea de A');
select throws_ok(
  $$ insert into public.subtasks (task_id, title) values ('a0000000-0000-4000-8000-000000000001', 'intrusa') $$,
  '23503', null, 'B no puede colgar una subtarea de la tarea de A (clave compuesta)'
);
select throws_ok(
  $$ insert into public.task_notes (task_id, body) values ('a0000000-0000-4000-8000-000000000001', 'intrusa') $$,
  '23503', null, 'B no puede añadir notas a la tarea de A'
);
select throws_ok(
  $$ insert into public.tasks (title, user_id) values ('suplantación', 'aaaaaaaa-0000-4000-8000-00000000000a') $$,
  '42501', null, 'B no puede crear tareas a nombre de A'
);
select is_empty($$ select id from public.search_tasks('seguro') $$, 'La búsqueda de B no devuelve tareas de A');
select throws_ok($$ select public.report_progress('a0000000-0000-4000-8000-000000000001') $$, 'P0002', null,
  'B no puede marcar avance en la tarea de A');

-- ---------------------------------------------------------------- Anónimo
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok($$ select * from public.tasks $$, '42501', null, 'anon no puede leer tareas');
select is((public.get_features() ->> 'tasks')::boolean, true, 'anon sí puede consultar las funcionalidades públicas');

select * from finish();
rollback;
