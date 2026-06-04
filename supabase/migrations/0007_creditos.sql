-- ============================================================
-- 0007 — Modelo de CRÉDITOS (pivote desde BYOK, 2026-06-03)
-- ============================================================
-- Vendí deja de ser BYOK. Ahora:
--   - La key de Google es de Vendí (server-side).
--   - El usuario paga una suscripción por Culqi y recibe créditos.
--   - Cada generación descuenta créditos. A 0, no genera.
--
-- Los créditos NO son dinero — son fichas que cuentan imágenes restantes.
-- `profiles.credits_remaining` (ya existe desde 0001) se usa como SALDO
-- cacheado para lectura rápida. `credit_ledger` es la fuente de verdad
-- auditable: el saldo real = suma de todos los `delta` del usuario.
--
-- SEGURIDAD CRÍTICA: los créditos solo se mutan server-side (service_role).
-- Un usuario NUNCA puede escribir su propio saldo — si pudiera, abriría
-- devtools y se regalaría créditos. Por eso las RLS de escritura están
-- cerradas al cliente; solo lectura de lo propio.

-- ============================================================
-- subscriptions — el plan activo del usuario
-- ============================================================
create table public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free',          -- 'free' | 'base' | 'pro' | etc.
  status text not null default 'active'        -- 'active' | 'cancelled' | 'past_due' | 'paused'
    check (status in ('active', 'cancelled', 'past_due', 'paused')),
  credits_per_cycle integer not null default 0, -- ej. 75 imágenes por ciclo
  cycle_start timestamptz not null default now(),
  cycle_end timestamptz,                        -- cuándo renueva / vence
  culqi_customer_id text,                       -- id del cliente en Culqi
  culqi_subscription_id text,                   -- id de la suscripción en Culqi (reconciliación)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions(user_id);
create index subscriptions_status_idx on public.subscriptions(status);
create unique index subscriptions_culqi_sub_idx
  on public.subscriptions(culqi_subscription_id)
  where culqi_subscription_id is not null;

-- ============================================================
-- credit_ledger — registro auditable de cada movimiento
-- ============================================================
create table public.credit_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,                       -- +75 al recargar, -1 por imagen
  reason text not null                          -- por qué se movió
    check (reason in (
      'subscription_grant',   -- recarga por ciclo de suscripción
      'purchase',             -- compra puntual de créditos
      'generation',           -- consumo por generar
      'refund',               -- devolución (generación fallida, etc.)
      'manual_adjustment',    -- ajuste manual del admin
      'signup_bonus'          -- créditos de bienvenida
    )),
  generation_id uuid references public.generations(id) on delete set null,
  balance_after integer not null,               -- saldo tras este movimiento
  created_at timestamptz not null default now()
);

create index credit_ledger_user_id_idx on public.credit_ledger(user_id);
create index credit_ledger_created_at_idx on public.credit_ledger(created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.subscriptions enable row level security;
alter table public.credit_ledger enable row level security;

-- subscriptions: el usuario LEE la suya. NO escribe (solo el server con
-- service_role, que bypassa RLS, puede crear/actualizar suscripciones).
create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- credit_ledger: el usuario LEE su historial. NUNCA escribe. El descuento
-- y la acreditación pasan por funciones server-side con service_role.
create policy "credit_ledger_select_own" on public.credit_ledger
  for select using (auth.uid() = user_id);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Función: descontar créditos atómicamente
-- ============================================================
-- Corre con SECURITY DEFINER (privilegios del owner) para poder escribir
-- el ledger y profiles aunque el caller sea un usuario normal. PERO solo
-- debe invocarse desde el SERVER (API route con service_role), nunca
-- expuesta directo al cliente.
--
-- Atómica: bloquea la fila del profile (FOR UPDATE), verifica saldo,
-- descuenta, escribe el ledger. Si no hay saldo suficiente, lanza error
-- y la transacción entera se revierte (no descuenta ni escribe ledger).
create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_generation_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'El monto a descontar debe ser positivo (recibido: %)', p_amount;
  end if;

  -- Lock pesimista sobre el profile para evitar doble-descuento concurrente.
  select credits_remaining into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'Profile no encontrado para user %', p_user_id;
  end if;

  if v_balance < p_amount then
    raise exception 'Créditos insuficientes: tiene %, necesita %', v_balance, p_amount
      using errcode = 'P0001';
  end if;

  v_new_balance := v_balance - p_amount;

  update public.profiles
  set credits_remaining = v_new_balance
  where id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, generation_id, balance_after)
  values (p_user_id, -p_amount, 'generation', p_generation_id, v_new_balance);

  return v_new_balance;
end;
$$;

-- ============================================================
-- Función: acreditar créditos (recarga / compra / bonus)
-- ============================================================
create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'El monto a acreditar debe ser positivo (recibido: %)', p_amount;
  end if;

  if p_reason not in ('subscription_grant', 'purchase', 'refund', 'manual_adjustment', 'signup_bonus') then
    raise exception 'reason inválido para grant: %', p_reason;
  end if;

  select credits_remaining into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'Profile no encontrado para user %', p_user_id;
  end if;

  v_new_balance := v_balance + p_amount;

  update public.profiles
  set credits_remaining = v_new_balance
  where id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, balance_after)
  values (p_user_id, p_amount, p_reason, v_new_balance);

  return v_new_balance;
end;
$$;

-- Revocar el acceso a estas funciones desde roles públicos: SOLO el server
-- (service_role) las invoca. El cliente autenticado no debe poder llamarlas
-- directo (si no, se auto-regalaría créditos vía grant_credits).
revoke execute on function public.deduct_credits(uuid, integer, uuid) from anon, authenticated;
revoke execute on function public.grant_credits(uuid, integer, text) from anon, authenticated;
