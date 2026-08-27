-- ============================================================
-- 0016 — Modelo PAGA-PRIMERO: sin créditos de regalo (2026-06-27)
-- ============================================================
-- Decisión de Paolo: "usuario paga en Mercado Pago -> usa la app". Una cuenta
-- nueva ya NO nace con el bono de generación/análisis. El acceso a la app lo
-- abre el guardia del proxy (proxy.ts + lib/auth/paid-access.ts) cuando el
-- usuario registra su primera compra (movimiento 'purchase' en credit_ledger).
--
-- Antes (0001/0008) el regalo salía del DEFAULT de estas columnas (60 / 10).
-- Bajarlo a 0 hace que:
--   - un freeloader que se registra no tenga fichas para gastar, y
--   - quien paga reciba EXACTAMENTE lo que compró (sin bono arrastrado).
--
-- SOLO afecta INSERTs futuros: las filas existentes conservan su saldo. Las
-- cuentas comp (Paolo / testers) van por la allowlist `unlimited_users`, no por
-- estos defaults.

alter table public.profiles
  alter column credits_remaining set default 0;

alter table public.profiles
  alter column analysis_credits_remaining set default 0;
