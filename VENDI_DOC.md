# Vendí — Documento completo

**Fecha:** 6 de junio de 2026
**Autor:** Paolo Nieto (founder)
**Repo:** github.com/PaoNieto/Vendiapp (ramas `main` + `borrador`, en sync)
**Branch activo:** `main` @ `abbfd0f`
**Supabase project:** `njmoxdaxzzllowoudgv` (workspace Jidoka)
**Hosting:** Vercel — vendiapp.vercel.app

---

## 1. Qué es Vendí

Vendí es un generador de fotografía de producto con IA para PYMEs de Latinoamérica. El usuario sube fotos de su producto, elige un estilo visual y un formato, y la app genera variaciones fotográficas profesionales listas para ecommerce, redes sociales y publicidad — sin sesión de fotos, sin diseñador, sin Photoshop.

**Tagline:** "Tu producto, en cualquier escenario, sin sesión de fotos."

**Público objetivo:** Emprendedoras y PYMEs latinas que venden en Instagram, Shopify, Mercado Libre, TikTok Shop. No saben de prompts, no saben de IA, pero necesitan fotos que vendan.

---

## 2. Modelo de negocio — CRÉDITOS (decisión durable, pivote 2026-06-03)

> **Antes era BYOK** (cada usuario pegaba su propia API key de Google). Eso se **revirtió por completo**. Si alguien sugiere volver a BYOK: no.

### Cómo funciona

- Vendí tiene **UNA** API key de Google **propia**, server-side (`process.env.GOOGLE_API_KEY`), nunca en el browser.
- La generación corre en **el server de Vendí** (`/api/generations`), no en el browser.
- El usuario paga una suscripción/packs por **Mercado Pago** (Perú, soles) y recibe **créditos**.
- Cada generación **descuenta créditos** (1 crédito = 1 imagen). A 0, no genera hasta comprar más.
- Los créditos **NO son dinero** — son fichas que cuentan imágenes restantes. La plata entra por Mercado Pago; sale por la cuenta de Google del founder (**prepago**: se carga saldo por adelantado).
- Vendí absorbe el costo de IA + markup.

### Economía (2026-06-06)

- Costo de generación: **~USD 0.067–0.101 por imagen** (Nano Banana 2). ~USD 10 de saldo rinden **~100–150 imágenes**.
- Referencia de mercado: CienAds cobra ~USD 47 el plan base por 75 imágenes.

### Planes (`lib/constants.ts`)

| Plan | Créditos/mes | Precio (USD) |
|---|---|---|
| Free | 10 | 0 |
| Pro | 200 | 19 |
| Business | 1000 | 79 |

- `FREE_PLAN_CREDITS = 10` (créditos de arranque).
- El copy comercial (features, comparaciones) vive en la landing `/upgrade`, **NO** dentro de la app.

---

## 3. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript estricto (sin `any`) |
| UI | shadcn/ui + Tailwind CSS v4 + Motion (Framer) |
| Auth | Supabase Auth (email/password) |
| Base de datos | Supabase (PostgreSQL) |
| Storage | Supabase Storage (5 buckets) |
| IA — Generación de imágenes | Gemini 3.1 Flash Image (Nano Banana 2) |
| IA — Director de arte | Gemini 3.1 Pro |
| IA — Análisis de imagen (Oráculo) | Gemini 2.5 Flash |
| Validación | Zod |
| Pagos | Mercado Pago (pendiente de integrar; Culqi descartado) |
| Hosting | Vercel — vendiapp.vercel.app |

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
2. Auth: getUser(). Sin sesión → 401.
3. Lee la versión (RLS) → producto, refs, ratio, variaciones, user_prompt.
4. Pre-check de créditos: si credits_remaining < variaciones → 402 (no gasta en Google).
5. Crea row generations (status: processing).
6. RESERVA créditos: admin.rpc("deduct_credits") — atómico, vía service_role.
7. generateOnServer():
   a. Imágenes de Storage → inlineData base64 (Buffer, server-safe)
   b. El Director (Gemini 3.1 Pro, best-effort JSON) → basePrompt. Si falla, fallback a userPrompt o genérico.
   c. Arma prompt final: role split + basePrompt + style fragment + ratio + IDENTITY_GUARD
   d. N llamadas en paralelo (Promise.allSettled) a Nano Banana
   e. Enforce aspect ratio con sharp (cover-crop a dimensiones exactas) → JPEG 92%
