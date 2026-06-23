# Vendí — Documento completo

**Fecha:** 23 de junio de 2026
**Autor:** Paolo Nieto (founder)
**Repo:** github.com/PaoNieto/Vendiapp (rama activa `main`; `borrador` existe pero quedó atrás)
**Branch activo:** `main` @ `5d65e13` (origin/main = lo que está vivo)
**Supabase project:** `njmoxdaxzzllowoudgv` (workspace Jidoka)
**Hosting:** Vercel — vendiapp.vercel.app (dominio canónico de la app: **vendilatam.com**)

> ⚠️ **Drift de git (al 2026-06-23):** el `main` LOCAL puede quedar atrás de `origin/main` porque los push históricos se hicieron desde worktrees con `git push origin HEAD:main`. **Hacé `git pull` (o `git fetch && git reset --hard origin/main`) antes de tocar nada.** El SessionStart hook y los subagentes leen los archivos del working tree local, así que un local viejo inyecta contexto viejo.

---

## 1. Qué es Vendí

Vendí es un generador de fotografía de producto con IA para PYMEs de Latinoamérica. El usuario sube fotos de su producto, elige un estilo visual y un formato, y la app genera variaciones fotográficas profesionales listas para ecommerce, redes sociales y publicidad — sin sesión de fotos, sin diseñador, sin Photoshop.

**Tagline:** "Tu producto, en cualquier escenario, sin sesión de fotos."

**Público objetivo:** Emprendedoras y PYMEs latinas que venden en Instagram, Shopify, Mercado Libre, TikTok Shop. No saben de prompts, no saben de IA, pero necesitan fotos que vendan.

**Foco actual (post 2026-06-18):** Mercado Pago ya corre en producción → el foco pasó de construir a **comercial + Meta Ads**: validar demanda, conseguir los primeros 30 fundadores (Lifetime Pass), generar assets de marketing.

---

## 2. Modelo de negocio — CRÉDITOS (decisión durable, pivote 2026-06-03)

> **Antes era BYOK** (cada usuario pegaba su propia API key de Google). Eso se **revirtió por completo**. Si alguien sugiere volver a BYOK: no.

### Cómo funciona

- Vendí tiene **UNA** API key de Google **propia**, server-side (`process.env.GOOGLE_API_KEY`), nunca en el browser.
- La generación corre en **el server de Vendí** (`/api/generations`), no en el browser.
- El usuario paga por **Mercado Pago** (Perú, soles) y recibe **créditos**.
- Cada generación **descuenta créditos** (1 crédito = 1 imagen). A 0, no genera hasta comprar más.
- Los créditos **NO son dinero** — son fichas que cuentan imágenes restantes. La plata entra por Mercado Pago; sale por la cuenta de Google del founder (**prepago**: se carga saldo por adelantado).
- Vendí absorbe el costo de IA + markup.

### Dos bolsas de créditos separadas

- **Generación:** `FREE_PLAN_CREDITS = 60` de regalo al registrarse (1 crédito = 1 imagen).
- **Análisis con IA (Oráculo):** `FREE_ANALYSIS_CREDITS = 10` de regalo, bolsa **aparte** (1 crédito = 1 análisis).

### Economía (medido 2026-06-08)

- Costo real todo incluido: **~USD 0.061 / imagen** (40 imgs + 1 análisis = 9.15 PEN). Ojo: convertir PEN→USD (÷3.7) antes de dividir.
- Un pack de **USD 10 / 60 créditos cierra con ~56% de margen**.
- Referencia de mercado: CienAds cobra ~USD 47 el plan base por 75 imágenes.

### Productos de cobro (`lib/mercadopago/catalog.ts` — FUENTE DE VERDAD server-side)

**Modelo = PACKS de pago único** (NO suscripción recurrente; la tabla `subscriptions` igual soporta ciclos por si en el futuro se pasa a suscripción).

| Producto | kind | Créditos | Precio | Estado |
|---|---|---|---|---|
| **Pase Fundador (Lifetime Pass)** | `lifetime` | 60 generación | **S/ 37.90** (pago único) | **VIVO** — primer producto, primeros 30 fundadores (+ soporte y perks de fundador, que son marketing) |
| Packs 30 / 75 / 200 | `pack` | 30/75/200 | (a definir) | Planeados — se agregan como entradas nuevas en el catálogo sin tocar checkout ni webhook |

> Precio y créditos se resuelven SIEMPRE server-side desde el catálogo, NUNCA desde el cliente ni el body del webhook (si no, alguien compra 200 créditos por 1 sol desde devtools).
> `lib/constants.ts` aún expone `PLANS` (free/pro/business) como remanente, pero el cobro real corre por el **catálogo de Mercado Pago**, no por esa constante. Comercialmente: **solo Free + Pro**; la copy comercial vive en la landing, **NO** dentro de la app.

