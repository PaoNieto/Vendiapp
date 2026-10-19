-- ============================================================
-- 0028 — Sistema de avisos: cliente + Paolo + estado de la IA (2026-10-16)
-- ============================================================
-- QUÉ (spec: cerebro_vendi/AVISOS_SPEC_V1.md; las correcciones de JonSnow
-- mandan sobre la v1):
--   1. `user_notifications` — avisos al cliente (campanita). La base guarda el
--      HECHO (kind + data); el texto lo arma `lib/avisos/textos.ts`, así la copy
--      cambia sin migración. Único (user_id, dedupe_key): un evento, un aviso.
--   2. `admin_alerts`       — alertas a Paolo (panel /admin/avisos + mail).
--      Índice único PARCIAL por dedupe_key sobre lo abierto: si el evento se
--      repite sube `occurrences`, aunque lo vean varias instancias de Vercel.
--   3. `service_status`     — una fila 'ai' (ok, since, reason, next_probe_at):
--      el corte global de la IA ANTES de cobrar.
--   4. `ai_outage_watchers` — a quién avisarle «Ya podés generar de nuevo».
--   5. `cron_runs`          — candado diario de los crons (resumen de las 8:00).
--   5.b `batch_charges`     — lo que cobró cada tanda (fuente del reaper).
--   5.c `action_attempts`   — topes de regenerar/analizar y de devoluciones por
--                             bloqueo de la salida.
--   + RPCs (todas SECURITY DEFINER, search_path fijo, solo service_role).
--
-- SEGURIDAD (JonSnow #3, verificado en prod: el default ACL de `public` les da
-- TODO a anon/authenticated sobre cada tabla nueva y EXECUTE sobre cada función
-- nueva):
--   - RLS prendido en TODAS + `revoke all` a anon/authenticated + grants mínimos:
--       user_notifications → authenticated: SELECT + UPDATE(read_at) SOLAMENTE,
--                            policy por auth.jwt()->>'sub' (patrón de 0011). No
--                            puede insertar ni borrar (lección 0018: RLS no
--                            limita columnas, el GRANT por columna sí).
--       service_status     → anon + authenticated: SELECT de (id, ok, since).
--                            `reason` y `next_probe_at` no se exponen.
--       el resto           → sin grants: solo el server (service_role).
--   - Toda RPC: revoke execute de public, anon y authenticated (lección 0015).
--
-- QUÉ NO HACE (alcance decidido):
--   - NO hay "reserva con recibo" (credit_holds / hold_credits / settle_hold).
--     La devolución sigue siendo grant_credits(..., 'refund').
--   - NO toca el CHECK de generations.status: una tanda colgada queda 'failed'
--     con error_message 'timeout'.
--
-- TANDAS COLGADAS SIN credit_holds (JonSnow #1 + revisión del 16/10): la plata
-- del reaper sale SOLO de `batch_charges`, una tabla que escribe únicamente el
-- server (sin grants al cliente):
--   - `charge_batch` = deduct_credits + la fila de la tanda, en UNA transacción
--     (solo la llama POST /api/generations; regenerar nunca escribe ahí, así que
--     el reaper no puede devolverle nada).
--   - `batch_charge_image_saved` suma cada imagen que la ruta entregó.
--   - `batch_charge_close` = la ruta terminó (closed_at). Una tanda cerrada no
--     se devuelve NUNCA, diga lo que diga generations.status (que el dueño
--     puede escribir).
-- Devolución del reaper = amount − images_saved. Ni `generations` ni
-- `generated_images` (las dos las escribe el dueño) deciden plata. El aviso
-- 'gen:<id>' sigue siendo el único aviso de resultado de la tanda y, si existe,
-- el reaper la da por terminada (nunca devuelve por su ausencia).
--
-- `read_at` solo se puede marcar "ahora" y una sola vez (trigger): el cliente
-- no puede envejecer un aviso para que la limpieza lo borre.
--
-- Idempotente: if not exists / or replace / drop policy if exists.

-- ============================================================
-- 1. user_notifications — avisos al cliente
-- ============================================================
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                     -- id de Clerk (text), igual que profiles.id desde 0012
  kind text not null
    check (kind ~ '^[a-z][a-z0-9_]{1,63}$'), -- ver NoticeKind en lib/avisos/types.ts
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object'),   -- el hecho, no el texto
  dedupe_key text
    check (dedupe_key is null or length(dedupe_key) between 1 and 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  -- Un evento, un aviso. Con dedupe_key NULL no deduplica (los NULL son distintos).
  constraint user_notifications_user_dedupe_key unique (user_id, dedupe_key)
);

-- La campanita: lo último del usuario.
create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

-- El contador de no leídos.
create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id) where read_at is null;

alter table public.user_notifications enable row level security;

revoke all on table public.user_notifications from public, anon, authenticated;
grant select on table public.user_notifications to authenticated;
grant update (read_at) on table public.user_notifications to authenticated;
grant all on table public.user_notifications to service_role;

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own on public.user_notifications
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- UPDATE solo de la fila propia; el GRANT por columna deja tocar solo read_at.
drop policy if exists user_notifications_update_own on public.user_notifications;
create policy user_notifications_update_own on public.user_notifications
  for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

-- read_at: el GRANT deja tocar la columna, pero con cualquier valor. Este
-- trigger lo fija a "ahora" la primera vez y después no cambia más (ni a otra
-- fecha ni a NULL). Así read_at sirve solo para mostrar: nadie puede ponerle
-- '2020-01-01' a un aviso para que la limpieza de 90 días lo borre (hallazgo de
-- JonSnow del 16/10). Corre también para el server: el server nunca necesita
-- escribir otra cosa.
create or replace function public.user_notifications_guard_read_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.read_at := case
    when old.read_at is null and new.read_at is not null then now()
    else old.read_at
  end;
  return new;
end;
$$;