8. Sube imágenes OK a Storage (generated-images) + signed URL (1 año) + insert en generated_images.
9. REEMBOLSA créditos de las variaciones que fallaron (grant_credits, reason "refund").
10. Marca completed, devuelve { generationId, images, delivered, requested, creditsRemaining }.
```

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

### Tablas

| Tabla | Propósito | RLS |
|---|---|---|
| `profiles` | Extiende auth.users. username, display_name, avatar, plan, **credits_remaining** (saldo cacheado). Trigger auto-create on signup. | select/update own |
| `projects` | Los "productos" del usuario (nombre, descripción, product_images). | all own |
| `versions` | Campañas creativas dentro de un producto. reference_images, output_ratio, variations_default, user_prompt. | all own |
| `generations` | Cada tanda. status (pending/processing/completed/failed), product_images, reference_images, user_prompt, output_ratio, variations_requested, error_message, completed_at. | all own |
| `generated_images` | Cada imagen individual. image_url, variation_index, strict_prompt, user_rating, is_favorite, is_downloaded. | select/update/insert own |
| `analyses` | Análisis con Oráculo. composition, lighting, why_it_sells, identified_styles. | all own |
| `starter_references` | Galería curada por Vendí (pública). category, image_url, tags. | select public |
| **`subscriptions`** | Plan activo. plan, status, credits_per_cycle, cycle_start/end, culqi_customer_id, culqi_subscription_id (columnas `culqi_*` legacy — el riel ahora es Mercado Pago). | **select own** (escritura solo server) |
| **`credit_ledger`** | Registro auditable de cada movimiento de créditos. delta, reason, generation_id, balance_after. Fuente de verdad del saldo. | **select own** (escritura solo server) |

### Créditos — seguridad crítica

- `profiles.credits_remaining` = saldo **cacheado** para lectura rápida. La **fuente de verdad** auditable es `credit_ledger` (saldo = suma de todos los `delta`).
- Los créditos **solo se mutan server-side** vía dos funciones `SECURITY DEFINER`:
  - `deduct_credits(user_id, amount, generation_id)` — lock pesimista (`FOR UPDATE`), verifica saldo, descuenta, escribe ledger. Atómica: si no alcanza, revierte todo.
  - `grant_credits(user_id, amount, reason)` — acredita (subscription_grant / purchase / refund / manual_adjustment / signup_bonus).
- **`REVOKE EXECUTE` de ambas funciones a `anon` y `authenticated`**: solo el server (service_role, vía `lib/supabase/admin.ts`) puede invocarlas. Un usuario no puede regalarse créditos desde devtools.

### Storage Buckets

| Bucket | Acceso | Uso |
|---|---|---|
| `product-uploads` | Privado (owner) | Fotos de producto subidas por el usuario |
| `references-uploads` | Privado (owner) | Imágenes de referencia visual |
| `generated-images` | Privado (owner) | Imágenes generadas por Banano (signed URLs) |
| `analysis-uploads` | Privado (owner) | Imágenes subidas para análisis con Oráculo |
| `starter-references` | Público (lectura) | Galería curada por el equipo Vendí |

### Migraciones (7)

```
0001_initial_schema.sql                  → profiles, projects, generations, generated_images, starter_references + RLS + triggers
0002_add_product_images.sql              → product_images jsonb en projects
0003_versions.sql                        → tabla versions + version_id en generations
0004_generated_image_strict_prompt.sql   → strict_prompt en generated_images
0005_analyses.sql                        → tabla analyses
0006_storage_buckets.sql                 → 5 buckets + storage policies
0007_creditos.sql                        → subscriptions + credit_ledger + RPCs deduct_credits/grant_credits + RLS
```

---

## 6. Páginas de la app

### Autenticación (`app/(auth)/`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/login` | `login/page.tsx` | Login con email/password. Errores de Supabase en español. Redirect a `/dashboard`. |
| `/signup` | `signup/page.tsx` | Registro con email/password. |
| `/recuperar` | `recuperar/page.tsx` | Solicitud de reset de contraseña. |
| `/recuperar/nueva` | `recuperar/nueva/page.tsx` | Set de nueva contraseña tras el link de reset. |
| `/` | `app/page.tsx` | Redirect: sesión → `/dashboard`, si no → `/login`. |

