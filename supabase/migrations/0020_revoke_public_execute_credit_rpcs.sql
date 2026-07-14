-- YA APLICADA EN PROD el 2026-06-07 (version 20260607023251, "0008_revoke_public_execute_credit_rpcs")
-- — archivo solo para versionar el schema vivo. NO re-ejecutar.
--
-- Contenido reproducido EXACTO desde supabase_migrations.schema_migrations.statements.
-- El REVOKE de 0019 no bastó: las funciones tenían EXECUTE para PUBLIC por defecto,
-- y anon/authenticated heredaban de ahí. Hay que revocar a PUBLIC y conceder
-- EXECUTE explícito solo a service_role (el rol con el que corre el backend).
-- Igual que 0019: firmas uuid pre-Clerk, hoy inexistentes (guardas → no-op).
-- El equivalente vigente para las firmas text es 0015_lock_credit_rpcs_from_public.sql.

do $$
begin
  if to_regprocedure('public.grant_credits(uuid, integer, text)') is not null then
    execute 'revoke execute on function public.grant_credits(uuid, integer, text) from public, anon, authenticated';
    execute 'grant execute on function public.grant_credits(uuid, integer, text) to service_role';
  end if;
  if to_regprocedure('public.grant_analysis_credits(uuid, integer)') is not null then
    execute 'revoke execute on function public.grant_analysis_credits(uuid, integer) from public, anon, authenticated';
    execute 'grant execute on function public.grant_analysis_credits(uuid, integer) to service_role';
  end if;
  if to_regprocedure('public.deduct_credits(uuid, integer, uuid)') is not null then
    execute 'revoke execute on function public.deduct_credits(uuid, integer, uuid) from public, anon, authenticated';
    execute 'grant execute on function public.deduct_credits(uuid, integer, uuid) to service_role';
  end if;
  if to_regprocedure('public.deduct_analysis_credit(uuid)') is not null then
    execute 'revoke execute on function public.deduct_analysis_credit(uuid) from public, anon, authenticated';
    execute 'grant execute on function public.deduct_analysis_credit(uuid) to service_role';
  end if;
  -- handle_new_user NO necesita grant: se ejecuta como trigger (contexto del owner),
  -- no vía RPC. Queda sin EXECUTE para nadie del API.
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
  end if;
end $$;
