# Vendí — Documento completo

**Fecha:** 27 de mayo de 2026
**Autor:** Paolo Nieto (founder)
**Repo:** github.com/PaoNieto/Vendiapp
**Branch activo:** `main` @ `d321ca5`
**Supabase project:** `njmoxdaxzzllowoudgv` (workspace Jidoka)

---

## 1. Qué es Vendí

Vendí es un generador de fotografía de producto con IA para PYMEs de Latinoamérica. El usuario sube fotos de su producto, elige un estilo visual y un formato, y la app genera variaciones fotográficas profesionales listas para ecommerce, redes sociales y publicidad — sin sesión de fotos, sin diseñador, sin Photoshop.

**Tagline:** "Tu producto, en cualquier escenario, sin sesión de fotos."

**Público objetivo:** Emprendedoras y PYMEs latinas que venden en Instagram, Shopify, Mercado Libre, TikTok Shop. No saben de prompts, no saben de IA, pero necesitan fotos que vendan.

---

## 2. Modelo de negocio

### BYOK (Bring Your Own Key)

Vendí NO absorbe costos de IA. Cada usuario pega su propia API key de Google AI Studio en la sección "Mi Negocio". Las llamadas a Gemini se hacen desde el browser del usuario directamente a Google — nunca pasan por el server de Vendí.

- El usuario paga directamente a Google por su consumo.
- Vendí no tiene sistema de créditos.
- La key se guarda en `localStorage` del browser, no en Supabase ni en ningún server.

### Planes

Solo dos planes: **Free** y **Pro**.

- Las features, precios y comparaciones viven en una landing `/upgrade` (no construida todavía), NO dentro de la app.
- La app solo muestra el plan actual + un botón "Subir a Pro".
- El plan está hardcodeado como `"free"` hasta que se integre Stripe.

### Revenue (futuro)

Stripe subscriptions. No implementado. Cuando se construya, lo maneja el agente Integral (integraciones).

---

## 3. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript estricto (sin `any`) |
| UI | shadcn/ui + Tailwind CSS + Framer Motion |
| Auth | Supabase Auth (email/password) |
| Base de datos | Supabase (PostgreSQL) |
| Storage | Supabase Storage (5 buckets) |
| IA — Generación de imágenes | Gemini 3.1 Flash Image (Nano Banana 2) |
| IA — Director de arte | Gemini 3.1 Pro |
| IA — Análisis de imagen | Gemini 3.1 Pro (Oráculo) |
| IA — Validación de key | Gemini 3 Flash (Portero) |
| Validación | Zod |
| Hosting | No desplegado todavía |

### Modelos de Gemini (strings exactos)

```
GEMINI_REASONING_MODEL = "gemini-3.1-pro-preview"    → Oráculo + El Director
GEMINI_PING_MODEL      = "gemini-3-flash-preview"     → Portero
GEMINI_IMAGE_MODEL     = "gemini-3.1-flash-image-preview" → Banano (Nano Banana 2)
```

---

## 4. Arquitectura de componentes de IA (codenames)

Cada componente de IA tiene un codename G.I. Joe:

| Codename | Archivo | Modelo | Función |
|---|---|---|---|
| **Banano** (image-generator) | `lib/ai/image-generator.ts` | Nano Banana 2 | Genera N variaciones de imagen en paralelo. Recibe prompt armado + imágenes de producto + referencias. Devuelve dataURLs base64. |
| **El Director** (art-director) | `lib/ai/art-director.ts` | Gemini 3.1 Pro | Sintetiza un prompt enriquecido en JSON a partir de fotos de producto + referencias + ratio. Devuelve `final_prompt` en inglés listo para Banano. |
| **Oráculo** (image-analyzer) | `lib/ai/image-analyzer.ts` | Gemini 3.1 Pro | Analiza una imagen subida por el usuario. Devuelve composición, iluminación, por qué vende, y estilos identificados. |
| **Portero** (validate-key) | `lib/ai/validate-key.ts` | Gemini 3 Flash | Valida que la API key del usuario funcione haciendo un ping barato. |
| **Cartero** (gemini-client) | `lib/ai/gemini-client.ts` | — | Cliente HTTP compartido. Llama a la REST API de Google sin SDK. Maneja errores tipados (rate_limit, invalid_key, content_blocked, network, unknown). |