### App autenticada (`app/(app)/`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | Pantalla principal. Saludo por hora, metric tiles, workflow chips, timeline, grid de generaciones recientes. Skeleton loading. |
| `/mi-negocio` | `mi-negocio/page.tsx` | **Solo perfil de marca** (nombre, rubro, descripción). Ya **NO** hay API key — la IA corre server-side con la key de Vendí. |
| `/productos` | `productos/page.tsx` | Catálogo de productos. Grid responsive. |
| `/productos/nuevo` | `productos/nuevo/page.tsx` | Crear producto (Zod). |
| `/productos/[id]` | `productos/[id]/page.tsx` | Detalle del producto. Fotos, versiones, "+ Nueva Versión". |
| `/productos/[id]/versiones/[versionId]` | `versiones/[versionId]/page.tsx` | Detalle de versión. Config + "Generar primera tanda" + galería. |
| `/referencias` | `referencias/page.tsx` | Estación 01. Subir inspiración + galería de 9 estilos curados. |
| `/estilo` | `estilo/page.tsx` | Estación 03. Grid de 8 estilos fotográficos (single-select). |
| `/formato` | `formato/page.tsx` | Estación 02. Ratio (1:1, 4:5, 9:16, 16:9) + variaciones (1-10). |
| `/fabrica` | `fabrica/page.tsx` | Hub central. Grid filtrable de TODAS las versiones. FilterBar (status + producto). |
| `/fabrica/[versionId]` | `fabrica/[versionId]/page.tsx` | **Versión en PÁGINA COMPLETA** (no drawer). Detalle + galería + generar más. |
| `/analisis` | `analisis/page.tsx` | Análisis de imágenes con Oráculo. |
| `/ajustes` | `ajustes/page.tsx` | **Cuenta + Uso de créditos + Plan.** La sección "Uso" es el dashboard de créditos: saldo, consumo del mes, histórico, movimientos del `credit_ledger`. |
| `/upgrade` | `upgrade/page.tsx` | Landing de planes + "Comprar créditos" (botón **placeholder** hasta integrar Mercado Pago). |

### Proxy/Middleware (`proxy.ts`)

- Rutas públicas: `/`, `/login`, `/signup`, `/recuperar`, `/privacidad`, `/terminos`, `/onboarding`.
- Todo lo demás requiere sesión → redirect a `/login?from=<ruta>`.
- Logueados en `/login`/`/signup` → redirect a `/dashboard`.
- Usa `getUser()` (verifica JWT), nunca `getSession()`.

---

## 7. Stores (estado del cliente)

| Store | Archivo | localStorage key | Qué guarda |
|---|---|---|---|
| `NegocioProvider` | `lib/negocio/store.tsx` | `vendi:negocio` | brandName, industry, description (**ya sin apiKey**) |
| `ProductsProvider` | `lib/products/store.tsx` | `vendi:products` | Array de Product |
| `VersionsProvider` | `lib/versions/store.tsx` | `vendi:versions` | Array de Version |
| `GenerationsProvider` | `lib/generations/store.tsx` | `vendi:generations` | Generations + GeneratedImages + helpers (createGeneration, markProcessing/Completed/Failed, attachImages, getStats…) |
| `AnalysesProvider` | `lib/analyses/store.tsx` | `vendi:analyses` | Array de Analysis |
| `RecorridoProvider` | `lib/recorrido/store.tsx` | `vendi:recorrido` | productId, versionId (flujo lineal entre estaciones) |
| `GeneracionProvider` | `lib/generacion/store.tsx` | `vendi:generacion` | selectedStyleId |
| `useCreditos` | `lib/creditos/use-creditos.tsx` | — (Supabase) | Saldo de créditos + ledger (movimientos) leídos de Supabase |
| `UserProvider` | `lib/auth/use-user.tsx` | — (Supabase session) | User de Supabase Auth |

