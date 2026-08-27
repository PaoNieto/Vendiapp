-- ============================================================
-- 0014 — Acreditación de créditos por pedidos de Shopify (2026-06-25)
-- ============================================================
-- Nuevo riel de cobro complementario: Shopify. El webhook orders/paid (lo codea
-- Integral en /api/webhooks/shopify, NO vive en esta migración) es la FUENTE DE
-- VERDAD: valida el HMAC del pedido, resuelve el comprador → id de Clerk y
-- acredita créditos vía grant_credits (reason 'purchase', ya existe desde
-- 0007/0012). Esta migración es SOLO la capa de base de datos: las tablas de
-- idempotencia/estacionamiento y la RPC atómica que el server invoca.
--
-- Espeja 1:1 la postura de 0013 (Mercado Pago):
--   - PROBLEMA: Shopify reintenta el mismo webhook si no respondés 200 a tiempo
--     y puede mandar el evento más de una vez. Sin idempotencia, un pedido
--     acreditaría créditos múltiples veces.
--   - SOLUCIÓN: tabla `shopify_processed_orders` con PK = shopify_order_id. El
--     registro del pedido y la acreditación pasan juntos en UNA transacción (RPC
--     process_shopify_order): el INSERT ... ON CONFLICT DO NOTHING actúa de
--     candado; si la fila ya existía, NO se vuelve a acreditar. Si grant_credits
--     falla, toda la transacción se revierte (no queda registro a medias) y
--     Shopify puede reintentar de forma segura.
--
-- ESTACIONAMIENTO (fase 2): a diferencia de Mercado Pago (donde el checkout viaja
-- con el id de Clerk en external_reference), un pedido de Shopify puede venir de
-- un comprador cuyo email TODAVÍA no tiene cuenta en Clerk. Para no perder la
-- plata, esos pedidos se "estacionan" en `shopify_unmatched_orders` y se
-- reconcilian cuando la persona se registra. La lógica de matching/reconciliación
-- la maneja el server; acá solo definimos la tabla donde se guardan.
--
-- SEGURIDAD: igual que el resto del modelo de créditos, estas tablas y la RPC
-- solo las toca el SERVER (service_role). El usuario no puede escribir ni invocar
-- la RPC (si pudiera, se auto-acreditaría compras falsas).

-- ============================================================
-- 0. Ampliar profiles.plan para admitir 'founder'
-- ============================================================
-- El Lifetime Pass marca al comprador como fundador: process_shopify_order hace
-- `update profiles set plan = 'founder'`. Pero el CHECK original (0001) solo
-- admite ('free','pro','business'), así que ese update REVERTIRÍA la transacción
-- del lifetime (el pago entraría pero no acreditaría). Reemplazamos el CHECK por
-- uno que incluya 'founder'. Idempotente: drop if exists + recreate.
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'business', 'founder'));

-- ============================================================
-- shopify_processed_orders — un row por pedido ya acreditado
-- ============================================================
-- Candado de idempotencia. PK = shopify_order_id: el segundo intento de procesar
-- el mismo pedido choca con el ON CONFLICT y no re-acredita.
create table public.shopify_processed_orders (
  shopify_order_id text primary key,            -- id del Order en Shopify
  clerk_user_id text not null,                  -- a quién se le acreditó (id de Clerk)
  credits_granted integer not null,             -- cuántos créditos se acreditaron
  is_lifetime boolean not null default false,   -- si el pedido era el Lifetime Pass (plan founder)
  status text not null,                         -- status del pedido al procesarlo
  raw_event jsonb,                              -- snapshot del Order para auditoría
  processed_at timestamptz not null default now()
);

create index shopify_processed_orders_user_idx
  on public.shopify_processed_orders(clerk_user_id);

-- RLS prendido SIN policies: nadie (anon/authenticated) lee ni escribe. Solo el
-- service_role (que bypassa RLS) opera sobre esta tabla desde el webhook.
alter table public.shopify_processed_orders enable row level security;

-- ============================================================
-- shopify_unmatched_orders — pedidos sin usuario Clerk todavía (estacionados)
-- ============================================================
-- Cuando el email comprador no matchea ningún usuario de Clerk, el pedido se
-- guarda acá en lugar de perderse. Al registrarse esa persona (fase 2), el server
-- busca por email, acredita con grant_credits y marca reconciled = true.
create table public.shopify_unmatched_orders (
  shopify_order_id text primary key,            -- id del Order en Shopify
  email text,                                   -- email del comprador (clave de reconciliación)
  credits integer not null,                     -- créditos pendientes de acreditar
  is_lifetime boolean not null default false,   -- si el pedido era el Lifetime Pass
  raw_event jsonb,                              -- snapshot del Order para auditoría
  reconciled boolean not null default false,    -- true una vez acreditado al usuario real
  created_at timestamptz not null default now()
);

-- RLS prendido SIN policies: solo el service_role opera sobre esta tabla.
alter table public.shopify_unmatched_orders enable row level security;

-- ============================================================
-- process_shopify_order — registra el pedido y acredita en una transacción atómica
-- ============================================================
-- Idempotente por PK: si el shopify_order_id ya estaba, devuelve 'duplicate' y NO
-- re-acredita. Si es nuevo, registra + grant_credits('purchase') y devuelve
-- 'granted'. Si es Lifetime Pass, además marca el plan del comprador como
-- 'founder'. Si grant_credits levanta excepción (ej. profile inexistente), la
-- transacción entera se revierte → el webhook responde error y Shopify reintenta
-- sin riesgo de doble acreditación.
--
-- SECURITY DEFINER + REVOKE a anon/authenticated: SOLO el server la invoca.
create or replace function public.process_shopify_order(
  p_shopify_order_id text,
  p_clerk_user_id text,
  p_credits integer,
  p_is_lifetime boolean default false,
  p_raw jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if p_credits <= 0 then
    raise exception 'credits a acreditar debe ser positivo (recibido: %)', p_credits;
  end if;

  -- Candado de idempotencia: si el pedido ya estaba registrado, no inserta.
  insert into public.shopify_processed_orders
    (shopify_order_id, clerk_user_id, credits_granted, is_lifetime, status, raw_event)
  values
    (p_shopify_order_id, p_clerk_user_id, p_credits, p_is_lifetime, 'paid', p_raw)
  on conflict (shopify_order_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;

  -- Primer procesamiento: acreditar. Misma transacción que el INSERT de arriba.
  perform public.grant_credits(p_clerk_user_id, p_credits, 'purchase');

  -- Lifetime Pass: el comprador pasa a fundador. Va en la misma transacción, así
  -- que si grant_credits revirtió, este update tampoco persiste.
  if p_is_lifetime then
    update public.profiles set plan = 'founder' where id = p_clerk_user_id;
  end if;

  return 'granted';
end;
$$;

-- Solo el server (service_role) invoca esta RPC. Un usuario autenticado NUNCA
-- debe poder llamarla directo (si no, se auto-acreditaría compras inexistentes).
revoke execute on function public.process_shopify_order(text, text, integer, boolean, jsonb)
  from anon, authenticated;
