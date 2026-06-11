-- ============================================================
-- 0010 — Persistir el estilo elegido en la versión + separar prompts (2026-06-11)
-- ============================================================
-- QUÉ:
--   1. `versions.style_id`: persiste el "Estilo Profesional" que el usuario
--      eligió en la estación de Estilo de la Fábrica. Hasta ahora ese estilo
--      vivía SOLO en el store global efímero (`lib/generacion/store`), así que
--      no se podía mostrar "el estilo de esta versión" en los seteos ni usarlo
--      como fuente autoritativa server-side al generar.
--   2. Data-migration de prompts en `generated_images`: separa el "prompt
--      original/base" (read-only, generado por el modelo) del "prompt estricto"
--      (editable por el usuario). Movemos el prompt final que hoy vive en
--      `strict_prompt` hacia `metadata.base_prompt` y dejamos `strict_prompt`
--      vacío, para que el campo editable del usuario arranque limpio.
--
-- POR QUÉ es seguro aplicarla antes del deploy:
--   - `style_id` es nullable y sin default → 100% backward-compatible: el código
--     viejo que no lo conoce sigue insertando/leyendo sin romper.
--   - El UPDATE de prompts es idempotente y con guardas (solo toca filas con
--     `strict_prompt` no vacío y que aún NO tengan `base_prompt` en metadata),
--     así que correrlo dos veces no duplica ni pisa nada.

-- ============================================================
-- 1. versions.style_id — clave del estilo elegido (snake_case, ver lib/styles.ts)
-- ============================================================
-- Nullable + sin default: una versión sin estilo elegido queda en NULL.
alter table public.versions
  add column if not exists style_id text;

-- ============================================================
-- 2. Separar prompts en imágenes existentes (idempotente)
-- ============================================================
-- Mueve el prompt final (hoy en strict_prompt) a metadata.base_prompt como
-- prompt original read-only, y vacía strict_prompt para que el "prompt estricto"
-- del usuario arranque limpio. Las guardas evitan re-procesar filas ya migradas.
update public.generated_images
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('base_prompt', strict_prompt),
    strict_prompt = ''
where strict_prompt is not null and strict_prompt <> ''
  and (metadata->>'base_prompt') is null;