**Nota:** products, versions, generations y analyses sincronizan con Supabase. Negocio, Recorrido y Generacion son solo localStorage. Créditos lee de Supabase (saldo + ledger).

---

## 8. Componentes UI

### Sistema de diseño (Cuaderno v2 — GLASS REAL)

Identidad **Cuaderno**: paleta sage + cream + butter + clay, pill verde-oscuro profundo. Fondo del shell = gradient pastel (sage base + butter hotspot top-right). Tipografía: **Instrument Serif italic** para H1/H2/H3 y momentos editoriales; **Inter** para el chrome de UI (weight 500 default sobre el pastel).

- **Cards = GLASS REAL** (decisión 2026-06-06, revierte el sólido de Cuaderno v2): `.glass-card` y `.glass-card-compact` renderizan vidrio real (backdrop-blur 18-22px + saturate + gradient cream translúcido + highlight + sombra profunda). `.glass-strong` / `.glass` para landing pública.
- `.glass-interactive` → hover opt-in (translateY -2px). Las cards estáticas no se mueven.
- **Tokens semánticos** `--vd-*` en `:root` (ink, mute, pill, sage, clay, butter, card-cream…). Tokens viejos (`green-dark`, `champagne`, etc.) quedan como aliases.
- Radius base 12px (`--radius: 0.75rem`). Dark mode via `[data-theme="dark"]` (deep forest + cream invertido).

### Componentes clave

| Componente | Archivo | Uso |
|---|---|---|
| `Sidebar` / `BottomNav` | `components/app/` | Nav desktop / mobile |
| `Topbar` | `components/app/topbar.tsx` | Header de página |
| `StationShell` | `components/app/station-shell.tsx` | Wrapper de estaciones |
| `StyleCard` | `components/app/style-card.tsx` | Card seleccionable de estilo |
| `CreditBadge` | `components/app/credit-badge.tsx` | Badge de saldo de créditos en el chrome |
| `GeneratingOverlay` | `components/app/generating-overlay.tsx` | Overlay único de carga al generar |
| `VersionGallery` | `components/app/version-gallery.tsx` | Galería de imágenes de una versión |
| `ImageUploader` / `RatioSelector` / `NumberStepper` | `components/fabrica/` | Inputs de las estaciones |
| `VersionDrawer` / `FilterBar` / `MetricTile` / `GenerationCard` | `components/dashboard/` | Hub + dashboard |

---

## 9. Catálogo de estilos

### Estilos curados de referencia (estación Referencias) — 9 tiles de color

| ID | Label | Color |
|---|---|---|
| mineral | Mineral | #E8DFC8 |
| calido | Cálido | #B8694F |
| editorial | Editorial | #5C6B3F |
| mostaza | Mostaza | #C99A4B |
| nocturno | Nocturno | #26395A |
| pastel | Pastel | #E8B8C6 |
| mint | Mint | #9ECDB9 |
| mono | Mono | #1B1B1B |
| champagne | Champagne | #DCC59A |

### Estilos fotográficos (estación Estilo) — 8 estilos con fragment en inglés (nunca visible)

