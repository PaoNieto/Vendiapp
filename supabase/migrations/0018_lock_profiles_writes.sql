-- 0018 — Blindaje anti self-grant de créditos en profiles (2026-07-06)
-- Hueco: profiles_update_own (UPDATE fila propia) + GRANT de UPDATE a anon/authenticated,
-- sin restricción de columnas ni WITH CHECK → un usuario logueado podía
--   supabase.from('profiles').update({ credits_remaining: 99999 }).eq('id', MI_ID)
-- y auto-regalarse créditos. El saldo debe ser SOLO escribible por las RPC
-- service_role (SECURITY DEFINER) y el admin client. Verificado: ningún path de
-- cliente escribe profiles (solo lo lee lib/creditos/use-creditos).
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
drop policy if exists profiles_update_own on public.profiles;