### Flujo de generación (cómo Banano y El Director trabajan juntos)

```
1. Usuario clickea "Generar" en Fábrica o detalle de versión
2. image-generator.ts recibe: apiKey, product, version, styleFragment
3. Llama a El Director (art-director.ts) con las imágenes + ratio
   → Si funciona: usa enriched.final_prompt como base
   → Si falla: fallback a buildPromptFromBrief(version) (prompt local)
4. Arma el prompt final concatenando:
   a. Role split: "Las primeras N imágenes son el PRODUCTO... Las siguientes son REFERENCIAS..."
   b. Prompt base (del Director o local)
   c. Style fragment (si el usuario eligió un estilo)
   d. Instrucción de ratio
   e. "Produce one photorealistic..."
   f. IDENTITY_GUARD en mayúsculas al final
5. Dispara N llamadas en paralelo (Promise.allSettled) a Nano Banana
6. Enforce aspect ratio con Canvas (cover crop a dimensiones exactas)
7. Retorna { images, failures, finalPrompt }
8. finalPrompt se persiste en generated_images.strict_prompt
```

### Prompt concatenation pattern

El prompt final que llega a Nano Banana tiene esta estructura:

```
"The first {N} image(s) show the PRODUCT — preserve EXACTLY...
The remaining {M} image(s) are STYLE references only — extract aesthetic...

{prompt base del Director o buildPromptFromBrief}

Style direction: {fragment del estilo elegido}

Output one {ratio} image...

PRESERVE EXACTLY THE PRODUCT SHOWN IN THE FIRST REFERENCE IMAGE:
same shape, same colors, same packaging, same label text, same proportions.
THE STYLE REFERENCES CONTRIBUTE AESTHETIC ONLY — THEY MUST NEVER REPLACE
OR ALTER THE PRODUCT ITSELF."
```

---

## 5. Base de datos (Supabase)

### Tablas

| Tabla | Propósito | RLS |
|---|---|---|
| `profiles` | Extiende auth.users. username, display_name, avatar, plan, credits. Trigger auto-create on signup. | select/update own |
| `projects` | Los "productos" del usuario (nombre, descripción, product_images). | all own |
| `versions` | Campañas creativas dentro de un producto. Tiene reference_images, output_ratio, variations_default, user_prompt. | all own |
| `generations` | Cada tanda de generación. Status (pending/processing/completed/failed), product_images, reference_images, enriched_prompt, output_ratio. | all own |
| `generated_images` | Cada imagen individual generada. image_url, variation_index, strict_prompt, user_rating, is_favorite, is_downloaded. | select/update/insert own |
| `analyses` | Análisis de imágenes con Oráculo. composition, lighting, why_it_sells, identified_styles. | all own |
| `starter_references` | Galería curada por Vendí (pública). category, image_url, tags. | select public |

### Storage Buckets

| Bucket | Acceso | Uso |
|---|---|---|
| `product-uploads` | Privado (owner) | Fotos de producto subidas por el usuario |
| `references-uploads` | Privado (owner) | Imágenes de referencia visual |
| `generated-images` | Privado (owner) | Imágenes generadas por Banano |
| `analysis-uploads` | Privado (owner) | Imágenes subidas para análisis con Oráculo |
| `starter-references` | Público (lectura) | Galería curada por el equipo Vendí |

### Migraciones (6)

```
0001_initial_schema.sql    → profiles, projects, generations, generated_images, starter_references + RLS + triggers
0002_add_product_images.sql → product_images jsonb en projects
0003_versions.sql           → tabla versions + version_id en generations
0004_generated_image_strict_prompt.sql → strict_prompt en generated_images
0005_analyses.sql           → tabla analyses
0006_storage_buckets.sql    → 5 buckets + storage policies
```

---

## 6. Páginas de la app

### Autenticación (`app/(auth)/`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/login` | `login/page.tsx` | Login con email/password. Errores de Supabase traducidos a español (ej: "Email o contraseña incorrectos"). Redirect a `/dashboard` post-login. |
| `/signup` | `signup/page.tsx` | Registro con email/password. |
| `/` | `app/page.tsx` | Redirect: si hay sesión → `/dashboard`, si no → `/login`. |