drop trigger if exists user_notifications_guard_read_at on public.user_notifications;
create trigger user_notifications_guard_read_at
  before update of read_at on public.user_notifications
  for each row execute function public.user_notifications_guard_read_at();

comment on table public.user_notifications is
  'Avisos al cliente (campanita). Escribe solo el server (RPC notify_user / refund_credits_with_notice / reaper). El cliente lee lo suyo y solo puede marcar read_at (el trigger lo fija a now(), una vez).';

-- ============================================================
-- 2. admin_alerts — alertas a Paolo
-- ============================================================
create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind ~ '^[a-z][a-z0-9_]{1,63}$'), -- ver AdminAlertKind en lib/avisos/types.ts
  severity text not null
    check (severity in ('U', 'M', 'B')),     -- U = mail ya + panel · M = panel + resumen · B = solo panel
  dedupe_key text not null
    check (length(dedupe_key) between 1 and 200),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  user_id text,                              -- cliente afectado (id de Clerk), si hay
  occurrences integer not null default 1 check (occurrences >= 1),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_emailed_at timestamptz,
  resolved_at timestamptz
);

-- Dedupe: una sola alerta ABIERTA por llave. Resuelta, la próxima abre otra fila.
create unique index if not exists admin_alerts_open_dedupe_key
  on public.admin_alerts (dedupe_key) where resolved_at is null;

create index if not exists admin_alerts_open_kind_idx
  on public.admin_alerts (kind, last_seen desc) where resolved_at is null;

