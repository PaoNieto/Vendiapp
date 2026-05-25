-- ============================================================
-- 0006 — Storage buckets para imágenes
-- ============================================================
-- 4 buckets privados por user (excepto starter-references que es público para
-- toda la galería curada). El path interno de cada bucket es:
--   <bucket>/<user_id>/<resource_id>/<filename>
-- Las RLS policies validan que el user_id en el path coincida con auth.uid().

insert into storage.buckets (id, name, public)
values
  ('product-uploads', 'product-uploads', false),
  ('references-uploads', 'references-uploads', false),
  ('generated-images', 'generated-images', false),
  ('analysis-uploads', 'analysis-uploads', false),
  ('starter-references', 'starter-references', true)
on conflict (id) do nothing;

-- ─── Policies: cada user solo accede a su carpeta ────────────────
-- Para los 4 buckets privados:
create policy "product-uploads owner" on storage.objects
  for all using (
    bucket_id = 'product-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'product-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "references-uploads owner" on storage.objects
  for all using (
    bucket_id = 'references-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'references-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "generated-images owner" on storage.objects
  for all using (
    bucket_id = 'generated-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'generated-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "analysis-uploads owner" on storage.objects
  for all using (
    bucket_id = 'analysis-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'analysis-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- starter-references es público (lectura sin auth, escritura solo service_role
-- para que el equipo de Vendí cargue la galería curada via dashboard/CLI).
create policy "starter-references public read" on storage.objects
  for select using (bucket_id = 'starter-references');
