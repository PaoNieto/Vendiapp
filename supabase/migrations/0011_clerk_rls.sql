-- ============================================================
-- 0011 — RLS para Clerk: auth.uid() → auth.jwt()->>'sub' (2026-06-12)
-- ============================================================
-- Migración de auth Supabase Auth → Clerk. El id canónico del usuario pasa a
-- ser el id de Clerk (string `user_xxx`), que viaja como claim `sub` en el JWT
-- de Clerk. La integración nativa third-party auth hace que Supabase resuelva
-- la RLS con ESE token, así que `auth.uid()` (que devuelve el uuid del usuario
-- de Supabase Auth) deja de matchear: con Clerk vale NULL.
--
-- Esta migración reescribe TODAS las policies que usaban `auth.uid()` para
-- comparar contra el id de Clerk: `auth.jwt()->>'sub'` (text). Mantiene los
-- MISMOS nombres de policy y los MISMOS permisos (cmd, using, with_check).
--
-- IMPORTANTE — ORDEN DE CUTOVER:
--   * Esta migración DEPENDE de 0012 (que cambia las columnas user_id/id de
--     uuid → text). `auth.jwt()->>'sub'` es text; comparar text = uuid NO casa.
--     Por eso 0012 debe aplicarse JUNTO o ANTES en el mismo cutover.
--   * NO aplicar a prod hasta el cutover de Clerk. Si se aplica con la app
--     todavía sobre Supabase Auth, `auth.jwt()->>'sub'` será el uuid de Supabase
--     (sub del JWT de Supabase) — convive, pero el resto de la migración (0012)
--     rompería los tipos. Validar en una branch de Supabase antes de prod.

-- ============================================================
-- public.profiles — dueño por `id` (= id de Clerk)
-- ============================================================
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ((auth.jwt()->>'sub') = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ((auth.jwt()->>'sub') = id);

-- ============================================================
-- public.projects — dueño por `user_id`
-- ============================================================
drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own" on public.projects
  for all using ((auth.jwt()->>'sub') = user_id)
  with check ((auth.jwt()->>'sub') = user_id);

-- ============================================================
-- public.versions — dueño por `user_id`
-- ============================================================
drop policy if exists "versions_all_own" on public.versions;
create policy "versions_all_own" on public.versions
  for all using ((auth.jwt()->>'sub') = user_id)
  with check ((auth.jwt()->>'sub') = user_id);

-- ============================================================
-- public.generations — dueño por `user_id`
-- ============================================================
drop policy if exists "generations_all_own" on public.generations;
create policy "generations_all_own" on public.generations
  for all using ((auth.jwt()->>'sub') = user_id)
  with check ((auth.jwt()->>'sub') = user_id);

-- ============================================================
-- public.generated_images — dueño por `user_id` (select/update/insert)
-- ============================================================
drop policy if exists "generated_images_select_own" on public.generated_images;
create policy "generated_images_select_own" on public.generated_images
  for select using ((auth.jwt()->>'sub') = user_id);

drop policy if exists "generated_images_update_own" on public.generated_images;
create policy "generated_images_update_own" on public.generated_images
  for update using ((auth.jwt()->>'sub') = user_id);

drop policy if exists "generated_images_insert_service" on public.generated_images;
create policy "generated_images_insert_service" on public.generated_images
  for insert with check ((auth.jwt()->>'sub') = user_id);

-- ============================================================
-- public.analyses — dueño por `user_id`
-- ============================================================
drop policy if exists "analyses_all_own" on public.analyses;
create policy "analyses_all_own" on public.analyses
  for all using ((auth.jwt()->>'sub') = user_id)
  with check ((auth.jwt()->>'sub') = user_id);

-- ============================================================
-- public.subscriptions — SELECT propio (escritura solo service_role)
-- ============================================================
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select using ((auth.jwt()->>'sub') = user_id);

-- ============================================================
-- public.credit_ledger — SELECT propio (escritura solo server)
-- ============================================================
drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own" on public.credit_ledger
  for select using ((auth.jwt()->>'sub') = user_id);

-- ============================================================
-- public.unlimited_users — SELECT propio (alta/baja solo service_role)
-- ============================================================
drop policy if exists "unlimited_users_select_own" on public.unlimited_users;
create policy "unlimited_users_select_own" on public.unlimited_users
  for select using ((auth.jwt()->>'sub') = user_id);

-- ============================================================
-- public.starter_references — lectura PÚBLICA (sin cambios, queda igual)
-- ============================================================
-- starter_references_public_read es `using (true)` → no depende del usuario.
-- No se toca: lectura pública para la galería curada.

-- ============================================================
-- storage.objects — 4 buckets privados por carpeta = id del usuario
-- ============================================================
-- Antes: (auth.uid())::text = (storage.foldername(name))[1]
-- Ahora: (auth.jwt()->>'sub') = (storage.foldername(name))[1]
-- El sub de Clerk ya es text, así que no hace falta cast.
drop policy if exists "product-uploads owner" on storage.objects;
create policy "product-uploads owner" on storage.objects
  for all using (
    bucket_id = 'product-uploads'
    and (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'product-uploads'
    and (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  );

drop policy if exists "references-uploads owner" on storage.objects;
create policy "references-uploads owner" on storage.objects
  for all using (
    bucket_id = 'references-uploads'
    and (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'references-uploads'
    and (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  );

drop policy if exists "generated-images owner" on storage.objects;
create policy "generated-images owner" on storage.objects
  for all using (
    bucket_id = 'generated-images'
    and (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'generated-images'
    and (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  );

drop policy if exists "analysis-uploads owner" on storage.objects;
create policy "analysis-uploads owner" on storage.objects
  for all using (
    bucket_id = 'analysis-uploads'
    and (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'analysis-uploads'
    and (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  );

-- starter-references public read: sin cambios (lectura pública por bucket_id).
