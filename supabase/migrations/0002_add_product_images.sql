-- ============================================================
-- 0002 — Add product_images jsonb to projects
-- ============================================================
-- Se agrega para que cada producto guarde sus fotos persistentes
-- (antes vivían en el recorrido / generation; ahora viven en el producto).

alter table public.projects
  add column if not exists product_images jsonb not null default '[]'::jsonb;