### App autenticada (`app/(app)/`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | Pantalla principal. Saludo personalizado por hora ("Buenos días, Paolo"). 4 metric tiles (imágenes este mes, descargas, productos activos, tiempo ahorrado). Workflow chips (Producto → Referencias → Formato → Versión). Timeline de actividad reciente. Grid de generaciones recientes. Skeleton loading. Mock data si no hay data real. |
| `/mi-negocio` | `mi-negocio/page.tsx` | Perfil de marca (nombre, rubro, descripción) + API key de Google AI Studio con botón Validar. La key se guarda en localStorage, no en server. Link a aistudio.google.com para obtener key gratis. |
| `/productos` | `productos/page.tsx` | Catálogo de productos. Grid responsive (1/2/3/4 cols). Cada card: foto hero + nombre italic + conteo de generaciones + última actividad. Empty state con CTA. |
| `/productos/nuevo` | `productos/nuevo/page.tsx` | Formulario para crear producto (nombre + descripción). Validación Zod. |
| `/productos/[id]` | `productos/[id]/page.tsx` | Detalle del producto. Fotos, versiones, botón "+ Nueva Versión". |
| `/productos/[id]/versiones/[versionId]` | `versiones/[versionId]/page.tsx` | Detalle de versión. Muestra config (refs, ratio, variaciones). HeroCTA "Generar primera tanda". Galería de imágenes generadas. Botón "Generar más". |
| `/referencias` | `referencias/page.tsx` | Estación 01. Subir inspiración propia (hasta 5) + galería de 9 estilos curados (Mineral, Cálido, Editorial, Mostaza, Nocturno, Pastel, Mint, Mono, Champagne). |
| `/estilo` | `estilo/page.tsx` | Estación 03. Grid de 8 estilos fotográficos seleccionables (Estudio limpio, Café de barrio, Lifestyle natural, Fondo de color, Editorial premium, Cenital, Aire libre, Vibrante pop). Single-select toggle. |
| `/formato` | `formato/page.tsx` | Estación 02. Selector de ratio (1:1, 4:5, 9:16, 16:9) + stepper de variaciones (1-10). |
| `/fabrica` | `fabrica/page.tsx` | Hub central. Grid filtrable de TODAS las versiones. FilterBar (status + producto). Cards con status badge + estilo curado + ratio. Click abre VersionDrawer con detalle + galería + botón "Generar más". |
| `/analisis` | `analisis/page.tsx` | Análisis de imágenes con IA (Oráculo). Subir imagen → Gemini Vision analiza composición, iluminación, por qué vende, estilos. Historial persistido en Supabase. 3 estados: galería, creando, viendo. |
| `/ajustes` | `ajustes/page.tsx` | Correo (read-only) + plan actual (Free/Pro badge) + CTA "Subir a Pro" (apunta a `/upgrade`, no construido). |

### Proxy/Middleware (`proxy.ts`)

- Rutas públicas: `/`, `/login`, `/signup`, `/privacidad`, `/terminos`, `/onboarding`.
- Todo lo demás requiere sesión → redirect a `/login?from=<ruta-original>`.
- Usuarios logueados en `/login` o `/signup` → redirect a `/dashboard`.
- Refresh de cookies de Supabase en cada request.
- Usa `getUser()` (verifica JWT contra Supabase), nunca `getSession()` (inseguro).

---

## 7. Stores (estado del cliente)

Todos los stores siguen el mismo patrón: Context + Provider + localStorage hydration. Se montan en `AppProviders`.