| ID | Label en UI | Descripción |
|---|---|---|
| estudio_limpio | Estudio limpio | Fondo blanco, sombra suave, foco nítido |
| cafe_de_barrio | Café de barrio | Madera, tonos tierra, luz cálida |
| lifestyle_natural | Lifestyle natural | Producto en uso, luz de día, escena real |
| color_solido | Fondo de color | Fondo vibrante sólido, estilo redes |
| editorial_premium | Editorial premium | Luz dramática lateral, sombras profundas, vibe lujo |
| cenital_flatlay | Cenital | Vista desde arriba, props ordenados |
| aire_libre | Aire libre | Exterior, luz natural de día |
| vibrante_pop | Vibrante pop | Colores saturados, contraste fuerte, energía joven |

---

## 10. Seguridad

### Lo que está implementado

- **RLS en todas las tablas**: policies `auth.uid() = user_id`. `subscriptions` y `credit_ledger` son **select-only** para el cliente (escritura solo server).
- **Créditos blindados**: `deduct_credits` / `grant_credits` son `SECURITY DEFINER` con `REVOKE EXECUTE` a `anon`/`authenticated`. Solo el server (service_role, `lib/supabase/admin.ts`) las invoca. El usuario nunca escribe su propio saldo.
- **Key de Google server-side**: `GOOGLE_API_KEY` vive en env del server, **nunca** en el browser ni commiteada. La generación corre 100% server-side.
- **Pre-check de créditos** antes de pegarle a Google (early reject 402) + reembolso de variaciones fallidas.
- **Storage policies**: cada bucket privado valida `user_id` en el path = `auth.uid()`.
- **Proxy/middleware**: `getUser()` (no `getSession()`) en cada request protegido.
- **Zod**: en inputs de forms y respuestas de Gemini.
- **Errores en español**: login, generación, créditos insuficientes.
- **Sin Anthropic SDK**: todo es Gemini.

### Lo que falta

- **Observabilidad**: Sentry/PostHog tienen campos en `.env.example` pero no están en código.
- **Entornos separados**: un solo proyecto Supabase para dev y prod. Separar antes de escalar.
- **Webhook Mercado Pago**: acreditar créditos al confirmarse el pago (ver §15).

---

