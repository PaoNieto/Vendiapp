-- ============================================================
-- 0003 — Tabla versions (campañas creativas dentro de un producto)
-- ============================================================
-- Una versión tiene su propia config creativa (refs, ratio, prompt)
-- y agrupa las generaciones del usuario para una campaña/contexto puntual.

create table public.versions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  reference_images jsonb not null default '[]'::jsonb,
  output_ratio text not null check (output_ratio in ('1:1','4:5','9:16','16:9')) default '1:1',
  variations_default integer not null default 5,
  user_prompt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index versions_product_id_idx on public.versions(product_id);
create index versions_user_id_idx on public.versions(user_id);

alter table public.versions enable row level security;

create policy "versions_all_own" on public.versions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger versions_updated_at before update on public.versions
  for each row execute procedure public.set_updated_at();

-- Agregar version_id a generations (referencia opcional para compat con generations antiguas)
alter table public.generations
  add column if not exists version_id uuid references public.versions(id) on delete cascade;

create index if not exists generations_version_id_idx on public.generations(version_id);
