-- ============================================================
-- 0015 — Cerrar las RPC de créditos al rol PUBLIC (2026-06-25)
-- ============================================================
-- AGUJERO CRÍTICO detectado el 2026-06-25 (confirmado en vivo vía REST):
-- las RPC de créditos eran invocables por `anon` / `authenticated` a través de
-- PostgREST (/rest/v1/rpc/<fn>). Un atacante podía llamar grant_credits con su
-- propio id y un monto arbitrario y AUTO-REGALARSE créditos sin pagar.
--
-- CAUSA: cuando CREATE FUNCTION corre, Postgres concede EXECUTE a PUBLIC por
-- default. Las migraciones (0007/0012/0013/0014) revocaban solo de `anon` y
-- `authenticated`, PERO no de PUBLIC — y anon/authenticated heredan de PUBLIC,
-- así que el EXECUTE seguía vigente. La recreación de funciones en el cutover de
-- Clerk (0012) volvió a abrir lo que el hardening manual del 2026-06-06 había
-- cerrado en la DB viva (drift no versionado).
--
-- FIX: REVOKE EXECUTE ... FROM PUBLIC en cada función SECURITY DEFINER de la
-- plomería de créditos. Esto SOLO restringe acceso. El server opera con
-- service_role (bypassa GRANTs), así que checkout, generación, análisis y los
-- webhooks de Mercado Pago / Shopify siguen funcionando igual. Cero impacto
-- funcional.

revoke execute on function public.grant_credits(text, integer, text) from public;
revoke execute on function public.deduct_credits(text, integer, uuid) from public;
revoke execute on function public.grant_analysis_credits(text, integer) from public;
revoke execute on function public.deduct_analysis_credit(text) from public;
revoke execute on function public.is_unlimited(text) from public;
revoke execute on function public.process_mp_payment(text, text, integer, jsonb) from public;
revoke execute on function public.process_shopify_order(text, text, integer, boolean, jsonb) from public;

-- Defensa en profundidad: reafirmar la revocación a los roles concretos también
-- (idempotente; ya estaba en las migraciones previas, pero lo dejamos explícito).
revoke execute on function public.grant_credits(text, integer, text) from anon, authenticated;
revoke execute on function public.deduct_credits(text, integer, uuid) from anon, authenticated;
revoke execute on function public.grant_analysis_credits(text, integer) from anon, authenticated;
revoke execute on function public.deduct_analysis_credit(text) from anon, authenticated;
revoke execute on function public.is_unlimited(text) from anon, authenticated;
revoke execute on function public.process_mp_payment(text, text, integer, jsonb) from anon, authenticated;
revoke execute on function public.process_shopify_order(text, text, integer, boolean, jsonb) from anon, authenticated;
