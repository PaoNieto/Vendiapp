-- ============================================================
-- 0012 — IDs de usuario uuid → text (id de Clerk) (2026-06-12)
-- ============================================================
-- Parte 2 del corte a Clerk. El id canónico del usuario pasa de un uuid de
-- Supabase Auth a un string de Clerk (`user_xxx`). Eso obliga a:
--   1. Dropear las FKs a auth.users (con Clerk los usuarios ya no viven ahí).
--   2. Cambiar de uuid → text las columnas que guardan el id de usuario:
--      profiles.id (PK) + user_id en projects, versions, generations,
--      generated_images, analyses, subscriptions, credit_ledger, unlimited_users.
--   3. Cambiar la firma (uuid → text) de las RPC de créditos y de is_unlimited,
--      preservando su lógica atómica y que sigan REVOCADAS a anon/authenticated.
--
-- ⚠️ ESTA MIGRACIÓN VA DE LA MANO DE 0011 (RLS). 0011 compara contra
--    `auth.jwt()->>'sub'` (text); estas columnas tienen que ser text para que
--    el match funcione. Aplicar AMBAS en el mismo cutover.
--
-- ⚠️ NO APLICAR A PROD hasta el cutover de Clerk. El `using col::text` de abajo
--    convierte los uuids EXISTENTES a su representación string (ej.
--    '2067e50a-...'); esos valores NO son ids de Clerk todavía. El remapeo real
--    (uuid → id de Clerk) se hace en 0012b una vez conocidos los ids de Clerk.
--    Validar en una branch de Supabase antes de prod.
--
-- ⚠️ Las columnas `id` de FILA (generations.id, generated_images.id, etc.) y sus
--    FKs internas (project_id, version_id, generation_id…) NO se tocan: siguen
--    siendo uuid. Solo cambia el id de USUARIO.

-- ============================================================
-- 1. Dropear las FKs a auth.users (9)
-- ============================================================
-- Con Clerk los usuarios no existen en auth.users, así que estas FKs ya no
-- pueden mantenerse. NO se recrean: el id de usuario ahora es opaco (string de
-- Clerk) y su integridad la garantiza la app + RLS, no una FK a auth.users.
alter table public.profiles        drop constraint if exists profiles_id_fkey;
alter table public.projects        drop constraint if exists projects_user_id_fkey;
alter table public.versions        drop constraint if exists versions_user_id_fkey;
alter table public.generations     drop constraint if exists generations_user_id_fkey;
alter table public.generated_images drop constraint if exists generated_images_user_id_fkey;
alter table public.analyses        drop constraint if exists analyses_user_id_fkey;
alter table public.subscriptions   drop constraint if exists subscriptions_user_id_fkey;
alter table public.credit_ledger   drop constraint if exists credit_ledger_user_id_fkey;
alter table public.unlimited_users drop constraint if exists unlimited_users_user_id_fkey;

-- ============================================================
-- 2. Cambiar el tipo de las columnas de id de usuario: uuid → text
-- ============================================================
-- `using col::text` convierte los uuids existentes a su string (idempotente
-- en sí mismo, pero un ALTER TYPE no se puede correr dos veces si ya es text;
-- por eso esta migración corre UNA vez en el cutover).
alter table public.profiles        alter column id      type text using id::text;
alter table public.projects        alter column user_id type text using user_id::text;
alter table public.versions        alter column user_id type text using user_id::text;
alter table public.generations     alter column user_id type text using user_id::text;
alter table public.generated_images alter column user_id type text using user_id::text;
alter table public.analyses        alter column user_id type text using user_id::text;
alter table public.subscriptions   alter column user_id type text using user_id::text;
alter table public.credit_ledger   alter column user_id type text using user_id::text;
alter table public.unlimited_users alter column user_id type text using user_id::text;

-- ============================================================
-- 3. RPCs de créditos + is_unlimited: firma uuid → text
-- ============================================================
-- Cambiar el TIPO de un parámetro requiere DROP + CREATE (create or replace no
-- permite cambiar la firma). Dropeamos las versiones uuid y recreamos las text
-- con la MISMA lógica atómica y SECURITY DEFINER. Al final reaplicamos los
-- REVOKE (un nuevo CREATE FUNCTION otorga EXECUTE a PUBLIC por default).

-- --- is_unlimited(text) -------------------------------------
-- Helper consultado por las API routes (service_role) y por deduct_credits/
-- deduct_analysis_credit. p_user_id pasa a text (id de Clerk).
drop function if exists public.is_unlimited(uuid);
create or replace function public.is_unlimited(p_user_id text)
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

-- --- deduct_credits(text, integer, uuid) --------------------
-- p_user_id → text (id de Clerk). p_generation_id sigue uuid (es id de fila de
-- la tabla generations, no de usuario). No-op para usuarios de la allowlist.
drop function if exists public.deduct_credits(uuid, integer, uuid);
create or replace function public.deduct_credits(
  p_user_id text,
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

-- --- grant_credits(text, integer, text) ---------------------
drop function if exists public.grant_credits(uuid, integer, text);
create or replace function public.grant_credits(
  p_user_id text,
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

-- --- deduct_analysis_credit(text) ---------------------------
drop function if exists public.deduct_analysis_credit(uuid);
create or replace function public.deduct_analysis_credit(p_user_id text)
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

-- --- grant_analysis_credits(text, integer) ------------------
drop function if exists public.grant_analysis_credits(uuid, integer);
create or replace function public.grant_analysis_credits(
  p_user_id text,
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

-- ============================================================
-- 4. Reaplicar los REVOKE (seguridad crítica)
-- ============================================================
-- Un nuevo CREATE FUNCTION concede EXECUTE a PUBLIC por default. Hay que volver
-- a revocar para que SOLO el server (service_role) pueda invocar estas RPC; si
-- no, un usuario autenticado podría auto-regalarse créditos vía grant_credits.
revoke execute on function public.deduct_credits(text, integer, uuid) from anon, authenticated;
revoke execute on function public.grant_credits(text, integer, text) from anon, authenticated;
revoke execute on function public.deduct_analysis_credit(text) from anon, authenticated;
revoke execute on function public.grant_analysis_credits(text, integer) from anon, authenticated;
revoke execute on function public.is_unlimited(text) from anon, authenticated;

-- ============================================================
-- 5. Trigger handle_new_user → reemplazado por provisioning en el server
-- ============================================================
-- El trigger `on_auth_user_created` en auth.users (migración 0001) ya NO sirve
-- con Clerk: los usuarios nuevos NO nacen en auth.users, así que nunca dispara.
--
-- El profile de un usuario Clerk ahora se crea desde el server, idempotente, vía
-- `lib/auth/ensure-profile.ts` (función `ensureProfile()`), invocada desde el
-- layout de la sección autenticada (`app/(app)/layout.tsx`) y al tope de las API
-- routes que consumen créditos. Los créditos de regalo (60 generación / 10
-- análisis) los pone el DEFAULT de las columnas `credits_remaining` /
-- `analysis_credits_remaining` (igual que cuando lo hacía el trigger), así que un
-- simple INSERT del id ya entrega el bono — sin RPC.
--
-- Dropeamos el trigger + la función muertos: además de no servir, su body inserta
-- `new.id` (uuid) en `profiles.id`, que en esta misma migración pasa a `text`, así
-- que quedaría como código stale y confuso.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
