-- Reglas de dominio que aplica la base de datos: normalización, transiciones de estado,
-- seguimiento del progreso, historial y búsqueda.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(22);

insert into private.signup_allowlist (email) values ('a@test.dev');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.dev');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

-- Etiquetas y validaciones -------------------------------------------------
insert into public.tasks (id, title, tags)
values ('a0000000-0000-4000-8000-000000000001', '  Renovar el seguro del coche  ', array['  Coche ', 'coche', 'Viaje']);

select is((select tags from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'),
  array['coche', 'viaje'], 'Etiquetas en minúsculas, sin espacios ni duplicados');
select is((select title from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'),
  'Renovar el seguro del coche', 'El título se guarda recortado');
select throws_ok($$ insert into public.tasks (title, tags) values ('x', array['hola mundo']) $$, '22023', null,
  'Etiqueta con espacios rechazada');
select throws_ok($$ insert into public.tasks (title, tags) select 'x', array_agg('t' || g) from generate_series(1, 21) g $$,
  '22023', null, 'Más de 20 etiquetas rechazadas');
select throws_ok($$ insert into public.tasks (title) values ('   ') $$, '23514', null, 'Título vacío rechazado');
select throws_ok($$ insert into public.tasks (title, priority) values ('x', 7) $$, '23514', null, 'Prioridad fuera de rango rechazada');

-- Estados -----------------------------------------------------------------
select lives_ok($$ update public.tasks set status = 'done' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'Bandeja → Hecha permitido');
select isnt((select completed_at from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'), null,
  'Al completar se registra completed_at');
select throws_ok($$ update public.tasks set status = 'blocked' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '22023', null, 'Hecha → Bloqueada no permitido');
select lives_ok($$ update public.tasks set status = 'todo' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'Reabrir (Hecha → Por hacer) permitido');
select is((select completed_at from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'), null,
  'Al reabrir se limpia completed_at');

-- Progreso ----------------------------------------------------------------
reset role;
update public.tasks set last_progress_at = now() - interval '10 days' where id = 'a0000000-0000-4000-8000-000000000001';
set local role authenticated;

insert into public.task_notes (task_id, body)
values ('a0000000-0000-4000-8000-000000000001', 'Llamar a Mapfre para comparar precios');
select is((select last_progress_at from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'), now(),
  'Añadir una nota cuenta como avance');

reset role;
update public.tasks set last_progress_at = now() - interval '10 days' where id = 'a0000000-0000-4000-8000-000000000001';
set local role authenticated;

insert into public.subtasks (id, task_id, title)
values ('a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Pedir presupuestos');
select is((select last_progress_at from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'), now() - interval '10 days',
  'Crear una subtarea pendiente no cuenta como avance');
update public.subtasks set done = true where id = 'a5000000-0000-4000-8000-000000000001';
select is((select last_progress_at from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'), now(),
  'Completar una subtarea cuenta como avance');
select isnt((select done_at from public.subtasks where id = 'a5000000-0000-4000-8000-000000000001'), null,
  'La subtarea registra cuándo se completó');

-- Historial ---------------------------------------------------------------
select results_eq(
  $$ select kind from public.task_events where task_id = 'a0000000-0000-4000-8000-000000000001' order by id $$,
  $$ values ('created'), ('status_changed'), ('status_changed'), ('note_added'), ('subtask_done') $$,
  'El historial registra cada paso en orden'
);

-- Búsqueda ----------------------------------------------------------------
insert into public.tasks (title) values ('Revisión del camión'), ('Comprar pan');

select results_eq($$ select title from public.search_tasks('SEGURO') $$,
  $$ values ('Renovar el seguro del coche') $$, 'Búsqueda insensible a mayúsculas');
select results_eq($$ select title from public.search_tasks('camion') $$,
  $$ values ('Revisión del camión') $$, 'Búsqueda insensible a acentos');
select results_eq($$ select title from public.search_tasks('segu') $$,
  $$ values ('Renovar el seguro del coche') $$, 'Coincidencia parcial en el título');
select results_eq($$ select title, matched_in from public.search_tasks('mapfre') $$,
  $$ values ('Renovar el seguro del coche', 'note') $$, 'Encuentra tareas por el texto de sus notas');
select results_eq($$ select title from public.search_tasks('', tag_filter => array['Coche']) $$,
  $$ values ('Renovar el seguro del coche') $$, 'Filtro por etiqueta');
select lives_ok($$ select * from public.search_tasks('100%_raro\\') $$, 'Caracteres especiales no rompen la búsqueda');

select * from finish();
rollback;
