-- ============================================================
-- 0004 — Add strict_prompt to generated_images
-- ============================================================
-- Cada imagen generada puede tener su propio prompt editable
-- que sobrescribe el estilo y referencias al regenerar.

alter table public.generated_images
  add column if not exists strict_prompt text not null default '';
