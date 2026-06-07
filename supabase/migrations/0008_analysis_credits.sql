-- ============================================================
-- 0008 — Créditos de ANÁLISIS (bolsa separada) + ajuste del regalo de signup
-- ============================================================
-- Decisión de producto:
--   - GENERAR imágenes gasta `credits_remaining` (1 crédito = 1 imagen).
--     El regalo de bienvenida sube de 10 → 60 créditos.
--   - ANALIZAR con IA gasta una bolsa SEPARADA `analysis_credits_remaining`
--     (1 crédito = 1 análisis). El usuario arranca con 10 análisis de regalo.
--
-- Así analizar nunca consume los créditos de generar — son dos saldos
-- distintos. Igual que con los créditos de generación, esta bolsa solo se
-- muta server-side (service_role): el usuario no puede regalarse análisis.

-- ============================================================
-- profiles: nueva columna + nuevo default del regalo de generación
-- ============================================================
alter table public.profiles
  add column if not exists analysis_credits_remaining integer not null default 10;

-- Regalo de generación: 10 → 60. (Solo afecta a nuevos signups; los usuarios
-- existentes conservan su saldo actual.)
alter table public.profiles
  alter column credits_remaining set default 60;

-- ============================================================
-- Función: consumir 1 crédito de análisis (atómica)
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

-- ============================================================
-- Función: acreditar créditos de análisis (reembolso / recarga)
-- ============================================================
create or replace function public.grant_analysis_credits(
  p_user_id uuid,
  p_amount integer
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

  select analysis_credits_remaining into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'Profile no encontrado para user %', p_user_id;
  end if;

  v_new_balance := v_balance + p_amount;

  update public.profiles
  set analysis_credits_remaining = v_new_balance
  where id = p_user_id;

  return v_new_balance;
end;
$$;

-- Solo el server (service_role). El usuario autenticado NO las invoca directo.
revoke execute on function public.deduct_analysis_credit(uuid) from anon, authenticated;
revoke execute on function public.grant_analysis_credits(uuid, integer) from anon, authenticated;
