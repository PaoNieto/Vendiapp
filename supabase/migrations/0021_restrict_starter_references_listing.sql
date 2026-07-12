-- YA APLICADA EN PROD el 2026-06-07 (version 20260607025322, "0009_restrict_starter_references_listing")
-- — archivo solo para versionar el schema vivo. NO re-ejecutar.
--
-- Contenido reproducido EXACTO desde supabase_migrations.schema_migrations.statements
-- (ya era idempotente: drop policy if exists).

-- El bucket starter-references es público: el acceso por URL directa
-- (/storage/v1/object/public/...) NO depende de esta policy. La policy SELECT
-- amplia solo habilitaba LISTAR todos los archivos del bucket, lo que permitía
-- enumerar nombres. La eliminamos: las imágenes se siguen sirviendo por su URL,
-- pero ya no se puede listar el contenido.
drop policy if exists "starter-references public read" on storage.objects;
