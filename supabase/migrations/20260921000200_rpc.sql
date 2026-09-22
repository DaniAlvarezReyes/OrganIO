-- =============================================================================
-- OrganIO · Funciones expuestas por la API (RPC)
--
-- Regla: SECURITY INVOKER siempre que sea posible (RLS aplica sola). SECURITY DEFINER
-- solo cuando hace falta tocar columnas o tablas que el cliente no puede escribir, y en
-- ese caso la función comprueba explícitamente que la fila es de auth.uid().
-- Las funciones *_service solo las puede ejecutar service_role (funciones de servidor).
-- =============================================================================

-- Normaliza filtros de etiquetas (función pura, sin acceso a datos)
create or replace function public.normalize_tag_filter(input text[])
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct lower(btrim(t))), '{}')
  from unnest(coalesce(input, '{}')) as t
  where btrim(t) <> ''
$$;

-- -----------------------------------------------------------------------------
-- Búsqueda avanzada (INVOKER → RLS aplicada)
-- -----------------------------------------------------------------------------
create or replace function public.search_tasks(
  q text default '',
  statuses public.task_status[] default null,
  tag_filter text[] default null,
  due_from timestamptz default null,
  due_to timestamptz default null,
  has_attachments boolean default null,
  limit_n integer default 50
)
returns table (
  id uuid,
  title text,
  status public.task_status,
  priority smallint,
  due_at timestamptz,
  tags text[],
  last_progress_at timestamptz,
  updated_at timestamptz,
  rank real,
  matched_in text
)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  clean text := left(btrim(coalesce(q, '')), 200);
  tsq tsquery;
  plain text;
