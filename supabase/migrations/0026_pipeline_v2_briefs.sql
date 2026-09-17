-- ============================================================
-- 0026 — Pipeline v2 de prompts: notas de producto/referencia + plan por versión (2026-09-10)
-- ============================================================
-- QUÉ:
--   Tres tablas de CACHE para el pipeline v2 de generación (lib/ai/v2/):
--     1. `product_briefs`   — la "nota del producto": qué es, cómo se ve (colores
--        con hex, material, textura, texto impreso), escrita por Gemini mirando
--        las fotos del vendedor. Una fila por (producto, hash de insumos).
--     2. `reference_briefs` — la "nota de la referencia": qué se toma de una
--        imagen de inspiración (lugar, composición, persona) y qué se deja atrás
--        (su producto, marcas de agua). Una fila por (producto, hash de insumos).
--     3. `version_plans`    — el plan del Director (dónde va el producto y qué lo
--        rodea, 5 tomas) para una versión. Una fila por (versión, hash).
--   Más el TOPE de notas por usuario (40/hora) de /api/briefs/*:
--     4. `brief_attempts` + RPC `check_brief_rate_limit` — reserva el cupo de
--        forma ATÓMICA antes de llamar a Gemini (ver sección 4).
--
-- POR QUÉ:
--   - CONSISTENCIA: Gemini 3 pide dejar la temperatura en 1.0, así que dos
--     llamadas iguales dan textos distintos. Lo que hace que la tanda de hoy y la
--     de mañana salgan de la MISMA dirección de arte es este cache: mismo hash de
--     insumos → misma nota, mismo plan.
--   - PLATA Y TIEMPO: la nota del producto se calcula una vez (en segundo plano,
--     al subir las fotos) y no en cada tanda. El Director no vuelve a mirar
--     imágenes: trabaja sobre las notas, que es más barato y más rápido.
--   - El hash (`inputs_hash`) incluye la versión de cada prompt: cambiar un
--     prompt invalida el cache solo, sin borrar filas.
--
-- POR QUÉ TABLAS APARTE Y NO COLUMNAS EN projects/versions:
--   - Los stores del cliente hacen `select("*")` sobre projects/versions: un
--     jsonb grande viajaría al browser en cada carga.
--   - El trigger `updated_at` reordenaría las listas de "recientes" cada vez que
--     se escribe una nota.
--   - La policy FOR ALL de projects/versions dejaría al usuario EDITAR su nota,
--     y la nota es texto que después llega al modelo de imagen.
--
-- SEGURIDAD: RLS prendido y SIN policies → anon/authenticated no leen ni
--   escriben nada. Solo el server (service_role, que bypassa RLS) opera acá, igual
--   que `whop_processed_payments` (0024) y `generation_attempts` (0025).
--
-- ESCRITURA: siempre `upsert ... on conflict do nothing` desde el server, porque
--   puede haber carrera entre el cálculo en segundo plano (after()) y el camino
--   lazy de la generación. El primero que llega gana; el otro no pisa.
--
-- ⚠️ `version_plans` guarda SOLO planes del Director. Los del fallback
--   determinístico no se cachean (si el Director falló una vez, la próxima tanda
--   tiene que volver a intentarlo).
--
-- Idempotente: `if not exists` en tablas e índices. Seguro de correr dos veces.
-- El código de la v2 trata cualquier error contra estas tablas (incluida "tabla
-- inexistente") como cache miss: la generación sigue aunque esta migración no
-- esté aplicada.

-- ============================================================
-- 1. product_briefs — nota del producto
-- ============================================================
create table if not exists public.product_briefs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,                 -- dueño (id de Clerk), para el tope por hora
  inputs_hash text not null,             -- sha256 de nombre + descripción + paths de fotos (en orden)
  photo_urls jsonb not null,             -- URLs en el orden en que se mandaron (photo_index 1..P)
  brief jsonb not null,                  -- la nota validada (zod), no el texto crudo del modelo
  created_at timestamptz not null default now(),
  unique (product_id, inputs_hash)
);

-- Consultas por usuario (diagnóstico, limpieza). El tope por hora NO se cuenta
-- acá: vive en `brief_attempts` (sección 4).
create index if not exists product_briefs_user_time_idx
  on public.product_briefs (user_id, created_at desc);

alter table public.product_briefs enable row level security;  -- sin policies: solo service role

-- ============================================================
-- 2. reference_briefs — nota de cada referencia
-- ============================================================
-- Va por PRODUCTO y no por versión: `duplicateVersion` copia las mismas URLs, así
-- que la versión duplicada reusa las notas gratis (mismo producto, mismo hash).
create table if not exists public.reference_briefs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  url text not null,                     -- URL de la referencia analizada
  inputs_hash text not null,             -- sha256 de nombre del producto + path de la imagen
  brief jsonb not null,
  created_at timestamptz not null default now(),
  unique (product_id, inputs_hash)
);

create index if not exists reference_briefs_user_time_idx
  on public.reference_briefs (user_id, created_at desc);

alter table public.reference_briefs enable row level security;

-- ============================================================
-- 3. version_plans — plan del Director por versión
-- ============================================================
create table if not exists public.version_plans (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.versions(id) on delete cascade,
  user_id text not null,
  inputs_hash text not null,             -- sha256 de notas + estilo + ratio + user_prompt + marca
  plan jsonb not null,
  created_at timestamptz not null default now(),
  unique (version_id, inputs_hash)
);

create index if not exists version_plans_user_time_idx
  on public.version_plans (user_id, created_at desc);

alter table public.version_plans enable row level security;

-- ============================================================
-- 4. brief_attempts + check_brief_rate_limit — tope de 40 notas por hora
-- ============================================================
-- POR QUÉ UNA TABLA DE INTENTOS Y NO CONTAR FILAS DE product_briefs/reference_briefs:
--   - Las filas de notas recién se escriben cuando Gemini termina (10-45s después
--     del 202). Contarlas y encolar después era check-then-act: N pedidos en
--     paralelo (instancias distintas, productos distintos) veían todos el mismo
--     cupo y pasaban. Una ráfaga agotaba el RPM de la ÚNICA key de Google y
--     tumbaba las generaciones de todos los que pagan.
--   - Una nota que falla (timeout, JSON inválido, bloqueo) no escribe fila, así
--     que nunca contaba: repedirla salía gratis contra el tope, y Google la cobra.
-- CÓMO: la ruta llama a la RPC ANTES de encolar el trabajo. La RPC toma un
--   advisory lock por usuario (serializa sus pedidos concurrentes), suma los
--   intentos de la última hora y reserva lo que entre del pedido (parcial: si
--   faltan 5 notas de referencia y quedan 2 de cupo, reserva 2). Se cuenta al
--   RESERVAR, no al terminar: los fallos cobrados también cuentan.
-- Mismo patrón que `check_generation_rate_limit` (0025), más el advisory lock.
create table if not exists public.brief_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  cost int not null check (cost between 1 and 40),   -- notas reservadas en este pedido
  created_at timestamptz not null default now()
);

create index if not exists brief_attempts_user_time_idx
  on public.brief_attempts (user_id, created_at desc);

alter table public.brief_attempts enable row level security;  -- sin policies: solo la RPC (service role)

create or replace function public.check_brief_rate_limit(
  p_user_id text,
  p_cost int,
  p_per_hour int default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used  int;
  v_grant int;
begin
  if p_cost is null or p_cost < 1 then
    return jsonb_build_object('allowed', false, 'granted', 0, 'used', null, 'limit_hour', p_per_hour);
  end if;

  -- Serializa los pedidos del MISMO usuario hasta el commit: el segundo pedido
  -- concurrente ve el intento que insertó el primero.
  perform pg_advisory_xact_lock(hashtext('brief_attempts:' || p_user_id));

  -- Higiene: la tabla es un contador, no un historial.
  delete from public.brief_attempts
   where created_at < now() - interval '2 days';

  select coalesce(sum(cost), 0) into v_used
    from public.brief_attempts
   where user_id = p_user_id
     and created_at > now() - interval '1 hour';

  v_grant := least(p_cost, p_per_hour - v_used);
  if v_grant < 1 then
    return jsonb_build_object('allowed', false, 'granted', 0, 'used', v_used, 'limit_hour', p_per_hour);
  end if;

  insert into public.brief_attempts (user_id, cost) values (p_user_id, v_grant);

  return jsonb_build_object('allowed', true, 'granted', v_grant, 'used', v_used + v_grant, 'limit_hour', p_per_hour);
end;
$$;

-- Mismo blindaje que las RPC de créditos y la 0025: solo service_role.
revoke execute on function public.check_brief_rate_limit(text, int, int)
  from public, anon, authenticated;