---

## 3. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) — `middleware` se llama `proxy.ts` |
| Lenguaje | TypeScript estricto (sin `any`) |
| UI | shadcn/ui + @base-ui/react + Tailwind CSS v4 + Motion (Framer) |
| **Auth** | **Clerk** (login + signup + verificación). Migrado desde Supabase Auth (2026-06-13) |
| Base de datos | Supabase (PostgreSQL) — RLS vivo vía third-party auth de Clerk |
| Storage | Supabase Storage (5 buckets) |
| IA — Generación de imágenes | Gemini 3.1 Flash Image (Nano Banana 2) |
| IA — Director de arte | Gemini 3.1 Pro |
| IA — Análisis de imagen (Oráculo) | Gemini 2.5 Flash |
| Validación | Zod |
| **Pagos** | **Mercado Pago — EN PRODUCCIÓN (Checkout Pro)**, Perú/soles, packs de pago único. SDK `mercadopago ^3.1.0`. (Culqi/Yape/Stripe descartados) |
| Hosting | Vercel — vendiapp.vercel.app (canónico vendilatam.com) |

### Modelos de Gemini (strings exactos — `lib/ai/gemini-client.ts`)

```
GEMINI_REASONING_MODEL = "gemini-3.1-pro-preview"        → El Director (generate-server)
GEMINI_IMAGE_MODEL     = "gemini-3.1-flash-image-preview" → Banano (Nano Banana 2)
GEMINI_PING_MODEL      = "gemini-3-flash-preview"         → declarado, hoy SIN USO (era el Portero BYOK)
```

> Nota: el analizador de imágenes (`image-analyzer.ts`, Oráculo) usa **`gemini-2.5-flash`** por su cuenta, no las constantes de arriba.

---

## 4. Arquitectura de componentes de IA (codenames)

Cada componente de IA tiene un codename G.I. Joe. **Importante:** el pivote a créditos consolidó la generación browser-side (`image-generator.ts` + `art-director.ts`) en un único motor server-side (`generate-server.ts`). El validador de key (`validate-key.ts`, "Portero") se eliminó — ya no hay key de usuario que validar.

| Codename | Archivo | Modelo | Función |
|---|---|---|---|
| **Banano + El Director** (motor server) | `lib/ai/generate-server.ts` | Nano Banana 2 + Gemini 3.1 Pro | Motor único server-side. El Director (3.1 Pro) sintetiza un prompt enriquecido en JSON best-effort; Banano (Nano Banana 2) genera N variaciones en paralelo. Usa la key propia de Vendí. Lee imágenes de Storage → base64, enforce de aspect ratio con `sharp`, devuelve Buffers JPEG. |
| **Oráculo** (image-analyzer) | `lib/ai/image-analyzer.ts` | Gemini 2.5 Flash | Analiza una imagen subida por el usuario. Devuelve composición, iluminación, por qué vende, y estilos identificados (JSON validado con Zod). |
| **Cartero** (gemini-client) | `lib/ai/gemini-client.ts` | — | Cliente HTTP compartido. Llama a la REST API de Google sin SDK. Errores tipados (`missing_key`, `invalid_key`, `rate_limit`, `content_blocked`, `network`, `unknown`). |

> **Deuda técnica conocida:** el header doc de `gemini-client.ts` todavía dice "BYOK" y referencia `validate-key.ts` / `art-director.ts` (archivos ya borrados). Comentarios desactualizados, no afecta runtime.

### Flujo de generación (server-side, modelo de créditos)

```
1. Usuario clickea "Generar" → POST /api/generations { versionId, styleFragment }
2. Auth: Clerk auth() → ensureProfile(). Sin sesión → 401.
3. Lee la versión (RLS) → producto, refs, ratio, variaciones, user_prompt.
4. Pre-check de créditos: si credits_remaining < variaciones → 402 (no gasta en Google).
5. Crea row generations (status: processing).
6. RESERVA créditos: admin.rpc("deduct_credits") — atómico, vía service_role.
7. generateOnServer():
   a. Imágenes de Storage → inlineData base64 (Buffer, server-safe)
   b. El Director (Gemini 3.1 Pro, best-effort JSON) → basePrompt. Si falla, fallback a userPrompt o genérico.
   c. Arma prompt final: role split + basePrompt + style fragment + ratio + IDENTITY_GUARD
   d. N llamadas en paralelo (Promise.allSettled) a Nano Banana  (DEFAULT_VARIATIONS = 5 por tanda)
   e. Enforce aspect ratio con sharp (cover-crop a dimensiones exactas) → JPEG 92%
8. Sube imágenes OK a Storage (generated-images) + signed URL (1 año) + insert en generated_images.
9. REEMBOLSA créditos de las variaciones que fallaron (grant_credits, reason "refund").
10. Marca completed, devuelve { generationId, images, delivered, requested, creditsRemaining }.
```

