-- ============================================================
-- 0013 — Idempotencia de pagos de Mercado Pago (2026-06-16)
-- ============================================================
-- Riel de cobro = Mercado Pago, Checkout Pro (ver memoria mercadopago). El
-- webhook /api/webhooks/mercadopago es la FUENTE DE VERDAD: valida la firma,
-- re-consulta el pago y acredita créditos vía grant_credits (reason 'purchase',
-- ya existe desde 0007/0012).
--
-- PROBLEMA: Mercado Pago notifica el MISMO pago varias veces (topic payment +
-- merchant_order) y REINTENTA si no respondés 200 a tiempo. Sin idempotencia,
-- un pago acreditaría créditos múltiples veces.
--
-- SOLUCIÓN: tabla `mp_processed_payments` con PK = mp_payment_id. El registro
-- del pago y la acreditación pasan juntos en UNA transacción (RPC
-- process_mp_payment): el INSERT ... ON CONFLICT DO NOTHING actúa de candado;
-- si la fila ya existía, NO se vuelve a acreditar. Si grant_credits falla, toda
-- la transacción se revierte (no queda el registro a medias) y MP puede
-- reintentar de forma segura.
--
-- SEGURIDAD: igual que el resto del modelo de créditos, esta tabla y la RPC solo
-- las toca el SERVER (service_role). El usuario no puede escribir ni invocar la
-- RPC (si pudiera, se auto-acreditaría compras falsas).

-- ============================================================
-- mp_processed_payments — un row por pago aprobado ya acreditado
-- ============================================================
create table public.mp_processed_payments (
  mp_payment_id text primary key,               -- id del Payment en Mercado Pago
  clerk_user_id text not null,                  -- a quién se le acreditó (id de Clerk)
  credits_granted integer not null,             -- cuántos créditos se acreditaron
  status text not null,                         -- status del pago al procesarlo
  raw_event jsonb,                              -- snapshot del Payment para auditoría
  processed_at timestamptz not null default now()
);

create index mp_processed_payments_user_idx
  on public.mp_processed_payments(clerk_user_id);

-- RLS prendido SIN policies: nadie (anon/authenticated) lee ni escribe. Solo el
-- service_role (que bypassa RLS) opera sobre esta tabla desde el webhook.
alter table public.mp_processed_payments enable row level security;

-- ============================================================
-- process_mp_payment — registra el pago y acredita en una transacción atómica
-- ============================================================
-- Idempotente por PK: si el mp_payment_id ya estaba, devuelve 'duplicate' y NO
-- re-acredita. Si es nuevo, registra + grant_credits('purchase') y devuelve
-- 'granted'. Si grant_credits levanta excepción (ej. profile inexistente), la
-- transacción entera se revierte → el webhook responde error y MP reintenta sin
-- riesgo de doble acreditación.
--
-- SECURITY DEFINER + REVOKE a anon/authenticated: SOLO el server la invoca.
create or replace function public.process_mp_payment(
  p_mp_payment_id text,
  p_clerk_user_id text,
  p_credits integer,
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
  return 'granted';
end;
$$;

-- Solo el server (service_role) invoca esta RPC. Un usuario autenticado NUNCA
-- debe poder llamarla directo (si no, se auto-acreditaría compras inexistentes).
revoke execute on function public.process_mp_payment(text, text, integer, jsonb)
  from anon, authenticated;
