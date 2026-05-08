-- ============================================================
-- Vendí — Schema inicial
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- profiles (extiende auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
  credits_remaining integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_username_idx on public.profiles(username);

-- Trigger: crear profile cuando se crea un user
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- projects
-- ============================================================
create table public.projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on public.projects(user_id);

-- ============================================================
-- generations
-- ============================================================
create table public.generations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  product_images jsonb not null,
  reference_images jsonb not null,
  user_prompt text,
  enriched_prompt jsonb,
  output_ratio text not null check (output_ratio in ('1:1', '4:5', '9:16', '16:9')),
  variations_requested integer not null default 5,
  cost_credits integer not null default 1,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index generations_user_id_idx on public.generations(user_id);
create index generations_project_id_idx on public.generations(project_id);
create index generations_status_idx on public.generations(status);

-- ============================================================
-- generated_images
-- ============================================================
create table public.generated_images (
  id uuid primary key default uuid_generate_v4(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  thumbnail_url text,
  variation_index integer not null,
  metadata jsonb,
  user_rating integer check (user_rating between 1 and 5),
  is_favorite boolean not null default false,
  is_downloaded boolean not null default false,
  created_at timestamptz not null default now()
);

create index generated_images_generation_id_idx on public.generated_images(generation_id);
create index generated_images_user_id_idx on public.generated_images(user_id);

-- ============================================================
-- starter_references (galería curada por Vendí, pública)
-- ============================================================
create table public.starter_references (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  image_url text not null,
  thumbnail_url text,
  tags jsonb,
  created_at timestamptz not null default now()
);

create index starter_references_category_idx on public.starter_references(category);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.generations enable row level security;
alter table public.generated_images enable row level security;
alter table public.starter_references enable row level security;

-- profiles: cada usuario lee/edita su perfil
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- projects: cada usuario gestiona sus proyectos
create policy "projects_all_own" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- generations: cada usuario gestiona sus generaciones
create policy "generations_all_own" on public.generations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- generated_images: cada usuario lee y actualiza (favoritos/rating) sus imágenes
create policy "generated_images_select_own" on public.generated_images
  for select using (auth.uid() = user_id);
create policy "generated_images_update_own" on public.generated_images
  for update using (auth.uid() = user_id);
create policy "generated_images_insert_service" on public.generated_images
  for insert with check (auth.uid() = user_id);

-- starter_references: lectura pública, escritura solo service role
create policy "starter_references_public_read" on public.starter_references
  for select using (true);

-- ============================================================
-- Updated at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Storage Buckets (ejecutar via Supabase Dashboard o CLI)
-- ============================================================
-- product-uploads      (privado por user_id)
-- references-uploads   (privado por user_id)
-- generated-images     (privado por user_id)
-- starter-references   (público)