### Modelo de prompts por imagen (desde el rediseño de la Fábrica)

- `generated_images.strict_prompt` = prompt estricto **EDITABLE** del usuario (arranca `""`).
- `metadata.base_prompt` = prompt final/original **read-only** (lo que armó el Director). La migración `0010` movió los legacy.

### Prompt final que llega a Nano Banana

```
"The first {N} image(s) show the PRODUCT — preserve EXACTLY: same shape,
same color, same label, same proportions. The remaining {M} image(s) are
STYLE references only — extract aesthetic but DO NOT copy their content.

{basePrompt del Director o fallback}

Style direction: {fragment del estilo elegido}

Aspect ratio: {ratio} ({label}). Frame the composition to match exactly.

Produce one photorealistic, studio-grade commercial image.

PRESERVE EXACTLY THE PRODUCT SHOWN IN THE FIRST REFERENCE IMAGE: same shape,
same colors, same packaging, same label text, same proportions. THE STYLE
REFERENCES CONTRIBUTE AESTHETIC ONLY — THEY MUST NEVER REPLACE OR ALTER THE
PRODUCT ITSELF."
```

---

## 5. Base de datos (Supabase)

> **Auth = Clerk.** `profiles.id` = userId de Clerk (**text**, ya no uuid). El RLS lee `auth.jwt()->>'sub'` (el sub del token de Clerk inyectado en el cliente Supabase). El perfil lo crea **`ensureProfile()`** (`lib/auth/ensure-profile.ts`), invocado desde `app/(app)/layout.tsx` y `/api/checkout` — reemplaza al trigger `handle_new_user`, muerto con la migración a Clerk.

### Tablas

| Tabla | Propósito | RLS |
|---|---|---|
| `profiles` | Perfil del usuario. id = userId Clerk (text). username, display_name, avatar, plan, **credits_remaining** + **analysis_credits_remaining** (saldos cacheados, dos bolsas). | select/update own |
| `projects` | Los "productos" del usuario (nombre, descripción, product_images). | all own |
| `versions` | Campañas creativas dentro de un producto. reference_images, output_ratio, variations_default, user_prompt, **style_id** (migr 0010). | all own |
| `generations` | Cada tanda. status (pending/processing/completed/failed), product_images, reference_images, user_prompt, output_ratio, variations_requested, error_message, completed_at. | all own |
| `generated_images` | Cada imagen individual. image_url, variation_index, **strict_prompt** (editable), metadata.base_prompt (read-only), user_rating, is_favorite, is_downloaded. | select/update/insert own |
| `analyses` | Análisis con Oráculo. composition, lighting, why_it_sells, identified_styles. | all own |
| `starter_references` | Galería curada por Vendí (pública). category, image_url, tags. | select public |
| `subscriptions` | Plan activo. plan, status, credits_per_cycle, cycle_start/end. Las columnas `culqi_*` son **legacy** del riel viejo; el cobro ahora es Mercado Pago. | **select own** (escritura solo server) |
| `credit_ledger` | Registro auditable de cada movimiento de créditos. delta, reason, generation_id, balance_after. Fuente de verdad del saldo. | **select own** (escritura solo server) |
| `unlimited_users` | Allowlist de créditos ILIMITADOS (migr 0009). Solo Paolo + quien él ordene. | server-only |
| `mp_processed_payments` | Idempotencia del webhook de Mercado Pago (migr 0013): cada payment_id se procesa una sola vez. | server-only |

### Créditos — seguridad crítica

- `profiles.credits_remaining` / `analysis_credits_remaining` = saldos **cacheados** para lectura rápida. La **fuente de verdad** auditable es `credit_ledger` (saldo = suma de todos los `delta`).
- Los créditos **solo se mutan server-side** vía RPCs `SECURITY DEFINER`:
  - `deduct_credits(user_id, amount, generation_id)` — lock pesimista (`FOR UPDATE`), verifica saldo, descuenta, escribe ledger. Atómica.
  - `grant_credits(user_id, amount, reason)` — acredita (subscription_grant / **purchase** / refund / manual_adjustment / signup_bonus).
  - `deduct_analysis_credit` / `grant_analysis_credits` — equivalentes para la bolsa de análisis.
  - `process_mp_payment(...)` — usada por el webhook de MP: registra el pago en `mp_processed_payments` y llama `grant_credits('purchase')` en **una sola transacción atómica e idempotente**.
