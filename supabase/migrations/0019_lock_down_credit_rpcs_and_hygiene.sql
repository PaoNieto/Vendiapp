-- YA APLICADA EN PROD el 2026-06-07 (version 20260607023159, "0007_lock_down_credit_rpcs_and_hygiene")
-- — archivo solo para versionar el schema vivo. NO re-ejecutar.
--
-- Contenido reproducido EXACTO desde supabase_migrations.schema_migrations.statements.
-- Contexto histórico: en esa fecha los RPCs de créditos tenían firma uuid (pre-Clerk).
-- El cutover de Clerk (repo 0011/0012) dropeó esas firmas y las recreó con text;
-- el re-lock de las firmas text vive en 0015_lock_credit_rpcs_from_public.sql.
-- Por eso los REVOKE de acá van con guardas to_regprocedure: hoy son no-op.
-- Lo único de esta migración que sigue vivo tal cual: el índice
-- credit_ledger_generation_id_idx y el search_path de set_updated_at.

-- 🔴 CRÍTICO: revocar ejecución de funciones de créditos al cliente.
-- El backend debe llamarlas con la service_role key (que ignora estos GRANT).
do $$
begin
  if to_regprocedure('public.grant_credits(uuid, integer, text)') is not null then
    execute 'revoke execute on function public.grant_credits(uuid, integer, text) from anon, authenticated';
  end if;
  if to_regprocedure('public.grant_analysis_credits(uuid, integer)') is not null then
    execute 'revoke execute on function public.grant_analysis_credits(uuid, integer) from anon, authenticated';
  end if;
  if to_regprocedure('public.deduct_credits(uuid, integer, uuid)') is not null then
    execute 'revoke execute on function public.deduct_credits(uuid, integer, uuid) from anon, authenticated';
  end if;
  if to_regprocedure('public.deduct_analysis_credit(uuid)') is not null then
    execute 'revoke execute on function public.deduct_analysis_credit(uuid) from anon, authenticated';
  end if;
  -- handle_new_user es un trigger; no tiene sentido exponerla como RPC.
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from anon, authenticated';
  end if;
end $$;

-- 🟡 HIGIENE: fijar search_path en funciones que no lo tenían.
do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute $sql$alter function public.handle_new_user() set search_path = ''$sql$;
  end if;
  if to_regprocedure('public.set_updated_at()') is not null then
    execute $sql$alter function public.set_updated_at() set search_path = ''$sql$;
  end if;
end $$;

-- 🟡 HIGIENE: índice para la FK sin cubrir.
create index if not exists credit_ledger_generation_id_idx
  on public.credit_ledger (generation_id);
