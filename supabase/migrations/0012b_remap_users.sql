-- ============================================================
-- 0012b — REMAPEO de datos: uuid de Supabase Auth → id de Clerk (TEMPLATE)
-- ============================================================
-- ⚠️⚠️ ESTE ARCHIVO ESTÁ COMENTADO A PROPÓSITO. NO ES EJECUTABLE A CIEGAS. ⚠️⚠️
--
-- Se corre UNA sola vez, en el cutover, DESPUÉS de 0011 + 0012 y DESPUÉS de que
-- cada usuario exista en Clerk (así se conocen sus ids `user_xxx`). Hasta
-- entonces las columnas user_id/id guardan el uuid viejo convertido a text
-- (por el `using col::text` de 0012). Este script los reemplaza por el id de
-- Clerk correspondiente.
--
-- CÓMO OBTENER LOS IDS DE CLERK:
--   * Paolo (y los otros 2) se registran/inician sesión en Clerk con su MISMO
--     email. En el dashboard de Clerk (Users) o vía API, cada uno tiene su id
--     `user_xxx`. Mapear por email contra los uuids viejos (abajo, ya conocidos).
--
-- USUARIOS EXISTENTES EN PROD (uuid viejo → email) — snapshot 2026-06-12:
--   2067e50a-d18b-4f52-ba03-d996ad558ded  → paolonietoc@gmail.com  (fundador, ilimitado)
--   fc0189b1-4680-4057-9ca4-795dd1670257  → epas_27@hotmail.com
--   2842faf5-7865-4e09-b778-544d51e9a66f  → alannieto@gmail.com
--
-- INSTRUCCIONES:
--   1. Completar abajo los 3 ids de Clerk reales (reemplazar los CLERK_ID_*).
--   2. Descomentar el bloque do $$ ... $$.
--   3. Correrlo (idealmente primero en una branch de Supabase para validar, y
--      recién después en prod, dentro del cutover).
--
-- POR QUÉ un do-block por usuario y no un UPDATE con join:
--   Las FKs a auth.users se dropearon en 0012, así que cada columna user_id es
--   independiente — hay que actualizarla tabla por tabla. El do-block agrupa las
--   9 ubicaciones de cada usuario y es transaccional (todo o nada por usuario).

-- ------------------------------------------------------------
-- PLANTILLA (repetir el bloque por cada usuario, completando old/new):
-- ------------------------------------------------------------
/*
do $$
declare
  v_old text := '<UUID_VIEJO_COMO_TEXT>';   -- ej. '2067e50a-d18b-4f52-ba03-d996ad558ded'
  v_new text := '<CLERK_ID>';               -- ej. 'user_2abc...'
begin
  update public.profiles         set id      = v_new where id      = v_old;
  update public.projects         set user_id = v_new where user_id = v_old;
  update public.versions         set user_id = v_new where user_id = v_old;
  update public.generations      set user_id = v_new where user_id = v_old;
  update public.generated_images set user_id = v_new where user_id = v_old;
  update public.analyses         set user_id = v_new where user_id = v_old;
  update public.subscriptions    set user_id = v_new where user_id = v_old;
  update public.credit_ledger    set user_id = v_new where user_id = v_old;
  update public.unlimited_users  set user_id = v_new where user_id = v_old;
end $$;
*/

-- ------------------------------------------------------------
-- BLOQUES CONCRETOS A COMPLETAR (uno por usuario existente):
-- ------------------------------------------------------------

-- Paolo (fundador, ilimitado)
/*
do $$
declare
  v_old text := '2067e50a-d18b-4f52-ba03-d996ad558ded';
  v_new text := 'CLERK_ID_PAOLO';   -- TODO: pegar el id de Clerk de paolonietoc@gmail.com
begin
  update public.profiles         set id      = v_new where id      = v_old;
  update public.projects         set user_id = v_new where user_id = v_old;
  update public.versions         set user_id = v_new where user_id = v_old;
  update public.generations      set user_id = v_new where user_id = v_old;
  update public.generated_images set user_id = v_new where user_id = v_old;
  update public.analyses         set user_id = v_new where user_id = v_old;
  update public.subscriptions    set user_id = v_new where user_id = v_old;
  update public.credit_ledger    set user_id = v_new where user_id = v_old;
  update public.unlimited_users  set user_id = v_new where user_id = v_old;
end $$;
*/

-- epas_27@hotmail.com
/*
do $$
declare
  v_old text := 'fc0189b1-4680-4057-9ca4-795dd1670257';
  v_new text := 'CLERK_ID_EPAS';   -- TODO: pegar el id de Clerk de epas_27@hotmail.com
begin
  update public.profiles         set id      = v_new where id      = v_old;
  update public.projects         set user_id = v_new where user_id = v_old;
  update public.versions         set user_id = v_new where user_id = v_old;
  update public.generations      set user_id = v_new where user_id = v_old;
  update public.generated_images set user_id = v_new where user_id = v_old;
  update public.analyses         set user_id = v_new where user_id = v_old;
  update public.subscriptions    set user_id = v_new where user_id = v_old;
  update public.credit_ledger    set user_id = v_new where user_id = v_old;
  update public.unlimited_users  set user_id = v_new where user_id = v_old;
end $$;
*/

-- alannieto@gmail.com
/*
do $$
declare
  v_old text := '2842faf5-7865-4e09-b778-544d51e9a66f';
  v_new text := 'CLERK_ID_ALAN';   -- TODO: pegar el id de Clerk de alannieto@gmail.com
begin
  update public.profiles         set id      = v_new where id      = v_old;
  update public.projects         set user_id = v_new where user_id = v_old;
  update public.versions         set user_id = v_new where user_id = v_old;
  update public.generations      set user_id = v_new where user_id = v_old;
  update public.generated_images set user_id = v_new where user_id = v_old;
  update public.analyses         set user_id = v_new where user_id = v_old;
  update public.subscriptions    set user_id = v_new where user_id = v_old;
  update public.credit_ledger    set user_id = v_new where user_id = v_old;
  update public.unlimited_users  set user_id = v_new where user_id = v_old;
end $$;
*/

-- ------------------------------------------------------------
-- VERIFICACIÓN post-remapeo (descomentar para chequear que no quedó ningún
-- uuid viejo sin mapear — debería devolver 0 filas):
-- ------------------------------------------------------------
/*
select 'profiles' as tbl, id as leftover from public.profiles where id ~ '^[0-9a-f-]{36}$'
union all select 'projects', user_id from public.projects where user_id ~ '^[0-9a-f-]{36}$'
union all select 'versions', user_id from public.versions where user_id ~ '^[0-9a-f-]{36}$'
union all select 'generations', user_id from public.generations where user_id ~ '^[0-9a-f-]{36}$'
union all select 'generated_images', user_id from public.generated_images where user_id ~ '^[0-9a-f-]{36}$'
union all select 'analyses', user_id from public.analyses where user_id ~ '^[0-9a-f-]{36}$'
union all select 'subscriptions', user_id from public.subscriptions where user_id ~ '^[0-9a-f-]{36}$'
union all select 'credit_ledger', user_id from public.credit_ledger where user_id ~ '^[0-9a-f-]{36}$'
union all select 'unlimited_users', user_id from public.unlimited_users where user_id ~ '^[0-9a-f-]{36}$';
*/
