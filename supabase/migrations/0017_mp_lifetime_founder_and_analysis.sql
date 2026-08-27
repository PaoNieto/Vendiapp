-- ============================================================
-- 0017 — Cobro MP del Lifetime: plan founder + créditos de análisis (2026-06-27)
-- ============================================================
-- Decisión de Paolo: el PASE FUNDADOR (Lifetime) se cobra por MERCADO PAGO (el
-- riel per-usuario que ya funciona), no por Shopify. El comprador llega desde la
-- landing → /comenzar?producto=lifetime-pass → /upgrade/fundador → POST
-- /api/checkout (productId="lifetime-pass") → webhook /api/webhooks/mercadopago.
--
-- Hasta 0013, process_mp_payment SOLO acreditaba créditos de generación con
-- grant_credits('purchase'). Le faltaban dos cosas que el Lifetime promete:
--   1. plan = 'founder'  (hoy SOLO lo hacía el RPC de Shopify, 0014).
--   2. créditos de ANÁLISIS IA (10 para el Lifetime). Ningún flujo de cobro los
--      acreditaba — la landing los prometía y nadie los daba.
--
-- Esta migración redefine process_mp_payment para recibir `p_is_lifetime` y
-- `p_analysis_credits` (los resuelve el webhook del catálogo server-side) y, en
-- la MISMA transacción atómica que ya existía:
--   - grant_credits('purchase')               -> créditos de generación + abre el paywall
--   - grant_analysis_credits(...) si > 0      -> créditos de análisis
--   - update profiles set plan='founder'      -> si el producto es lifetime
-- Todo dentro del candado de idempotencia por mp_payment_id (no re-acredita en
-- los reintentos de MP). El CHECK de profiles.plan ya admite 'founder' (0014).
--
-- ⚠️ ORDEN DE DEPLOY: esta migración DROPEA la firma vieja de 4 args y crea la de
-- 6. El código viejo (que llama con 4 args) y el nuevo (6 args) no pueden convivir
-- a la vez, así que conviene aplicar migración + deploy de la app juntos. Si hay
-- una ventana, NO se pierde plata: el webhook responde 500 ante el error y MP
-- REINTENTA la notificación; al quedar ambos al día, el reintento acredita (la
-- idempotencia evita doble acreditación).
--
-- SECURITY DEFINER + REVOKE a public/anon/authenticated: SOLO el server la invoca.

-- Firma vieja (0013): se reemplaza por la de 6 args de abajo.
drop function if exists public.process_mp_payment(text, text, integer, jsonb);

create or replace function public.process_mp_payment(
  p_mp_payment_id text,
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
  insert into public.mp_processed_payments
    (mp_payment_id, clerk_user_id, credits_granted, status, raw_event)
  values
    (p_mp_payment_id, p_clerk_user_id, p_credits, 'approved', p_raw)
  on conflict (mp_payment_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;

  -- Primer procesamiento: acreditar. Misma transacción que el INSERT de arriba.
  perform public.grant_credits(p_clerk_user_id, p_credits, 'purchase');

  -- Créditos de análisis (bolsa aparte). Solo si el producto los da (> 0).
  if p_analysis_credits > 0 then
    perform public.grant_analysis_credits(p_clerk_user_id, p_analysis_credits);
  end if;

  -- Lifetime Pass: el comprador pasa a fundador. Va en la misma transacción, así
  -- que si algo revirtió, este update tampoco persiste.
  if p_is_lifetime then
    update public.profiles set plan = 'founder' where id = p_clerk_user_id;
  end if;

  return 'granted';
end;
$$;

-- Solo el server (service_role) invoca esta RPC. Un usuario autenticado NUNCA
-- debe poder llamarla directo (si no, se auto-acreditaría compras inexistentes).
revoke execute on function
  public.process_mp_payment(text, text, integer, boolean, integer, jsonb)
  from public, anon, authenticated;