- **`REVOKE EXECUTE` de las RPCs a `anon` y `authenticated`**: solo el server (service_role, vía `lib/supabase/admin.ts`) puede invocarlas. Un usuario no puede regalarse créditos desde devtools.

### Storage Buckets

| Bucket | Acceso | Uso |
|---|---|---|
| `product-uploads` | Privado (owner) | Fotos de producto subidas por el usuario |
| `references-uploads` | Privado (owner) | Imágenes de referencia visual |
| `generated-images` | Privado (owner) | Imágenes generadas por Banano (signed URLs) |
| `analysis-uploads` | Privado (owner) | Imágenes subidas para análisis con Oráculo |
| `starter-references` | Público (lectura) | Galería curada por el equipo Vendí |

### Migraciones (0001–0013, todas aplicadas en PROD)

```
0001_initial_schema.sql                  → profiles, projects, generations, generated_images, starter_references + RLS + triggers
0002_add_product_images.sql              → product_images jsonb en projects
0003_versions.sql                        → tabla versions + version_id en generations
0004_generated_image_strict_prompt.sql   → strict_prompt en generated_images
0005_analyses.sql                        → tabla analyses
0006_storage_buckets.sql                 → 5 buckets + storage policies
0007_creditos.sql                        → subscriptions + credit_ledger + RPCs deduct_credits/grant_credits + RLS
0008_analysis_credits.sql                → bolsa de análisis separada (analysis_credits_remaining + RPCs)
0009_unlimited_credits.sql               → tabla unlimited_users (allowlist de ilimitados)
0010_version_style.sql                   → versions.style_id + split de prompts (strict_prompt / metadata.base_prompt)
0011_clerk_rls.sql                       → RLS leyendo auth.jwt()->>'sub' (token Clerk)
0012_clerk_user_ids.sql                  → profiles.id a text (id Clerk), tablas relacionadas
0012b_remap_users.sql                    → remap de usuarios viejos uuid → id Clerk (al loguearse)
0013_mp_processed_payments.sql           → tabla de idempotencia del webhook de Mercado Pago + RPC process_mp_payment
```

---

## 6. Páginas de la app

### Autenticación — Clerk (`app/(auth)/`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/login` | `login/[[...rest]]/page.tsx` | Login con Clerk (catch-all para los sub-flows de Clerk). Redirect a `/dashboard`. |
| `/signup` | `signup/[[...rest]]/page.tsx` | Registro con Clerk (catch-all). |
| `/recuperar` | `recuperar/page.tsx` | Reset de contraseña (legacy; Clerk también maneja recuperación). |
| `/comenzar` | `app/comenzar/route.ts` | **Route handler auth-aware** (destino del botón "Comenzar" de la landing): logueado → `/dashboard`, sin sesión → pago (Mercado Pago). Ruta pública. |
| `/` | `app/page.tsx` | Redirect: sesión → `/dashboard`, si no → `/login`. |

### App autenticada (`app/(app)/`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | Pantalla principal. Métricas 100% reales (leen Supabase). Saludo por hora, metric tiles, workflow chips, timeline, grid de generaciones recientes. |
| `/mi-negocio` | `mi-negocio/page.tsx` | **Solo perfil de marca** (nombre, rubro, descripción). Ya **NO** hay API key — la IA corre server-side con la key de Vendí. Esa identidad viaja al Director. |
| `/productos` `/productos/nuevo` `/productos/[id]` | `productos/...` | Catálogo, crear (Zod) y detalle de producto (fotos, versiones). |
| `/productos/[id]/versiones/[versionId]` | `versiones/[versionId]/page.tsx` | Detalle de versión + "Generar primera tanda" + galería. |
| `/referencias` | `referencias/page.tsx` | Estación: subir inspiración + galería. |
| `/estilo` | `estilo/page.tsx` | Estación: **Estilos Profesionales** (10 estilos con foto de ejemplo, single-select, persistidos en `versions.style_id`). |
| `/formato` | `formato/page.tsx` | Estación: ratio (1:1, 4:5, 9:16, 16:9) + variaciones (1-10). |
| `/fabrica` | `fabrica/page.tsx` | Hub central. Grid filtrable de TODAS las versiones. |
| `/fabrica/[versionId]` | `fabrica/[versionId]/page.tsx` | **Versión en PÁGINA COMPLETA** (no drawer): catálogo limpio de imágenes; click → modal de detalle (foto · Seteos · Prompt original read-only · Prompt estricto editable). |
| `/analisis` | `analisis/page.tsx` | Análisis de imágenes con Oráculo (bolsa de créditos de análisis). |
| `/ajustes` | `ajustes/page.tsx` | **Cuenta + Uso de créditos + Plan.** "Uso" = dashboard de créditos: saldo, consumo, histórico del `credit_ledger`. |
| `/upgrade` | `upgrade/page.tsx` | Landing de planes + **checkout real de Mercado Pago** (Lifetime Pass). |
| `/upgrade/resultado` | `upgrade/resultado/page.tsx` | Página de retorno tras el pago (back_url de MP). UX — NO acredita créditos (eso lo hace el webhook). |

