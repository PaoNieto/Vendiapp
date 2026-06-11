-- ============================================================
-- 0009 — Créditos ILIMITADOS por allowlist (2026-06-10)
-- ============================================================
-- Paolo (fundador) y cualquier cuenta que él ordene tienen créditos
-- ilimitados, tanto de GENERACIÓN como de ANÁLISIS. El resto sigue pagando
-- y gastando normal.
--
-- POR QUÉ una tabla separada y NO un flag en `profiles`:
--   La policy `profiles_update_own` (0001) deja al usuario hacer UPDATE de su
--   propia fila SIN with-check ni restricción de columnas. Un flag de
--   ilimitado ahí sería auto-asignable desde devtools — el mismo agujero que
--   todo el modelo de créditos evita. Por eso la allowlist es una tabla aparte
--   que SOLO escribe el service_role; el usuario, como mucho, LEE si él es
--   ilimitado (para que la UI muestre ∞).
--
-- Mecánica: las RPC de descuento (`deduct_credits` / `deduct_analysis_credit`)
-- se vuelven NO-OP para los usuarios de la allowlist: no tocan el saldo ni
-- escriben ledger, y devuelven el saldo intacto. Como nunca baja el saldo y
-- el pre-check de las API routes también consulta `is_unlimited`, el usuario
-- ilimitado nunca topa.

-- ============================================================
-- unlimited_users — la allowlist
-- ============================================================
create table public.unlimited_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,                                    -- por qué / quién lo habilitó
  created_at timestamptz not null default now()
);

alter table public.unlimited_users enable row level security;

-- El usuario puede LEER únicamente su propia fila (para que la UI muestre ∞).
-- NUNCA escribe: alta y baja sólo con service_role (que bypassa RLS).
create policy "unlimited_users_select_own" on public.unlimited_users
  for select using (auth.uid() = user_id);

-- ============================================================
-- is_unlimited(user_id) — helper consultado por las API routes (service_role)
-- ============================================================
create or replace function public.is_unlimited(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.unlimited_users where user_id = p_user_id
  );
$$;

-- ============================================================
-- deduct_credits — no-op para usuarios ilimitados
-- ============================================================
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

  -- Ilimitado: no descuenta, no escribe ledger, devuelve el saldo intacto.
  if exists (select 1 from public.unlimited_users where user_id = p_user_id) then
    return (select credits_remaining from public.profiles where id = p_user_id);
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
-- deduct_analysis_credit — no-op para usuarios ilimitados
-- ============================================================
create or replace function public.deduct_analysis_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_new_balance integer;
begin
  -- Ilimitado: no descuenta, devuelve el saldo intacto.
  if exists (select 1 from public.unlimited_users where user_id = p_user_id) then
    return (select analysis_credits_remaining from public.profiles where id = p_user_id);
  end if;

  -- Lock pesimista para evitar doble descuento concurrente.
  select analysis_credits_remaining into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'Profile no encontrado para user %', p_user_id;
  end if;

  if v_balance < 1 then
    raise exception 'Sin créditos de análisis' using errcode = 'P0001';
  end if;

  v_new_balance := v_balance - 1;

  update public.profiles
  set analysis_credits_remaining = v_new_balance
  where id = p_user_id;

  return v_new_balance;
end;
$$;

-- is_unlimited: la invoca el server (service_role). El cliente no la necesita
-- directo — lee su estado vía la tabla con la policy select-own.
revoke execute on function public.is_unlimited(uuid) from anon, authenticated;

-- ============================================================
-- Seed: Paolo (fundador) — ilimitado permanente
-- ============================================================
-- Idempotente y reproducible por email (sin hardcodear el uuid).
insert into public.unlimited_users (user_id, note)
select id, 'fundador — ilimitado permanente'
from auth.users
where email = 'paolonietoc@gmail.com'
on conflict (user_id) do nothing;