| Store | Archivo | localStorage key | Qué guarda |
|---|---|---|---|
| `NegocioProvider` | `lib/negocio/store.tsx` | `vendi:negocio` | brandName, industry, description, apiKey, apiKeyValidated |
| `ProductsProvider` | `lib/products/store.tsx` | `vendi:products` | Array de Product (+ helpers: getById, getRecent, seedDevData) |
| `VersionsProvider` | `lib/versions/store.tsx` | `vendi:versions` | Array de Version (+ helpers: getById, duplicateVersion, updateVersion) |
| `GenerationsProvider` | `lib/generations/store.tsx` | `vendi:generations` | Array de Generation + Array de GeneratedImage (+ helpers: createGeneration, markProcessing/Completed/Failed, attachImages, getStats, getRecent, getByVersionId) |
| `AnalysesProvider` | `lib/analyses/store.tsx` | `vendi:analyses` | Array de Analysis |
| `RecorridoProvider` | `lib/recorrido/store.tsx` | `vendi:recorrido` | productId, versionId (estado del flujo lineal entre estaciones) |
| `GeneracionProvider` | `lib/generacion/store.tsx` | `vendi:generacion` | selectedStyleId (estilo elegido en la estación Estilo) |
| `UserProvider` | `lib/auth/use-user.tsx` | — (Supabase session) | User de Supabase Auth |

**Nota:** Los stores principales (products, versions, generations, analyses) sincronizan con Supabase. NegocioProvider, RecorridoProvider y GeneracionProvider son solo localStorage.

---

## 8. Componentes UI

### Sistema de diseño (Cuaderno theme)

- **Glass cards**: `glass-card`, `glass-card-compact`, `glass-strong` — glassmorphism con backdrop-blur.
- **PillButton**: botón redondeado pill con variantes de tamaño (sm, md, lg).
- **Tipografía**: `display-serif` (Georgia italic), `eyebrow` (uppercase tracking-wide).
- **Colores**: tokens CSS custom `--vd-pill-bg`, `--vd-pill-fg`, `--vd-sage`, `--vd-clay`, `--vd-butter`, etc.
- **Thumbnails**: 7 tonos (sage, butter, paper, clay, mineral, editorial, champagne).
- **StatusBadge**: estados pending, completed con iconos.

### Componentes clave

| Componente | Archivo | Uso |
|---|---|---|
| `StationShell` | `components/app/station-shell.tsx` | Wrapper de estaciones (número, título, descripción, nav prev/next) |
| `StyleCard` | `components/app/style-card.tsx` | Card seleccionable de estilo con Framer Motion hover/tap |
| `Sidebar` | `components/app/sidebar.tsx` | Navegación desktop |
| `BottomNav` | `components/app/bottom-nav.tsx` | Navegación mobile |
| `Topbar` | `components/app/topbar.tsx` | Header de página con título + subtitle + slot derecho |
| `ImageUploader` | `components/fabrica/image-uploader.tsx` | Drag & drop / click to upload, multi-imagen |
| `RatioSelector` | `components/fabrica/ratio-selector.tsx` | 4 cards de ratio con preview proporcional |
| `NumberStepper` | `components/fabrica/number-stepper.tsx` | Stepper (- N +) para variaciones |
| `VersionDrawer` | `components/dashboard/version-drawer.tsx` | Drawer lateral con detalle de versión + galería + acciones |
| `FilterBar` | `components/dashboard/filter-bar.tsx` | Filtro por status + producto para la Fábrica |
| `MetricTile` | `components/dashboard/metric-tile.tsx` | Tile de KPI con sparkline |
| `GenerationCard` | `components/dashboard/generation-card.tsx` | Card de generación con thumbnail + status |
| `ActivityTimeline` | `components/dashboard/activity-timeline.tsx` | Timeline de eventos recientes |

---

## 9. Catálogo de estilos

### Estilos curados de referencia (estación Referencias)

9 tiles de color sólido que el usuario puede seleccionar como referencia visual:

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

### Estilos fotográficos (estación Estilo)

8 estilos con fragment en inglés para el prompt (nunca visible al usuario):

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

- **RLS en todas las tablas**: profiles, projects, versions, generations, generated_images, analyses, starter_references. Policies `auth.uid() = user_id`.
- **Storage policies**: cada bucket privado valida que el `user_id` en el path coincida con `auth.uid()`.
- **Proxy/middleware**: verifica JWT con `getUser()` (no `getSession()`) en cada request protegido.
- **API key BYOK**: la key del usuario nunca pasa por el server de Vendí. Va directo del browser a Google.
- **.env.local en .gitignore**: secrets nunca commiteados.
- **Zod validation**: en inputs de formularios y respuestas de Gemini.
- **Errores en español**: login, generación, validación de key — todos traducidos a mensajes legibles.
- **Anthropic SDK eliminado**: no queda dependencia ni endpoint de Claude. Todo migrado a Gemini.

