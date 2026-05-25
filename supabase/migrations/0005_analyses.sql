-- ============================================================
-- 0005 — Tabla analyses (análisis de imágenes con Gemini Vision)
-- ============================================================
-- Cada vez que el usuario sube una imagen a /analisis, la pasamos por
-- Gemini Vision para identificar composición, iluminación, por qué
-- vende y qué estilos visuales presenta. Persistimos el resultado para
-- mostrarlo en el historial y poder reusarlo como referencia visual al
-- generar nuevas imágenes.

create table public.analyses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  output_ratio text not null check (output_ratio in ('1:1','4:5','9:16','16:9')),
  composition text not null,
  lighting text not null,
  why_it_sells text not null,
  identified_styles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index analyses_user_id_idx on public.analyses(user_id);
create index analyses_created_at_idx on public.analyses(created_at desc);

alter table public.analyses enable row level security;

create policy "analyses_all_own" on public.analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