## 11. API Routes (server-side)

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/generations` | POST | **Generación real** server-side (modelo de créditos): auth → versión → pre-check créditos → deduct → generar con key propia → subir a Storage → reembolsar fallidas → completed. |
| `/api/generations/[id]` | GET | Lee una generación por ID. |
| `/api/analyze` | POST | Análisis de imagen con Oráculo (Gemini Vision) server-side. |

> Ya **no** son stubs: la generación y el análisis corren en el server con la key de Vendí.

---

## 12. Agentes de desarrollo (codenames)

| Codename | Rol | Alcance |
|---|---|---|
| **Bujía** | Backend | Supabase, migraciones, RLS, Zod, créditos, integración con APIs de IA |
| **Frontero** | Frontend | Next.js 16, shadcn/ui, páginas, componentes responsive, hooks |
| **Davinci** | Estilos | Tailwind, paleta Cuaderno, glassmorphism, animaciones Motion |
| **Integral** | Integraciones | Mercado Pago, Meta Ads API, webhooks (Fase 2) |
| **Hawkeye** | Testing/QA | Vitest, Playwright, mobile, accesibilidad |

> Componentes de IA (no agentes de dev): **El Director** + **Banano** (generate-server), **Oráculo** (analyzer), **Cartero** (gemini-client).

---

## 13. Flujo del usuario (de punta a punta)

```
1. Signup (/signup) → user en Supabase Auth + trigger crea profile (+ créditos Free)
2. Mi Negocio (/mi-negocio) → perfil de marca (sin API key)
3. Nuevo Producto (/productos/nuevo) → nombre + descripción
4. Detalle Producto (/productos/[id]) → sube fotos + crea versión
5. Referencias (/referencias) → inspiración y/o estilo curado
6. Estilo (/estilo) → estilo fotográfico (opcional)
7. Formato (/formato) → ratio + variaciones
8. Generar → POST /api/generations (server, descuenta créditos)
9. Fábrica (/fabrica) → todas sus versiones; abre /fabrica/[versionId] en página completa
10. Análisis (/analisis) → Oráculo analiza cualquier imagen
11. Ajustes (/ajustes) → cuenta, uso de créditos, plan
12. Sin saldo → /upgrade → comprar créditos (Mercado Pago, pendiente)
```

---

## 14. Historial de commits (recientes)

```
abbfd0f  fix(ux): un solo indicador de carga al generar
aeb2ba1  feat(ux): 8 mejoras - glass real, contraste, fabrica en pagina, loading, fix recarga
d865502  feat(creditos): pivote completo de BYOK a modelo de créditos + fix auth
6139d81  docs: documento completo de Vendi (vision, arquitectura, codebase, estado)
d321ca5  fix(seguridad): limpieza de codigo muerto + mejor error de billing
1afa089  feat(ajustes): UI minima con Correo + Plan + CTA upgrade
d1880ac  fix(ai): strings exactos de Gemini 3.1 segun doc oficial
dab8d38  feat(ai): upgrade modelos (Gemini 3 Pro + Nano Banana 2) + Director migrado a Gemini
ec915ec  feat(generator): persistir finalPrompt + enforce aspect ratio con canvas
be78177  feat(estilo): catalogo de estilos + picker + identity guard reforzado
```

---

## 15. Lo que falta / en lo que estoy (2026-06-06)

### Prioridad alta

1. **Mercado Pago (cobro real)**: el botón "Comprar créditos" en `/upgrade` es placeholder. Falta integrar el pago + **webhook** que acredita créditos vía `grant_credits` (reason `purchase`/`subscription_grant`). Las columnas `culqi_*` en `subscriptions` (nombre legacy) se reusan. **Esperando verificación de la cuenta de Mercado Pago.** (Culqi y Yape descartados.)
2. **Validar la CALIDAD de las imágenes**: que el producto salga fiel y el estilo profesional, en producción real.
3. **Mostrar a dueños de negocio reales** para validar demanda.

### Prioridad media

4. **Brand profile no alimenta al Director**: el system prompt del Director es fijo. No lee paleta/tono/do's-don'ts del perfil de marca. El diferencial "IA que aprende tu marca" no está implementado.
5. **enriched_prompt descartado**: El Director devuelve JSON rico (scene_description, lighting, composition, mood, props, color_palette, camera_angle) pero solo se usa `final_prompt`. Persistir el resto desbloquearía metadata visual.
6. **Prompt estricto (CONSTRUIDO + reconciliado 2026-07-02)**: regeneración por imagen. `POST /api/generations/regenerate` (imageId + strictPrompt) cobra 1 crédito y genera 1 variación con el texto del usuario como especificación **AUTORITATIVA**. Se saltea el Director, pero **MANTIENE producto + referencias de escena + estilo elegido**; el texto del usuario gana solo en conflicto y la identidad del producto queda blindada (dos candados). Ver `generateOnServer({ strictPrompt })`.
7. **Fusionar Referencias + Estilo** en una sola pantalla (decisión de producto; el código aún tiene rutas separadas).
8. **Style persistence en Supabase**: el estilo elegido vive solo en localStorage; falta columna `style_id` en `versions`.

### Prioridad baja / deuda

9. **Comentarios stale en `gemini-client.ts`**: dicen "BYOK" y referencian archivos borrados (`validate-key.ts`, `art-director.ts`).
10. **`GEMINI_PING_MODEL` sin uso**: era el Portero (validación de key BYOK). Eliminado el flujo, quedó la constante.
11. **rate_limit vs sin saldo**: Google devuelve 429 para ambos; el mensaje no distingue la causa con certeza.
12. **Observabilidad + entornos separados** (ver §10).

---

## 16. Estructura de archivos (resumen)

```
vendiapp/vendi/
├── app/
│   ├── page.tsx                          # Redirect dashboard/login
│   ├── layout.tsx                        # Root layout (fonts, theme, Toaster)
│   ├── globals.css                       # Sistema de diseño Cuaderno v2 (glass real)
│   ├── onboarding/page.tsx
│   ├── (auth)/{login,signup,recuperar,recuperar/nueva}/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                    # Shell: AppProviders + Sidebar + BottomNav
│   │   ├── dashboard/page.tsx
│   │   ├── mi-negocio/page.tsx           # Perfil de marca (sin API key)
│   │   ├── productos/{page,nuevo}/...     # + [id] + [id]/versiones/[versionId]
│   │   ├── referencias/ estilo/ formato/  # Estaciones 01 / 03 / 02
│   │   ├── fabrica/page.tsx              # Hub
│   │   ├── fabrica/[versionId]/page.tsx  # Versión en página completa
│   │   ├── analisis/page.tsx
│   │   ├── ajustes/page.tsx              # Cuenta + Uso (créditos) + Plan
│   │   └── upgrade/page.tsx              # Planes + comprar créditos (placeholder)
│   └── api/
│       ├── generations/route.ts          # POST — generación server-side real
│       ├── generations/[id]/route.ts     # GET
│       └── analyze/route.ts              # POST — análisis (Oráculo)
├── components/
│   ├── app/      # sidebar, bottom-nav, topbar, station-shell, style-card,
│   │             # app-providers, credit-badge, generating-overlay, version-gallery
│   ├── dashboard/ # cards, metric-tile, filter-bar, version-drawer, sparkline, etc.
│   ├── fabrica/  # image-uploader, mood-card, number-stepper, ratio-selector, selectable-chip
│   └── ui/       # shadcn base
├── lib/
│   ├── ai/
│   │   ├── gemini-client.ts              # Cartero — cliente REST Gemini
│   │   ├── generate-server.ts            # El Director + Banano (motor server-side)
│   │   └── image-analyzer.ts             # Oráculo (Gemini 2.5 Flash)
│   ├── creditos/use-creditos.tsx         # Saldo + ledger desde Supabase
│   ├── negocio/store.tsx                 # Perfil de marca (sin apiKey)
│   ├── products/ versions/ generations/ analyses/ generacion/ recorrido/  # stores
│   ├── auth/use-user.tsx
│   ├── supabase/{client,server,storage,admin}.ts   # admin = service_role
│   ├── validations/{generations,recorrido}.ts
│   ├── styles.ts                         # 8 estilos fotográficos
│   ├── constants.ts                      # APP_NAME, PLANS, FREE_PLAN_CREDITS, OUTPUT_RATIOS…
│   └── utils.ts
├── supabase/migrations/0001…0007.sql
├── types/database.ts
├── proxy.ts                              # Middleware (auth + cookie refresh)
└── .env.example
```

> **Eliminados en el pivote a créditos:** `lib/ai/art-director.ts`, `lib/ai/image-generator.ts`, `lib/ai/validate-key.ts` (consolidados en `generate-server.ts` / ya no se valida key de usuario).

---

## 17. Dependencies (package.json)

```json
{
  "@base-ui/react": "^1.4.1",
  "@hookform/resolvers": "^5.2.2",
  "@supabase/ssr": "^0.10.3",
  "@supabase/supabase-js": "^2.105.4",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "lucide-react": "^1.14.0",
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
# --- Supabase (DB + Auth + Storage) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Google Gemini (modelo de CRÉDITOS: key PROPIA de Vendí, server-side) ---
GOOGLE_API_KEY=

# --- Observabilidad (opcional en MVP) ---
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# --- Mercado Pago (pasarela de pago — Perú/soles). Pendiente de credenciales (cuenta en verificación) ---
# MERCADOPAGO_PUBLIC_KEY=
# MERCADOPAGO_ACCESS_TOKEN=
# MERCADOPAGO_WEBHOOK_SECRET=

# --- Fase 2 ---
# META_ADS_APP_ID=
# META_ADS_APP_SECRET=
```

---

*Documento actualizado el 6 de junio de 2026. Refleja el estado del código en commit `abbfd0f` (branch `main`) — modelo de CRÉDITOS server-side.*