### Lo que falta

- **Observabilidad**: Sentry y PostHog tienen campos en `.env.example` pero no están implementados en código.
- **Entornos separados**: un solo proyecto Supabase para dev y prod. Necesita separarse antes de lanzar.

---

## 11. API Routes (server-side)

Solo 2 rutas activas:

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/generations` | POST | Stub — TODO: orquestación real con Supabase + art-director + image-generator |
| `/api/generations/[id]` | GET | Lee una generación por ID |

**Nota:** La generación real ocurre 100% en el browser (BYOK). Estos endpoints son stubs para cuando se quiera agregar orquestación server-side.

---

## 12. Agentes de desarrollo (codenames)

El equipo de agentes de IA que construyen Vendí:

| Codename | Rol | Alcance |
|---|---|---|
| **Bujía** | Backend | Supabase, migraciones, RLS, validaciones Zod, integración con APIs de IA |
| **Frontero** | Frontend | Next.js 15, shadcn/ui, páginas, componentes responsive, hooks |
| **Davinci** | Estilos | Tailwind config, paleta, glassmorphism, animaciones Framer Motion |
| **Integral** | Integraciones | Stripe, Meta Ads API, webhooks (Fase 2) |
| **Hawkeye** | Testing/QA | Vitest, Playwright, verificación mobile, accesibilidad |

---

## 13. Flujo del usuario (de punta a punta)

```
1. Signup (/signup) → se crea user en Supabase Auth + trigger crea profile
2. Mi Negocio (/mi-negocio) → pega API key de Google + perfil de marca
3. Nuevo Producto (/productos/nuevo) → nombre + descripción
4. Detalle Producto (/productos/[id]) → sube fotos del producto + crea versión
5. Referencias (/referencias) → sube inspiración y/o elige estilo curado
6. Estilo (/estilo) → elige estilo fotográfico (opcional)
7. Formato (/formato) → elige ratio (1:1, 4:5, 9:16, 16:9) + variaciones (1-10)
8. Detalle Versión (/productos/[id]/versiones/[versionId]) → "Generar primera tanda"
9. Fábrica (/fabrica) → ve todas sus versiones, filtra, abre drawer, genera más
10. Análisis (/analisis) → sube cualquier imagen y Oráculo la analiza
11. Ajustes (/ajustes) → ve su correo y plan
```

---

## 14. Historial de commits

```
d321ca5  fix(seguridad): limpieza de codigo muerto + mejor error de billing
1afa089  feat(ajustes): UI minima con Correo + Plan + CTA upgrade
d1880ac  fix(ai): strings exactos de Gemini 3.1 segun doc oficial
dab8d38  feat(ai): upgrade modelos (Gemini 3 Pro + Nano Banana 2) + Director migrado a Gemini
ec915ec  feat(generator): persistir finalPrompt + enforce aspect ratio con canvas
be78177  feat(estilo): catalogo de estilos + picker + identity guard reforzado
bf610c2  feat(storage): mover imagenes a Supabase Storage (no mas dataURLs en DB)
a56ecef  fix(dashboard): saludo + avatar usan display_name del user (no brandName)
96758cc  fix(ui): avatar circle usa display_name del user auth (no brandName)
758df62  feat(stores): migrar los 4 stores de localStorage a Supabase
8f9ac08  feat(auth): Supabase Auth + middleware + useUser hook
42b9850  feat(vendi): dashboard Cuaderno + Analisis con IA + Gemini real
a2f52d7  feat(vendi): rebrand global + modelo productos/versiones + Fabrica como hub
181757f  feat(fabrica): implementar las 5 estaciones del brief
3b6e16d  merge: consolidar borrador de Fabrica Creativa desde worktree
ff83a52  feat(borrador): stores de estado + pestana Mi Negocio funcional
43c8097  feat(borrador): arquitectura Fabrica Creativa con 5 estaciones + sidebar nueva
ed6db66  feat: app completa con stubs listos para conectar Supabase + IA
5330887  chore: setup inicial de Vendi
```

---

## 15. Lo que NO existe todavía (gaps conocidos)

### Prioridad alta (antes de lanzar)

1. **Entornos separados**: crear segundo proyecto Supabase para dev.
2. **Observabilidad**: implementar Sentry (errores) + PostHog (analytics).
3. **Landing /upgrade**: la ruta no existe. El CTA en Ajustes da 404.
4. **Stripe/subscriptions**: no hay tabla `subscriptions`, no hay webhook, no hay customer portal.
5. **Verificar Nano Banana 2**: el string `gemini-3.1-flash-image-preview` no se ha validado end-to-end (bloqueado por saldo PEN 0.00 en la cuenta de Google del founder).

### Prioridad media (funcionalidad)

6. **Brand profile no alimenta al Director**: El Director tiene un system prompt fijo. No lee paleta, tono ni do's/don'ts del perfil de marca. El diferencial "IA que aprende tu marca" no está implementado.
7. **enriched_prompt descartado**: El Director devuelve un JSON rico (scene_description, lighting, composition, mood, props, color_palette, camera_angle) pero solo se usa `final_prompt`. Persistir el resto en `generations.enriched_prompt` desbloquearía metadata visual en galería.
8. **UI de prompt estricto**: el backend lo soporta (`strict_prompt` ya se persiste por imagen), falta el toggle + textarea + botón regenerar en la Fábrica.
9. **Fusionar Referencias + Estilo**: decisión de producto es que sean una sola pantalla. El código todavía tiene rutas separadas.
10. **Eliminar /prompt**: la ruta `/prompt` no debería existir per decisión de producto.
11. **Style persistence en Supabase**: el estilo elegido solo vive en localStorage. Falta columna `style_id` en tabla `versions`.

### Prioridad baja (polish)

12. **Error rate_limit vs sin saldo**: Google devuelve HTTP 429 para ambos. El mensaje ahora menciona "revisá tu billing" pero no puede distinguir la causa con certeza.
13. **Comprimir imágenes antes de enviar**: las fotos se mandan en base64 sin comprimir a Gemini. Si el usuario sube >5MB, es lento.
14. **Landing pública**: la home (`/`) solo redirige. No hay landing de marketing.
15. **Recuperar contraseña**: el link "Olvidé mi contraseña" en login apunta a `/recuperar` que no existe.

---

## 16. Estructura de archivos

```
vendiapp/vendi/
├── app/
│   ├── page.tsx                          # Home — redirect a dashboard o login
│   ├── layout.tsx                        # Root layout (fonts, theme, Toaster)
│   ├── onboarding/page.tsx               # Onboarding (stub)
│   ├── (auth)/
│   │   ├── layout.tsx                    # Layout centrado para auth
│   │   ├── login/page.tsx                # Login
│   │   └── signup/page.tsx               # Signup
│   ├── (app)/
│   │   ├── layout.tsx                    # Shell: AppProviders + Sidebar + BottomNav
│   │   ├── dashboard/page.tsx            # Dashboard principal
│   │   ├── mi-negocio/page.tsx           # Perfil de marca + API key
│   │   ├── productos/
│   │   │   ├── page.tsx                  # Catálogo de productos
│   │   │   ├── nuevo/page.tsx            # Crear producto
│   │   │   └── [id]/
│   │   │       ├── page.tsx              # Detalle de producto
│   │   │       └── versiones/
│   │   │           └── [versionId]/page.tsx  # Detalle de versión + generar
│   │   ├── referencias/page.tsx          # Estación 01 — refs + estilos curados
│   │   ├── estilo/page.tsx               # Estación 03 — estilos fotográficos
│   │   ├── formato/page.tsx              # Estación 02 — ratio + variaciones
│   │   ├── fabrica/page.tsx              # Hub de versiones (inbox)
│   │   ├── analisis/page.tsx             # Análisis con IA (Oráculo)
│   │   └── ajustes/page.tsx              # Correo + Plan + CTA upgrade
│   └── api/
│       └── generations/
│           ├── route.ts                  # POST — stub
│           └── [id]/route.ts             # GET — lee generación
├── components/
│   ├── app/                              # Componentes de la app
│   │   ├── app-providers.tsx             # Árbol de providers
│   │   ├── bottom-nav.tsx                # Nav mobile
│   │   ├── sidebar.tsx                   # Nav desktop
│   │   ├── station-shell.tsx             # Wrapper de estaciones
│   │   ├── style-card.tsx                # Card de estilo seleccionable
│   │   └── topbar.tsx                    # Header de página
│   ├── dashboard/                        # Componentes del dashboard
│   │   ├── index.ts                      # Barrel export
│   │   ├── activity-timeline.tsx
│   │   ├── avatar-circle.tsx
│   │   ├── filter-bar.tsx
│   │   ├── generation-card.tsx
│   │   ├── metric-tile.tsx
│   │   ├── pill-button.tsx
│   │   ├── product-card.tsx
│   │   ├── sparkline.tsx
│   │   ├── status-badge.tsx
│   │   ├── theme-toggle.tsx
│   │   ├── thumbnail.tsx
│   │   ├── version-card.tsx
│   │   ├── version-drawer.tsx
│   │   └── workflow-chip.tsx
│   ├── fabrica/                          # Componentes de estaciones
│   │   ├── index.ts
│   │   ├── image-uploader.tsx
│   │   ├── mood-card.tsx
│   │   ├── number-stepper.tsx
│   │   ├── ratio-selector.tsx
│   │   └── selectable-chip.tsx
│   └── ui/                               # shadcn/ui base
│       ├── avatar.tsx, badge.tsx, button.tsx, card.tsx, dialog.tsx,
│       │   dropdown-menu.tsx, input.tsx, label.tsx, progress.tsx,
│       │   separator.tsx, skeleton.tsx, sonner.tsx, tabs.tsx,
│       │   textarea.tsx, tooltip.tsx
├── lib/
│   ├── ai/
│   │   ├── gemini-client.ts              # Cartero — cliente REST Gemini
│   │   ├── image-generator.ts            # Banano — generador de imágenes
│   │   ├── art-director.ts               # El Director — sintetizador de prompt
│   │   ├── image-analyzer.ts             # Oráculo — analizador de imágenes
│   │   └── validate-key.ts               # Portero — validador de API key
│   ├── negocio/store.tsx                 # Store: perfil + API key
│   ├── products/store.tsx                # Store: productos
│   ├── versions/store.tsx                # Store: versiones
│   ├── generations/
│   │   ├── store.tsx                     # Store: generaciones + imágenes
│   │   └── format.ts                     # formatRelativeTime helper
│   ├── generacion/store.tsx              # Store: estilo seleccionado
│   ├── analyses/store.tsx                # Store: análisis
│   ├── recorrido/
│   │   ├── store.tsx                     # Store: estado del flujo
│   │   └── build-prompt.ts              # Prompt scaffold local (fallback)
│   ├── auth/use-user.tsx                 # Hook: usuario de Supabase
│   ├── supabase/
│   │   ├── client.ts                     # Browser client
│   │   ├── server.ts                     # Server client
│   │   └── storage.ts                    # Helpers de Storage
│   ├── validations/
│   │   ├── generations.ts                # Schemas Zod (enrichedPromptSchema, etc.)
│   │   └── recorrido.ts                  # isVersionReady validator
│   ├── styles.ts                         # Catálogo de 8 estilos fotográficos
│   ├── constants.ts                      # APP_NAME, OUTPUT_RATIOS, PLANS, etc.
│   └── utils.ts                          # cn() helper
├── supabase/
│   ├── migrations-combined.sql           # Schema completo consolidado
│   └── migrations/
│       ├── 0001_initial_schema.sql
│       ├── 0002_add_product_images.sql
│       ├── 0003_versions.sql
│       ├── 0004_generated_image_strict_prompt.sql
│       ├── 0005_analyses.sql
│       └── 0006_storage_buckets.sql
├── types/
│   └── database.ts                       # Tipos TS para tablas de Supabase
├── proxy.ts                              # Middleware (auth guard + cookie refresh)
├── package.json                          # Dependencies
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── .env.example                          # Template de variables de entorno
└── .gitignore
```

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
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Gemini (ya no se usa server-side — BYOK)
# GEMINI_API_KEY=

# Observabilidad (no implementado todavía)
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# Fase 2
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
# META_ADS_APP_ID=
# META_ADS_APP_SECRET=
```

---

*Documento generado el 27 de mayo de 2026. Refleja el estado del código en commit `d321ca5` (branch `main`).*
