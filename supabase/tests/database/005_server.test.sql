-- Funciones de servidor: vinculación con Telegram, reclamo de avisos, cuota de IA,
-- política de altas y borrado completo de cuenta.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(25);

insert into private.signup_allowlist (email) values ('a@test.dev'), ('b@test.dev');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.dev'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@test.dev');

-- ------------------------------------------------------------ Clientes vs servidor
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select throws_ok($$ select * from public.claim_stale_tasks_service() $$, '42501', null, 'Un cliente no puede reclamar avisos');
select throws_ok($$ select public.link_telegram_service(repeat('a', 64), 1) $$, '42501', null, 'Un cliente no puede vincular Telegram por su cuenta');
select throws_ok($$ select public.consume_ai_quota_service(auth.uid()) $$, '42501', null, 'Un cliente no puede tocar la cuota de IA');

-- ------------------------------------------------------------ Telegram
select set_config('test.code1', public.create_telegram_link_code(), true);
select set_config('test.code2', public.create_telegram_link_code(), true);
select matches(current_setting('test.code2'), '^[a-f0-9]{64}$', 'El código tiene 64 caracteres hexadecimales');

reset role;
select is((select count(*)::int from private.telegram_link_codes), 1, 'Solo se guarda un código activo por usuario');
select is((select count(*)::int from private.telegram_link_codes where code_hash = convert_to(current_setting('test.code2'), 'UTF8')), 0,
  'El código no se guarda en claro');

set local role service_role;
select is(public.link_telegram_service(current_setting('test.code1'), 111), null, 'Un código sustituido ya no sirve');
select is(public.link_telegram_service(current_setting('test.code2'), 111, 'dani'),
  'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'El código válido vincula el chat con A');
select is(public.link_telegram_service(current_setting('test.code2'), 111), null, 'Un código no se puede reutilizar');
select is(public.link_telegram_service('not-a-code', 111), null, 'Formato inválido rechazado');
select is(public.user_for_telegram_chat_service(111), 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'El chat resuelve al usuario A');

-- Código caducado
reset role;
set local role authenticated;
select set_config('test.code3', public.create_telegram_link_code(), true);
reset role;
update private.telegram_link_codes set expires_at = now() - interval '1 minute';
set local role service_role;
select is(public.link_telegram_service(current_setting('test.code3'), 222), null, 'Un código caducado no sirve');

-- B no ve el vínculo de A
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.telegram_links), 0, 'B no ve el vínculo de Telegram de A');

-- ------------------------------------------------------------ Avisos de estancamiento
reset role;
update public.profiles set timezone = 'UTC', nudge_hour = extract(hour from now() at time zone 'UTC')::smallint;
insert into public.tasks (id, user_id, title, status, stale_after_days, snoozed_until) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Estancada', 'todo', null, null),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Umbral propio de 14 días', 'todo', 14, null),
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Pospuesta', 'todo', null, now() + interval '2 days'),
  ('a0000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Hecha', 'done', null, null),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b', 'De B, sin canal', 'todo', null, null);
update public.tasks set last_progress_at = now() - interval '8 days';

set local role service_role;
select results_eq(
  $$ select task_id, idle_days from public.claim_stale_tasks_service() $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid, 8) $$,
  'Solo se reclama la tarea estancada, con canal, sin posponer y activa'
);
select is_empty($$ select * from public.claim_stale_tasks_service() $$, 'Una tarea ya avisada no se vuelve a reclamar');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.task_events where kind = 'nudged'), 1, 'El aviso queda en el historial de A');
select lives_ok($$ select public.report_progress('a0000000-0000-4000-8000-000000000001') $$, 'A marca que ha avanzado');
select is((select last_progress_at from public.tasks where id = 'a0000000-0000-4000-8000-000000000001'), now(),
  '«He avanzado» reinicia el contador');

-- ------------------------------------------------------------ Cuota de IA
reset role;
set local role service_role;
select is((select count(*)::int from generate_series(1, 30) where public.consume_ai_quota_service('aaaaaaaa-0000-4000-8000-00000000000a')),
  30, 'El plan gratuito permite 30 peticiones de IA al día');
select is(public.consume_ai_quota_service('aaaaaaaa-0000-4000-8000-00000000000a'), false, 'La 31ª petición se rechaza');
select is(public.consume_ai_quota_service('00000000-0000-4000-8000-000000000000'), false, 'Un usuario inexistente no tiene cuota');

-- ------------------------------------------------------------ Altas
reset role;
select throws_ok($$ insert into auth.users (email) values ('intruso@test.dev') $$, '42501', 'signup_not_allowed',
  'Un correo no invitado no puede darse de alta');
update private.settings set value = 'open' where key = 'signup_mode';
select lives_ok($$ insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-00000000000c', 'nuevo@test.dev') $$,
  'Con registro abierto cualquiera puede darse de alta');
select is((select count(*)::int from public.profiles where id = 'cccccccc-0000-4000-8000-00000000000c'), 1,
  'El alta crea el perfil automáticamente');

-- ------------------------------------------------------------ Borrado de cuenta
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int from public.tasks where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
  + (select count(*)::int from public.task_events where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
  + (select count(*)::int from public.telegram_links where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
  + (select count(*)::int from public.ai_usage where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  0, 'Borrar la cuenta elimina todos sus datos en cascada'
);

select * from finish();
rollback;