### Proxy/Middleware (`proxy.ts` — `clerkMiddleware`)

- En Next.js 16 el middleware se llama **`proxy.ts`**. Usa `clerkMiddleware()` de `@clerk/nextjs/server`.
- Rutas públicas: `/`, `/login` (+subrutas), `/signup` (+subrutas), `/privacidad`, `/terminos`, `/onboarding`, `/recuperar`, **`/comenzar`**.
- Todo lo demás (`(app)/*`) requiere sesión → redirect a `/login?from=<ruta>`.
- Logueado en `/login`/`/signup` → redirect a `/dashboard`.
- ⚠️ **NO usa `auth.protect()`** (bug Clerk #8302 en el proxy de Next 16 redirige a la URL actual): lee `userId` con `auth()` y hace los redirects a mano con `NextResponse`.
- Las API routes hacen su propia validación con `auth()` en server.

---

## 7. Stores (estado del cliente)

| Store | Archivo | localStorage key | Qué guarda |
|---|---|---|---|
| `NegocioProvider` | `lib/negocio/store.tsx` | `vendi:negocio` | brandName, industry, description (**sin apiKey**) |
| `ProductsProvider` | `lib/products/store.tsx` | `vendi:products` | Array de Product |
| `VersionsProvider` | `lib/versions/store.tsx` | `vendi:versions` | Array de Version |
| `GenerationsProvider` | `lib/generations/store.tsx` | `vendi:generations` | Generations + GeneratedImages + helpers |
| `AnalysesProvider` | `lib/analyses/store.tsx` | `vendi:analyses` | Array de Analysis |
| `RecorridoProvider` | `lib/recorrido/store.tsx` | `vendi:recorrido` | productId, versionId (flujo lineal entre estaciones) |
| `GeneracionProvider` | `lib/generacion/store.tsx` | `vendi:generacion` | selectedStyleId |
| `useCreditos` | `lib/creditos/use-creditos.tsx` | — (Supabase) | Saldo de créditos (dos bolsas) + ledger |
| Auth | `@clerk/nextjs` (`useUser`, `useAuth`) | — (Clerk) | Usuario/sesión vía Clerk |

**Nota:** products, versions, generations y analyses sincronizan con Supabase. Negocio, Recorrido y Generacion son solo localStorage. Créditos lee de Supabase. La sesión la maneja Clerk.

---

## 8. Componentes UI

### Sistema de diseño (Cuaderno v2 — GLASS REAL)

Identidad **Cuaderno**: paleta cream/forest/butter/clay (sage + cream + butter + clay), pill verde-oscuro profundo. Fondo del shell = gradient pastel. Tipografía: **Instrument Serif italic** para display/H1-H3 y momentos editoriales; **Inter** para el chrome de UI.

- **Cards = GLASS REAL** (decisión 2026-06-06, revierte el sólido de Cuaderno v2): `.glass-card` y `.glass-card-compact` (backdrop-blur 18-22px + saturate + gradient cream translúcido + highlight + sombra profunda). `.glass-strong` / `.glass` para landing pública.
- `.glass-interactive` → hover opt-in. Las cards estáticas no se mueven.
- **Tokens semánticos** `--vd-*` en `:root` (ink, mute, pill, sage, clay, butter, card-cream…). Clases Tailwind: `text-ink`, `text-mute`, `glass-card`, `eyebrow`, `font-display`, etc.
- Radius base 12px. **Dark mode** vía `[data-theme="dark"]`. Mobile-first 375px, touch targets ≥ 44px.

### Componentes clave

| Componente | Archivo | Uso |
|---|---|---|
| `Sidebar` / `BottomNav` | `components/app/` | Nav desktop / mobile |
| `Topbar` | `components/app/topbar.tsx` | Header de página |
| `StationShell` | `components/app/station-shell.tsx` | Wrapper de estaciones |
| `StyleCard` | `components/app/style-card.tsx` | Card seleccionable de estilo (con foto de ejemplo) |
| `CreditBadge` | `components/app/credit-badge.tsx` | Badge de saldo de créditos en el chrome |
| `GeneratingOverlay` | `components/app/generating-overlay.tsx` | Overlay único de carga al generar |
| `VersionGallery` | `components/app/version-gallery.tsx` | Galería de imágenes de una versión |
| `ImageUploader` / `RatioSelector` / `NumberStepper` | `components/fabrica/` | Inputs de las estaciones |
| `FilterBar` / `MetricTile` / `GenerationCard` | `components/dashboard/` | Hub + dashboard |

---

## 9. Catálogo de estilos

### Estilos Profesionales (estación `/estilo`) — 10 estilos con foto de ejemplo

Reemplazaron a los viejos "estilos curados" (cuadrados de color). Cada uno tiene mini-foto de ejemplo + fragment en inglés (nunca visible). Single-select, persistido en `versions.style_id` (migr 0010). Referencia OPCIONAL (estilo solo / ref sola / ambos).

> `CURATED_STYLES` (los tiles de color viejos) sobrevive SOLO para el Análisis IA + retrocompat — **no borrar**.

---

## 10. Seguridad

### Lo que está implementado

- **Auth = Clerk** (login/signup/verificación). RLS de Supabase vivo vía third-party auth: el token de Clerk se inyecta en el cliente Supabase y las policies leen `auth.jwt()->>'sub'`.
- **RLS en todas las tablas**: dueño-only. `subscriptions` y `credit_ledger` son **select-only** para el cliente (escritura solo server). `unlimited_users` y `mp_processed_payments` son server-only.
- **Créditos blindados**: RPCs `SECURITY DEFINER` con `REVOKE EXECUTE` a `anon`/`authenticated`. Solo el server (service_role, `lib/supabase/admin.ts`) las invoca.
- **Key de Google server-side**: `GOOGLE_API_KEY` en env del server, **nunca** en el browser ni commiteada. Generación 100% server-side.
- **Pre-check de créditos** antes de pegarle a Google (early reject 402) + reembolso de variaciones fallidas.
- **Webhook de Mercado Pago**: valida firma `x-signature` (HMAC-SHA256), re-consulta `Payment.get` (no confía en el body) y acredita de forma **idempotente** (`process_mp_payment`). Precio/créditos resueltos del catálogo, nunca del evento.
- **Storage policies**: cada bucket privado valida `user_id` en el path.
- **Zod** en inputs de forms, respuestas de Gemini y body del checkout.
- **Sin Anthropic SDK**: todo es Gemini.

### Lo que falta

- **Observabilidad**: Sentry/PostHog tienen campos en `.env.example` pero no están en código.
- **Entornos separados**: un solo proyecto Supabase para dev y prod. Separar antes de escalar.
- **Leaked-password protection** OFF (no aparece en plan Free de Supabase; activar al pasar a Pro).
- **Anti-abuso del regalo**: 60+10 créditos de regalo por signup. Con Clerk la verificación de email la maneja Clerk; re-evaluar el riesgo de abuso (~$4.85 de costo por signup).

---

## 11. API Routes (server-side)

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/generations` | POST | **Generación real** server-side: auth Clerk → versión → pre-check créditos → deduct → generar con key propia → subir a Storage → reembolsar fallidas → completed. |
| `/api/generations/[id]` | GET | Lee una generación por ID. |
| `/api/analyze` | POST | Análisis de imagen con Oráculo (Gemini Vision) server-side (bolsa de créditos de análisis). |
| `/api/checkout` | POST | **Mercado Pago Checkout Pro:** auth Clerk → `ensureProfile()` → resuelve precio/créditos del catálogo → crea Preference (`external_reference` = id Clerk) → devuelve `init_point`. runtime nodejs, force-dynamic. |
| `/api/webhooks/mercadopago` | POST | **Fuente de verdad del cobro:** valida `x-signature` → `Payment.get` → si `approved`, acredita idempotente vía `process_mp_payment` (grant_credits 'purchase'). Env `MP_WEBHOOK_SECRET`. |
| `/comenzar` | GET | Route handler auth-aware (botón "Comenzar" de la landing): logueado → dashboard, sino → pago. |

---

## 12. Agentes de desarrollo (codenames)

| Codename | Rol | Alcance |
|---|---|---|
| **Capataz** | Orquestador | Tiene la foto completa, delega a los especialistas (es la sesión principal por defecto) |
| **Bujía** | Backend | Supabase, migraciones, RLS, Zod, créditos, integración con APIs de IA (Gemini) |
| **Frontero** | Frontend | Next.js 16, shadcn/@base-ui, páginas, componentes responsive, hooks |
| **Davinci** | Estilos | Tailwind v4, paleta Cuaderno v2, glassmorphism, animaciones Motion |
| **Integral** | Integraciones | Mercado Pago (cobro, vivo), Meta Ads API + webhooks (Fase 2) |
| **Hawkeye** | Testing/QA | Vitest, Playwright, mobile, accesibilidad |

> Convención: nombrar siempre el code name con el rol entre paréntesis ("Bujía (backend)").
> Componentes de IA (no agentes de dev): **El Director** + **Banano** (generate-server), **Oráculo** (analyzer), **Cartero** (gemini-client).

---

## 13. Flujo del usuario (de punta a punta)

```
1. Signup (/signup, Clerk) → ensureProfile() crea profile (id Clerk) + créditos de regalo (60 gen + 10 análisis)
2. Mi Negocio (/mi-negocio) → perfil de marca (sin API key)
3. Nuevo Producto (/productos/nuevo) → nombre + descripción
4. Detalle Producto (/productos/[id]) → sube fotos + crea versión
5. Referencias (/referencias) → inspiración (opcional)
6. Estilo (/estilo) → Estilo Profesional (persiste en versions.style_id)
7. Formato (/formato) → ratio + variaciones
8. Generar → POST /api/generations (server, descuenta créditos)
9. Fábrica (/fabrica) → todas sus versiones; abre /fabrica/[versionId] en página completa (modal por imagen)
10. Análisis (/analisis) → Oráculo analiza cualquier imagen (bolsa de análisis)
11. Ajustes (/ajustes) → cuenta, uso de créditos, plan
12. Sin saldo → /upgrade → comprar (Mercado Pago Checkout Pro, Lifetime Pass) → webhook acredita
```

---

## 14. Hitos recientes

```
2026-06-19  Landing: botones Comenzar (/comenzar auth-aware) + login → vendilatam.com (origin/main 5d65e13)
2026-06-18  Mercado Pago EN PRODUCCIÓN (credenciales PROD); revert de "servir landing pública en / dentro de la app"
2026-06-16/17  Integración Mercado Pago Checkout Pro + Lifetime Pass pago único (installments:1)
2026-06-13  Migración completa Supabase Auth → Clerk (LIVE en prod, c33177c)
2026-06-11  Rediseño de la Fábrica + preview de imágenes en cards de versión
2026-06-11  Estilos Profesionales (10 con foto, referencia opcional, style_id)
```

---

## 15. Lo que falta / en lo que estoy (2026-06-23)

### Prioridad alta — comercial

1. **Conseguir los primeros 30 fundadores** (Lifetime Pass, S/ 37.90). Validar demanda con dueños de negocio reales.
2. **Meta Ads** (siguiente riel técnico, Fase 2 de Integral): campañas + creatividades generadas con Vendí.
3. **Validar la CALIDAD de las imágenes en prod real**: que el producto salga fiel y el estilo profesional.

### Operativo / pendientes

4. **`git pull` del main local** si quedó atrás de origin/main (ver header). Drift recurrente.
5. **Remap de los 3 usuarios viejos** (uuid → id Clerk) al loguearse (migr 0012b). Sus datos no aparecen hasta entonces.
6. **Probar EN VIVO una generación real en prod** con login + saldo (cableado hecho; confirmar que se validó).
7. **Definir y cargar los packs 30/75/200** en el catálogo de MP (hoy solo Lifetime Pass).
8. **Fusionar Referencias + Estilo** en una sola pantalla (decisión de producto; el código aún tiene rutas separadas).

### Prioridad baja / deuda

9. **Comentarios stale en `gemini-client.ts`** (dicen "BYOK", referencian archivos borrados). No afecta runtime.
10. **`GEMINI_PING_MODEL` sin uso** (era el Portero BYOK).
11. **Columnas `culqi_*` legacy** en `subscriptions` (renombrar a genéricas/`mp_*` en una migración futura).
12. **Observabilidad + entornos separados** (ver §10).

---

## 16. Estructura de archivos (resumen)

```
vendiapp/vendi/
├── app/
│   ├── page.tsx                          # Redirect dashboard/login
│   ├── layout.tsx                        # Root layout (Clerk provider, fonts, theme, Toaster)
│   ├── comenzar/route.ts                 # Route handler auth-aware (botón "Comenzar" de la landing)
│   ├── onboarding/page.tsx
│   ├── (auth)/
│   │   ├── login/[[...rest]]/page.tsx     # Clerk (catch-all)
│   │   ├── signup/[[...rest]]/page.tsx    # Clerk (catch-all)
│   │   └── recuperar/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                    # Shell: AppProviders + Sidebar + BottomNav + ensureProfile()
│   │   ├── dashboard/page.tsx
│   │   ├── mi-negocio/page.tsx           # Perfil de marca (sin API key)
│   │   ├── productos/{page,nuevo}/...     # + [id] + [id]/versiones/[versionId]
│   │   ├── referencias/ estilo/ formato/  # Estaciones
│   │   ├── fabrica/page.tsx              # Hub
│   │   ├── fabrica/[versionId]/page.tsx  # Versión en página completa (catálogo + modal)
│   │   ├── analisis/page.tsx
│   │   ├── ajustes/page.tsx              # Cuenta + Uso (créditos) + Plan
│   │   └── upgrade/{page,resultado}/page.tsx   # Planes + checkout MP + página de retorno
│   └── api/
│       ├── generations/route.ts          # POST — generación server-side real
│       ├── generations/[id]/route.ts     # GET
│       ├── analyze/route.ts              # POST — análisis (Oráculo)
│       ├── checkout/route.ts             # POST — Mercado Pago Checkout Pro
│       └── webhooks/mercadopago/route.ts # POST — webhook MP (fuente de verdad del cobro)
├── components/
│   ├── app/      # sidebar, bottom-nav, topbar, station-shell, style-card,
│   │             # app-providers, credit-badge, generating-overlay, version-gallery
│   ├── dashboard/ # cards, metric-tile, filter-bar, sparkline, etc.
│   ├── fabrica/  # image-uploader, number-stepper, ratio-selector, selectable-chip
│   └── ui/       # shadcn / @base-ui base
├── lib/
│   ├── ai/
│   │   ├── gemini-client.ts              # Cartero — cliente REST Gemini
│   │   ├── generate-server.ts            # El Director + Banano (motor server-side)
│   │   └── image-analyzer.ts             # Oráculo (Gemini 2.5 Flash)
│   ├── mercadopago/{client,catalog}.ts   # SDK MP + catálogo de productos (fuente de verdad de precios/créditos)
│   ├── auth/ensure-profile.ts            # crea el profile (reemplaza al trigger handle_new_user)
│   ├── creditos/use-creditos.tsx         # Saldos (dos bolsas) + ledger desde Supabase
│   ├── negocio/store.tsx                 # Perfil de marca (sin apiKey)
│   ├── products/ versions/ generations/ analyses/ generacion/ recorrido/  # stores
│   ├── supabase/{client,server,storage,admin}.ts   # admin = service_role; client/server inyectan token Clerk
│   ├── validations/{generations,analyze,checkout,recorrido}.ts
│   ├── styles.ts                         # Estilos Profesionales + CURATED_STYLES (legacy análisis)
│   ├── constants.ts                      # APP_NAME, FREE_PLAN_CREDITS=60, FREE_ANALYSIS_CREDITS=10, PLANS, OUTPUT_RATIOS…
│   └── utils.ts
├── supabase/migrations/0001…0013.sql
├── types/database.ts
├── proxy.ts                              # Middleware Next 16 (clerkMiddleware)
└── .env.example
```

> **Eliminados en el pivote a créditos:** `lib/ai/art-director.ts`, `lib/ai/image-generator.ts`, `lib/ai/validate-key.ts`.

---

## 17. Dependencies (package.json)

```json
{
  "@base-ui/react": "^1.4.1",
  "@clerk/nextjs": "^7.5.2",
  "@hookform/resolvers": "^5.2.2",
  "@supabase/ssr": "^0.10.3",
  "@supabase/supabase-js": "^2.105.4",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "lucide-react": "^1.14.0",
  "mercadopago": "^3.1.0",
  "motion": "^12.38.0",
  "next": "16.2.6",
  "next-themes": "^0.4.6",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "react-hook-form": "^7.75.0",
  "server-only": "^0.0.1",
  "sharp": "^0.34.5",
  "shadcn": "^4.7.0",
  "sonner": "^2.0.7",
  "tailwind-merge": "^3.5.0",
  "tw-animate-css": "^1.4.0",
  "zod": "^4.4.3"
}
```

---

## 18. Variables de entorno (.env.example)

```bash
# --- Supabase (DB + Storage; Auth ahora es Clerk) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Clerk (Auth) ---
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# --- Google Gemini (modelo de CRÉDITOS: key PROPIA de Vendí, server-side) ---
GOOGLE_API_KEY=

# --- Mercado Pago (pasarela de pago — Perú/soles, EN PRODUCCIÓN) ---
MP_ACCESS_TOKEN=          # Access Token PROD (server-side, single-seller)
MP_WEBHOOK_SECRET=        # secreto para validar x-signature del webhook
NEXT_PUBLIC_MP_PUBLIC_KEY=   # (si aplica al front)

# --- Fase 2 ---
# META_ADS_APP_ID=
# META_ADS_APP_SECRET=
```

> Los nombres exactos de las env vars de MP/Clerk pueden variar — verificar contra `lib/mercadopago/client.ts`, `proxy.ts` y `.env.example` reales del repo.

---

*Documento actualizado el 23 de junio de 2026. Refleja el estado de `origin/main` @ `5d65e13` — modelo de CRÉDITOS server-side, Auth = Clerk, cobro = Mercado Pago (Checkout Pro) en producción.*
