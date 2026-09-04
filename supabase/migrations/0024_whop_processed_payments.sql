-- ============================================================
-- 0024 — Acreditación de créditos por pagos de WHOP (2026-09-04)
-- ============================================================
-- CAMBIO DE RIEL: el cobro de Vendí pasa de Mercado Pago (Perú/soles) a WHOP
-- (USD, Merchant of Record, 186+ países, con mercado_pago y yape adentro del
-- checkout + adaptive pricing). El webhook /api/webhooks/whop es la FUENTE DE
-- VERDAD: verifica la firma (Standard Webhooks), resuelve el comprador y el
-- producto desde el metadata del evento y acredita créditos vía grant_credits
-- (reason 'purchase', existe desde 0007/0012). Esta migración es SOLO la capa
-- de base de datos: las tablas de idempotencia/estacionamiento y la RPC atómica.
--
-- Espeja 1:1 la postura de 0013/0017 (Mercado Pago) y 0014 (Shopify):
--   - PROBLEMA: Whop reintenta el mismo evento hasta 12 veces (~71 horas) si no
--     respondés 200 en menos de 5 segundos. Sin idempotencia, un pago acreditaría
--     créditos varias veces.
--   - SOLUCIÓN: tabla `whop_processed_payments` con PK = whop_payment_id. El
--     registro del pago y la acreditación pasan juntos en UNA transacción (RPC
--     process_whop_payment): el INSERT ... ON CONFLICT DO NOTHING actúa de
--     candado; si la fila ya existía, NO se vuelve a acreditar. Si grant_credits
--     falla, toda la transacción se revierte (no queda registro a medias) y Whop
--     puede reintentar sin riesgo.
--
-- ⚠️ FIRMA DE 6 ARGS, COPIADA DE process_mp_payment (0017:36-84) — NO la de
-- Shopify (5 args). Shopify no acredita créditos de ANÁLISIS, y el Pase Fundador
-- necesita sus 10. Con la firma de Shopify, el comprador del Pase pagaría y no
-- recibiría los análisis prometidos.
--
-- ESTACIONAMIENTO: un pago puede llegar sin `metadata.clerk_user_id` (ej. una
-- compra hecha desde un checkout link estático de Whop, fuera de la app). Para no
-- perder la plata, esos pagos se guardan en `whop_unmatched_payments` y se
-- reconcilian a mano. El webhook responde 200 (ya quedó guardado; reintentar no
-- aporta).
--
-- ⚠️ NO se toca el CHECK de `profiles.plan`: el valor 'founder' ya está admitido
-- desde 0014. Redefinirlo acá sería pisar historia aplicada.
--
-- SEGURIDAD: igual que el resto del modelo de créditos, estas tablas y la RPC
-- solo las toca el SERVER (service_role). El usuario no puede escribir ni invocar
-- la RPC (si pudiera, se auto-acreditaría compras falsas).
--
-- ⚠️ TODOS los productos son de PAGO ÚNICO: el Pase Fundador se compra una vez y
-- los packs de créditos se recargan cuantas veces el usuario quiera. Ninguno
-- renueva. No hay lógica de suscripción acá ni la va a haber sin una migración
-- nueva.

-- ============================================================
-- whop_processed_payments — un row por pago ya acreditado
-- ============================================================
-- Candado de idempotencia. PK = whop_payment_id ('pay_...'): el segundo intento
-- de procesar el mismo pago choca con el ON CONFLICT y no re-acredita.
create table if not exists public.whop_processed_payments (
  whop_payment_id text primary key,             -- id del Payment en Whop ('pay_...')
  clerk_user_id text not null,                  -- a quién se le acreditó (id de Clerk)
  credits_granted integer not null,             -- créditos de GENERACIÓN acreditados
  analysis_credits_granted integer not null default 0, -- créditos de ANÁLISIS acreditados
  is_lifetime boolean not null default false,   -- si era el Pase Fundador (plan founder)
  status text not null,                         -- status del pago al procesarlo
  raw_event jsonb,                              -- snapshot del evento para auditoría
  processed_at timestamptz not null default now()
);

create index if not exists whop_processed_payments_user_idx
  on public.whop_processed_payments(clerk_user_id);

-- RLS prendido SIN policies: nadie (anon/authenticated) lee ni escribe. Solo el
-- service_role (que bypassa RLS) opera sobre esta tabla desde el webhook.
alter table public.whop_processed_payments enable row level security;