begin
  if clean <> '' then
    tsq := websearch_to_tsquery('public.es_unaccent', clean);
    -- Coincidencia parcial en título (p. ej. "segu" → "seguro"), escapando comodines de LIKE
    plain := replace(replace(replace(extensions.unaccent(lower(clean)), '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  return query
  with note_hits as (
    select n.task_id, max(ts_rank(n.search_vector, tsq)) as r
    from public.task_notes n
    where tsq is not null and n.search_vector @@ tsq
    group by n.task_id
  )
  select t.id, t.title, t.status, t.priority, t.due_at, t.tags, t.last_progress_at, t.updated_at,
         (case
            when clean = '' then 0
            else greatest(
              coalesce(ts_rank(t.search_vector, tsq), 0),
              coalesce(nh.r, 0) * 0.8,
              case when extensions.unaccent(lower(t.title)) like '%' || plain || '%' then 0.05 else 0 end
            )
          end)::real as rank,
         case
           when clean = '' then 'filter'
           when t.search_vector @@ tsq or extensions.unaccent(lower(t.title)) like '%' || plain || '%' then 'title'
           else 'note'
         end as matched_in
  from public.tasks t
  left join note_hits nh on nh.task_id = t.id
  where (clean = ''
         or t.search_vector @@ tsq
         or nh.task_id is not null
         or extensions.unaccent(lower(t.title)) like '%' || plain || '%')
    and (statuses is null or t.status = any (statuses))
    and (tag_filter is null or t.tags @> public.normalize_tag_filter(tag_filter))
    and (due_from is null or t.due_at >= due_from)
    and (due_to is null or t.due_at < due_to)
    and (has_attachments is null
         or has_attachments = exists (select 1 from public.attachments a where a.task_id = t.id))
  order by rank desc, t.updated_at desc
  limit least(greatest(coalesce(limit_n, 50), 1), 100);
end;
$$;

-- -----------------------------------------------------------------------------
-- «He avanzado hoy» (DEFINER: last_progress_at no es escribible por el cliente)
-- -----------------------------------------------------------------------------
create or replace function public.report_progress(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.tasks set last_progress_at = now(), snoozed_until = null
  where id = p_task_id and user_id = uid;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.log_event(uid, p_task_id, 'progress_reported', '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Registro de token push. Un token pertenece a un único usuario: si el dispositivo
-- cambia de cuenta, el token se reasigna (y deja de recibir avisos de la anterior).
-- -----------------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$' or p_platform not in ('ios', 'android') then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  if (select count(*) from public.push_tokens where user_id = uid and token <> p_token) >= 10 then
    raise exception 'too_many_devices' using errcode = '54000';
  end if;
  insert into public.push_tokens (user_id, token, platform)
  values (uid, p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- Funcionalidades activas para el usuario actual (anon recibe las del plan gratuito,
-- necesario para pintar la pantalla de acceso)
-- -----------------------------------------------------------------------------
create or replace function public.get_features()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (
    select coalesce((select p.plan from public.profiles p where p.id = auth.uid()), 'free'::public.plan_tier) as plan
  )
  select coalesce(jsonb_object_agg(f.key, f.enabled and private.plan_rank(me.plan) >= private.plan_rank(f.min_plan)), '{}'::jsonb)
  from private.app_features f, me
$$;

-- =============================================================================
-- Solo service_role (Edge Functions)
-- =============================================================================
create or replace function public.feature_enabled_service(p_user uuid, p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select f.enabled and private.plan_rank(coalesce(p.plan, 'free')) >= private.plan_rank(f.min_plan)
    from private.app_features f
    left join public.profiles p on p.id = p_user
    where f.key = p_key
  ), false)
$$;

-- Consume una petición de IA de forma atómica. Devuelve false si se supera la cuota diaria.
create or replace function public.consume_ai_quota_service(p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
  used integer;
begin
  select l.ai_requests_per_day into lim
  from public.profiles p join private.plan_limits l on l.plan = p.plan
  where p.id = p_user;
  if lim is null then
    return false;
  end if;

  insert into public.ai_usage (user_id, day, requests) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set requests = public.ai_usage.requests + 1
  returning requests into used;

  if used > lim then
    update public.ai_usage set requests = requests - 1 where user_id = p_user and day = current_date;
    return false;
  end if;
  return true;
end;
$$;

-- Reclama las tareas estancadas que toca avisar ahora y registra el aviso en la misma
-- transacción (sin duplicados aunque el cron se solape). Una tarea se avisa como máximo
-- una vez cada `stale_after_days` días y solo a la hora de aviso local de su usuario.
create or replace function public.claim_stale_tasks_service(p_limit integer default 200)
returns table (user_id uuid, task_id uuid, title text, idle_days integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with candidates as (
    select t.id, t.user_id, t.title,
           extract(day from now() - t.last_progress_at)::integer as idle,
           coalesce(t.stale_after_days, p.stale_days_default) as threshold
    from public.tasks t
    join public.profiles p on p.id = t.user_id
    where t.status in ('inbox', 'todo', 'in_progress', 'blocked')
      and (t.snoozed_until is null or t.snoozed_until <= now())
      and t.last_progress_at <= now() - make_interval(days => coalesce(t.stale_after_days, p.stale_days_default))
      and extract(hour from now() at time zone p.timezone) = p.nudge_hour
      and not exists (
        select 1 from public.nudges n
        where n.task_id = t.id and n.kind = 'stale'
          and n.sent_at > now() - make_interval(days => coalesce(t.stale_after_days, p.stale_days_default))
      )
      and (exists (select 1 from public.push_tokens pt where pt.user_id = t.user_id)
           or exists (select 1 from public.telegram_links tl where tl.user_id = t.user_id))
    order by t.last_progress_at
    limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    for update of t skip locked
  ),
  logged as (
    insert into public.nudges (user_id, task_id, kind)
    select c.user_id, c.id, 'stale' from candidates c
    returning nudges.task_id
  ),
  events as (
    insert into public.task_events (user_id, task_id, kind, payload)
    select c.user_id, c.id, 'nudged', jsonb_build_object('idle_days', c.idle) from candidates c
    returning task_events.task_id
  )
  select c.user_id, c.id, c.title, c.idle from candidates c;
end;
$$;

create or replace function public.push_tokens_for_service(p_users uuid[])
returns table (user_id uuid, token text)
language sql stable security definer set search_path = '' as $$
  select pt.user_id, pt.token from public.push_tokens pt where pt.user_id = any (p_users)
$$;

create or replace function public.forget_push_tokens_service(p_tokens text[])
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = any (p_tokens)
$$;

-- -----------------------------------------------------------------------------
-- Telegram
-- -----------------------------------------------------------------------------
-- Genera un código de un solo uso (64 hex, 244 bits aleatorios) para vincular Telegram.
-- Se devuelve en claro UNA vez; en la base solo queda su SHA-256. Caduca a los 10 minutos
-- y anula cualquier código anterior del usuario. Encaja en el parámetro de t.me/<bot>?start=<código>.
create or replace function public.create_telegram_link_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  code text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  delete from private.telegram_link_codes where user_id = uid or expires_at < now();
  insert into private.telegram_link_codes (code_hash, user_id, expires_at)
  values (sha256(convert_to(code, 'UTF8')), uid, now() + interval '10 minutes');
  return code;
end;
$$;

-- El bot canjea el código. Devuelve el usuario vinculado o NULL si el código no existe,
-- ya se usó o ha caducado. Un chat solo puede estar vinculado a un usuario.
create or replace function public.link_telegram_service(p_code text, p_chat_id bigint, p_username text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if p_code is null or p_code !~ '^[a-f0-9]{64}$' or p_chat_id is null then
    return null;
  end if;
  delete from private.telegram_link_codes
  where code_hash = sha256(convert_to(p_code, 'UTF8')) and expires_at > now()
  returning user_id into uid;
  if uid is null then
    return null;
  end if;
  delete from public.telegram_links where chat_id = p_chat_id and user_id <> uid;
  insert into public.telegram_links (user_id, chat_id, username)
  values (uid, p_chat_id, left(p_username, 64))
  on conflict (user_id) do update
    set chat_id = excluded.chat_id, username = excluded.username, linked_at = now();
  return uid;
end;
$$;

create or replace function public.user_for_telegram_chat_service(p_chat_id bigint)
returns uuid language sql stable security definer set search_path = '' as $$
  select tl.user_id from public.telegram_links tl where tl.chat_id = p_chat_id
$$;

create or replace function public.telegram_chats_for_service(p_users uuid[])
returns table (user_id uuid, chat_id bigint)
language sql stable security definer set search_path = '' as $$
  select tl.user_id, tl.chat_id from public.telegram_links tl where tl.user_id = any (p_users)
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke all on function public.search_tasks(text, public.task_status[], text[], timestamptz, timestamptz, boolean, integer) from public, anon;
revoke all on function public.normalize_tag_filter(text[]) from public, anon;
revoke all on function public.report_progress(uuid) from public, anon;
revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.get_features() from public;
revoke all on function public.feature_enabled_service(uuid, text) from public, anon, authenticated;
revoke all on function public.consume_ai_quota_service(uuid) from public, anon, authenticated;
revoke all on function public.claim_stale_tasks_service(integer) from public, anon, authenticated;
revoke all on function public.push_tokens_for_service(uuid[]) from public, anon, authenticated;
revoke all on function public.forget_push_tokens_service(text[]) from public, anon, authenticated;
revoke all on function public.create_telegram_link_code() from public, anon;
revoke all on function public.link_telegram_service(text, bigint, text) from public, anon, authenticated;
revoke all on function public.user_for_telegram_chat_service(bigint) from public, anon, authenticated;
revoke all on function public.telegram_chats_for_service(uuid[]) from public, anon, authenticated;

grant execute on function public.search_tasks(text, public.task_status[], text[], timestamptz, timestamptz, boolean, integer) to authenticated;
grant execute on function public.normalize_tag_filter(text[]) to authenticated;
grant execute on function public.report_progress(uuid) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.get_features() to anon, authenticated;
grant execute on function public.feature_enabled_service(uuid, text) to service_role;
grant execute on function public.consume_ai_quota_service(uuid) to service_role;
grant execute on function public.claim_stale_tasks_service(integer) to service_role;
grant execute on function public.push_tokens_for_service(uuid[]) to service_role;
grant execute on function public.forget_push_tokens_service(text[]) to service_role;
grant execute on function public.create_telegram_link_code() to authenticated;
grant execute on function public.link_telegram_service(text, bigint, text) to service_role;
grant execute on function public.user_for_telegram_chat_service(bigint) to service_role;
grant execute on function public.telegram_chats_for_service(uuid[]) to service_role;
