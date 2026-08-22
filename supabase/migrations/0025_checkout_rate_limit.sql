-- ============================================================
-- 0025 — Rate limit del checkout de Mercado Pago (2026-08-22)
-- ============================================================
-- Cierra el hallazgo G3 de la auditoría de JonSnow (2026-08-21):
--
--   `app/api/checkout/route.ts` y `app/comprar/route.ts?direct=1` crean una
--   Preference de Checkout Pro en CADA request, sin ningún tope. Cualquier
--   logueado (y crear cuenta es 1 clic desde que está el Google OAuth) puede
--   pegarles en loop y llenar de basura la cuenta real de Mercado Pago de Paolo
--   (app id 532027134550190). No acredita nada ni rompe el paywall: es DoS de
--   COSTO y de REPUTACIÓN — puede disparar los controles antifraude de MP.
--
-- POR QUÉ EN LA BASE Y NO EN MEMORIA: Vendí corre en Vercel serverless. Un
-- contador en una variable de módulo vive por instancia (lambda), y cada request
-- puede caer en una instancia distinta o recién arrancada → el tope sería
-- ficticio. Postgres es el único estado compartido que Vendí ya tiene; usarlo
-- evita sumar infraestructura nueva (Redis/KV) para un candado de 3 columnas.
--
-- ⚠️ FAIL-OPEN A PROPÓSITO (regla comercial de Paolo): si esta tabla, esta RPC o
-- la conexión a Supabase fallan, el código de la app DEJA PASAR el checkout. Una
-- Preference de más es barata; una venta perdida no. Esto es lo INVERSO al
-- paywall (`lib/auth/paid-access.ts`, fail-CLOSED) y es deliberado: aquel decide
-- quién ENTRA, este solo decide quién ABRE UNA PANTALLA DE PAGO.

-- ============================================================
-- checkout_attempts — un row por Preference que se va a crear
-- ============================================================
-- Solo tres datos: quién y cuándo. No guarda producto, monto ni nada del pago:
-- la verdad del cobro sigue siendo `mp_processed_payments` + el webhook.
create table if not exists public.checkout_attempts (
  id         bigint generated always as identity primary key,
  user_id    text        not null,               -- id de Clerk
  created_at timestamptz not null default now()
);

-- Índice del camino caliente: contar los intentos de UN usuario en una ventana.
create index if not exists checkout_attempts_user_time_idx
  on public.checkout_attempts (user_id, created_at desc);

-- Índice de la limpieza global (barrido por antigüedad, sin user_id).
create index if not exists checkout_attempts_time_idx
  on public.checkout_attempts (created_at);

-- RLS prendido SIN policies: nadie (anon/authenticated) lee ni escribe. Solo el
-- service_role (que bypassa RLS) opera acá, y siempre a través de la RPC.
alter table public.checkout_attempts enable row level security;

-- Cinturón + tirantes (lección de G2): que RLS no sea la única pared. Sin GRANT
-- de tabla, una policy permisiva futura tampoco abriría nada.
revoke all on table public.checkout_attempts from anon, authenticated;

comment on table public.checkout_attempts is
  'Rate limit del checkout de Mercado Pago (G3). Un row por Preference creada. Solo service_role, vía check_checkout_rate_limit(). Se auto-limpia: nada sobrevive más de 3 días.';

-- ============================================================
-- check_checkout_rate_limit — "¿puede este usuario abrir otro checkout?"
-- ============================================================
-- Cuenta y registra en UNA sola llamada (una transacción, un round trip desde
-- Vercel) para no sumar latencia al camino del pago.
--
-- DOS TOPES, por razones distintas:
--   · p_max_window / p_window_seconds → frena la RÁFAGA (el loop).
--   · p_max_day                       → frena el GOTEO sostenido, que es lo que
--     realmente ensucia el panel de MP (sin él, el tope de ráfaga permitiría
--     ~2.100 Preferences por día por cuenta).
--
-- Los valores por defecto son sugerencias: los manda el caller
-- (`lib/mercadopago/checkout-rate-limit.ts`), que es la fuente de verdad de los
-- números para poder ajustarlos sin una migración nueva.
--
-- Devuelve jsonb: {allowed, scope, retry_after}. `retry_after` son SEGUNDOS
-- hasta que se libere un lugar, para poder decirle al usuario cuánto esperar.
--
-- SECURITY DEFINER + REVOKE de PUBLIC: la RPC solo la invoca el server con
-- service_role. (Vendí ya sangró tres veces por RPC abiertas a PUBLIC —
-- migraciones 0015, 0019, 0020: acá se cierra desde el día uno.)
create or replace function public.check_checkout_rate_limit(
  p_user_id        text,
  p_max_window     integer default 15,
  p_window_seconds integer default 600,
  p_max_day        integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now          timestamptz := now();
  v_window_start timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_day_start    timestamptz := v_now - interval '24 hours';
  v_recent       integer;
  v_day          integer;
  v_oldest       timestamptz;
  v_retry        integer;
begin
  -- Candado por usuario dentro de la transacción. Sin esto, N requests en
  -- paralelo (que es exactamente la forma del ataque) leen el mismo contador
  -- viejo y pasan todas. Solo serializa a ESE usuario; no bloquea a nadie más.
  perform pg_advisory_xact_lock(hashtext('checkout_rl:' || p_user_id)::bigint);

  -- Higiene barata: lo del propio usuario que ya no cuenta para ninguna ventana.
  delete from public.checkout_attempts
   where user_id = p_user_id
     and created_at < v_day_start;

  -- Un solo escaneo del índice devuelve los dos contadores y el más viejo de la
  -- ventana corta (con el que se calcula cuándo se libera un lugar).
  select count(*) filter (where created_at >= v_window_start),
         count(*),
         min(created_at) filter (where created_at >= v_window_start)
    into v_recent, v_day, v_oldest
    from public.checkout_attempts
   where user_id = p_user_id
     and created_at >= v_day_start;

  if v_day >= p_max_day then
    -- Tope diario: no tiene sentido darle un "reintentá en X"; la salida es
    -- soporte. El caller manda a soporte@vendilatam.com.
    return jsonb_build_object('allowed', false, 'scope', 'day', 'retry_after', 3600);
  end if;

  if v_recent >= p_max_window then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds)) - v_now))::integer
    );
    return jsonb_build_object('allowed', false, 'scope', 'window', 'retry_after', v_retry);
  end if;

  insert into public.checkout_attempts (user_id) values (p_user_id);

  -- Barrido global ocasional (~1 de cada 50 llamadas). Los usuarios que nunca
  -- vuelven no disparan la limpieza de arriba, así que sin esto la tabla crecería
  -- para siempre. Va DESPUÉS de decidir, para no meterse en el camino caliente.
  if random() < 0.02 then
    delete from public.checkout_attempts
     where created_at < v_now - interval '3 days';
  end if;

  return jsonb_build_object('allowed', true, 'scope', 'ok', 'retry_after', 0);
end;
$$;

comment on function public.check_checkout_rate_limit(text, integer, integer, integer) is
  'Rate limit por usuario para crear Preferences de Mercado Pago (G3). Cuenta y registra atómicamente. Devuelve {allowed, scope, retry_after}. Solo service_role.';

-- Nadie más que el server. `public` incluye a anon y authenticated y a cualquier
-- rol futuro: se revoca del grupo, no solo de los dos roles conocidos.
revoke all on function public.check_checkout_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;

grant execute on function public.check_checkout_rate_limit(text, integer, integer, integer)
  to service_role;