-- Tope global de mails urgentes (JonSnow #7): se cuentan por last_emailed_at.
create index if not exists admin_alerts_last_emailed_idx
  on public.admin_alerts (last_emailed_at) where last_emailed_at is not null;

-- Resumen diario: "resueltas en las últimas 24 h".
create index if not exists admin_alerts_resolved_idx
  on public.admin_alerts (resolved_at desc) where resolved_at is not null;

alter table public.admin_alerts enable row level security;  -- sin policies: solo service_role
revoke all on table public.admin_alerts from public, anon, authenticated;
grant all on table public.admin_alerts to service_role;

comment on table public.admin_alerts is
  'Alertas a Paolo. Solo service_role. Dedupe por dedupe_key sobre lo abierto (occurrences sube).';

-- ============================================================
-- 3. service_status — el estado de la IA
-- ============================================================
create table if not exists public.service_status (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  ok boolean not null default true,
  since timestamptz not null default now(), -- desde cuándo está en el estado actual
  reason text,                              -- causa interna ('billing', 'model_not_found:<modelo>'...). NO se expone.
  next_probe_at timestamptz                 -- cuándo se puede volver a probar si volvió. NO se expone.
);

insert into public.service_status (id, ok, since)
values ('ai', true, now())
on conflict (id) do nothing;

alter table public.service_status enable row level security;
revoke all on table public.service_status from public, anon, authenticated;
-- Solo estas 3 columnas: el banner necesita ok/since, nunca la causa (JonSnow #3).
-- ⚠️ Por eso el cliente tiene que pedir columnas explícitas: select=* da 42501.
grant select (id, ok, since) on table public.service_status to anon, authenticated;
grant all on table public.service_status to service_role;

drop policy if exists service_status_public_read on public.service_status;
create policy service_status_public_read on public.service_status
  for select to anon, authenticated
  using (true);

comment on table public.service_status is
  'Estado de servicios (fila ai). anon/authenticated leen solo (id, ok, since). Escribe solo el server.';

-- ============================================================
-- 4. ai_outage_watchers — a quién avisarle cuando vuelve la IA
-- ============================================================
create table if not exists public.ai_outage_watchers (
  user_id text primary key,                 -- id de Clerk
  created_at timestamptz not null default now()
);

alter table public.ai_outage_watchers enable row level security;  -- sin policies
revoke all on table public.ai_outage_watchers from public, anon, authenticated;
grant all on table public.ai_outage_watchers to service_role;

-- ============================================================
-- 5. cron_runs — candado diario de los crons (JonSnow #4)
-- ============================================================
-- Vercel puede invocar un cron más de una vez: la PK (job, run_key) hace que el
-- resumen de las 8:00 salga una sola vez por día. run_key = fecha de Lima.
create table if not exists public.cron_runs (
  job text not null check (length(job) between 1 and 64),
  run_key text not null check (length(run_key) between 1 and 64),
  ran_at timestamptz not null default now(),
  primary key (job, run_key)
);

alter table public.cron_runs enable row level security;  -- sin policies
revoke all on table public.cron_runs from public, anon, authenticated;
grant all on table public.cron_runs to service_role;

-- ============================================================
-- 5.b batch_charges — lo que cobró CADA tanda (solo el server)
-- ============================================================
-- La fuente de verdad del reaper (hallazgos de JonSnow del 16/10): sin esto, el
-- reaper sumaba el ledger por generation_id (regenerar también cobra ahí) y le
-- restaba generated_images (que el dueño puede mover de tanda), así que un
-- usuario podía fabricarse devoluciones. Esta tabla NO tiene grants al
-- cliente: la escribe solo POST /api/generations vía las RPC de abajo.
-- Sin FK a generations a propósito: el dueño puede borrar su tanda (RLS FOR
-- ALL) y el cobro tiene que seguir registrado.
create table if not exists public.batch_charges (
  generation_id uuid primary key,
  user_id text not null,                      -- id de Clerk
  amount integer not null check (amount >= 0), -- 0 = ilimitado (su descuento es no-op)
  images_saved integer not null default 0 check (images_saved >= 0),
  refunded integer check (refunded is null or refunded >= 0), -- lo que devolvió el reaper
  charged_at timestamptz not null default now(),
  closed_at timestamptz                         -- la ruta (o el reaper) cerró la tanda
);

create index if not exists batch_charges_open_idx
  on public.batch_charges (charged_at) where closed_at is null;

alter table public.batch_charges enable row level security;  -- sin policies
revoke all on table public.batch_charges from public, anon, authenticated;
grant all on table public.batch_charges to service_role;

comment on table public.batch_charges is
  'Cobro de cada tanda de /api/generations (solo service_role). El reaper devuelve amount − images_saved de las que siguen abiertas; una cerrada no se toca nunca.';

-- ============================================================
-- 5.c action_attempts — topes por usuario de regenerar / analizar
-- ============================================================
-- Mismo patrón que generation_attempts (0025), con una columna `action`:
--   'regenerate' / 'analyze'  → check_action_rate_limit
--   'output_block_refund'     → claim_output_block_refund (tope de devoluciones
--                               por bloqueo de la SALIDA)
-- Sin esto, una falla forzada (pedido que Google corta en la salida, que por
-- regla se devuelve) se podía repetir sin fin a costa de la cuenta de Gemini.
create table if not exists public.action_attempts (
  id bigint generated always as identity primary key,
  user_id text not null,
  action text not null check (action ~ '^[a-z][a-z0-9_]{1,31}$'),
  created_at timestamptz not null default now()
);

create index if not exists action_attempts_user_action_time_idx
  on public.action_attempts (user_id, action, created_at desc);

alter table public.action_attempts enable row level security;  -- sin policies
revoke all on table public.action_attempts from public, anon, authenticated;
grant all on table public.action_attempts to service_role;

-- ============================================================
-- 6. RPCs
-- ============================================================

-- ------------------------------------------------------------
-- notify_user — crea un aviso (idempotente por dedupe_key) y devuelve su id.
-- ------------------------------------------------------------
-- Si ya existía un aviso con esa llave para ese usuario, NO crea otro y devuelve
-- el id del existente (así la pantalla puede marcar leído el que ya mostró).
-- p_read = true lo crea ya leído (ej. la tanda terminó con el cliente mirando:
-- el aviso queda como marca 'gen:<id>' y en el historial, sin sumar a la
-- campanita).
create or replace function public.notify_user(
  p_user_id text,
  p_kind text,
  p_data jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_read boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := nullif(trim(coalesce(p_dedupe_key, '')), '');
  v_id uuid;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'notify_user: falta p_user_id';
  end if;

  insert into public.user_notifications (user_id, kind, data, dedupe_key, read_at)
  values (
    p_user_id,
    p_kind,
    coalesce(p_data, '{}'::jsonb),
    v_key,
    case when coalesce(p_read, false) then now() end
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select n.id into v_id
      from public.user_notifications n
     where n.user_id = p_user_id and n.dedupe_key = v_key;
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- refund_credits_with_notice — devolución + su aviso en UNA transacción.
-- ------------------------------------------------------------
-- Es el mismo mecanismo de siempre (grant_credits(..., 'refund') o
-- grant_analysis_credits), envuelto para dos garantías:
--   1. "No se promete nada que el sistema no haga": el aviso «ya te devolvimos»
--      nace en la MISMA transacción que la devolución. Si una falla, no queda
--      ninguna de las dos.
--   2. IDEMPOTENTE por dedupe_key: si el aviso ya existe, NO devuelve de nuevo
--      (status 'duplicate'). Reintentar es seguro: nunca devuelve dos veces lo
--      mismo.
-- Ilimitados: su descuento fue no-op; devolver acuñaría créditos (ya pasó en
-- prod: +2 sin deduct) → NO se devuelve, pero el aviso sale igual con
-- refunded = 0 (el texto omite «te devolvimos»), así la ruta llama siempre a
-- esta función. Excepción: 'refund_landed' sin devolución no tiene sentido →
-- ni aviso.
-- Escribe en data: refunded (= p_amount, o 0 si es ilimitado), bucket y el
-- saldo resultante (saldo para 'generation', saldo_analisis para 'analysis').
create or replace function public.refund_credits_with_notice(
  p_user_id text,
  p_amount integer,
  p_bucket text,
  p_kind text,
  p_data jsonb,
  p_dedupe_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := nullif(trim(coalesce(p_dedupe_key, '')), '');
  v_id uuid;
  v_existing_id uuid;
  v_existing_kind text;
  v_balance integer;
begin
  if v_key is null then
    raise exception 'refund_credits_with_notice: la devolución necesita dedupe_key (es su llave de idempotencia)';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'refund_credits_with_notice: el monto debe ser positivo (recibido: %)', p_amount;
  end if;
  if p_bucket is null or p_bucket not in ('generation', 'analysis') then
    raise exception 'refund_credits_with_notice: bucket inválido: %', p_bucket;
  end if;

  if exists (select 1 from public.unlimited_users u where u.user_id = p_user_id) then
    if p_kind = 'refund_landed' then
      return jsonb_build_object('status', 'unlimited', 'notification_id', null::uuid);
    end if;
    insert into public.user_notifications (user_id, kind, data, dedupe_key)
    values (
      p_user_id,
      p_kind,
      coalesce(p_data, '{}'::jsonb)
        || jsonb_build_object('refunded', 0, 'bucket', p_bucket),
      v_key
    )
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_id;
    if v_id is null then
      select n.id into v_id
        from public.user_notifications n
       where n.user_id = p_user_id and n.dedupe_key = v_key;
    end if;
    return jsonb_build_object('status', 'unlimited', 'notification_id', v_id);
  end if;

  -- El aviso primero: es el candado de idempotencia.
  insert into public.user_notifications (user_id, kind, data, dedupe_key)
  values (
    p_user_id,
    p_kind,
    coalesce(p_data, '{}'::jsonb)
      || jsonb_build_object('refunded', p_amount, 'bucket', p_bucket),
    v_key
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select n.id, n.kind into v_existing_id, v_existing_kind
      from public.user_notifications n
     where n.user_id = p_user_id and n.dedupe_key = v_key;
    return jsonb_build_object(
      'status', 'duplicate',
      'notification_id', v_existing_id,
      'existing_kind', v_existing_kind
    );
  end if;

  if p_bucket = 'generation' then
    v_balance := public.grant_credits(p_user_id, p_amount, 'refund');
    update public.user_notifications
       set data = data || jsonb_build_object('saldo', v_balance)
     where id = v_id;
  else
    v_balance := public.grant_analysis_credits(p_user_id, p_amount);
    update public.user_notifications
       set data = data || jsonb_build_object('saldo_analisis', v_balance)
     where id = v_id;
  end if;

  return jsonb_build_object(
    'status', 'refunded',
    'notification_id', v_id,
    'balance', v_balance
  );
end;
$$;

-- ------------------------------------------------------------
-- admin_alert_raise — abre o repite una alerta y decide si sale mail.
-- ------------------------------------------------------------
-- - Dedupe por dedupe_key sobre lo abierto: si ya hay una abierta, sube
--   occurrences, last_seen y la severidad (nunca la baja).
-- - Episodio nuevo: si la abierta llevaba más de 24 h en silencio, se reinicia
--   (occurrences = 1, first_seen = ahora) y se trata como nueva.
-- - Escalada opcional: con p_escalate_at ocurrencias dentro de
--   p_escalate_within_minutes desde first_seen, sube a U (ej. chequeo de acceso:
--   «mail si son ≥5 en 10 min»).
-- - Mail (solo U): al abrir, y otra vez si sigue abierta y el último mail tiene
--   más de 6 h. Se RESERVA acá (last_emailed_at = now()) para que entre varias
--   instancias salga uno solo. Frenos: (a) anti idas y vueltas: no sale si esta
--   misma llave mandó mail en los últimos 30 min; (b) tope global de mails
--   urgentes por hora (JonSnow #7), SEPARADO por bolsa (ver
--   admin_alert_mail_pool). Frenado no es perdido: queda sin mail y el
--   próximo raise (o el recordatorio) lo manda.

-- Bolsa del tope de mails: las alertas de SISTEMA no comparten tope con las
-- fallas de un cliente. Así un cliente que fuerza fallas no puede gastar el tope
-- y frenar el mail de ai_down, payment_credit_failed o refund_failed.
create or replace function public.admin_alert_mail_pool(p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_kind in ('ai_down', 'refund_failed', 'db_down', 'charge_failed', 'webhook_secret_missing')
      or p_kind like 'payment\_%'
    then 'system'
    else 'client'
  end;
$$;

create or replace function public.admin_alert_raise(
  p_kind text,
  p_severity text,
  p_dedupe_key text,
  p_details jsonb default '{}'::jsonb,
  p_user_id text default null,
  p_escalate_at integer default null,
  p_escalate_within_minutes integer default null,
  p_mail_cap_per_hour integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := nullif(trim(coalesce(p_dedupe_key, '')), '');
  v_row public.admin_alerts%rowtype;
  v_is_new boolean := false;
  v_new_episode boolean := false;
  v_prev_emailed timestamptz;
  v_should_email boolean := false;
  v_rank_old integer;
  v_rank_new integer;
  v_recent_mail boolean;
  v_mails_last_hour integer;
begin
  if v_key is null then
    raise exception 'admin_alert_raise: falta dedupe_key';
  end if;
  if p_severity is null or p_severity not in ('U', 'M', 'B') then
    raise exception 'admin_alert_raise: severity inválida: %', p_severity;
  end if;

  -- Serializa los raise de la MISMA llave hasta el commit.
  perform pg_advisory_xact_lock(hashtext('admin_alerts:' || v_key));

  select * into v_row
    from public.admin_alerts a
   where a.dedupe_key = v_key and a.resolved_at is null
   for update;

  if not found then
    insert into public.admin_alerts (kind, severity, dedupe_key, details, user_id)
    values (p_kind, p_severity, v_key, coalesce(p_details, '{}'::jsonb), p_user_id)
    returning * into v_row;
    v_is_new := true;
  else
    v_new_episode := v_row.last_seen < now() - interval '24 hours';
    v_rank_old := case v_row.severity when 'U' then 3 when 'M' then 2 else 1 end;
    v_rank_new := case p_severity when 'U' then 3 when 'M' then 2 else 1 end;

    update public.admin_alerts a
       set kind = p_kind,
           severity = case
             when v_new_episode then p_severity
             when v_rank_new > v_rank_old then p_severity
             else a.severity
           end,
           details = case
             when v_new_episode then coalesce(p_details, '{}'::jsonb)
             else a.details || coalesce(p_details, '{}'::jsonb)
           end,
           user_id = coalesce(p_user_id, a.user_id),
           occurrences = case when v_new_episode then 1 else a.occurrences + 1 end,
           first_seen = case when v_new_episode then now() else a.first_seen end,
           last_seen = now(),
           last_emailed_at = case when v_new_episode then null else a.last_emailed_at end
     where a.id = v_row.id
    returning * into v_row;
  end if;

  -- Escalada por ráfaga.
  if p_escalate_at is not null
     and p_escalate_within_minutes is not null
     and v_row.severity <> 'U'
     and v_row.occurrences >= p_escalate_at
     and v_row.last_seen - v_row.first_seen
         <= make_interval(mins => greatest(p_escalate_within_minutes, 1)) then
    update public.admin_alerts a
       set severity = 'U'
     where a.id = v_row.id
    returning * into v_row;
  end if;

  -- ¿Sale mail?
  v_prev_emailed := v_row.last_emailed_at;
  if v_row.severity = 'U'
     and (v_row.last_emailed_at is null
          or v_row.last_emailed_at < now() - interval '6 hours') then
    select exists (
      select 1 from public.admin_alerts b
       where b.dedupe_key = v_key
         and b.last_emailed_at > now() - interval '30 minutes'
    ) into v_recent_mail;

    select count(*) into v_mails_last_hour
      from public.admin_alerts b
     where b.last_emailed_at > now() - interval '1 hour'
       and public.admin_alert_mail_pool(b.kind) = public.admin_alert_mail_pool(v_row.kind);

    if not v_recent_mail
       and v_mails_last_hour < greatest(coalesce(p_mail_cap_per_hour, 12), 1) then
      update public.admin_alerts a
         set last_emailed_at = now()
       where a.id = v_row.id
      returning * into v_row;
      v_should_email := true;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'kind', v_row.kind,
    'severity', v_row.severity,
    'dedupe_key', v_row.dedupe_key,
    'details', v_row.details,
    'user_id', v_row.user_id,
    'occurrences', v_row.occurrences,
    'first_seen', v_row.first_seen,
    'last_seen', v_row.last_seen,
    'is_new', v_is_new or v_new_episode,
    'should_email', v_should_email,
    'emailed_at', case when v_should_email then v_row.last_emailed_at end,
    'prev_emailed_at', v_prev_emailed
  );
end;
$$;

-- ------------------------------------------------------------
-- admin_alert_resolve — cierra la alerta abierta de esa llave.
-- ------------------------------------------------------------
-- Devuelve la fila cerrada (o null si no había abierta). should_email = era U y
-- a Paolo le había llegado el mail de apertura (si nunca le llegó, el «resuelta»
-- sobra).
create or replace function public.admin_alert_resolve(
  p_dedupe_key text,
  p_resolution jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_alerts%rowtype;
begin
  update public.admin_alerts a
     set resolved_at = now(),
         details = case
           when p_resolution is null then a.details
           else a.details || jsonb_build_object('resolution', p_resolution)
         end
   where a.dedupe_key = nullif(trim(coalesce(p_dedupe_key, '')), '')
     and a.resolved_at is null
  returning * into v_row;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'kind', v_row.kind,
    'severity', v_row.severity,
    'dedupe_key', v_row.dedupe_key,
    'details', v_row.details,
    'user_id', v_row.user_id,
    'occurrences', v_row.occurrences,
    'first_seen', v_row.first_seen,
    'last_seen', v_row.last_seen,
    'resolved_at', v_row.resolved_at,
    'should_email', v_row.severity = 'U' and v_row.last_emailed_at is not null
  );
end;
$$;

-- ------------------------------------------------------------
-- admin_alert_claim_reminders — reserva los recordatorios de U abiertas.
-- ------------------------------------------------------------
-- U abiertas sin mail (frenadas por el tope) o con el último mail de hace más de
-- 6 h. Respeta el anti idas y vueltas (30 min por llave) y el tope por hora de
-- CADA bolsa (sistema / cliente; las de sistema primero). Devuelve las filas
-- reservadas (jsonb array); el mail lo manda el server.
create or replace function public.admin_alert_claim_reminders(
  p_limit integer default 10,
  p_mail_cap_per_hour integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool text;
  v_budget integer;
  v_left integer := greatest(coalesce(p_limit, 10), 1);
  v_part jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  foreach v_pool in array array['system', 'client'] loop
    exit when v_left <= 0;

    select greatest(coalesce(p_mail_cap_per_hour, 12), 1) - count(*)
      into v_budget
      from public.admin_alerts b
     where b.last_emailed_at > now() - interval '1 hour'
       and public.admin_alert_mail_pool(b.kind) = v_pool;

    v_budget := least(v_budget, v_left);
    continue when v_budget <= 0;

    with picked as (
      select a.id
        from public.admin_alerts a
       where a.resolved_at is null
         and a.severity = 'U'
         and public.admin_alert_mail_pool(a.kind) = v_pool
         and (a.last_emailed_at is null or a.last_emailed_at < now() - interval '6 hours')
         and not exists (
           select 1 from public.admin_alerts b
            where b.dedupe_key = a.dedupe_key
              and b.last_emailed_at > now() - interval '30 minutes'
         )
       order by coalesce(a.last_emailed_at, a.first_seen)
       limit v_budget
       for update of a skip locked
    ),
    claimed as (
      update public.admin_alerts a
         set last_emailed_at = now()
        from picked
       where a.id = picked.id
      returning a.*
    )
    select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb)
      into v_part
      from claimed;

    v_out := v_out || v_part;
    v_left := v_left - jsonb_array_length(v_part);
  end loop;

  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- ai_mark_down — la IA está caída.
-- ------------------------------------------------------------
-- changed = true solo para el que la pasa de ok a caída (ese abre la alerta).
-- Si ya estaba caída, solo actualiza la causa: NO pospone la próxima prueba.
create or replace function public.ai_mark_down(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
begin
  update public.service_status s
     set ok = false,
         since = now(),
         reason = left(coalesce(p_reason, ''), 300),
         next_probe_at = now() + interval '2 minutes'
   where s.id = 'ai' and s.ok = true
  returning s.since into v_since;

  if found then
    return jsonb_build_object('changed', true, 'since', v_since);
  end if;

  update public.service_status s
     set reason = left(coalesce(p_reason, ''), 300)
   where s.id = 'ai'
  returning s.since into v_since;

  if not found then
    -- Sin fila 'ai' (alguien la borró): se recrea caída.
    insert into public.service_status (id, ok, since, reason, next_probe_at)
    values ('ai', false, now(), left(coalesce(p_reason, ''), 300), now() + interval '2 minutes')
    on conflict (id) do nothing
    returning since into v_since;
    return jsonb_build_object('changed', v_since is not null, 'since', v_since);
  end if;

  return jsonb_build_object('changed', false, 'since', v_since);
end;
$$;

-- ------------------------------------------------------------
-- ai_claim_probe — UN solo intento de prueba cuando venció next_probe_at.
-- ------------------------------------------------------------
-- UPDATE ... RETURNING atómico: entre todas las instancias, una sola gana. La
-- próxima ventana se aleja con el tiempo caído: entre 2 y 15 min (un cuarto de
-- lo que lleva caída). Revocada al cliente: si cualquiera pudiera reclamarla,
-- acapararía la prueba y la IA no volvería sola (JonSnow #3).
create or replace function public.ai_claim_probe()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  update public.service_status s
     set next_probe_at = now() + least(
           interval '15 minutes',
           greatest(interval '2 minutes', (now() - s.since) / 4)
         )
   where s.id = 'ai'
     and s.ok = false
     and (s.next_probe_at is null or s.next_probe_at <= now())
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

-- ------------------------------------------------------------
-- ai_mark_up — la IA volvió. Atómico: solo el que la pasa de caída a ok avisa.
-- ------------------------------------------------------------
-- En la misma transacción: ok = true, un aviso «Ya podés generar de nuevo» por
-- cada watcher (dedupe por caída: nunca dos por usuario para la misma caída) y
-- se borran esos watchers. La alerta 'ai_down' la cierra el server
-- (resolveAlert) para mandar el mail de "resuelta".
create or replace function public.ai_mark_up(p_source text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_since timestamptz;
  v_watchers text[];
  v_notified integer := 0;
begin
  select s.since into v_old_since
    from public.service_status s
   where s.id = 'ai' and s.ok = false
   for update;

  if not found then
    return jsonb_build_object('changed', false, 'notified', 0);
  end if;

  update public.service_status s
     set ok = true, since = now(), reason = null, next_probe_at = null
   where s.id = 'ai';

  select coalesce(array_agg(w.user_id), array[]::text[])
    into v_watchers
    from public.ai_outage_watchers w;

  insert into public.user_notifications (user_id, kind, data, dedupe_key)
  select u.uid,
         'ai_restored',
         jsonb_build_object('down_since', v_old_since, 'source', p_source),
         'ai_restored:' || extract(epoch from v_old_since)::bigint::text
    from unnest(v_watchers) as u(uid)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_notified = row_count;

  delete from public.ai_outage_watchers w where w.user_id = any(v_watchers);

  return jsonb_build_object(
    'changed', true,
    'notified', v_notified,
    'down_since', v_old_since
  );
end;
$$;

-- ------------------------------------------------------------
-- charge_batch — descuenta la tanda y registra el cobro, en UNA transacción.
-- ------------------------------------------------------------
-- Reemplaza la llamada directa a deduct_credits en POST /api/generations. Si
-- deduct_credits tira (saldo insuficiente, perfil inexistente), tira con el
-- MISMO mensaje (la ruta sigue distinguiendo el 402) y no queda nada. Si el
-- registro falla, el descuento se revierte: nunca hay cobro sin fila.
-- Ilimitados: deduct_credits es no-op → amount = 0 (el reaper no les devuelve).
create or replace function public.charge_batch(
  p_user_id text,
  p_amount integer,
  p_generation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unlimited boolean;
  v_balance integer;
begin
  if p_generation_id is null then
    raise exception 'charge_batch: falta p_generation_id';
  end if;

  v_unlimited := exists (select 1 from public.unlimited_users u where u.user_id = p_user_id);
  v_balance := public.deduct_credits(p_user_id, p_amount, p_generation_id);

  insert into public.batch_charges (generation_id, user_id, amount)
  values (p_generation_id, p_user_id, case when v_unlimited then 0 else p_amount end);

  return v_balance;
end;
$$;

-- ------------------------------------------------------------
-- batch_charge_image_saved — la ruta entregó una imagen de la tanda.
-- ------------------------------------------------------------
create or replace function public.batch_charge_image_saved(p_generation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.batch_charges b
     set images_saved = b.images_saved + 1
   where b.generation_id = p_generation_id
     and b.closed_at is null;
$$;

-- ------------------------------------------------------------
-- batch_charge_close — la ruta terminó la tanda: el reaper no la toca más.
-- ------------------------------------------------------------
create or replace function public.batch_charge_close(p_generation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.batch_charges b
     set closed_at = now()
   where b.generation_id = p_generation_id
     and b.closed_at is null;
$$;

-- ------------------------------------------------------------
-- reap_one_generation — decide UNA tanda colgada (la usa reap_stale_generations).
-- ------------------------------------------------------------
-- Devuelve el jsonb de lo que hizo, o null si no la tocó.
-- CON fila en batch_charges (la plata sale SOLO de ahí):
--   - cerrada (closed_at)             → null: la ruta terminó. Nunca se devuelve.
--   - cobrada hace < 15 min           → null: la ruta puede seguir viva.
--   - ya tiene aviso 'gen:<id>'       → la ruta terminó y murió antes de cerrar:
--                                       se cierra SIN devolver.
--   - si no                           → aviso 'batch_timeout' con dedupe
--                                       'gen:<id>' (candado: nunca devuelve dos
--                                       veces) + grant_credits(amount −
--                                       images_saved, 'refund') + cierre +
--                                       generations 'failed'/'timeout' si seguía
--                                       en pending/processing.
-- SIN fila en batch_charges (ilimitado viejo, murió antes del descuento, o una
-- tanda que el dueño insertó a mano): nunca hay plata. Si sigue en
-- pending/processing, se cierra 'failed'/'timeout' con aviso sin «te
-- devolvimos» (dedupe 'gen_timeout:<id>', NO 'gen:').
-- (La versión anterior recibía un p_cutoff: se borra por si alguien la aplicó.)
drop function if exists public.reap_one_generation(uuid, timestamptz);
create or replace function public.reap_one_generation(p_generation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.batch_charges%rowtype;
  v_user text;
  v_project uuid;
  v_version uuid;
  v_status text;
  v_product text;
  v_refund integer;
  v_notif uuid;
  v_balance integer;
begin
  select * into c
    from public.batch_charges b
   where b.generation_id = p_generation_id
   for update;

  if found then
    if c.closed_at is not null then
      return null;
    end if;
    if c.charged_at > now() - interval '15 minutes' then
      return null;
    end if;

    -- Datos de la tanda SOLO para el texto (producto) y el panel: no deciden plata.
    select g.project_id, g.version_id, g.status
      into v_project, v_version, v_status
      from public.generations g
     where g.id = p_generation_id and g.user_id = c.user_id;

    select p.name into v_product
      from public.projects p
     where p.id = v_project and p.user_id = c.user_id;

    if exists (
      select 1 from public.user_notifications n
       where n.user_id = c.user_id and n.dedupe_key = 'gen:' || p_generation_id::text
    ) then
      update public.batch_charges b
         set closed_at = now(), refunded = 0
       where b.generation_id = p_generation_id;
      return null;
    end if;

    v_refund := greatest(c.amount - c.images_saved, 0);

    insert into public.user_notifications (user_id, kind, data, dedupe_key)
    values (
      c.user_id,
      'batch_timeout',
      jsonb_build_object(
        'product', v_product,
        'refunded', v_refund,
        'bucket', 'generation',
        'generation_id', p_generation_id,
        'version_id', v_version
      ),
      'gen:' || p_generation_id::text
    )
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_notif;

    if v_notif is null then
      -- Otra transacción escribió el aviso: la tanda terminó por otro lado.
      update public.batch_charges b
         set closed_at = now(), refunded = 0
       where b.generation_id = p_generation_id;
      return null;
    end if;

    if v_refund > 0 then
      v_balance := public.grant_credits(c.user_id, v_refund, 'refund');
      update public.user_notifications
         set data = data || jsonb_build_object('saldo', v_balance)
       where id = v_notif;
    end if;

    update public.batch_charges b
       set closed_at = now(), refunded = v_refund
     where b.generation_id = p_generation_id;

    update public.generations
       set status = 'failed', error_message = 'timeout'
     where id = p_generation_id
       and status in ('pending', 'processing');

    return jsonb_build_object(
      'generation_id', p_generation_id,
      'user_id', c.user_id,
      'version_id', v_version,
      'product', v_product,
      'charged', c.amount,
      'images', c.images_saved,
      'refunded', v_refund,
      'needs_review', false,
      'notification_id', v_notif
    );
  end if;

  -- Sin cobro registrado: nunca hay plata en juego.
  select g.user_id, g.project_id, g.version_id, g.status
    into v_user, v_project, v_version, v_status
    from public.generations g
   where g.id = p_generation_id
   for update;

  if v_user is null or v_status not in ('pending', 'processing') then
    return null;
  end if;

  if exists (
    select 1 from public.user_notifications n
     where n.user_id = v_user and n.dedupe_key = 'gen:' || p_generation_id::text
  ) then
    return null;
  end if;

  select p.name into v_product
    from public.projects p
   where p.id = v_project and p.user_id = v_user;

  insert into public.user_notifications (user_id, kind, data, dedupe_key)
  values (
    v_user,
    'batch_timeout',
    jsonb_build_object(
      'product', v_product,
      'refunded', 0,
      'generation_id', p_generation_id,
      'version_id', v_version
    ),
    'gen_timeout:' || p_generation_id::text
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_notif;

  update public.generations
     set status = 'failed', error_message = 'timeout'
   where id = p_generation_id;

  return jsonb_build_object(
    'generation_id', p_generation_id,
    'user_id', v_user,
    'version_id', v_version,
    'product', v_product,
    'charged', 0,
    'images', null::integer,
    'refunded', 0,
    'needs_review', false,
    'notification_id', v_notif
  );
end;
$$;

-- ------------------------------------------------------------
-- reap_stale_generations — tandas colgadas (Vercel corta la ruta a los 300 s).
-- ------------------------------------------------------------
-- DOS pasadas, cada una con su tope:
--   1. Cobros ABIERTOS de batch_charges de hace más de 15 min (charged_at lo
--      pone el server: el dueño no lo puede tocar). Son las únicas con plata.
--   2. generations en pending/processing hace más de 15 min y menos de 7 días
--      SIN fila en batch_charges: solo se cierran, sin plata. created_at lo
--      puede tocar el dueño, pero acá no decide nada de dinero.
-- Así un usuario que inserte miles de tandas falsas no tapa las cobradas de
-- nadie. Cada tanda va en su propia subtransacción: una rota no frena a las
-- demás. Devuelve un jsonb array; las alertas a Paolo las abre el server.
create or replace function public.reap_stale_generations(
  p_user_id text default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  r record;
begin
  -- Pasada 1: cobros abiertos.
  for r in
    select b.generation_id as id, b.user_id
      from public.batch_charges b
     where b.closed_at is null
       and b.charged_at < now() - interval '15 minutes'
       and (p_user_id is null or b.user_id = p_user_id)
     order by b.charged_at
     limit v_limit
     for update of b skip locked
  loop
    begin
      v_item := public.reap_one_generation(r.id);
      if v_item is not null then
        v_out := v_out || jsonb_build_array(v_item);
      end if;
    exception when others then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'generation_id', r.id, 'user_id', r.user_id, 'error', sqlerrm
      ));
    end;
  end loop;

  -- Pasada 2: tandas sin cobro registrado (solo se cierran).
  for r in
    select g.id, g.user_id
      from public.generations g
     where g.status in ('pending', 'processing')
       and g.created_at < now() - interval '15 minutes'
       and g.created_at > now() - interval '7 days'
       and (p_user_id is null or g.user_id = p_user_id)
       and not exists (
         select 1 from public.batch_charges b where b.generation_id = g.id
       )
     order by g.created_at
     limit v_limit
     for update of g skip locked
  loop
    begin
      v_item := public.reap_one_generation(r.id);
      if v_item is not null then
        v_out := v_out || jsonb_build_array(v_item);
      end if;
    exception when others then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'generation_id', r.id, 'user_id', r.user_id, 'error', sqlerrm
      ));
    end;
  end loop;

  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- check_action_rate_limit — tope por usuario de regenerar / analizar.
-- ------------------------------------------------------------
-- Mismo contrato que check_generation_rate_limit (0025): solo cuenta los
-- intentos PERMITIDOS y devuelve { allowed, per_hour, per_day, limit_hour,
-- limit_day }. Serializado por usuario+acción (advisory lock) para que dos
-- pedidos simultáneos no pasen los dos con el último cupo.
create or replace function public.check_action_rate_limit(
  p_user_id text,
  p_action text,
  p_per_hour integer,
  p_per_day integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour integer;
  v_day integer;
begin
  perform pg_advisory_xact_lock(hashtext('action_attempts:' || coalesce(p_user_id, '') || ':' || coalesce(p_action, '')));

  -- Higiene: es un contador, no un historial (2 días alcanzan).
  delete from public.action_attempts a
   where a.user_id = p_user_id
     and a.created_at < now() - interval '2 days';

  select count(*) filter (where a.created_at > now() - interval '1 hour'),
         count(*)
    into v_hour, v_day
    from public.action_attempts a
   where a.user_id = p_user_id
     and a.action = p_action
     and a.created_at > now() - interval '1 day';

  if v_hour >= p_per_hour or v_day >= p_per_day then
    return jsonb_build_object(
      'allowed', false,
      'per_hour', v_hour,
      'per_day', v_day,
      'limit_hour', p_per_hour,
      'limit_day', p_per_day
    );
  end if;

  insert into public.action_attempts (user_id, action) values (p_user_id, p_action);

  return jsonb_build_object(
    'allowed', true,
    'per_hour', v_hour + 1,
    'per_day', v_day + 1,
    'limit_hour', p_per_hour,
    'limit_day', p_per_day
  );
end;
$$;

-- ------------------------------------------------------------
-- claim_output_block_refund — ¿se devuelve este bloqueo de la SALIDA?
-- ------------------------------------------------------------
-- Regla de Paolo: el bloqueo de la salida (IMAGE_SAFETY, etc.) se devuelve
-- porque la culpa no es clara. Tope: más de p_max_per_day por usuario en 24 h
-- dejan de devolverse (se tratan como entrada bloqueada) y la ruta abre una
-- alerta M. true = se devuelve (y queda contado); false = ya pasó el tope.
create or replace function public.claim_output_block_refund(
  p_user_id text,
  p_max_per_day integer default 3
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('action_attempts:' || coalesce(p_user_id, '') || ':output_block_refund'));

  select count(*) into v_count
    from public.action_attempts a
   where a.user_id = p_user_id
     and a.action = 'output_block_refund'
     and a.created_at > now() - interval '24 hours';

  if v_count >= greatest(coalesce(p_max_per_day, 3), 0) then
    return false;
  end if;

  insert into public.action_attempts (user_id, action) values (p_user_id, 'output_block_refund');
  return true;
end;
$$;

-- ============================================================
-- 7. Blindaje de las RPC (lección 0015): solo service_role
-- ============================================================
-- Postgres da EXECUTE a PUBLIC al crear una función y el default ACL de
-- Supabase se lo da además a anon/authenticated: hay que revocar de los tres.
revoke execute on function public.notify_user(text, text, jsonb, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.refund_credits_with_notice(text, integer, text, text, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.admin_alert_raise(text, text, text, jsonb, text, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.admin_alert_resolve(text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.admin_alert_claim_reminders(integer, integer)
  from public, anon, authenticated;
revoke execute on function public.ai_mark_down(text)
  from public, anon, authenticated;
revoke execute on function public.ai_claim_probe()
  from public, anon, authenticated;
revoke execute on function public.ai_mark_up(text)
  from public, anon, authenticated;
revoke execute on function public.reap_one_generation(uuid)
  from public, anon, authenticated;
revoke execute on function public.charge_batch(text, integer, uuid)
  from public, anon, authenticated;
revoke execute on function public.batch_charge_image_saved(uuid)
  from public, anon, authenticated;
revoke execute on function public.batch_charge_close(uuid)
  from public, anon, authenticated;
revoke execute on function public.check_action_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.claim_output_block_refund(text, integer)
  from public, anon, authenticated;
revoke execute on function public.admin_alert_mail_pool(text)
  from public, anon, authenticated;
revoke execute on function public.user_notifications_guard_read_at()
  from public, anon, authenticated;
revoke execute on function public.reap_stale_generations(text, integer)
  from public, anon, authenticated;

grant execute on function public.notify_user(text, text, jsonb, text, boolean) to service_role;
grant execute on function public.refund_credits_with_notice(text, integer, text, text, jsonb, text) to service_role;
grant execute on function public.admin_alert_raise(text, text, text, jsonb, text, integer, integer, integer) to service_role;
grant execute on function public.admin_alert_resolve(text, jsonb) to service_role;
grant execute on function public.admin_alert_claim_reminders(integer, integer) to service_role;
grant execute on function public.ai_mark_down(text) to service_role;
grant execute on function public.ai_claim_probe() to service_role;
grant execute on function public.ai_mark_up(text) to service_role;
grant execute on function public.reap_one_generation(uuid) to service_role;
grant execute on function public.charge_batch(text, integer, uuid) to service_role;
grant execute on function public.batch_charge_image_saved(uuid) to service_role;
grant execute on function public.batch_charge_close(uuid) to service_role;
grant execute on function public.check_action_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.claim_output_block_refund(text, integer) to service_role;
grant execute on function public.admin_alert_mail_pool(text) to service_role;
grant execute on function public.reap_stale_generations(text, integer) to service_role;