-- ============================================================
-- whop_unmatched_payments — pagos sin atribución (estacionados)
-- ============================================================
-- Cuando el evento no trae `metadata.clerk_user_id`, o el producto no se puede
-- resolver ni por `pack_id` ni por `plan_id`, el pago se guarda acá en lugar de
-- perderse. Se reconcilia a mano: mirar `raw_event`, identificar al comprador y
-- llamar a process_whop_payment con el mismo whop_payment_id (la idempotencia
-- garantiza que se acredite una sola vez).
create table if not exists public.whop_unmatched_payments (
  whop_payment_id text primary key,             -- id del Payment en Whop
  clerk_user_id text,                           -- si vino a medias (puede ser null)
  pack_id text,                                 -- id de producto del catálogo, si se supo
  whop_plan_id text,                            -- 'plan_...' del pago (pista de reconciliación)
  credits integer not null default 0,           -- créditos pendientes de acreditar
  analysis_credits integer not null default 0,  -- créditos de análisis pendientes
  is_lifetime boolean not null default false,   -- si era el Pase Fundador
  raw_event jsonb,                              -- snapshot del evento para auditoría
  reconciled boolean not null default false,    -- true una vez acreditado a mano
  created_at timestamptz not null default now()
);

-- RLS prendido SIN policies: solo el service_role opera sobre esta tabla.
alter table public.whop_unmatched_payments enable row level security;

-- ============================================================
-- process_whop_payment — registra el pago y acredita en una transacción atómica
-- ============================================================
-- Idempotente por PK: si el whop_payment_id ya estaba, devuelve 'duplicate' y NO
-- re-acredita. Si es nuevo: registra + grant_credits('purchase') + (si aplica)
-- grant_analysis_credits + plan='founder', y devuelve 'granted'.
--
-- El movimiento `credit_ledger.reason = 'purchase'` que escribe grant_credits es
-- LO QUE ABRE EL PAYWALL (lib/auth/paid-access.ts). Por eso no hace falta tocar
-- ningún call site del gate: con esta RPC escribiendo esa fila, el comprador
-- entra a la app solo.
--
-- Si grant_credits levanta excepción (ej. profile inexistente), la transacción
-- entera se revierte -> el webhook responde 500 y Whop reintenta sin riesgo de
-- doble acreditación.
--
-- SECURITY DEFINER + REVOKE a public/anon/authenticated: SOLO el server la invoca.
create or replace function public.process_whop_payment(
  p_whop_payment_id text,
  p_clerk_user_id text,
  p_credits integer,
  p_is_lifetime boolean default false,
  p_analysis_credits integer default 0,
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

  -- Candado de idempotencia: si el pago ya estaba registrado, no inserta.
  insert into public.whop_processed_payments
    (whop_payment_id, clerk_user_id, credits_granted, analysis_credits_granted,
     is_lifetime, status, raw_event)
  values
    (p_whop_payment_id, p_clerk_user_id, p_credits,
     coalesce(p_analysis_credits, 0), p_is_lifetime, 'paid', p_raw)
  on conflict (whop_payment_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;

  -- Primer procesamiento: acreditar. Misma transacción que el INSERT de arriba.
  perform public.grant_credits(p_clerk_user_id, p_credits, 'purchase');

  -- Créditos de análisis (bolsa aparte). Solo si el producto los da (> 0).
  if coalesce(p_analysis_credits, 0) > 0 then
    perform public.grant_analysis_credits(p_clerk_user_id, p_analysis_credits);
  end if;

  -- Pase Fundador: el comprador pasa a fundador. Va en la misma transacción, así
  -- que si algo revirtió, este update tampoco persiste. El CHECK que admite
  -- 'founder' vive en 0014 y NO se toca acá.
  if p_is_lifetime then
    update public.profiles set plan = 'founder' where id = p_clerk_user_id;
  end if;

  return 'granted';
end;
$$;

-- ⚠️ CRÍTICO: Postgres concede EXECUTE a PUBLIC por DEFAULT al crear una
-- función. Revocar solo de anon/authenticated NO alcanza, porque ambos heredan
-- de PUBLIC (ese fue exactamente el agujero que tapó 0015). Sin este REVOKE,
-- cualquiera podría llamar la RPC por PostgREST (/rest/v1/rpc/process_whop_payment)
-- y auto-acreditarse una compra inexistente.
revoke execute on function
  public.process_whop_payment(text, text, integer, boolean, integer, jsonb)
  from public, anon, authenticated;
