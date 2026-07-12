-- YA APLICADA EN PROD el 2026-06-17 (version 20260617180302, "leads_capture")
-- — archivo solo para versionar el schema vivo. NO re-ejecutar.
--
-- Contenido reproducido EXACTO desde supabase_migrations.schema_migrations.statements,
-- con guarda de idempotencia en el create policy (el resto ya era idempotente).
-- Verificado contra el schema vivo 2026-07-11: tabla public.leads (7 columnas,
-- RLS on, 43 filas) coincide 1:1 con este DDL.

-- Captura de leads del quiz de la landing (insert anónimo vía REST + RLS insert-only).
-- Los leads NO son legibles públicamente: RLS habilitado sin policy de SELECT.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text,
  answers jsonb,
  diagnostico jsonb,
  source text not null default 'landing-quiz',
  user_agent text
);

alter table public.leads enable row level security;

-- anon/authenticated solo pueden INSERT. Sin policy de SELECT/UPDATE/DELETE => denegado por RLS.
grant insert on public.leads to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leads' and policyname = 'leads_insert_anon'
  ) then
    execute 'create policy "leads_insert_anon" on public.leads for insert to anon, authenticated with check (true)';
  end if;
end $$;

comment on table public.leads is 'Leads capturados desde el quiz de la landing (landing.html). Insert-only para anon; lectura solo via service_role.';
