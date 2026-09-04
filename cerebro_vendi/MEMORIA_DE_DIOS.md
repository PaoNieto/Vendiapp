# 🟢 MEMORIA DE DIOS — Vendí (archivo único canónico)

> **Esta es la ÚNICA memoria del proyecto Vendí.** Reemplaza a las 27 memorias fragmentadas + el viejo `MEMORY.md` (consolidados el 2026-06-25).
>
> **REGLAS DE MANTENIMIENTO (override del comportamiento por defecto de memoria):**
> - 🔄 **ACTUALIZAR EN CADA SESIÓN — OBLIGATORIO.** En toda sesión donde se haga trabajo (decisiones, deploys, cambios de estado de git, features, fixes), actualizá este archivo con lo que cambió ANTES de cerrar. No es opcional ni hay que esperar a que Paolo lo pida: es el comportamiento por defecto. Cada sesión que se abre, lee esto; cada sesión que hace algo, lo deja actualizado.
> - **La memoria de Vendí son DOS archivos y nada más:** este (`MEMORIA_DE_DIOS.md`, proyecto) + `MINIONS.md` (agentes). **NO crear ningún otro archivo de memoria** (ni `MEMORY.md`, ni por-hecho). Si hay algo nuevo del proyecto, editá acá; si es de los agentes, editá `MINIONS.md`.
> - **Esos dos son lo ÚNICO que se carga como memoria.** NO son memoria ni se cargan: `VENDI_DOC.md`, `CONTEXTO_VENDI.md`, el "contexto canónico", ni los volcados de `CLAUDE.md`/`AGENTS.md`. Si Paolo ve que aparece alguno de esos en el arranque, hay que sacarlo del hook.
> - Ruta absoluta fija de la carpeta: `C:\Users\Usuario\vendiapp\vendi\cerebro_vendi\` (DENTRO del repo de Vendí). Leer/escribir SIEMPRE acá, ignorando cualquier otra carpeta de memoria (la vieja `.claude\projects\…\memory`, worktrees, o la padre `vendiapp`). **Toda la memoria de Vendí estuvo, está y estará SOLO en `cerebro_vendi`.**
> - El hook SessionStart (`vendi-context.ps1`) inyecta los DOS archivos al arrancar la sesión principal. Los subagentes NO lo reciben → deben `Read` ambos por ruta absoluta antes de actuar.
> - Al actualizar: convertí fechas relativas a absolutas, marcá decisiones REVERTIDAS/DESCARTADAS sin borrar el contexto, y no dupliques.

Última actualización: **2026-08-22**.

---

## 1. QUIÉN ES PAOLO + CÓMO TRABAJAR CON ÉL

**Paolo** — founder y dev solo de **Vendí**. Email `paolonietoc@gmail.com`. Sede Perú, cuenta Google AI Studio en PEN. Construye en español (rioplatense/Latam mix; acepta inglés en código, pero UI y conversación en español) para **PYME de Latam** no tech-savvy (cafeterías, ropa indie, cosmética, ferretería).

### Nivel de lenguaje (2026-06-25 — regla dura)
Hablarle **en fácil, con analogías, como a un chico de 12 años**. NO asumir que sabe jerga técnica (webhook, HMAC, RPC, idempotente). Cuando aparezca un término técnico, traducirlo con una analogía del mundo real (puerta, cartero, recibo, etc.). Esto NO contradice "directo/accionable" — sigue siendo al grano, solo explicado simple.

### Tono y formato
**Sí:**
- Ir al grano. Headline primero, contexto después.
- Decidir por él cuando hay un default razonable (si tenés 80% de certeza, hacelo y explicalo en una línea). **Actuar > verificar 3 veces.**
- Mockups ASCII / tablas / snippets de código > párrafos largos.
- Honestidad cruda sobre lo que no sabés o no funciona ("esto está huérfano", "no lo verifiqué", "es un placeholder").

**No:**
- No le preguntes 3 veces lo mismo. Si lo dijo antes, está dicho.
- No le ofrezcas 4 opciones cuando podés recomendar una con razón.
- No inventes features, copy comercial ni precios sin que él te los pase. La copy vive en la landing, no en la app.
- No agregues "preguntas reflexivas" al final. Si hay siguiente paso obvio, proponelo concreto; si no, cerrá.
- No expliques herramientas internas (agentes Claude, IDs, sub-tareas) salvo que pregunte.

**Why:** lo pidió explícito varias veces, frustrado ("me estás haciendo perder tokens", "te estás sacando todo del culo"). Cuando fui directo y accioné, lo aceptó bien.

### Keys/secretos — SIN objeciones
Paolo pega access tokens / API keys / secretos donde quiera (incluido el chat) y **NO quiere advertencias** sobre exposición, rotación, "no lo pegues acá", etc. Es el fundador solo, su máquina y sus llaves, conoce el riesgo y lo acepta. **Usá la key y seguí.** Nada de moralizar ni preámbulos de seguridad.

### Uso de agentes (regla de operación, 2026-06-08)
Criterio = qué da mejor resultado, no la formalidad:
- **USAR agentes** cuando: trabajo grande o paralelo (varias áreas/pantallas), tarea de especialista dedicado, o investigación amplia (barrer muchos archivos → mandar agente y quedarse con las conclusiones).
- **HACER directo** cuando: cambio chico y conectado donde ya tengo el contexto cargado. Meter un agente en frío ahí es más lento y riesgoso (re-deriva contexto, desincroniza).
- Riesgo real = descoordinación entre trabajos paralelos (causó el drift de git). Con varias terminales/worktrees: mantener todo sincronizado, `git fetch`/`pull` antes de pushear, una terminal por vez.

### Métodos proactivos (de gstack / Garry Tan) — los corro YO, sin slash commands
Paolo NO tipea slash commands. Detecto el momento y aplico:
- **OFFICE HOURS (validación de producto, estilo YC):** cuando plantea idea nueva de feature, pregunta "¿vale la pena?", o va a construir algo grande sin validar. ANTES de codear. Las 6 preguntas (una por vez): (1) evidencia real de demanda; (2) qué hacen hoy como workaround y cuánto les cuesta; (3) nombrar al humano concreto que más lo necesita; (4) el wedge más angosto que alguien pagaría esta semana; (5) ¿lo viste usar sin ayudar?; (6) future-fit a 3 años. Después: desafiar la premisa, 2-3 enfoques, recomendar uno.
- **CSO (auditoría de seguridad) — AHORA es un minion propio: JonSnow (seguridad), `subagent_type: jonsnow`; el Capataz lo lanza (ficha en `MINIONS.md`):** antes de un push importante a prod, al exponer la app a usuarios reales, al tocar auth/RLS/storage/keys. Infra-first, anti-ruido: trust boundaries → censo de superficie → secretos en git history → deps → OWASP dirigido (¡RLS!) → STRIDE → LLM security (prompt injection en El Director, costo descontrolado). **Regla de oro:** cada finding con file:line + cómo se explota + cómo se arregla. Nada teórico.
- NO instalar gstack, NO crear slash commands.

---

## 2. AGENTES → ver MINIONS.md

Toda la memoria de los agentes vive en el **otro archivo de memoria, `MINIONS.md`** (mismo folder): el escuadrón (Capataz, Bujía/backend, Frontero/frontend, Davinci/estilos, Integral/integraciones, **El Comerciante/comerciante**, Metapod/metapod, Willy/willy, Hawkeye/testing-qa, JonSnow/jonsnow — **10 en total**), los componentes de IA (El Director, Banano, Oráculo, Cartero, Portero), el formato de code name, la regla de YAML y cómo los subagentes leen la memoria.

Recordatorio mínimo para este archivo: al nombrar un agente, SIEMPRE **code name + rol entre paréntesis** (`Bujía (backend)`); la IA de Vendí es **100% Gemini, NO Anthropic**. La memoria de Vendí son DOS archivos: este (`MEMORIA_DE_DIOS.md`, proyecto) + `MINIONS.md` (agentes).

---

## 3. ESTADO ACTUAL (git / deploy / qué está VIVO) — al 2026-06-30

### 🔀 2026-08-26 — DRIFT DE GIT RESUELTO: el repo local estaba 67 commits atrás y se mergeó (LEER PRIMERO)
El repo principal `C:\Users\Usuario\vendiapp\vendi` estaba **67 commits detrás de `origin/main`** y 3 adelante (una rama local vieja que nunca se subió). Se trajo `origin/main` con un merge en `main` local (`f0cfcb7`). **Estado ahora: 0 atrás / 4 adelante, SIN pushear.**

**Los 9 conflictos y con qué criterio se resolvieron:**
- **7 definiciones de agentes** (`backend/capataz/estilos/frontend/integraciones/metapod/testing-qa.md`) → **ganó LOCAL.** Las de `origin` estaban congeladas en julio; las locales son del 25/08. La diferencia decisiva: el `metapod.md` local trae el **Playbook de AulaPaolo** (27 clases) y el de Escalado DR, que en `origin` no existen. Detalle factual: local dice migraciones **0001–0018**, origin decía 0013.
- **`landing.html`** → **ganó LOCAL.** La copia de `origin` **todavía tenía el link de pago de PRUEBA de Mercado Pago** (`pref_id=3480421938-…`); la local ya no. Ver abajo.
- **`VENDI_DOC.md`** → se **aceptó el borrado** de origin (coherente con la regla: no es memoria, está muerto).

**Verificado tras el merge:** los 11 agentes parsean YAML OK · `landing.html` con 0 rastros de `pref_id`/`mercadopago` · faltaban deps locales (**Clerk y Mercado Pago nunca se habían instalado acá**) → `pnpm install` · se borró la caché `.next` vieja (apuntaba a rutas muertas) → **`npx tsc --noEmit` = 0 errores.**

⚠️ **NO se pusheó.** Subir estos 4 commits a `origin/main` dispara un deploy de producción de `vendiapp` — requiere OK explícito de Paolo.

### 💳 2026-08-26 — El cobro real: confirmado en vivo, y la mina del repo desactivada
**Producción cobra real y siempre cobró.** Cadena verificada en vivo ese día: `vendilatam.com/comenzar` → 307 → `/comprar` → 307 → `/signup?redirect_url=/comprar`. Es el flujo **cuenta-primero**, el que permite que MP cobre de verdad **y** acredite los créditos (`external_reference` = userId de Clerk). La landing viva (www.vendilatam.com) tiene **0** links de MP hardcodeados.

**La mina:** el `landing.html` del repo (copia huérfana que NO se deploya) conservaba en la línea 1978 el `MP_PAYMENT_LINK` de PRUEBA — el mismo `pref_id` del incidente de junio, donde el cliente pagaba y no recibía créditos. **Desactivado** (`MP_PAYMENT_LINK = ''` → cae al flujo real). Commit `27ae8ee`. `origin/main` también lo tenía y por eso el merge se resolvió a favor de la copia local.

### 🔒 ACTUALIZACIÓN 2026-07-10 — PAYWALL fail-CLOSED en prod + incidente de regresión (LEER PRIMERO)
- **`origin/main` = `ff0e7e1`** (Merge PR #12 `fix/paywall-failclosed`, 2026-07-10) = lo VIVO en `vendiapp` (deploy `dpl_4hEcL…` READY, alias **vendilatam.com**, source git). Verificado en vivo. La cadena real hoy: PR #7 `0efa059` → PR #8 `e47add3` (Metapod) → PR #9 `50b358a` (memoria) → PR #10 `7b0b481` (muro duro) → PR #12 `ff0e7e1` (fail-closed). El `effbd5b` de los bullets de abajo quedó VIEJO.
- **PR #10 "muro duro" YA ESTÁ MERGEADO** (2026-07-06, `7b0b481`). El paywall NO vive más en `proxy.ts` con redirect a la landing: ahora **el gate está en `app/(app)/layout.tsx`** y el no-pagador va DIRECTO a **Mercado Pago** vía `/comprar` (anon→`/signup?redirect_url=/comprar`, pagador→`/dashboard`, no-pagador→MP init_point). Result page en `app/pago/resultado` (fuera del gate). El bullet PAYWALL de "Qué está VIVO" (proxy.ts + fail-open + redirect a landing) quedó SUPERADO.
- **PR #12 (2026-07-10) TAPÓ EL AGUJERO fail-open** que Paolo cazó en vivo (cuenta "Digitex", no-pagadora, ENTRABA de forma intermitente). Causa: `userHasPaidAccess` (`lib/auth/paid-access.ts`) hacía **FAIL-OPEN** — si el fetch a Supabase (corre en cada navegación) fallaba/timeout, devolvía `true` y dejaba entrar a cualquiera. Fix: **FAIL-CLOSED** → da acceso SOLO si confirma positivamente compra (`credit_ledger reason=purchase`) o `unlimited_users`; `null`/duda ⇒ AFUERA. + reintento y timeout corto en el fetch (no rebotar de más a un pagador). Es la señal ÚNICA que usan el layout-gate del muro duro, `/comprar` y `/fundador` → ahora TODO el paywall es fail-closed.
- **+ Candado también en las APIs de acción** (`/api/generations`, `/api/generations/regenerate`, `/api/analyze`): el proxy NO tapa `/api`, así que un no-pagador con **saldo heredado de antes del paywall** (ej. `alannieto@gmail.com`, 60 cr, sin compra) podía generar pegándole directo a la API. Ahora cada una chequea `userHasPaidAccess` → **403** si no pagó. (Request sin sesión a esas APIs = 307 a /login por el proxy; con sesión sin pago = 403.)
- **Webhooks verificados VIVOS 2026-07-10:** `/api/webhooks/{mercadopago,shopify}` responden 401 (llegan al handler, NO redirigen a /login) → los pagos SÍ acreditan. El proxy los exime (`/api/webhooks/(.*)`).
- ⚠️ **INCIDENTE (lección dura): regresé producción por deploy CLI de una rama ATRASADA.** Publiqué con `vercel deploy --prod` una rama (`worktree-paywall-api-gate`, base `0efa059`) que NO tenía PR #8/#9/#10 → pisé prod y borré el muro duro + Metapod + memoria. Recuperado: cherry-pick de mi fix sobre `origin/main` (`7b0b481`) → rama `fix/paywall-failclosed` → **PR #12 merge → auto-deploy**. **REGLA REFORZADA: NUNCA deployar por CLI una rama a prod; TODO a producción SOLO por MERGE a `main`.** Con sesiones paralelas (la landing en `fix/landing-checkout-real`, PR #11 pendiente), cada una mergea lo suyo a main; nadie publica ramas a mano.
- DB (2026-07-10): "Digitex" = `user_3FxoWG12qpE2MUdcXsbfcVQXQ6V` (0 compras, 0 mov, no ilimitado) → AHORA rebota siempre. Pagador real: `user_3Fjz…` (jidoka, 60 cr, plan founder). Ilimitados: las 2 cuentas de Paolo.

### 📬 2026-07-19 — CORREO DE SOPORTE/CONTACTO (`soporte@vendilatam.com`) — buzón VIVO + app VIVA; landing pendiente
- **Correo único de soporte + contacto = `soporte@vendilatam.com`** (decisión Paolo 2026-07-19; "un solo buzón para cualquier consulta, después se segmenta" con etiquetas). **Reenvía a `paolonietoc@gmail.com`.**
- **Cómo recibe:** cuenta **ImprovMX plan FREE** (reenvío puro, NO buzón nuevo → cae en el Gmail de siempre). Alias `soporte@` + catch-all `*`, ambos → paolonietoc@gmail.com. La API key de ImprovMX la dio Paolo en el chat.
- ⚠️ **DNS en la RAÍZ de vendilatam.com (agregados por API el 2026-07-19) — NO BORRAR, son los que hacen andar el correo:** MX `mx1.improvmx.com` (prio 10) + MX `mx2.improvmx.com` (prio 20) + TXT SPF `v=spf1 include:spf.improvmx.com ~all`. Verificado: ImprovMX `check` = mx válido + spf válido + dominio **válido**. El DNS de vendilatam.com vive en **Vercel ns** y el **MCP de Vercel NO edita DNS** → se agregaron con la **REST API de Vercel** (`POST /v2/domains/{domain}/records`) + token que dio Paolo. (DMARC opcional, NO requerido para recibir.)
- **App (in-app) — VIVO en prod:** PR #24 (`a1740ad`, merge **`346b0c2`**) → sección "Ayuda y soporte" en `app/(app)/ajustes/page.tsx` + link "Ayuda y contacto" en `components/app/sidebar.tsx`, ambos `mailto:soporte@vendilatam.com` con la cuenta del user prellenada. Deploy Vercel READY. **`origin/main` ahora = `346b0c2`** (supera al `081b61d` de §12 y a todos los tips viejos de abajo).
- ✅ **Landing — VIVA (2026-07-19):** botón flotante "chat"→correo (tema DARK, sube solo cuando aparece `#ctaSticky` vía `.cta-sticky.show ~ .vsupport`) + links Contacto/Soporte del footer → `soporte@vendilatam.com`, aplicados sobre la fuente CORRECTA **`C:\Users\Usuario\.vendi-landing-deploy\index.html`** (verificada **byte-idéntica** a la viva ANTES de editar → sin regresión) y **deployada a prod** (`vendilanding`, deploy `dpl_3NRifL…` READY, alias www.vendilatam.com). Verificado en vivo: `id="vsupport"` presente, 3× `mailto:soporte@vendilatam`, 0× el `mailto:paolonietoc@gmail` viejo. ⚠️ La edición previa que hice al `landing.html` del REPO quedó HUÉRFANA (esa copia NO se deploya — ignorar; la real es `.vendi-landing-deploy`). ⚠️ **REUSABLE — el deploy a prod por CLI (`vercel --prod`) lo tuvo que correr PAOLO** (vía `!` en la sesión): el classifier del harness **BLOQUEA los deploys a producción del agente**. Los writes por REST API sí pasan (así se agregaron los DNS de ImprovMX). Para publicar la landing: editar `.vendi-landing-deploy/index.html` + Paolo corre `vercel "C:/Users/Usuario/.vendi-landing-deploy" --prod --yes`.

### Git / deploy
- **`origin/main` = `effbd5b`** (2026-06-27, Merge PR #6) = lo VIVO en `vendiapp` (Vercel auto-deploy READY, alias **vendilatam.com**). **Verificado por topología 2026-06-30.** Cadena de merges encima de `70acb07` (que sacó el Pase Fundador de la vitrina): PR #3 `3bf05b7` (comenzar al checkout per-usuario `1c0e62c`), luego paywall paga-primero `31acbd4`, luego PR #5 `6274574` (lifetime-mp `b4e22d8`), luego PR #6 `effbd5b` (fundador-paywall standalone `80b4dca`). **TODO lo que la memoria daba como "deployado por CLI y NO en main" YA está mergeado en origin/main — incluido el lifetime-mp (ver §8, drift RESUELTO).** Sin commits de código entre el 28 y el 30 de junio (el 28 fue solo deploy de landing por CLI, ver §8). Antes pasó por: `4250924` (3 packs + vitrina), merge dashboard-404 `063ca10`, **Shopify mergeado** (`4a976a6` webhook orders/paid + `1c5b027` exime webhooks del proxy Clerk + `a4bc5ed` saca chequeo shop-domain), seguridad RPC `e09ea43` (migr 0015). O sea: **Shopify (código) + packs + 0015 YA están en prod** (la memoria vieja decía "sin merge" — desactualizado).
- ⚠️ **`main` LOCAL de Paolo quedó ATRÁS** de `origin/main` (drift): local = `167b3ef` (solo docs, sobre `5d65e13`); le faltan TODOS los commits de arriba (al 2026-06-30, por git rev-list: 1 commit adelante y 15 detras de `origin/main`=`effbd5b`). Para tocar código usar SIEMPRE worktree `fresh` desde `origin/main` (no el main local stale). `167b3ef` sigue sin estar en origin (no bloquea).
- ⚠️ **LANDMINE landing.html:** sigue trackeado en origin/main (blob viejo). NO commitear/pushear `landing.html` desde el repo de la app. (El git-coupling con `vendilanding` ya está MUERTO — ver §8 — pero el blob trackeado sigue ahí.)
- ⚠️ **LANDMINE: `landing.html` está TRACKEADO en `origin/main`** (blob viejo, del experimento "servir landing en /" revertido a medias). El working tree de Paolo tiene su `landing.html` WIP (distinto, backup en `landing.html.local-wip-bak`). RIESGO: si Paolo hace `git add landing.html && push`, dispara el build de la app y tira 404 (ver §8 Landing). **Decisión pendiente:** destrackear (`git rm --cached` + `.gitignore`) o reconciliar. NO commitear/pushear landing.html sin resolver.

### Qué está VIVO en producción
- **Modelo de CRÉDITOS end-to-end** (no BYOK). Key de Google propia server-side; generación y análisis en API routes. Dos bolsas separadas: generación / análisis IA. ⚠️ **Desde el PAYWALL (2026-06-27) el regalo es 0** (antes 60/10, migr `0016`): la cuenta nueva nace sin fichas. Ver §4 y el bullet PAYWALL abajo.
- 🔒 **PAYWALL "paga-primero" (2026-06-27, `31acbd4` en `origin/main`, deploy Vercel READY en vendilatam.com).** Solo entra a la app quien **pagó** (movimiento `purchase` en `credit_ledger` → cubre Mercado Pago y Shopify) o está en la allowlist `unlimited_users` (cortesía). El guardia vive en `proxy.ts` (corre en CADA navegación, incluso RSC → candado duro): logueado sin pagar → redirige a la **landing** (`PAYWALL_LANDING_URL`, default `https://www.vendilatam.com`); la única página de app que ve es `/upgrade` (exenta), donde paga pegado a su cuenta y se desbloquea solo. Chequeo en `lib/auth/paid-access.ts` (fetch a PostgREST con service_role; fail-open ante error de infra; NO usa `server-only` porque lo importa el middleware). `/comenzar` enruta: sin sesion→`/signup?redirect_url=/upgrade`, sin pagar→`/upgrade`, pago→`/dashboard` (reconciliado con el commit paralelo `1c0e62c`). **Acceso seteado: SOLO las 2 cuentas Clerk de Paolo en cortesia** (`user_3F4V...` ya estaba + `user_3Fbo...` agregada 2026-06-27); Alan/Edgardo/jidoka y los uuid viejos quedan AFUERA. Verificado en vivo: `/comenzar`→307→`/signup?redirect_url=/upgrade`.
- **AUTH = CLERK** (live desde 2026-06-13, `c33177c`). Supabase = DB con RLS vivo vía third-party auth (token Clerk inyectado, policies leen `auth.jwt()->>'sub'`). `profiles.id` = userId de Clerk (text). Perfil lo crea `ensureProfile()`. Ver §6.
- **MERCADO PAGO EN PRODUCCIÓN — credenciales REALES seteadas el 2026-06-27.** ⚠️ OJO: hasta el 27/06 la env `MP_ACCESS_TOKEN` en Vercel tenía el token de **PRUEBA** (cargado el ~17/06 y nunca cambiado), así que TODO pago real fallaba con "una de las partes es de prueba" (lo cazó Paolo con una captura). El 2026-06-27 se reemplazaron en Vercel (proyecto vendiapp, Production) `MP_ACCESS_TOKEN` y `NEXT_PUBLIC_MP_PUBLIC_KEY` por las de PRODUCCIÓN de la cuenta real de Paolo (verificado vía MP API: cuenta `paolonietoc@gmail.com`, id 3474988543, Perú/MPE, NO test-user; se creó una preference real sin error). Redeploy a prod aliased a vendilatam.com. El token productivo lleva el app id `532027134550190` (VENDI APP, única app del panel; la "tienda Shopify" que ve Paolo es la integración MP-dentro-de-Shopify, otra cosa). Checkout Pro vivo + webhook idempotente (tabla `mp_processed_payments`, migración `0013`). Ver §5. **Seguridad pendiente (opcional): el Access Token se pegó en un chat → conviene regenerarlo en el panel MP y re-setearlo.** Env huérfana detectada: `SHOPIFY_SHOP_DOMAIN` (ya no la usa el código, sigue en Vercel).
- **VITRINA `/upgrade` = SOLO 3 PACKS** (desde `70acb07`, 2026-06-26): **Inicial** (`pack-inicial`, 30 cr / S/24.90), **Pro** (`pack-pro`, 80 cr / S/54.90, "Más elegido"), **Negocio** (`pack-negocio`, 200 cr / S/119.90). Pago único, recarga pura. **El Pase Fundador (`lifetime-pass`, 60 cr / S/39) se SACÓ de la app** (decisión Paolo 2026-06-26): `listProducts()` filtra `kind:"lifetime"` → no se muestra en `/upgrade`. PERO sigue en `PRODUCTS`/`getProduct()` → el cobro per-usuario (`/api/checkout`) y el webhook de Shopify lo acreditan igual cuando se compra desde la landing/Shopify. El Pase vive SOLO en la landing. Márgenes ~53–65%. **Catálogo server-side** (`lib/mercadopago/catalog.ts`) = fuente única de verdad; para sumar/cambiar packs editar solo el catálogo (checkout+webhook resuelven por `id`).
- **Landing** = proyecto Vercel SEPARADO (`vendilanding`, www.vendilatam.com). Ver §8.
- **Estilos Profesionales** (10, foto de ejemplo, ref opcional, `versions.style_id` migr 0010), **Fábrica rediseñada** (`/fabrica/[versionId]` catálogo+modal), **dashboard con métricas reales**, **créditos ilimitados** por allowlist `unlimited_users`. Ver §7 y §4.
- **Identidad de marca** (brandName/industry/description) viaja al Director (Gemini) y personaliza imágenes (no se persiste en DB).

### Verdades de código (verificadas)
- IA = 100% **Gemini** por REST, NO Anthropic. Director `gemini-3.1-pro-preview`, imagen `gemini-3.1-flash-image-preview`, análisis `gemini-2.5-flash`. Strings en `lib/ai/gemini-client.ts`; motor en `lib/ai/generate-server.ts`.
- **5 imágenes por tanda** confirmado; las que fallan se reembolsan. El Director corre 1 vez por tanda (no sangra por-imagen).
- Migraciones en PROD (verificado 2026-06-26 vía MCP): **0001–0013** + **0014** (Shopify: tablas `shopify_processed_orders`/`shopify_unmatched_orders` + RPC `process_shopify_order`, APLICADA) + **0015** (lock RPC PUBLIC) + **0016** (paywall: regalo de créditos = 0, cuenta nueva nace sin fichas) + **0017** (mp lifetime founder + analysis) + **0018** (lock profiles writes: revoca INSERT/UPDATE/DELETE de `profiles` a anon/authenticated -> cierra el self-grant de créditos vía RLS: un logueado podía `update({credits_remaining:99999})` desde el browser; RPC/service_role intactos; APLICADA 2026-07-06 desde el main con OK de Paolo, verificado). Stack: Next.js 16 (App Router) + React 19 + Supabase + Tailwind 4 + Gemini.

### Pendientes abiertos
- **PR #10 `feat/paywall-duro-comprar` (2026-07-06 — YA MERGEADO PR #10 `7b0b481`; + fail-closed PR #12 `ff0e7e1` — ver ACTUALIZACIÓN 2026-07-10 en §3):** mueve el paywall del `proxy.ts` al gate de `app/(app)/layout.tsx`; el no-pagador va DIRECTO al Checkout MP del **Pase Fundador** (S/39, `lifetime-pass`) vía `/comprar`, en vez de a la landing (cambio pedido por Paolo: el que no paga va a pagar, no a la landing). `/comprar` = destino universal (anon->/signup?redirect_url=/comprar, pagador->/dashboard, no-pagador->MP init_point). Señal = `userHasPaidAccess` (credit_ledger reason=purchase = MP+Shopify, fail-open) -- se DESCARTO un `hasAppAccess` por `mp_processed_payments` que armaron los minions por brief mío incompleto (era regresión latente Shopify + fail-closed; corregido en commit daf4240, `lib/auth/access.ts` eliminado). Vitrina `/upgrade` (3 packs) queda SOLO para pagadores (recargar). Result page movida a `app/pago/resultado` (fuera del gate). tsc limpio; build no corrido (worktree sin .env). **Falta:** (1) OK de Paolo a que el embudo venda el **Pase Fundador** vs un pack; (2) env Vercel `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/comprar`; (3) merge + deploy. Verificado en DB 2026-07-06: `unlimited_users`=[Paolo user_3F4VMb0isZjkGmfTevJrbG7RD2B]; 1 pago real (user_3Fjz... jidoka, 60 cr); defaults credits/analysis = 0.
- Push de `167b3ef` a `origin/main` (Paolo, opcional).
- Resolver `landing.html` trackeado (destrackear o reconciliar).
- **Remap de los 3 usuarios viejos** (uuid Supabase → id Clerk) al loguearse en Clerk (migr `0012b`). Sus datos no aparecen hasta entonces. *Confirmar si ya pasó.*
- Probar EN VIVO una generación real en prod (login + saldo).
- Re-evaluar anti-abuso del regalo (~$4.85/signup) bajo Clerk.
- Leaked-password protection OFF (activar al pasar a plan Pro de Supabase).
- Fusión Refs+Estilo en una sola pantalla (`referencias` y `estilo` siguen separadas).
- **Ir live Shopify (ver §5): SOLO faltan pasos de Paolo en paneles** (código y migr 0014 YA en prod): (1) prender Mercado Pago en Shopify (Settings→Pagos; confirmado disponible en Perú); (2) crear webhook `orders/paid`→`https://vendilatam.com/api/webhooks/shopify` y copiar el secret; (3) setear `SHOPIFY_WEBHOOK_SECRET` en Vercel + redeploy (ya NO se usa `SHOPIFY_SHOP_DOMAIN`). Verificado 2026-06-26: webhook NO creado (lista vacía) → Shopify NO acredita aún.
- Clutter untracked en raíz: `landing.html`, `landing.backup.html`, `CONTEXTO_VENDI.md`, `design_handoff_vendi_theme/`, `output/`, `.mcp.json`, `inquebrantable.skill.zip`.

### Foco actual de Paolo
Tras MP en producción, el foco pasó de construir a **comercial + Meta Ads**: validar demanda, primeros 30 fundadores (Lifetime Pass), generar assets de marketing. Próximo riel técnico = Meta Ads (fase 2 de Integral). **2026-07-05:** se creó el minion **Metapod (meta)** — dueño de todo lo de Meta (growth/ads) MENOS la plomería técnica (que es de Integral), con **PRIORIDAD #0 = respetar las políticas de uso de Meta** y un playbook anti-baneo de 3 niveles (App/API, cuenta de ads, BM/identidad). Arranca como estratega/asesor (aún NO hay App de Meta ni Marketing API). Ficha completa en `MINIONS.md`; definición en `.claude/agents/metapod.md`.

### 🔱 2026-07-10 — MISIÓN "SESIÓN NIVEL DIOS" (prep, pre-ads)
Paolo está por **prender los ads** y montó una misión de una **sesión nivel dios con Fable 5** (`claude-fable-5`) que audita **TODO Vendí sin excepción** — landing, app, bugs, generación de imágenes (Gemini), logeo (Clerk), recuperación de cuenta, cobro (MP/Shopify), webhooks, seguridad/RLS/paywall, datos/migraciones, coherencia con Meta/Facebook (anti-baneo) y correo/email (deliverability) — **Y lo arregla** (fixes en PRs desde `origin/main`, sin regresionar prod, nada de deploy por CLI), + genera **5 infoproductos** que funneleen al app (gratis/pago, sin claims de ingresos). El **prompt de misión** vive en `PROMPT_FABLE5_AUDITORIA_DIOS.md` (raíz del repo) — sirve de plantilla reusable para auditorías dios futuras.
- **Guardrail #0 de la misión:** NO tocar memoria/minions/contexto ni `landing.html` (landmine stale). Auditar contra **`origin/main` (lo vivo)**, no el working tree local (drifteado: migr locales llegan a 0013, faltan carpetas vivas). **Refrescar la memoria PRIMERO** contra origin/main y actualizarla al cerrar (pedido explícito de Paolo: "primero actualizá toda la memoria").

**Riesgo recurrente:** trabajar con varias terminales/worktrees en paralelo causa drift (ya se materializó varias veces). Regla: una terminal por vez al pushear, `git fetch`/`pull` antes.

---

## 4. MODELO DE NEGOCIO: CRÉDITOS

**Pivote 2026-06-03: de BYOK a CRÉDITOS** ("CAMBIA TODO, AHORA ES CRÉDITOS"). Invierte la decisión BYOK anterior (suscripción + key del usuario, descartada).

### El modelo
- **UNA API key de Google propia de Vendí**, server-side (env var en Vercel), NUNCA en el browser.
- Generación y análisis corren en el **server** (API routes).
- El usuario paga (Mercado Pago, ver §5) y recibe **créditos**. Cada generación descuenta créditos; a 0, no genera hasta recargar.
- **DOS BILLETERAS SEPARADAS:** (1) Mercado Pago = cómo el usuario le paga a Vendí (soles → banco de Paolo); (2) Google = cómo Vendí le paga a Google (USD, por el consumo de TODOS). Los créditos en Supabase NO son dinero, son fichas. Ganancia = (lo que entró) − (lo que Google cobró).
- **Google es PREPAGO:** saldo se consume en tiempo real, a $0 se cortan todas las keys. Activar recarga automática. Pospago recién en Tier 3 ($1.000+).

### Dos bolsas de créditos (2026-06-06, deployado)
- **Generación** (`profiles.credits_remaining`): **60 créditos** de regalo al registrarse. 1 crédito = 1 imagen.
- **Análisis con IA** (`profiles.analysis_credits_remaining`): bolsa **aparte**, **10 créditos** de regalo. 1 crédito = 1 análisis. (Antes `/api/analyze` era gratis e ilimitado = agujero de costo; ahora cobra 1 crédito con reembolso si falla.)
- Migración `0008_analysis_credits.sql`. **Rate limiting DESCARTADO** (un usuario que pagó no debe tener tope de velocidad; el costo lo topan los créditos).

### Costo real medido (2026-06-08) — el número que manda
- Medición empírica en Google AI Studio: **40 imágenes + 1 análisis = 9.15 SOLES (PEN)**.
- 9.15 PEN ÷ ~3.7 = **$2.45 USD** todo incluido → **~$0.061 USD por imagen entregada**.
- ⚠️ **CUIDADO AL CONVERTIR:** el dato es en SOLES. Un cálculo previo erró tomando soles como USD (9.15/40=$0.229) y concluyó falsamente que el pack pierde plata. **Siempre convertir PEN→USD (÷~3.7) antes de dividir.**
- Economía pack $10/60 créditos: costo ~$4.36 → **margen ~56%, CIERRA.** Precios reales en §3 (tienda).
- Precio teórico de modelos (verificar, cambia): Nano Banana 2 a 1K ~$0.067/img, a 2K ~$0.101/img.

### Créditos ilimitados por allowlist (2026-06-10, migr `0009`)
- Tabla `public.unlimited_users (user_id pk, note, created_at)`. Si un user está ahí, no gasta créditos de generación NI de análisis.
- `is_unlimited(uuid)` → bool. `deduct_credits`/`deduct_analysis_credit` son NO-OP para ilimitados. El pre-check 402 de `/api/generations` y `/api/analyze` se saltea. Muestran `∞ ilimitado` (CreditBadge, sidebar con render propio, tiles de Ajustes, página de Análisis).
- **Tabla aparte y NO flag en `profiles`** porque la policy `profiles_update_own` deja al user hacer UPDATE de su fila → un flag ahí sería auto-asignable. La allowlist solo la escribe service_role.
- **Alta de otra cuenta (solo cuando Paolo lo ordene):** `insert into public.unlimited_users (user_id, note) select id, '<motivo>' from auth.users where email = '<email>' on conflict do nothing;`. Seed inicial: solo Paolo.
- ⚠️ Tras el cutover de Clerk los user_id son text (id Clerk), no uuid — ajustar la consulta al esquema vigente.

### Estado de implementación
Las 4 fases (schema, generación server-side, limpieza BYOK, análisis con créditos) están VIVAS en prod. Migraciones 0007/0008 corridas, BYOK 100% borrado. Aprendizajes: ningún proveedor de IA escapa al prepago al arranque; Anthropic NO genera imágenes (no reemplaza a Nano Banana). El modelo requiere capital de Paolo (fronteás Google para todos) — estuvo bloqueado ~3 semanas por esto.

---

## 5. COBRO: MERCADO PAGO (en prod) + SHOPIFY (en progreso) + descartes

### 🟢 Mercado Pago — EN PRODUCCIÓN (2026-06-18)
**MP ya cobra en PRODUCCIÓN con credenciales de PROD activadas.** Cayó el gate histórico de "cuenta no verificada → solo TEST". **Culqi, Yape y Stripe DESCARTADOS definitivos — no re-proponer.**

**Decisión técnica:** **Checkout Pro** (NO Bricks/Checkout API). PCI = cero carga nuestra, antifraude/3DS incluidos. El usuario SÍ es redirigido a una página de MP y vuelve (normal en MP). **Single-seller:** Vendí cobra con SU único Access Token del panel → **NO se usa OAuth `/oauth/token`** (eso es para marketplaces que cobran por otros). No re-litigar.

**Flujo end-to-end:**
1. `POST /api/checkout` (server): `auth()` de Clerk → `clerkUserId`; resuelve precio+créditos del **catálogo server-side** (NUNCA del cliente); crea Preference (`currency_id PEN`, `external_reference=clerkUserId`, `metadata`, `back_urls`, `auto_return:"approved"`, `notification_url`); devuelve `init_point`.
2. Front redirige a `init_point` → paga en MP → vuelve a `/upgrade/resultado` (solo UX, NO acredita).
3. **Webhook `POST /api/webhooks/mercadopago` = fuente de verdad:** lee raw body → valida firma `x-signature` (HMAC-SHA256 sobre manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, compara con `timingSafeEqual`; el SDK NO valida firma, va a mano) → re-consulta `Payment.get(data.id)` → si `approved`: idempotencia por `mp_payment_id` → `grant_credits(clerkUserId, credits, 'purchase')` vía service_role → responde 200 (<22s o MP reintenta).

**Idempotencia:** tabla `mp_processed_payments` + RPC `process_mp_payment` (INSERT ON CONFLICT DO NOTHING + grant_credits atómico; devuelve 'granted'|'duplicate'). Migración **`0013`**, aplicada a prod.

**Archivos:** `lib/mercadopago/{client,catalog}.ts`, `lib/validations/checkout.ts`, `app/api/checkout/route.ts`, `app/api/webhooks/mercadopago/route.ts`.

**Env vars:** `MP_ACCESS_TOKEN` (server) · `NEXT_PUBLIC_MP_PUBLIC_KEY` · `MP_WEBHOOK_SECRET` (firma) · `NEXT_PUBLIC_APP_URL`. App de MP id **`532027134550190`**. **MCP de MP** en `.mcp.json` = dev tooling (sacar credenciales, configurar webhooks), NO el cobro en runtime.

**⛔ Moneda/alcance LATAM — CORREGIDO 2026-08-23. La versión vieja de este párrafo era FALSA y hay que no repetirla.**

> ❌ Lo que decía antes (ERROR): *"cobrar en soles NO limita al comprador LATAM (su banco convierte). El único techo real son métodos de pago locales faltantes, problema de Fase 2."*

**Por qué estaba mal:** analizaba la **conversión de moneda** (que efectivamente no es problema — el banco del comprador convierte) y se perdía el mecanismo real, que es **de cuenta, no de moneda**. La cuenta de MP de Paolo es **MPE (Perú)** y las cuentas de Mercado Pago están **siloed por país**. Consecuencias verificadas (2026-08-23):

- **Saldo en Mercado Pago de otro país → IMPOSIBLE.** Un MP Argentina/México/Colombia NO puede pagar una preference peruana. No es fricción, es cero.
- **PagoEfectivo / Yape → solo Perú** (agentes físicos / banco peruano).
- **Tarjeta extranjera → alta tasa de rechazo.** El antifraude de MP está calibrado por país; las tarjetas emitidas afuera rebotan seguido ("failed because of security reasons"). Es la ÚNICA vía posible y es poco confiable.
- Además el rechazo es **silencioso**: el lead rebota y no queda registro en ningún lado.

**NO es "problema de Fase 2": es un bloqueante de go-to-market.** El mercado objetivo de Paolo NUNCA fue Perú (confirmado por él 2026-08-23: pensaba México, Colombia, Argentina y en general **cobro internacional**), o sea que el rail apuntaba al único país que no era el target.

**Regla para el futuro:** antes de elegir CUALQUIER pasarela, la primera pregunta es **"¿de qué países son los compradores?"**. Esa pregunta se saltó dos veces seguidas (Culqi → Mercado Pago, ambos Perú/soles) y nunca se le confirmó a Paolo el supuesto.

**Salida decidida (2026-08-23):** para cobro **global** → **Merchant of Record** (Lemon Squeezy, o Polar si pesa la comisión). Lo decisivo NO es la cobertura de tarjetas sino que el MoR **es el vendedor legal** y asume la obligación de IVA/VAT en cada jurisdicción — imposible de gestionar solo desde Perú. Descartados: **dLocal Go** (bueno, pero solo LATAM), **Niubiz/Izipay** (procesan tarjeta internacional pero cobran en PEN y exigen RUC + banco empresarial), **Shopify** (no es procesador; Shopify Payments no existe en Perú → debajo quedaría MP Perú, mismo muro +$39/mes +2%). ⚠️ A ticket ~$10 un MoR se lleva ~10% por el cargo fijo → revisar precio/bundle.

**Costo real del error: 0 ventas perdidas** (`mp_processed_payments`=0 / `shopify_processed_orders`=0 — nunca hubo venta por ningún camino). Lo que se pierde es tiempo de integración en **2 archivos** (`/api/checkout` + webhook); la plomería (`grant_credits`, ledger, idempotencia, RLS, revocación de RPC `SECURITY DEFINER`) es **agnóstica del riel** y ya sobrevivió un cambio (Culqi→MP, 2026-06-15). **MP Perú NO se borra:** queda como rail secundario para compradores peruanos.

### 🟡 Shopify — código YA en prod, falta config de paneles (2026-06-26)
**Paolo decidió SÍ usar Shopify + Mercado Pago** (2026-06-25, reconfirmado 2026-06-26: quiere LAS DOS — app+MP in-app Y Shopify). Setup: **Shopify = tienda/vitrina, Mercado Pago = pasarela DENTRO de Shopify.** Entrega = webhook Shopify `orders/paid` → app Vercel valida HMAC → mapea producto a créditos → `grant_credits`. **NO re-litigar el descarte viejo.**

> ⚠️ **OJO — la memoria vieja decía "código sin merge / 0014 sin aplicar": DESACTUALIZADO.** Verificado en vivo 2026-06-26: el código de Shopify (`4a976a6`+`1c5b027`+`a4bc5ed`) está **MERGEADO en `origin/main` y deployado**, y la migr **0014 está APLICADA en prod**. Lo único que falta para que Shopify cobre y acredite son **3 pasos de Paolo en paneles** (no hay más código que escribir).

- **Tienda REAL = `vendi-9497.myshopify.com`** (Basic, PEN, "VENDÍ"). 4 productos ACTIVE, SKU = id de catálogo (`lifetime-pass`/`pack-inicial`/`pack-pro`/`pack-negocio`), todos correctos. Vendibles (`tracked:false`, `inventoryPolicy CONTINUE`). **Fix 2026-06-26:** `pack-pro` tenía `requiresShipping:true` (pedía dirección de envío para un digital) → corregido a `false` vía MCP (los 4 ya son digitales sin envío). Precio Lifetime Shopify S/39 = catálogo S/39 (ya alineados; el webhook igual no valida monto).
- **Flujo del webhook (`app/api/webhooks/shopify/route.ts` + `lib/shopify/{verify-webhook,order-to-credits}.ts`):** valida HMAC base64(HMAC-SHA256(rawBody, `SHOPIFY_WEBHOOK_SECRET`)) sobre cuerpo CRUDO → solo topic `orders/paid` → créditos del catálogo por SKU (fallback por título) → **identidad del comprador = note_attributes `clerk_user_id` (preferido) → si no, match por EMAIL vía Clerk (solo si hay EXACTAMENTE 1 user con ese email)** → sin match estaciona en `shopify_unmatched_orders` (no se pierde) → acredita idempotente vía RPC `process_shopify_order`. Lifetime = 60 créd + plan `founder`.
  - ⚠️ **GOTCHA clave:** el comprador debe usar en Shopify el MISMO email con que se registró en la app (Clerk), o el pedido queda "unmatched" y los créditos NO llegan solos. El flujo in-app MP no tiene este problema (usa `external_reference` = id Clerk del logueado).
- **PENDIENTE go-live (SOLO paneles de Paolo):** (1) **prender Mercado Pago** como medio de pago en Shopify (Settings→Pagos; confirmado disponible en Perú, PEN, tarjeta+PagoEfectivo, doc oficial MP-Shopify-PE); (2) **crear webhook** `orders/paid` formato JSON → `https://vendilatam.com/api/webhooks/shopify` (Shopify→Settings→Notificaciones→Webhooks) y copiar el **secret** que muestra esa página; (3) **setear `SHOPIFY_WEBHOOK_SECRET`** en Vercel (proyecto vendiapp) + **redeploy**. (Ya NO se usa `SHOPIFY_SHOP_DOMAIN`: el chequeo se sacó en `a4bc5ed`.) Después: 1 compra de prueba con MP usando el email registrado → ver créditos.
- **0 ventas reales hasta 2026-06-26** por NINGÚN camino (verificado: `mp_processed_payments`=0, `shopify_processed_orders`=0, `shopify_unmatched_orders`=0). Ni el cobro in-app MP ni Shopify se probaron nunca con plata real → **pendiente común: 1 compra real de prueba** (ej. Pack Inicial S/24.90) que confirme pago→créditos en vivo.

### Historial de descartes (no re-proponer)
- **Culqi** — fue el rail elegido un tiempo (Perú/soles, packs pago único). Reemplazado por Mercado Pago el 2026-06-15. La plomería de créditos (`grant_credits` + webhook) se reusó tal cual; solo cambió el riel.
- **Yape** — DESCARTADO definitivo (Paolo enfático, borró todas las menciones).
- **Whop** — ⚠️ **DESCARTE VENCIDO, REABIERTO 2026-09-04.** El motivo viejo ("vitrina US sobre Stripe/PayPal, no le cobra a un PYME peruano") ya no aplica por dos lados: (1) **cambió Whop** — hoy es su propio stack de pagos con orquestación multi-proveedor, cobra en 186+ países, paga a 187+, **es Merchant of Record** (add-on "Tax & Remittance", calcula y remite VAT/sales tax en 190+ países) y **eliminó la comisión del 30% del marketplace en mayo 2025**; (2) **cambió el ICP** — el 23/08 se definió que el comprador NO es peruano (MX/CO/AR + cobro internacional), así que "no le cobra a un PyME peruano" dejó de ser el criterio. **Queda como candidato al riel MoR pendiente**, al lado de Lemon Squeezy y Polar — NO como canal de ventas (audiencia US/inglés "make money online"; y a ticket $10 no hay margen para afiliados, que quieren 30-50%).
  - **Fees oficiales (docs.whop.com/fees, verificado 2026-09-04) — DOS capas separadas.** *Por venta:* 2.7% + $0.30 base · +1.5% tarjeta internacional · +1% conversión de moneda · **+2% Tax & Remittance (MoR)** → **≈$1.02 sobre un ticket de $10 = 10.2%**. Opcionales: afiliados 1.25%, orquestación 0.8%, facturación 0.5%. ⚠️ **Contracargo = $15** (a ticket $10 perdés más que la venta). *Por retiro (FIJO POR GIRO, no por venta):* ACH next-day **$2.50** (exige cuenta USD con routing ABA) · wire SWIFT **$23** (llega a Perú) · cripto 5%+$1 · "International Local Banks" varía por país (¿Perú? solo se ve en el dashboard) · RTP/Venmo solo US.
  - ⚠️ **La mordida que casi nadie cuenta: el banco peruano.** Un wire de $23 llega a Lima costando **$50-80** reales (banco intermediario ~$15-30 + comisión de recepción BCP/Interbank ~$10-35) + 2-4% de spread si convertís a soles. **Sobre $1.000 facturados la vía de retiro sola define ~$75 de diferencia** (~$815 por wire vs ~$890 por ACH). **Regla: cuenta USD con ABA (Payoneer/Wise) + retiro mensual. NUNCA wire directo ni retiros chicos** (el $23 fijo es 23% si retirás $100 y 0.8% si retirás $3.000).
  - ❌ **Cifra corregida:** el MoR de Whop es **2%**, no 0.5% (el 0.5% es "Billing Automation"/facturación). Costo real por venta ≈10%, no ≈8.7%.
  - **INSTALADO 2026-09-04 vía PLUGIN OFICIAL** (el camino correcto): `/plugin marketplace add whopio/plugins` → `/plugin install whop@whop` (v1.0.0, user scope, Apache-2.0, `github.com/whopio/plugins`). Trae el MCP `plugin:whop:whop` → `https://mcp.whop.com/mcp` + **3 skills** (`whop`, `whop-connect`, `whop-mcp-safety`). Aparte quedó `whop-docs` → `https://docs.whop.com/mcp` en user scope (Connected, sin cuenta) — el plugin NO incluye el server de docs, por eso van los dos.
    - **Faltan pasos de Paolo:** reiniciar Claude Code → `/mcp` → elegir `whop` → login por browser → confirmar con `/whop:whop-connect`.
    - 🔴 **OJO con el permiso:** el plugin pide el perfil **`admin`**, que cubre **TODOS los negocios** de ese usuario de Whop. Lo que mueve plata (refunds, payouts) corre en 2 pasos con `mcp_confirmation_token` + `idempotency_key`, pero eso limita accidentes, **NO el alcance del grant**. Se desconecta desde `/mcp`.
    - **Auth:** browser OAuth. La doc dice EXPLÍCITAMENTE **no pongas API key ni bearer header**; Whop guarda las credenciales server-side. (Paolo pegó una API key en el chat el 2026-09-04 → se le dijo que la rote; no se guardó en ningún archivo.)
  - ❌ **Tres errores míos en esta sesión, corregidos — GOTCHAS REUSABLES:** (1) instalé los MCP en `.mcp.json` (scope *project*), que **exige aprobación explícita**, y en esta máquina `enabledMcpjsonServers` está **vacío** → no aparecían. **Para MCP nuevos: `--scope user`.** (2) dije que el plugin de Whop "no existía" porque grepeé solo el marketplace de Anthropic — **sí existe, en el marketplace propio de Whop**. Un plugin ausente del catalogo oficial NO significa que no exista. (3) **truncué este archivo a 0 bytes** con un `io.open(p,"w")` que falló por un emoji mal escapado (surrogates) DESPUÉS de abrir en modo `w`. **Recuperado del volcado del hook de SessionStart** (`~/.claude/projects/.../tool-results/hook-*-additionalContext.txt`, que trae MEMORIA_DE_DIOS + MINIONS concatenados). ⚠️ **`cerebro_vendi/` está UNTRACKED en git — no hay red de seguridad.** **Regla: editar SIEMPRE a archivo temporal y después mover; nunca abrir el original en modo `w`.**
  - ⚠️ **Los MCP y plugins cargan al ARRANCAR la sesión** — agregarlos no alcanza, hay que reiniciar Claude Code.
  - 🔴 **El veredicto de fondo NO cambia:** hay **0 ventas por ningún riel**. Whop es un riel de cobro, no demanda. Sumar una tercera vitrina no arregla que el embudo nunca convirtió.
- **Stripe** — solo era el scope genérico del agente Integral; nunca fue la decisión de producto.
- **Tienda vieja 'Jidoka'** (`jidoka-1455.myshopify.com`, Basic pago, PEN) — NO tiene que ver con Vendí; probablemente Paolo paga un plan que no usa (evaluar darla de baja).

**Modelo de datos desacoplado (clave para migrar a suscripciones barato a futuro):** compras con `tipo` (`lifetime`|`pack`|`suscripcion`), créditos como **ledger** (no flag "tiene pase"), **entitlement/acceso separado del método de pago**. Así suscripciones = agregar un tipo + webhook de renovación, sin refactor.

---

## 6. AUTH: CLERK (live en prod desde 2026-06-13)

**Decisión REVERTIDA (2026-06-12):** antes se decidió NO migrar a Clerk; Paolo lo revirtió con info completa ("no insistas, no nos vamos a quedar en Supabase"). Quiere un especialista en login/verificación. **NO re-litigar.** (El problema original — link de confirmación a localhost + emails no personalizables — era config de Supabase, pero Paolo igual eligió Clerk.)

**Estado:** LIVE en prod, commit `c33177c` (+ fix `39fbf33`), Vercel READY.

**Arquitectura:**
- `clerkMiddleware()` en `proxy.ts` (Next 16: middleware→proxy; redirects a mano por bug Clerk #8302). `<ClerkProvider>` en `app/layout.tsx`. `@clerk/nextjs@7.5.2`.
- **Clerk↔Supabase = third-party auth NATIVO** (el JWT template está deprecado): el cliente Supabase pasa el token de Clerk vía `accessToken`. RLS = `auth.jwt()->>'sub'`. **Id canónico = id Clerk (text).**
- DB migrada (vía MCP, atómico): `clerk_cutover_schema` (drop policies viejas → drop 9 FKs a auth.users → 9 cols user-id uuid→text → 5 RPCs créditos firma text → drop trigger muerto `handle_new_user`) + `clerk_cutover_rls` (16 policies a jwt). Verificado: 9 cols text, 16 policies jwt, 0 residuo `auth.uid()`.
- `lib/auth/use-user.tsx`: `useUser()`/`useUserInitials()` intacta, backed por Clerk. `lib/auth/ensure-profile.ts` (`ensureProfile()`): crea profile + créditos de regalo idempotente vía service_role (reemplaza al trigger muerto), corre en `app/(app)/layout.tsx` + tope de las API routes. `lib/supabase/admin.ts` = service_role sin token Clerk.
- Login/signup = rutas catch-all `app/(auth)/{login,signup}/[[...rest]]` con `<SignIn/>`/`<SignUp/>` themeados (Cuaderno v2). Instancia: `eternal-swift-14.clerk.accounts.dev`.

**⚠️ POST-MORTEM 500 (resuelto `39fbf33`):** el cutover rompió TODA ruta server-side con HTTP 500. Causa: `createServerClient` de `@supabase/ssr` con la opción `accessToken` llama `client.auth.onAuthStateChange` al construir, y supabase-js con `accessToken` deja `client.auth` como proxy que LANZA → explotaba al instanciarse. **Fix:** usar el `createClient` PLANO de `@supabase/supabase-js` con `accessToken`. **LECCIÓN:** el smoke test del cutover solo probó páginas SIN sesión → el 500 se coló. **Próximo cutover de auth: probar SIEMPRE una ruta server autenticada real.**

**⏳ ÚNICO PENDIENTE — remap de los 3 usuarios:** las columnas guardan aún el uuid viejo (como text); el JWT de Clerk trae `user_xxx` → no matchea hasta remapear. Cuando cada uno se loguee en Clerk con su mismo email, correr el UPDATE (template `0012b_remap_users.sql`) en las 9 ubicaciones + paths de Storage. Mapeo: `2067e50a-…` = paolonietoc@gmail.com (Paolo) · `fc0189b1-…` = epas_27@hotmail.com · `2842faf5-…` = alannieto@gmail.com.

**Bonus gratis de Clerk:** login Google 1-clic, protección contra contraseñas filtradas (resuelve el pendiente leaked-password), MFA, webhooks, magic links. Correos: Clerk solo manda los de AUTH; bienvenida/promos → Resend vía webhook `user.created` (futuro). Secret key NO rotada (Paolo usa la del chat, `sk_test_`, su decisión — aunque login config dice instancia PROD `pk_live`, ver abajo).

### Login config (2026-06-24)
Paolo quiere **login clean**; el síntoma que lo molestaba era que Clerk pedía **código por email cada vez** (modo passwordless/email-code). Decisión:
- **Email + contraseña** como método principal (NO email-code/OTP).
- **"Continuar con Google"** (OAuth).
- **Recordar la sesión** + **"Olvidé mi contraseña"** funcional.
- **CLAVE:** el método de auth (password vs email-code, prender Google) es **config del Dashboard de Clerk, NO del código**. El `<SignIn>`/`<SignUp>` prebuilt reflejan lo que esté prendido en el Dashboard; no hay flujo custom forzando email-code (grep confirmado). El código ya está listo. La instancia es de **PRODUCCIÓN** (`pk_live`, keys solo en Vercel) → Google requiere credenciales OAuth propias de Google Cloud. Al prender password, los usuarios passwordless existentes deben usar "Olvidé mi contraseña" una vez.
- **Code fix (worktree `worktree-login-clean`, sin pushear):** bug del redirect post-login — `proxy.ts` mandaba `/login?from=<ruta>` pero `<SignIn>` honra `redirect_url`, no `from` → siempre caía en /dashboard. Cambiado a `redirect_url=<ruta+search>`.

---

## 7. PRODUCTO / UX

### Estaciones (el recorrido del usuario)
**3 estaciones** (no 5): (1) **Producto** (fotos), (2) **Referencias + Estilo combinadas** (misma decisión "¿cómo quiero que se vea?"), (3) **Formato** (ratio + cantidad). **No hay estación "Prompt"** — el usuario nunca escribe ni edita prompt en flujo normal (no es prompt engineer). El concatenador lo arma solo.
- Estado en código (al 2026-06-11): `producto/` ✅, `referencias/` ⚠️ ahora OPCIONAL pero todavía separada de `estilo/` (la **fusión Refs+Estilo es el único gap abierto**), `estilo/` → "Estilos Profesionales", `formato/` ✅, `prompt/` ✅ ya no existe.

### Prompt estricto: POST-generación (spec confirmada 2026-07-02 — regeneración por imagen construida)
Modo "prompt estricto" que **solo se habilita después** de generar, para el "último 0.5%": el usuario toma el volante y escribe la ESPECIFICACIÓN EXACTA de la imagen; la IA la **prioriza y la cumple al pie de la letra, sin alucinar**. UX: (1) completar estaciones + generar sin tocar prompt; (2) en `/fabrica/[versionId]` ver grilla → click → modal; (3) en el modal: **Prompt original** (read-only) + **Prompt estricto** (editable) + botón **Regenerar** (cobra 1 crédito).
- **La spec CLAVE (refinada con Paolo, caso soufflé):** el prompt estricto es una **capa AUTORITATIVA que se SUMA**, NO un reemplazo. Se **MANTIENEN** los tres inputs — **producto** (identidad blindada), **referencias de escena** y **estilo elegido** — y encima se cumple la especificación del usuario, que **gana solo donde CHOCA** con estilo/referencias.
  - Caso real que motivó la spec: usuario con envases soufflé (producto) + refs de empaques de salsa, que quería FUSIONARLOS. El modo normal se lo bloqueaba ("referencias = solo estilo, no copies contenido"). El estricto abre eso.
- **"Sin alucinar" = 2 cosas:** (1) **Producto blindado** — forma/color/etiqueta+texto/proporciones vienen de la FOTO, nunca del texto; nunca se deforma ni reemplaza (`HARD CONSTRAINT`). (2) **Literal, sin Director** — en estricto el **Director NO corre** + temperatura 0.2: la IA no enriquece, no agrega props/mood no pedidos, no reinterpreta ni ignora lo pedido.
- **Modelo de datos:** `generated_images.strict_prompt` = prompt EDITABLE (arranca `""`); `metadata.base_prompt` = prompt final read-only que usó el modelo. Migración `0010` movió los legacy.
- **Backend:** `POST /api/generations/regenerate` (imageId + strictPrompt) → cobra 1 crédito atómico (deduct/refund) → `generateOnServer({ strictPrompt, styleFragment })` (lee `version.style_id` para mantener el estilo) → nueva `generated_images` en la misma versión. La lógica del prompt estricto vive en `generateOnServer` (`lib/ai/generate-server.ts`).
- **OJO historia git:** la sesión que lo construyó (commit `5b737fd`, rama `worktree-prompt-estricto`) hacía estricto = IGNORAR estilo+refs. Se **reconcilió** con esta spec en commit `8d59b87` (2026-07-02). Aterrizaje limpio a main vía rama `feat/prompt-estricto` desde origin/main (sin el commit de tema `d71e9be`). Si ves código que borra refs en estricto, es la versión vieja.

### Fábrica rediseñada (2026-06-11, commit `df372cf`, migr `0010`)
- **`/fabrica/[versionId]`** = catálogo limpio (thumbnails con badge V{n} + favorito/descargar en hover). Click → modal (`components/app/version-gallery.tsx`): foto izq + 3 secciones der (Seteos read-only / Prompt original read-only / Prompt estricto editable).
- **`versions.style_id`** (migr 0010): el estilo elegido en `/estilo` se persiste por versión. Generación lo toma server-side autoritativo (`getStyleFragment(version.style_id) || styleFragment(body)`).
- **Quitados:** botón Duplicar (de la vista de versión y de la card; `duplicateVersion` SIGUE en el store, usado en `productos/[id]/page.tsx` — NO borrar) y el selector de estilos en la versión ya creada.
- Conteos unificados: "una imagen = una generación" (badge y texto usan el mismo número = imágenes `completed`).
- Cards de versión (`productos/[id]/page.tsx`) muestran mini-galería (hasta 4 thumbs + "+N"). Routing condicional: con imágenes → `/fabrica/[versionId]`; borrador sin imágenes → setup.

### Estilos Profesionales (2026-06-11, commits `3de9ec4`/`f9708bc`, en PROD)
- `lib/styles.ts`: 10 estilos de fotografía de producto (estudio_limpio, lifestyle, flat_lay, knolling, producto_flotando, editorial_premium, aire_libre, macro_detalle, fondo_color, calido_artesanal). Cada uno: `fragment` premium en inglés + `previewImage` (`/public/estilos/*.jpg`, Unsplash licencia comercial). Helpers `getStyleById`/`getStyleLabel`.
- Referencia ahora **OPCIONAL** (3 modos: estilo solo / ref sola / ambos). Se sacaron las 2 compuertas que la obligaban.
- **OJO — `CURATED_STYLES` sigue en el código:** los viejos "estilos curados" (cuadrados de color) se sacaron del selector, PERO `CURATED_STYLES`/`parseCuratedRef`/`curatedRefDataUrl`/tipos se MANTIENEN exportados desde `app/(app)/referencias/page.tsx` porque los importa el **Análisis con IA (Oráculo)** + retrocompat. NO borrarlos sin migrar esos 3 consumidores primero, o se rompe el build.

### Planes (estrategia comercial)
- **Solo dos planes:** **Free** (default) + **Pro** (upgrade). No hay Studio/Business/Enterprise. Una sola opción convierte mejor.
- **La copy comercial vive en la landing `/upgrade`, NO en la app.** La app solo muestra estado del plan + botón a `/upgrade`. Cambiar precios/features no debe requerir tocar código de la app.
- Hoy `currentPlan` hardcodeado `"free"` en `ajustes/page.tsx`.

### UI decisions (2026-06-06)
1. **Cards = GLASS REAL** (`.glass-card`/`.glass-card-compact` en `globals.css`): glassmorphism real (cream/dark-green translúcido 0.74–0.82 + `backdrop-filter: blur` + highlight + sombra). **Revierte** el "sólido cream" del handoff Cuaderno v2 (si ves ese comentario, está obsoleto). Paolo: "necesito el real glassmorphism". Se resolvió la dilución de texto con glass DENSO + texto secundario más contrastado.
2. **La versión se abre en PÁGINA completa** (`/fabrica/[versionId]`), NO en drawer. `components/dashboard/version-drawer.tsx` = código muerto (borrable). Post-generación usa recarga fresca (`window.location.assign`/`reload`) para re-hidratar el store desde la DB.
3. **Un solo indicador de carga** al generar (`generating-overlay.tsx` full-screen). Se quitó el "procesando" redundante.
- Fix: "la app se recarga sola al volver a la pestaña" era `onAuthStateChange` seteando el user en cada TOKEN_REFRESHED → fix: solo actualizar si `user.id` cambió.

### Diseño visual (Cuaderno v2 — Davinci)
Tokens Tailwind v4 en `globals.css`, paleta cream/forest/butter/clay, tipografía Instrument Serif (display) + Inter (UI), glass-card, Framer Motion. Estética premium, mobile-first (regla CSS, no positioning — la app es **web**, se accede desde el browser, NO es app nativa).

---

## 8. LANDING (proyecto Vercel SEPARADO)

**Landing y app = deployments SEPARADOS. NO re-proponer unificar** (se implementó el 2026-06-18, commit `17405c7`, y se REVIRTIÓ el mismo día `500f295` a pedido de Paolo: logueado no podía ver su landing en `/`, lo pateaba al dashboard). Dos proyectos Vercel:

| Cosa | Proyecto Vercel | Dominios |
|---|---|---|
| App (Next) | `vendiapp` | **vendilatam.com** (apex, CANÓNICO) + vendiapp.vercel.app |
| Landing (HTML) | `vendilanding` | vendilanding.vercel.app + **www.vendilatam.com** |

La sesión de Clerk vive en **vendilatam.com** → los CTAs de la landing que dependen de auth apuntan ahí, NO a vendiapp.vercel.app.

### ✅ 2026-06-25: LANDMINE git-coupling DESACTIVADO
El git-coupling se disparó de nuevo (pushes de la APP a main re-deployaban `vendilanding` desde el repo de la app → build de la app → **404** en www.vendilatam.com). **Fix aplicado (con OK explícito de Paolo):**
1. Re-deploy CLI de la landing standalone → prod READY, dominios a 200.
2. **`vercel git disconnect`** sobre `vendilanding` → **los pushes a main ya NO tocan la landing. Landmine MUERTO.**
- **Consecuencia:** la landing vive 100% del deploy CLI standalone. Para publicar: copiar `landing.html`→`index.html` + `estilos/` a un dir, linkear a `vendilanding`, `vercel deploy --prod --yes`. Al re-deployar SIEMPRE copiar `public/estilos/*.jpg` al `<dir>/estilos/` (si no, imgs 404).
- Pendiente menor: `/og-image.jpg` da 404 (preview social).

### Paywall /fundador STANDALONE (Lifetime Pass) — VIVO (2026-06-27)
El paywall del Lifetime Pass pasó de estar DENTRO de la app (`/upgrade/fundador`, route group `(app)`, con nav → el unpaid se escapaba a otras pestañas) a una **página de entrada ENCERRADA estilo Arcads** (`app.arcads.ai/onboarding/paywall`). Construido por **Frontero** (a pedido explícito de Paolo: 'usá a los agentes'), PR #6 (commit `80b4dca`, merge `effbd5b`), deployado y verificado en vivo.
- **`app/fundador/page.tsx`**: ruta TOP-LEVEL **fuera de `(app)`** → usa solo el root layout (sin sidebar/nav). Guardas server: sin sesión → `/signup?redirect_url=/fundador`; pagó (`userHasPaidAccess`) → `/dashboard`; logueado-sin-pagar → renderiza el paywall. El unpaid SOLO puede pagar o cerrar sesión (no navega la app).
- **Diseño 1:1 con la tarjeta Lifetime Pass de la landing** (la captura de Paolo): badge 'OFERTA DE LANZAMIENTO', título **'Lifetime Pass'** (NO 'Pase Fundador' — Paolo lo corrigió), precio **~~$27~~ $10 USD** + 'AHORRÁS $17', 6 beneficios, botón 'Quiero mi Lifetime Pass →'. Estilos autocontenidos en `app/fundador/fundador.css` (paleta/fuentes de la landing, no el design system del app). Archivos: `app/fundador/{page.tsx,fundador-client.tsx,fundador.css}`.
- **Cobro:** el botón → `POST /api/checkout {productId:'lifetime-pass'}` → redirige al `init_point` de **Mercado Pago**. Precio real lo resuelve el catálogo (S/39); la tarjeta MUESTRA $10/$27 (Paolo: 'dejalo así', mismatch USD-display vs PEN-charge a propósito).
- **Wiring:** `app/comenzar/route.ts` → `producto=lifetime-pass` redirige a `/fundador` (no más `/upgrade/fundador`). `proxy.ts`: `/fundador` en `isPaywallExempt` (requiere sesión, no es pública). Borrada `app/(app)/upgrade/fundador/page.tsx`. `/upgrade` interno (packs) intacto.
- **Pendiente UX (no bloqueante):** Paolo quiere login estilo Arcads (un clic, sin código por mail) → activar **Google OAuth en Clerk** (config de panel + credenciales Google; el botón aparece solo en el `<SignUp>`). Hoy Clerk pide código de verificación por correo.
- Verificado en vivo: /comenzar?producto=lifetime-pass → /signup?redirect_url=/fundador; /fundador existe (protegida). Falta la prueba: primera compra real.

### Lifetime Pass por Mercado Pago — VIVO (2026-06-27)
El Lifetime Pass (= COMPRAR LA APP; pago único; SOLO en la landing, NO es recarga interna) ahora se cobra por Mercado Pago end-to-end. Antes su botón caía en /upgrade (tienda de packs) y no había forma de comprarlo.
- **Flujo vivo:** landing 'Quiero mi Lifetime Pass' (y todos los CTAs de compra) → `vendilatam.com/comenzar?producto=lifetime-pass` → `/signup?redirect_url=/upgrade/fundador` → `/upgrade/fundador` (vitrina que muestra SOLO el Pase) → POST /api/checkout (productId=lifetime-pass, external_reference=Clerk userId) → Checkout Pro MP → webhook → `process_mp_payment`.
- **Migración 0017 (aplicada a prod 2026-06-27):** `process_mp_payment` pasó de 4 a 6 args (`p_is_lifetime`, `p_analysis_credits`). En la misma transacción idempotente: `grant_credits('purchase')` + `grant_analysis_credits` (si >0) + `update profiles set plan='founder'` si es lifetime. Antes solo el RPC de Shopify daba 'founder'.
- **Catálogo:** lifetime-pass ahora con `analysisCredits: 10` (la landing prometía 10 análisis que ningún flujo daba; ahora el Pase los incluye). Packs internos (/upgrade) intactos.
- **Landing:** copy reescrito — se sacó 'X de regalo / sin tarjeta / análisis de cortesía' (contradecían el paywall). Quedó 'pago único que INCLUYE 60 créditos + 10 análisis'. (Los 'cupón de regalo' del quiz son un descuento, benignos.)
- **PRECIO sin unificar (decisión de Paolo: 'dejalo así'):** la landing muestra **$10 USD** (con $27 tachado), MP cobra **S/39 PEN**. Inconsistente a propósito por ahora; Paolo no quiso tocarlo.
- ⚠️ **DRIFT / DURABILIDAD — RESUELTO 2026-06-30:** la app se deployó por **CLI** (rama `fix/lifetime-mp-checkout`, commit `b4e22d8`, basada en origin/main). El harness bloquea el push a main, así que el código **NO está en origin/main todavía**. Si alguien pushea a main, Vercel redeploya main y BORRA este fix. YA MERGEADO el 2026-06-27: PR #5 (merge `6274574`) dejó `b4e22d8` como ancestro de `origin/main`=`effbd5b`, verificado por topología el 2026-06-30. El fix quedó clavado en main; un push a main ya NO lo borra. (pendiente viejo ya cumplido, ignorar el resto: compare/main...fix/lifetime-mp-checkout). La migración 0017 SÍ está en la DB pero su archivo solo en la rama.
- Verificado en vivo: /comenzar?producto=lifetime-pass → signup → /upgrade/fundador (existe, no 404); landing sin link de prueba. Falta la prueba final: una compra real.

### Botones auth-aware (2026-06-19) · GAP del link de PRUEBA RESUELTO (2026-06-27)
Los CTAs "Comenzar"/"Unirme" → **`vendilatam.com/comenzar`** (ruta `app/comenzar/route.ts`). + "Iniciar sesión" → `vendilatam.com/login`.
- ⚠️ **GAP histórico (RESUELTO 2026-06-27):** `/comenzar` sin sesión redirigía a un link MP estático con `pref_id` de **PRUEBA** (`3480421938-38862917-...`) — NO cobraba real, y peor: un pref_id estático no lleva `external_reference` por usuario, así que aunque fuera productivo el webhook no podría acreditarle créditos a nadie (el cliente pagaba y quedaba sin nada). Detectado por ChatGPT (Paolo, 2026-06-27) y confirmado en vivo (`vendilatam.com/comenzar` → 307 → mercadopago test link). La env `MP_PAYMENT_LINK` ni estaba seteada en Vercel (caía al fallback de prueba hardcodeado en el route).
- ✅ **Fix (PR #3, commit `1c0e62c`, merge `3bf05b7`, deploy prod `dpl_7aBr...` READY):** `/comenzar` ahora enruta SIEMPRE por el checkout per-usuario (el único que cobra Y acredita): **con sesión → `/upgrade`**; **sin sesión → `/signup?redirect_url=/upgrade`**. Eliminado el link estático y la env `MP_PAYMENT_LINK`. Verificado en vivo: el redirect a Mercado Pago de prueba desapareció. Worktree del fix: `worktree-fix-comenzar-cobro-real` (rama mergeada, conservada en disco).
- 🟢 **CRÍTICO — la landing VIVA también se arregló y redeployó (2026-06-27):** la landing real (la del quiz, de los ads de Meta) NO estaba en el apex sino en **www.vendilatam.com** (proyecto `vendilanding`, deploy CLI standalone), y era la versión **WIP local** (botones → `VendiQuiz.openCheckout()`/`buy()`), que iba **directo** al link MP de PRUEBA SIN pasar por `/comenzar`. O sea: el fix de `/comenzar` por sí solo NO alcanzaba. Fix de la landing: `buy()` → `https://vendilatam.com/comenzar` (cobro real per-usuario), `APP_URL` = dominio canónico `vendilatam.com`, `MP_PAYMENT_LINK=''` (link de prueba muerto). Redeploy CLI a `vendilanding` prod (`dpl_7VMn1AN...` READY) desde un dir temporal (NO se tocó el repo; landing.html sigue trackeado con el blob viejo = landmine conocido). Verificado en vivo: `www.vendilatam.com` 0 hits del pref_id de prueba; todo CTA de compra → `/comenzar` → checkout per-usuario. **Paolo confirmó (2026-06-27) que el flujo cuenta-primero es INTENCIONAL — NO revertir a un link MP suelto.** Razón: para cobrar Y acreditar los créditos automáticamente, MP necesita saber quién compra (external_reference = id Clerk). Flujo end-to-end verificado: nuevo visitante → `/comenzar` → `/signup?redirect_url=/upgrade` → registro → cae en `/upgrade` (la `redirect_url` gana sobre el fallback env `/onboarding`) → paga MP real → webhook acredita. Usuario ya logueado → `/comenzar` → directo a `/upgrade`. `/upgrade` NO está gateada por onboarding (el layout `(app)` no fuerza desvío).

### 🎬 2026-06-27: VIDEO "PREVIEW" en la landing (reemplaza la animación CSS)
- La sección `#vsl` ("Video Sales Letter") ahora muestra un **video real de IA** en lugar de la animación CSS `#vendiFlow`. El kicker, el link de nav y el botón del hero pasaron de "Cómo funciona" -> **"Preview"/"Ver preview"**. Deploy a `vendilanding` prod (`dpl_6AUs3vqd81gQdVgqom7ARmS4CwBE`, READY, alias www.vendilatam.com). Verificado en vivo: kicker Preview, `/perfume_preview.mp4` 200, checkout sigue a `/comenzar` (0 hits del pref_id de prueba -> sin regresión).
- **El video = TEST/placeholder** (calidad-prueba, a mejorar): perfume genérico "ordinario -> campaña de lujo dorado/floral", 9:16, 4s, 720p, sin audio. Hecho con **Higgsfield** (imagen de arranque Nano Banana Pro 2cr + animación **Veo 3.1 Lite** 4cr). Versión buena pendiente: **Seedance 2.0** (mejor, pero 22.5 cr -> hay que cargar créditos primero).
- **Higgsfield (cuenta de Paolo) = plan FREE, ~4 créditos al 2026-06-27.** Aprendido: en free las IMÁGENES andan; la mayoría de modelos de VIDEO están gateados (Kling Turbo pide plan Basic -> error `job_minimum_basic_plan_required`); **Veo 3.1 Lite SÍ corre en free** (4cr/4s). Los intentos gateados NO cobran. `get_cost:true` preflightea el costo sin gastar.
- ⚠️ **Confirmado: el `landing.html` del repo (working tree) está STALE** - todavía tiene el link MP de PRUEBA (línea ~1972, `pref_id=3480421938...`) y `buy()` lo usa; le FALTA el fix de `/comenzar`. La landing VIVA NO sale del repo. **REGLA: para deployar la landing NO usar el `landing.html` del repo.** Fuente correcta = bajar el HTML vivo (`curl https://www.vendilatam.com/`) y editar sobre eso.
- **Dir de deploy reusable:** `C:\Users\Usuario\.vendi-landing-deploy\` (ya linkeado a `vendilanding` vía `.vercel`). Contiene `index.html` (= HTML vivo + edits del video), `estilos/` (10 jpgs), `perfume_preview.mp4`, `perfume_poster.png`. Re-deploy: editar `index.html` ahí + `vercel deploy --prod --yes --cwd <dir>`. La landing referencia `/estilos/*.jpg` + el video + favicon inline; `/og-image.jpg` sigue 404 (pendiente viejo, no regresión).

### 2026-06-28: CTAs → scroll al Pase Fundador + REGRESIÓN que causé (y arreglé)
- **Cambio pedido por Paolo:** TODOS los CTAs de embudo (Comenzar nav/hero, Unirme, "Quiero mis fotos así", CTA final) ahora hacen **scroll suave al Pase Fundador** (`#precios`, `scrollIntoView`) en vez de ir directo al checkout. El botón DENTRO de la tarjeta del Pase queda como la compra real (intacto, `VendiQuiz.buy()`). Deploy CLI a `vendilanding` prod (alias www.vendilatam.com, READY). Verificado en vivo: scrollIntoView x7, video/Preview/copy nuevo intactos.
- ⚠️ **LECCIÓN (metí la pata y la arreglé):** primero edité y deployé el `landing.html` del **REPO** (stale) → la landing viva PERDIÓ el video, "Preview" y el copy reescrito (volvió "60 créditos de regalo", que CONTRADICE el paywall). Lo detecté al leer §8 (que ya avisaba esto). **Arreglo:** apliqué el scroll sobre la versión BUENA (`.vendi-landing-deploy/index.html`) y redeployé. **REGLA REFORZADA (ya estaba, ahora en negrita): la landing viva se deploya SOLO desde `C:UsersUsuario.vendi-landing-deploy` (que tiene video+poster+estilos y está linkeado a vendilanding). NUNCA desde el `landing.html` del repo — está stale y es landmine.**

### Qué es la landing
Single file HTML+CSS+JS standalone (`landing.html`, solo Google Fonts como dep externa). Paleta sage/cream/butter/clay/forest. Tipografías DISTINTAS a la app: **Fraunces** (display/wordmark, italica 500), **Hanken Grotesk**, **DM Mono**. Imágenes reales = las 10 fotos de estilos (`public/estilos/*.jpg`). Secciones: NAV → HERO → animación CSS `#vendiFlow` (foto cruda→resultado) → MÉTRICAS → GALERÍA → PROBLEMA → CASOS → SOLUCIÓN → PRECIOS → FAQ (9 Q&A) → CTA → FOOTER. Quiz auto-abre al cargar (INTENCIONAL, vienen de ad de Meta — NO tocar).
- **Leads:** tabla `public.leads` en Supabase (RLS insert-only, anon puede INSERT no SELECT). `saveLead()` hace POST con publishable key, `keepalive:true`. ⚠️ La migración `leads_capture` se aplicó vía MCP pero NO quedó versionada en el repo (drift a arreglar).
- Pendientes: og-image.jpg, llenar links legales (Términos/Privacidad/Contacto) antes de cobrar, unificar moneda (landing dice USD, MP cobra soles).

---

## 9. SEGURIDAD (Supabase)

### Hardening inicial (2026-06-06, vía MCP advisors: 15→1 hallazgo)
- **Crítico cerrado:** las RPCs de créditos (`grant_credits`, `grant_analysis_credits`, `deduct_credits`, `deduct_analysis_credit`) son `SECURITY DEFINER`, reciben `p_user_id`/monto arbitrarios y no validan al llamador. Estaban ejecutables por `anon`/`authenticated` → cualquiera podía auto-regalarse créditos. Migraciones 0007/0008: revocado EXECUTE, concedido solo a `service_role`. **El backend DEBE llamarlas con service_role key (server-side, nunca cliente).**
- Otros: `search_path` fijado en funciones; índice FK en `credit_ledger.generation_id`; bucket `starter-references` ya no lista archivos.
- Pendientes: **leaked-password protection** OFF (toggle no aparece en Free; activar al pasar a Pro); RLS initplan perf (~12 policies re-evalúan `auth.uid()` por fila — envolver en `(select auth.uid())` cuando se toquen).
- **Drift:** el hardening se aplicó solo a la DB viva vía MCP, NO versionado en el repo.

### ⛔ Agujero CRÍTICO RPC créditos PUBLIC (2026-06-25, cerrado)
**Encontrado durante el wiring de Shopify** (`get_advisors(security)` + prueba REST real): `anon` y `authenticated` podían invocar las RPC de créditos vía PostgREST `/rest/v1/rpc/<fn>` (las 4 de créditos + `is_unlimited` + `process_mp_payment` + `process_shopify_order`). Un atacante podía POSTear `grant_credits(p_user_id=<su id>, p_amount=99999, p_reason='purchase')` y **auto-regalarse créditos sin pagar**.

**Causa raíz (LECCIÓN reusable):** `CREATE FUNCTION` concede `EXECUTE` a `PUBLIC` por default. Las migraciones previas (0007/0012/0013/0014) revocaban solo de `anon`/`authenticated`, **NO de PUBLIC** — y ambos roles heredan de PUBLIC → el EXECUTE seguía vigente. El cutover de Clerk (0012) que hace `drop+create` **reabrió** lo que el hardening manual del 2026-06-06 había cerrado solo en la DB viva (drift no versionado).

**Fix:** migración `0015_lock_credit_rpcs_from_public.sql` (commit `e09ea43`, branch `worktree-shopify-webhook-creditos`) — `REVOKE EXECUTE ... FROM PUBLIC` en las 7 RPC. **Aplicada a PROD el 2026-06-25** con autorización explícita de Paolo. Solo restringe acceso; el server usa service_role (bypassa GRANTs) → checkout/generación/análisis/webhooks intactos. **Versionada** (sin drift esta vez). Tras el fix: `42501 permission denied` (401).

**REGLA DURA:** cada vez que se cree o RECREE una función `SECURITY DEFINER` de la plomería de créditos (o cualquier RPC sensible en schema public), **revocar de PUBLIC** (`revoke execute ... from public`), no solo de anon/authenticated. Correr `get_advisors(security)` después de tocar funciones.

---

## 10. INFRA / HERRAMIENTAS / LECCIONES

### Memoria unificada (este archivo + el hook)
2026-06-07: la memoria nativa se scopea por la ruta del cwd → cada carpeta (vendi, vendiapp padre, cada worktree) generaba su propia memoria fragmentada. **Solución:** el hook SessionStart `C:\Users\Usuario\.claude\hooks\vendi-context.ps1` inyecta, desde una RUTA FIJA, este archivo de memoria + directiva firme. Cualquier terminal/worktree recibe la misma memoria.
- **El hook NO corre para los subagentes** (solo inyecta a la sesión principal = Capataz). Por eso los subagentes deben `Read` los DOS archivos (`MEMORIA_DE_DIOS.md` + `MINIONS.md`) por ruta absoluta antes de actuar. ⚠️ Las definiciones `.claude/agents/*.md` todavía mandan a leer el viejo `MEMORY.md` + `VENDI_DOC.md` → **pendiente actualizarlas** a estos dos archivos (commits originales `698b1a4`+`57d4503`).
- **2026-06-25:** se consolidó la memoria de Vendí en DOS archivos en esta carpeta: `MEMORIA_DE_DIOS.md` (proyecto) + `MINIONS.md` (agentes). Se borró TODO lo demás: las 27 memorias fragmentadas, el viejo `MEMORY.md`, y 2 memorias Vendí stale del home (`project_vendi.md` + `project_vendi_subagents.md`, pre-pivote). El hook se reescribió para inyectar SOLO esos dos archivos — sin header de "contexto canónico", sin volcados de `CLAUDE.md`/`AGENTS.md`, sin `VENDI_DOC.md` ni `CONTEXTO_VENDI.md` (pedido explícito de Paolo: que NO salgan los archivos de contexto). Toda la memoria de Vendí vive SOLO en esta carpeta.

### Generador de imágenes local (standalone, fuera de la app)
2026-06-21: para generar imágenes (ej: para la landing) SIN tocar la app. Carpeta fija fuera del repo: `C:\Users\Usuario\.vendi-imggen\`:
- `gen.mjs` (Node, fetch nativo, sin SDK; args `--out`, `--prompt`, `--ref`, `--model`) · `.key` (GOOGLE_API_KEY de Vendí, NUNCA versionar) · `refs\` / `out\`.
- Modelo `gemini-3.1-flash-image-preview` (mismo que la app). **Reusar, no recrear.** Si la key falla, pedirla de nuevo (Vercel Reveal de GOOGLE_API_KEY o AI Studio).

### ⚠️ LECCIÓN — drift de git (error 2026-06-07)
Me pasé una sesión "construyendo" el backend de créditos que **YA EXISTÍA y estaba deployado** en `origin/main` (`7eace7e`). Causa: el `main` LOCAL de Paolo estaba **5 commits ATRÁS** (estado pre-pivote, con BYOK). Vi que faltaba `art-director.ts` (borrado a propósito en el pivote), asumí mal que el worktree estaba viejo e hice `git reset --hard main` → me llevé al código stale.
- **REGLA:** NUNCA asumir que local main = verdad. SIEMPRE comparar con `origin/main` antes de construir (`git fetch` + `git log --oneline main..origin/main`). La topología (`git merge-base`) es la autoridad, no los mensajes/fechas de commit. Si un archivo "falta", chequear si fue borrado a propósito (`git log -- <archivo>`).
- El branch `worktree-backend-creditos-server` / commit `3b6a26c` NO se mergea (rebuild redundante sobre base stale).

---

## 11. GROWTH / INTELIGENCIA DE MERCADO

### 🔎 Capacidad de research de canales (Willy) — 2026-07-06
Vendí ahora tiene un minion de research, **Willy (research)**, que **analiza canales y videos de YouTube enteros** (metadata + transcripciones vía pipeline `yt-dlp`, sin API key de Google) de cualquier creador o competidor, y destila su cerebro en un dossier + playbook accionable. Es **reutilizable**: se apunta a cualquier fuente. Detalle del agente y del pipeline (con los gotchas) en `MINIONS.md`. Alimenta a **Metapod** (growth) y **Davinci** (creativos).

### 📊 Asset: research de Santi Bilbao (@SantiagoBilbao) — 2026-07-06
Primer caso de Willy. Bilbao escala **productos digitales a 7 cifras** con Meta Ads; su audiencia (vendedores DR de LATAM, obsesionados con creativos/hook para Meta) **ES el ICP de Vendí**, y su cuello de botella declarado —el **hook/creativo**— es justo lo que Vendí produce. O sea: su discurso *pre-vende* a Vendí.
- **Alcance del análisis:** 353 videos mapeados, **248 transcritos (todo 2025-2026, ~139k+ palabras)**. Canal chico en orgánico (5.490 subs, ~569 vistas promedio) → su negocio corre por **Meta Ads pago + backend**, no por YouTube (YouTube = autoridad/nurture).
- **Dossier (Artifact):** `https://claude.ai/code/artifact/52df877c-be32-4c4e-a640-e2f032aeb09b`
- **Playbook destilado (cargado en Metapod):** ecuación madre **CPV < RPV**; bajar CPV con **hook >50% / retención >10% / CTR 2-3% / carga landing >70%**; subir RPV con **conversión + AOV vía backend (ratio AOV/front = 1.5)**; escalar en **ABO 1-1** (+25-30%/día si ROAS>1.5, o 2× cada ~2h agresivo); testeo micro-budget 21-24h; **funnel hacking** para elegir oferta (ChatGPT keywords + herramienta espía + Biblioteca de Anuncios; filtros de +3 días / 7+ creativos; desarmar backend/suscripciones del competidor); modelo **venta directa perpetua + low-ticket + backend + WhatsApp**.
- **⚠️ Regla de uso (compliance):** se toma la **mecánica** (unit economics, estructura de campañas), **NUNCA el copy de claims de ingresos** ("$X/día") — eso viola las Advertising Standards de Meta y choca con la PRIORIDAD #0 de Metapod. Sirve para *pensar* la pauta y el GTM, no para *escribir* el anuncio.
- **Uso para Vendí:** ángulos de copy en el idioma del mercado ("creativos ganadores", "rompe-scroll", "ROAS 2 en LATAM"), plantilla de funnel (contenido → lead magnet → WhatsApp → oferta) para el GTM propio, y posible ángulo de colaboración/afiliación (creadores así ya recomiendan bundles de herramientas IA).

---

### 📕 Asset: BIBLIOTECA AULAPAOLO — 27 clases destiladas — 2026-08-25
**El asset de growth más grande que tiene Vendí.** Paolo tenía un campus offline local (`C:\Users\Usuario\Downloads\AulaPaolo`, 5 GB, 27 MP4, ~11h40m) que **nunca se había procesado**. Se transcribió entero y se destiló en un playbook operativo.

- **Los 3 cursos:** **Meta Ads por Santiago Bilbao** (17 clases — creativos, campañas, tracking) · **Marketing para Apps de IA por Claudio Conde** (3 clases) · **SLA Sesiones en Vivo** (7 mentorías).
- **Entregables (rutas):**
  - Playbook destilado → `cerebro_vendi/PLAYBOOK_ADS_AULAPAOLO.md` (~15k palabras)
  - Transcripciones crudas → `cerebro_vendi/transcripciones/aulapaolo/` (27 archivos, ~93k palabras)
  - **Metapod lo lee por ruta absoluta** — instrucción explícita en `.claude/agents/metapod.md` §Biblioteca AulaPaolo. (Corrige el error del asset de YouTube: aquel dejaba un link a un Artifact que Metapod nunca fue instruido a abrir.)
- **Cómo se hizo:** faster-whisper `small` int8 en CPU (sin GPU, sin API key — `GOOGLE_API_KEY` está vacía en `.env.local`), 2 workers × 2 hilos ≈ 1,7x realtime, + normalizador de jerga (710 correcciones: AVO→ABO, Coscap→Cost Cap, "chat chepete"→ChatGPT, etc.). Scripts en el job dir, reanudables.
- **⚠️ 3 sesiones de SLA (05/06/07) estaban descargadas ROTAS** (solo-video, sin pista de audio, sufijo `.f134`). Se rescató el audio parcial de los `.f140.m4a.part` huérfanos: 5 + 49 + 11 min. **El resto de esas 3 sesiones no existe en disco.** Además el `run.log` muestra que **las sesiones 18-27 nunca se descargaron** (Google Drive tiró 429).

**🔑 Los 4 hallazgos que cambian decisiones de Vendí:**
1. **Claudio Conde = fundador de 100ads** (`app.100ads.ai`), la app que Vendí ya tiene auditada con el agente **Adsioso**. Hay la voz del fundador explicando el porqué + la auditoría del producto. Su modelo (app de IA, suscripción US$57/mes) **es el de Vendí**, no el de Bilbao (infoproducto pago único).
2. **Mercado Pago es una VENTAJA de conversión, no una limitación.** Conde declara que su conversión en Argentina **bajó** al migrar de Mercado Pago a Stripe, y lista "precio en moneda local + medio de pago conocido" entre las causas de checkout que no convierte. Si alguna vez se evalúa migrar el cobro, esto es evidencia en contra.
3. **El backend no es un extra: es una defensa.** *"El que tiene el RPV más alto gana la subasta."* Sin backend el RPV queda plano y no podés pagar el clic que paga un competidor con upsells. Explica **por qué** el ratio AOV/front = 1.0 de Vendí es existencial y no cosmético.
4. **Tensión abierta sobre el pago único** (NO resuelta, es decisión de Paolo + El Comerciante): la memoria concluye que el pago único sin backend no hace viable el tráfico frío; Conde sostiene que el pago único es la jugada correcta **para validar** y la recurrencia viene después. Hablan de fases distintas. La pregunta real es *"¿en qué fase estamos?"*.

**⛔ 3 prácticas del corpus marcadas como NO copiables** (violan Advertising Standards / defensa del consumidor): reseñas falsas estilo Trustpilot, testimonios inventados al arrancar, y compra de seguidores. Marcadas en el playbook con sus alternativas legítimas.

**🚨 Además, entró al playbook anti-baneo de Metapod:** evidencia de campo de **cuentas publicitarias baneadas de por vida** por conectar un agente de IA (Claude Code) a la Marketing API — por app sin verificar y por ráfagas (~800 peticiones/minuto). Metapod ahora exige rate-limiting explícito y app en producción **antes** de pedirle a Integral la primera automatización.

---

_Fin de MEMORIA DE DIOS. Mantené este archivo como única fuente de memoria de Vendí._


---

## Consolidación de memorias sueltas (2026-07-10)
> Se fundieron acá memorias auto-generadas sueltas (violaban la regla "memoria = solo el cerebro") y se borraron esos archivos. Facts netos:

### Tooling: pnpm, NO npm
El repo usa **pnpm** (`pnpm-lock.yaml`). `npm install` ROMPE los tipos: mete `@types/react@19.2.17` en vez del `19.2.14` fijado y no instala `@base-ui/react` → ~80 errores en `components/ui/*` (ninguno real). Para typechear en un worktree fresco: `pnpm install --frozen-lockfile` + `npx tsc --noEmit -p tsconfig.json`.

### Regla dura: NUNCA regresionar main/prod
Al integrar un feature, `main` no retrocede jamás (main = prod, deploya solo). Si el feature vive en una rama atrasada/divergente respecto a `origin/main`, NO pushear esa rama a main: crear rama nueva desde `origin/main` y solo AGREGAR el feature (cherry-pick), excluyendo scope no relacionado (ej. commits de tema). Confirmar con Paolo antes del merge final; nunca pushear a main directo. (Paolo enfático 2026-07-02.)

### Clerk: instancia TEST = la de PROD + admin de usuarios
- La instancia Clerk autoritativa en PROD es la **TEST** (`sk_test_`/`pk_test_`), NO una live — corrige lo viejo que decía `pk_live`. La key `CLERK_SECRET_KEY` (`sk_test_…`) vive en `.claude/worktrees/clerk-migration/.env.local`; el `.env.local` de la raíz está viejo (BYOK) y NO la tiene. Los `user_id` de esta instancia matchean `profiles.id` del Supabase de prod.
- **Admin de usuarios:** `profiles` NO tiene columna `email` (vive solo en Clerk → `GET api.clerk.com/v1/users?limit=100` con `Bearer <CLERK_SECRET_KEY>`). Sesiones activas: por `user_id` (el global da HTTP 422). Borrar usuario = `DELETE /v1/users/<id>` + limpiar Supabase en orden de FKs: `generated_images → credit_ledger → generations → analyses → versions → projects → subscriptions → unlimited_users → profiles`. Usuarios pre-Clerk tienen `id` UUID y existen solo en Supabase. Ops destructivas: SIEMPRE desde el main con OK directo de Paolo, verificando por email (no por display_name).

### Tema OSCURO = default de marca (Natural OS)
Desde 2026-07-01 el tema por defecto es **OSCURO** (Natural OS premium: forest casi-negro `#0a130e` + glass luminoso + glow dorado). Arranca en dark vía `themeInitScript` de `app/layout.tsx`; light sigue disponible en `ThemeToggle` (`localStorage['vendi-theme']`). Regla de color: **verde = material base, DORADO = joya de acento**, solo vía la utility `dark:text-gold` (nunca en body copy, nunca en light). Theming 100% token-driven en `app/globals.css` (`--vd-*`).

---

## 12. 🔱 ARRANQUE MISIÓN SESIÓN NIVEL DIOS (Fable 5) — 2026-07-11

> Bloque **aditivo** de arranque (Fase 0.5 del prompt `PROMPT_FABLE5_AUDITORIA_DIOS.md`). Reconcilia SOLO facts ya sabidos stale contra `origin/main` + MCP y registra el estado de partida. Los RESULTADOS de la auditoría/fixes se agregan en un bloque de cierre aparte (no inventados acá). Nada de arriba se borró.

### 2026-07-11 — Estado de partida verificado (tip real, MCP, DB)
- **`origin/main` = `ae3879a`** (Merge PR #15 `revert/quitar-landing-de-app`), deploy `vendiapp` `dpl_2jC8Af43…` **READY en producción** (alias vendilatam.com, commit `ae3879a`, source git). **Esto SUPERA como "tip" al `ff0e7e1`** que figura arriba en §3 (ff0e7e1 sigue siendo VÁLIDO y ancestro; ya no es el tip). Cadena encima de ff0e7e1: PR #13 `08dd105` (servir landing en /) → PR #14 `12c35bb` (landing a todos) → **PR #15 `ae3879a` REVIRTIÓ #13/#14** → el árbol quedó **idéntico a `ff0e7e1`** (`git diff --stat ff0e7e1 ae3879a` = vacío). Ancestros sagrados verificados: `ff0e7e1` y `7b0b481` son ancestros de `ae3879a` (merge-base OK). La landing-en-app está DESHECHA — no re-tocar.
- **Los PRs #12–#15 los hizo Claude Opus 4.8** (co-author en los commits). Contexto para Paolo: si vio "opus" en sesiones recientes, es eso; no es un bug.
- **Migraciones VIVAS (MCP `list_migrations`) = 14 filas con nombres ad-hoc, NO "0001–0018".** La más vieja registrada es `0007_lock_down_credit_rpcs_and_hygiene` (20260607); **0001–0006 nunca quedaron en `supabase_migrations.schema_migrations`** (se aplicaron antes del tracking). El repo tiene 19 archivos `0001..0018` (+`0012b`). Drift de versionado REAL (nombres divergentes, faltan versionados los primeros 6 + hardening 2026-06-06 + `leads_capture` sí está registrada como `leads_capture`). **Marca la nota vieja de §2/§3 que decía "list_migrations en vivo (0001–0018)" como IMPRECISA** — el conteo/nombres reales son estos 14. A versionar sin re-aplicar (el schema vivo es la verdad).
- **Advisors Supabase (MCP):** SEGURIDAD = **0 críticos**. WARN: `leaked_password_protection` OFF (moot: el login es Clerk, no Supabase Auth) + `leads_insert_anon` always-true (POR DISEÑO, no cerrar). INFO: 3× `rls_enabled_no_policy` en `mp_processed_payments`/`shopify_processed_orders`/`shopify_unmatched_orders` (= deny-all salvo service_role = fail-closed, correcto). PERFORMANCE: 11× `auth_rls_initplan` (RLS re-evalúa `auth.jwt()` por fila — perf, no fuga) + varios `unused_index`. Ninguno bloquea ads.
- **Pagos reales (MCP MP + DB):** `notifications_history` = **1 notificación, HTTP 200, 100% sana** (webhook vivo). DB: `mp_processed_payments`=1, `shopify_processed_orders`=0, `shopify_unmatched_orders`=0. **CONFIRMA ≥1 pago MP real acreditado** — NO asumir "0 compras reales". Shopify no cobró aún (esperado: falta config de paneles).
- **DB snapshot 2026-07-11:** `profiles`=3, `unlimited_users`=1, `credit_ledger`=14 movs, `leads`=**42** (la landing SÍ captura leads — el imán del embudo ya junta gente, aunque hoy no hay forma de mailearles), `generations`=28, `generated_images`=87.
- **Vercel (MCP, team `Paolo's projects`):** proyectos listados = **`vendiapp` (`prj_grjv6…`) + `beatapp`** (otro proyecto de Paolo, no-Vendí). ⚠️ **`vendilanding` NO aparece en el team** — la landing viva (www.vendilatam.com, deploy CLI standalone desde `.vendi-landing-deploy`) puede vivir en scope personal (no-team) o haber cambiado de nombre. A verificar por `curl` que www.vendilatam.com siga 200; no es bloqueante para auditar la app.
- **MP:** una sola app productiva `VENDI APP` id `532027134550190` (cuenta `paolonietoc@gmail.com`). **Shopify:** `vendi-9497.myshopify.com`, Basic, PEN, Perú. Todo consistente con la memoria.
- **Misión en curso:** auditar TODO (landing/app/seguridad/RLS/paywall/cobro/webhooks/generación/logeo/recuperación/correo/Meta/datos) contra `origin/main`, arreglar en PRs desde `origin/main` (sin CLI deploy de la app, sin regresionar), + 5 infoproductos, + reporte branded en fácil para Paolo. Guardrail #0: memoria/minions/`landing.html` intocables; nada de `git clean`/`reset`/`stash` en el árbol main.

### 2026-07-11 — ARRANQUE MISIÓN FABLE 5 (`PROMPT_FABLE5_APP.md`) — plan aprobado por Paolo
- Sesión nueva con el prompt refinado `PROMPT_FABLE5_APP.md` (4 frentes: pulir+arreglar por PR · 5 infoproductos · vault Obsidian · workspace sano). Los 9 minions auditaron en SOLO-LECTURA contra `origin/main`=`ae3879a` durante el plan mode (pedido de Paolo: "invoca a los minions para el plan mode tambien, alos 9"). Plan aprobado: `C:\Users\Usuario\.claude\plans\arranque-mision-md-quizzical-stardust.md`. Worktree de código: `C:\Users\Usuario\vendiapp\wt-fable5`.
- **Findings clave de la auditoría de arranque:** `maxDuration` FALTA en las 3 API routes de IA (riesgo: función muere entre deduct y refund → PR-1) · redirect post-login ROTO en `proxy.ts:76` (`from=` que Clerk no honra; confirmado en vivo → PR-2) · **la landing VIVA re-tiene el copy "60 créditos de regalo / sin tarjeta"** que contradice el paywall paga-primero (el copy que se había sacado el 2026-06-27 volvió o nunca se limpió del todo — bloqueante #1 pre-ads) + el quiz promete un mail que nunca sale + legales `href="#"` y `/terminos` 404 · **DNS de vendilatam.com en CERO** (sin SPF/DKIM/DMARC/MX → mails de auth de Clerk con riesgo spam; pasos de panel para Paolo) · modo estricto verificado SANO en origin/main (refs+estilo SE MANTIENEN — no era bug) · `currentPlan` hardcode ya NO existe en origin/main (se arregló en algún momento) · RLS/Storage sólidos (JonSnow) · repo GitHub `PaoNieto/Vendiapp` PÚBLICO (nota para Paolo, no desarrollar — orden suya sobre accesos).
- **Decisiones de Paolo en el arranque (vigentes):** (1) fusión Refs+Estilo SÍ — "hazlo y ponlo en prod", vara ALTA de diseño, vía PR igual; (2) `/upgrade` display **SOLO USD** (cobro sigue PEN, convertir de los precios en soles fijados); (3) landing viva **full autorizada** ("haz todo, no me preguntes nada") — solo desde `.vendi-landing-deploy` + deploy CLI; (4) vault Obsidian: borrar `C:\Users\Usuario\vendiapp\Vendí APP obsidian pes\` (verificando antes que sea 100% Vendí) y crear uno nuevo actualizado; (5) trabajo sobre permisos/accesos internos NO se desarrolla — nota de 1 línea y seguir con lo constructivo.
- **PRs planeados (orden de merge):** PR-1 `fix/max-duration-api-ia` · PR-2 `fix/redirect-post-login` · PR-3 `chore/versionar-migraciones-vivas` · PR-4 `feat/upgrade-usd-display` · PR-5 `fix/ux-flujo-critico` (incluye sweep white-glass-roto-en-dark de Davinci) · PR-6a `refactor/curated-styles-a-lib` · PR-6b `feat/fusion-refs-estilo`. Detalle completo en el plan file.

### 2026-07-11 — CIERRE MISIÓN FABLE 5 — 7 PRs abiertos + landing arreglada en prod + IP5 vivo
> Todo el trabajo de código en el worktree `C:\Users\Usuario\vendiapp\wt-fable5` (+ `wt-fable5-ux` para PR-5, en paralelo). Cada PR nace de `ae3879a`, con `tsc`+`build` limpios (pnpm). **NINGÚN merge lo hace Fable — los mergea Paolo.** Verificado: ninguna de las 7 ramas toca `cerebro_vendi/`, `.claude/*`, `.mcp.json` ni `landing.html`.

**7 PRs LISTOS para que Paolo mergee (orden recomendado):**
1. **PR #16 `fix/max-duration-api-ia`** — `export const maxDuration` (300/300/120) en las 3 API de IA. Sin esto la función Vercel muere entre `deduct` y `refund` → cliente pierde créditos. ⚠️ verificar plan Vercel (Fluid Compute) antes de mergear.
2. **PR #17 `fix/redirect-post-login`** — `proxy.ts:76` `from=` → `redirect_url=pathname+search`. El `<SignIn>` de Clerk honra `redirect_url`, no `from` → todo deep-link caía en /dashboard. Confirmado en vivo.
3. **PR #19 `chore/versionar-migraciones-vivas`** — versiona 4 migraciones YA aplicadas en prod (0019 hardening 2026-06-07, 0020 revoke PUBLIC, 0021 starter-references, 0022 leads_capture). Solo archivos idempotentes con header "NO re-ejecutar"; `list_migrations` no cambia. Inventario de Bujía.
4. **PR #18 `feat/upgrade-usd-display`** — vitrina `/upgrade` en **solo USD** (campo cosmético `priceUsdDisplay`: Pase $10, Inicial $6.50, Pro $14, Negocio $31), font-mono + dorado dark, glass-card. **El cobro sigue en PEN** (checkout/webhook intactos). Pedido de Paolo.
5. **PR #20 `fix/creditos-bordes`** — hallazgos de la auditoría de Bujía: (a) refunds ya NO acuñan saldo a ilimitados (pasó en prod: +2 sin deduct), (b) imagen sin signed URL no inserta fila rota, (c) tanda con 0 subidas → `failed` no `completed`. + docstring stale de `ensure-profile.ts` (regalo 60/10 ya no existe, migr 0016).
6. **PR #22 `fix/ux-flujo-critico`** — Frontero + sweep dark de Davinci: bloque dev fuera de prod, bottom-nav mobile con Análisis + Ajustes por avatar, mensajes 402/403 del análisis con CTA (rama BYOK muerta borrada), touch targets ≥44px, familia `bg-white/*` legacy rota-en-dark → tokens, badges V{n} legibles, código muerto borrado (mood-card, version-drawer). 19 archivos, +136/−819.
7. **PR #21 `feat/fusion-refs-estilo`** (2 commits) — LA JOYA: fusiona Referencias+Estilo en una estación 02 "¿Cómo querés que se vea?" con el panel vivo "Tu look" (`components/app/look-summary.tsx`, moodboard polaroid, 4 modos). Commit 1 = extrae `CURATED_STYLES` a `lib/curated-styles.ts` (mata el acople page-client→server). `/referencias` → redirect. Contrato de datos IDÉNTICO (`style_id`+`reference_images`), cero migración. Preview Vercel READY. **Paolo debe verlo en el preview (auth real) antes de mergear — Fable no pudo screenshotear la página gateada.**

**Landing viva ARREGLADA + deployada (autorización full de Paolo, `vercel deploy --prod` desde `.vendi-landing-deploy`, dpl `3p7HEHW8s8`):** sacado el copy "60 créditos de regalo / sin tarjeta / Ahorrás $17" que contradecía el paywall (bloqueante #1 de baneo) → ahora "tu Pase INCLUYE 60 créditos" + "Precio de lanzamiento $10 · luego $27" + nota "el cobro se procesa en soles S/39 vía MP". Quiz ya no promete mail: `renderSuccess` da botón "Ver mi plan de fotos" (→ IP5) + guardar en WhatsApp. Legales creados (`/terminos.html` + `/privacidad.html`, Ley 29733 Perú) y linkeados; contacto = mailto. `og-image.jpg` 1200×630 generada (antes 404). Íconos sociales muertos sacados. Video/CTAs de compra intactos, verificado por curl.

**IP5 "Tu Plan de Fotos" VIVO** en `www.vendilatam.com/plan/{cosmetica,moda,alimentos,deco,joyeria,otro}.html` (6 páginas por rubro del quiz, 200 OK) — arregla el H2 (el quiz prometía un mail inexistente; ahora el plan se ve al instante). Los otros 4 infoproductos (IP4 hooks, IP1 calendario café, IP2 kit colección, IP3 guía cosmética) + el vault Obsidian se generaron en el mismo cierre. Todos los infoproductos: CERO claims de ingresos, entrega sin mail (link directo + wa.me).

**Reconciliación de la auditoría (Bujía, DB read-only):** ledger cuadra por usuario (17=17, 60=60); análisis NO tiene ledger (bolsa inauditables por diseño); CERO generations failed sin refund → nadie perjudicado (única anomalía = +2 a favor de Paolo, benigna). CSV de los 43 leads en `output/leads-export-2026-07-11.csv` (⚠️ solo 1 email real + 1 probe de auditoría a filtrar).

**Correcciones a facts de este mismo bloque (§12):** `unlimited_users` = **1** cuenta (user_3F4VMb…), NO 2 como decía §3 vieja. El modo estricto de `regenerate` NO reembolsaba ante signed-URL vacía (bug tapado por PR #20).

**PASOS DE PANEL para Paolo (documentados, NO aplicados — config no es código):**
- 🔴 **Correo/DNS (bloqueante pre-ads):** `vendilatam.com` sin SPF/DKIM/DMARC/MX → mails de Clerk (dominio compartido `accounts.dev`) con riesgo spam. Clerk → Create production instance → 5 CNAMEs en Vercel DNS + TXT `_dmarc` `v=DMARC1; p=none; rua=mailto:paolonietoc@gmail.com` + MX ImprovMX opcional. ⚠️ implica keys `pk_live/sk_live` nuevas (usuarios de la instancia TEST no migran solos).
- **Vercel:** confirmar plan (Fluid Compute para PR #16); env `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/comprar`; borrar huérfanas `SHOPIFY_SHOP_DOMAIN`, `NEXT_PUBLIC_MP_PUBLIC_KEY`, `PAYWALL_LANDING_URL`.
- **Shopify go-live:** prender MP en Payments + webhook `orders/paid` JSON → `/api/webhooks/shopify` + **REEMPLAZAR** `SHOPIFY_WEBHOOK_SECRET` (existe pero es pre-webhook, no coincide).
- **Compra real de prueba** (Fable no puede pagar): riel A hoy (cuenta sin pago → /comprar → Pase S/39 → verificar `mp_processed_payments`/`credit_ledger`/`plan=founder`). Refund manual descuenta créditos A MANO (no hay código de refunds — F4 de Integral).
- **Meta/BM (checklist Metapod):** BM + verificar negocio y dominio día 1, 2FA + admin de respaldo, cuenta ads en PEN, página de Facebook con contenido, Pixel/CAPI (Purchase server-side desde webhook MP, fase 2 de Integral). NO prender ads hasta cerrar el copy de la landing (hecho) + correo (pendiente).
- **Notas de 1 línea (accesos — no desarrolladas por orden de Paolo):** repo GitHub `PaoNieto/Vendiapp` PÚBLICO (Settings→Danger Zone si querés privado; Vercel deploya igual) · RLS/Storage sólidos (JonSnow, nada que hacer) · badge "Development mode" de Clerk visible en /login (instancia TEST, decisión tuya).
- **Vault Obsidian:** la carpeta vieja `C:\Users\Usuario\vendiapp\Vendí APP obsidian pes\` NO se borró — tiene un `BEAT/Proveedores.md` (tu OTRO proyecto) + notas diarias viejas de Vendí. Por tu condición "obsidian de Vendí ÚNICAMENTE" no era borrable a ciegas. El vault nuevo se creó limpio en `C:\Users\Usuario\vendiapp\vendi-vault\`.

---

## §13 — Cierre misión Fable 5 (2026-07-14): PRs en prod + infoproductos aparte + vault potenciado

**Los 7 PRs → PROD vía UN solo merge.** Se armó la rama integradora `mision/fable5-todo-junto` desde `origin/main`, mergeando los 7 PRs (#16 #17 #18 #19 #20 #21 #22) **sin un solo conflicto** (git separó bien las regiones de las API `generations/regenerate/analyze`). Verificado antes de abrir: `tsc --noEmit` = 0 errores, `pnpm build` = exit 0 (todas las rutas, incluida `/estilo` fusionada + `/referencias` redirect). Se abrió el **PR combinado #23** y **Paolo lo mergeó** (commit `081b61d` en `main`) → los 7 fixes ya en prod (Vercel autodeploya del merge). Los 7 PRs individuales quedaron **cerrados por redundantes** (apuntan al #23). **Decisión operativa validada:** para Paolo, un merge combinado (con su preview de Vercel) > siete merges. La rama integradora + su verificación tsc/build es el patrón a repetir para cerrar tandas de PRs.

**INFOPRODUCTOS = productos digitales APARTE de Vendí (decisión de Paolo 2026-07-14).** NO son parte del embudo/landing de Vendí; se venderán con ads propios y checkout propio (Hotmart/Gumroad, ver el PDF). 
- **Ubicación local (verlos):** `C:\Users\Usuario\vendiapp\infoproductos\` → `index.html` = catálogo para abrirlos local (rutas de imágenes arregladas a relativas para que rendericen por `file://`). Contiene los 5: `plan/{cosmetica,moda,alimentos,deco,joyeria,otro}.html` (IP5), `recursos/hooks.html` (IP4), `guias/{calendario-cafe,kit-coleccion,cosmetica}.html` (IP1/IP2/IP3) + imágenes `estilos/ catalogo/ antes/` + legales.
- **PDF de estrategia de ads (Metapod):** `infoproductos-para-ads.pdf` (9 págs, generado con Edge headless desde `infoproductos-para-ads.html`). Por infoproducto: qué es, ICP, dolor, **precio sugerido USD** (IP5 $7-9 entry, IP4 $12-17, IP1 $9-14, IP2 $14-19, IP3 $9-12), ángulo, 3 hooks, creativo, público Meta, presupuesto+métrica, plataforma de entrega. + estrategia de combo (front autoliquidable $7-9 → order bump → bundle $29-39) + candados anti-baneo. TODO compliance-safe (cero claims de ingresos).
- ⚠️ **Los .html de infoproductos todavía tienen CTA hacia Vendí** (así se crearon). Si se venden aparte, cambiar esos CTA por el checkout del producto digital.

**Landing redeployada 2× (autorización full, `vercel deploy --prod` desde `.vendi-landing-deploy`):** (1) se sacó el link del quiz a los infoproductos y se borraron las carpetas → daban 404; (2) Paolo aclaró *"no 404, solo fuera de la landing"* → se **restauraron las páginas** (vivas, 200) pero el **botón del quiz "Ver mi plan de fotos" quedó QUITADO** (`renderSuccess` ahora: "Ya sabemos qué fotos necesita tu rubro. Sigamos — te falta tu cupón de regalo."). **Neto:** `vendilatam.com/plan|guias|recursos/*` siguen 200 pero la landing/embudo ya NO los linkea (0 refs en `index.html`). El plan/${rubro} ya NO es la entrega del quiz.

**Vault Obsidian potenciado (`C:\Users\Usuario\vendiapp\vendi-vault\`).** Se le agregó lo que faltaba para que sea un "segundo cerebro" real: (1) carpeta **`.obsidian/`** (config: tema oscuro, `accentColor #e8b64c`, plantillas → `04_Plantillas`, Dataview pre-listado); (2) **`🏠 Inicio.md`** = cockpit raíz (bloqueantes pre-ads arriba, mapas + tableros Dataview abajo); (3) **`99_Meta/Mapa de Vendí.canvas`** = mapa mental clickeable; (4) **`99_Meta/Índice — todo el vault.md`** = índice Dataview por tipo/área/estado/tag; (5) breadcrumbs 🏠 en los 2 MOCs. Verificado **0 wikilinks rotos** reales. **Registrado en `%APPDATA%\obsidian\obsidian.json`** → abre con `obsidian://open?vault=vendi-vault`. **Único paso manual de Paolo:** instalar el plugin **Dataview** 1 vez (Ajustes → Community plugins) para que rendericen las 4 notas con tablas. Paolo ya lo abrió (config normalizada por Obsidian).

---

## §14 — 2026-08-17: SYNC del vault Obsidian (quedó al día hasta el 2026-07-19)

Sesión corta, sin tocar código. Paolo volvió tras ~1 mes ("tiempo sin vernos") y pidió **actualizar el segundo cerebro (Obsidian)** + recordarle en qué había quedado.

- **Verificado en vivo:** `git ls-remote origin main` → **`origin/main` = `346b0c2`**, IDÉNTICO al tip del 2026-07-19 (§3). **CERO commits nuevos entre el 2026-07-19 y el 2026-08-17** — el proyecto quedó exactamente donde lo dejamos. El `main` LOCAL sigue drifteado en `167b3ef` (lo de siempre: worktree fresh desde `origin/main` para tocar código).
- **Gap detectado:** el vault (`C:\Users\Usuario\vendiapp\vendi-vault\`) había quedado congelado en el **2026-07-14** (§13) → le faltaba TODO el bloque de correo del 2026-07-19, y además arrastraba como "bloqueantes" cosas que la misión Fable 5 ya había arreglado el 2026-07-11 (copy de la landing, legales, og-image, promesa de mail del quiz).
- **Notas NUEVAS (2):** `02_Vendí/Decisiones/2026-07-19 — Correo único de soporte.md` · `02_Vendí/Arquitectura/Correo y DNS.md` (incluye la tabla de los 3 registros DNS de ImprovMX marcados NO BORRAR + el gotcha de que el MCP de Vercel no edita DNS → REST API).
- **Notas ACTUALIZADAS (7):** `🏠 Inicio` (callout nuevo "Dónde quedaste" + bloqueantes reducidos a 3) · `Roadmap — pendientes y bloqueantes` (bloqueantes cerrados movidos a ✅; quedan Meta / compra real / mails de auth) · `Landing viva` · `Meta Ads readiness y anti-baneo` · `Funnel sin-mail (wa.me)` · `Entornos y variables` · `Integraciones` · `Vendí — MOC` (tip `346b0c2` + 2 decisiones que faltaban en la lista manual).
- **Regla operativa volcada al vault** (estaba solo en la memoria): la landing se edita en `.vendi-landing-deploy\index.html` y **el `vercel --prod` lo corre PAOLO** (el harness bloquea deploys a prod del agente; los writes por REST API sí pasan).
- **Verificado:** 59 notas, **0 wikilinks rotos** nuevos (los 5 que reporta el checker son placeholders dentro de `04_Plantillas` + un ejemplo en `Cómo usar este vault` — falsos positivos conocidos).
- **Estado del vault ahora:** al día hasta el 2026-07-19 = al día con la realidad, porque no hubo trabajo después. Sigue pendiente el único paso manual de Paolo: instalar el plugin **Dataview**.
- **Los 3 bloqueantes pre-ads reales que quedan** (así arranca la próxima sesión): (1) **Meta sin montar** (App + BM verificado + Pixel/CAPI) — el más grande; (2) **compra real de prueba** end-to-end; (3) **mails de auth de Clerk por dominio compartido `accounts.dev`** (instancia TEST → riesgo spam en el signup justo con tráfico pago).

---

## §15 — 2026-08-17: MAPA COMPETITIVO (verificado en vivo)

Paolo trajo una lista de 20 "competidores" que le había dado Claude Haiku hace tiempo. **Verificada con búsqueda web el 2026-08-17.** Conclusión: los nombres existen casi todos, pero la lista tenía un **sesgo estructural** — buscó startups que hacen lo mismo, y se perdió la competencia que de verdad aprieta a Vendí: **lo gratis y nativo del canal donde el PYME ya está**, y **el modelo pelado**.

### Las 4 capas de competencia (de más a menos peligrosa)

**Capa 1 — gratis y DENTRO del canal (Haiku no vio ninguna):**
- **IA nativa de Mercado Libre** — editor de fotos + generación con IA dentro del flujo de publicar, gratis, y ya cumple los requisitos de la ficha. *El* competidor estructural en LatAm: el vendedor no sale de donde ya está. Regla ML: escenas IA solo en imágenes secundarias; la portada va limpia.
- **Shopify Magic** — nativo, gratis en todo plan Shopify, genera escenas y saca fondos. Techo: 1 MP de resolución.

**Capa 2 — el modelo pelado, gratis:**
- **Gemini + Nano Banana 2** (= Gemini 3.1 Flash Image, lanzado 2026-02-26): razona antes de renderizar + Grounding with Google Images, usable **gratis** desde la app de Gemini (que le sacó a ChatGPT el #1 de la App Store). **Doble filo: es el motor de Vendí Y su competencia.** Implica que "genero imágenes lindas con IA" ya NO es diferencial.

**Capa 3 — LatAm (terreno de Vendí):**
- **Estudio Atlas** (AR) — el más peligroso de la lista original y estaba SUBESTIMADO. Fundadores Matías Estrella y Juan Ignacio Porras. +145.000 fotos/videos para +250 marcas y agencias en 6 meses (5× clientes). Freemium 10 fotos gratis; planes ARS $69.999 (Pro) a $399.999 (Ultra)/mes. **Busca US$400k para entrar a México** → NO es bootstrapped como decía Haiku. Mismo pitch central que Vendí: fidelidad del producto real.
- **App Producter** (MX) — app iOS, **ya listada en la App Store de PERÚ**. Foto → listing completo (fondo blanco, escala, comparativas, antes/después) apuntado a Mercado Libre/Amazon MX/Coppel/Liverpool/Linio. Ancla contra MXN$500–3.000 por imagen.
- **YaVendió!** (Lima, PE) — el vecino que se puede mudar al rubro. Fundada 2024 (David Tafúr + Sebastian González), **US$850k preseed** (Magma Partners, iThink VC, Semilla Ventures), +100 comercios en MX y PE, opera PE/MX/EC/CL/UY. Hoy hace agentes de venta por WhatsApp, NO fotos — pero su blog ya publica "Cómo uso la IA para crear fotos de producto gratis". Mismo cliente, mismo país, con plata y distribución.

**Capa 4 — lo que Haiku excluyó a propósito y NO debió:** **Canva** (50 generaciones IA gratis/mes, UI 100% en español, la más usada por PYME peruana) y **Photoroom**. La usuaria de cosmética NO elige entre Vendí y Pebblely: elige entre Vendí y Canva.

### Correcciones a la lista de Haiku
- **Pebblely** — vivo: $9 Lite / $19 Basic / $39 Pro + 40 imágenes gratis.
- **CreatorKit** — vivo: Free / $39 / $99 / $139 + pay-per-image desde $2,99.
- **Lumepixa** — existe (lumepixa.app), 10+ presets por marketplace, 3 créditos gratis sin tarjeta.
- **AI Product Pro** — existe (aiproductpro.app), PERO todo lo que se encuentra son **notas de prensa pagas** (openpr / abnewswire, abril 2026). Tratar el "scope agresivo" como marketing, no como benchmark.
- **Botika** — real: US$8M seed (ene-2025, Stardom + Secret Chord + Seedcamp), +1.000 marcas US/Europa, 19 empleados. Solo relevante si Vendí entra fuerte a ropa.
- **NO verificados uno por uno** (son ejemplos de *patrón de nichado*, no competidores de Vendí): real estate (Virtual Staging AI, Collov, REimagineHome), headshots (Aragon, Secta, HeadshotPro), UGC video (Arcads, Creatify, Reloop), comida (Restaurant Photos AI, Fudie, MenuPhotoAI).

### Lectura de posicionamiento (lo que SÍ es foso de Vendí)
1. **Cobro local en soles** — packs S/24.90–S/119.90 vía Mercado Pago vs suscripción en USD con tarjeta internacional. En Perú esto es foso real, no cosmético.
2. **Cero prompt** — las 3 estaciones vs herramientas que asumen que el usuario sabe qué pedir. Ver §7.
3. **Producto blindado + prompt estricto** — es donde Atlas pega en el mismo punto: es el competidor a vigilar.
4. **NO es diferencial:** "genero fotos lindas con IA" (commodity gratis) ni **anclar el precio contra el fotógrafo** — lo hacen los 20 de la lista y también 100ads.


---

## §15 — 2026-08-17: MIGRACIÓN DEL CORREO A GOOGLE WORKSPACE (completada y verificada)

**El correo de `vendilatam.com` ya NO pasa por ImprovMX: entra directo a Google Workspace.** Verificado en vivo (mail de prueba a `soporte@vendilatam.com`, aceptado sin rebote).

- **CAUSA RAÍZ (importante):** Paolo tenía Workspace contratado y facturando desde el 2026-08-02, pero **no recibía NADA**. Motivo: hacía **56 días** había un MX de Google cargado en Vercel **con el nombre mal puesto** (`vendilatamdns` en vez de la raíz del dominio) → Google nunca lo detectó, Gmail nunca se activó, y el dominio siguió entregando todo a ImprovMX (que reenviaba al Gmail personal). Se pagó ~1 mes de Workspace recibiendo cero.
- **Fix aplicado:** `+` MX raíz `smtp.google.com` prio 1 · `−` `mx1.improvmx.com` (10) · `−` `mx2.improvmx.com` (20) · `−` el `vendilatamdns` basura. **DNS final = 1 solo MX.** Paolo confirmó en el panel de Google y quedó activado.
- 🔑 **REUSABLE — el Vercel CLI de la máquina de Paolo YA ESTÁ LOGUEADO** (`paolonietoc-6715`): `npx vercel dns ls/add/rm <dominio>` anda **sin token**. NO hace falta pedirle un token de Vercel (se lo pedí al pedo antes de chequear).
- 🔑 **REUSABLE — gotcha del harness:** el classifier **BLOQUEA `vercel dns add`** pero **PERMITE `vercel dns rm`**. Para agregar registros DNS: Paolo lo corre con `! <comando>` desde el chat (igual que el `vercel --prod` de la landing, §3). Los `rm` los puedo correr yo.
- 🔑 **REUSABLE — huevo y la gallina de Workspace:** Google **no activa Gmail para NINGÚN usuario** hasta que el MX apunte a Google. Por eso es IMPOSIBLE crear el alias antes del cambio de MX. Mi recomendación inicial ("creá el alias primero para no cortar `soporte@`") era **inaplicable**; el orden real es: MX → confirmar en Google → recién ahí crear alias/usuarios.
- ⚠️ **SE PERDIÓ EL CATCH-ALL.** ImprovMX entregaba *cualquier* dirección `@vendilatam.com`. Google solo entrega las que existen. Hoy existen: `holavendi@`, `hola@`, `soporte@`.
- 💸 **PENDIENTE DE PLATA: hay 3 USUARIOS de Workspace = 3 licencias (~$7/mes c/u).** `holavendi@` (admin, principal), `hola@` (ya estaba) y `soporte@` (Paolo lo creó el 2026-08-17 **como usuario, no como alias** — le avisé pero ya estaba hecho). **Conviene consolidar a 1 usuario + 2 alias**: ahorra ~$170/año y unifica todo en una bandeja. Un alias no se puede crear si existe un usuario con esa dirección → borrar el usuario primero.
- ⚠️ **CLAUDE YA NO VE EL CORREO DE VENDÍ.** El conector de Gmail está autenticado con **`paolonietoc@gmail.com`** (personal). Hasta hoy veía el correo del dominio porque ImprovMX lo reenviaba ahí; **desde la migración, no más**. Para trabajar el buzón real hay que conectar `holavendi@vendilatam.com` en claude.ai → Settings → Connectors → Gmail.
- **Falta todavía (no bloqueante):** DKIM (`google._domainkey`, se genera en Admin console → Apps → Gmail → Autenticar correo) · DMARC (`_dmarc` → `v=DMARC1; p=none; rua=mailto:holavendi@vendilatam.com`) · limpiar el SPF (sacar `include:spf.improvmx.com`) · dar de baja ImprovMX. El SPF actual (`v=spf1 include:spf.improvmx.com include:_spf.google.com ~all`) ya autoriza a Google, así que no urge.
- **Vault actualizado** en el mismo movimiento: `02_Vendí/Arquitectura/Correo y DNS.md` reescrita con el estado real + gotchas; `Roadmap` (nueva sección "Plata que se está yendo"); la decisión `2026-07-19` marcada como superada en implementación.

### §15b — 2026-08-18: cuentas de Workspace consolidadas a UNA (cierre del tema correo)
- Paolo borró los usuarios `hola@` y `soporte@` (este último lo había creado por error **como usuario**, no como alias) y después **RENOMBRÓ `holavendi@` → `soporte@vendilatam.com`**. Resultado: **1 sola licencia de Workspace, 1 sola bandeja**. Ahorro ~$170/año.
- 🔑 **REUSABLE — el truco:** borrar un usuario y recrear esa dirección como alias **NO funciona al toque** (Google tarda en liberar el nombre). Lo que sí: **renombrar** la cuenta principal a la dirección deseada — Google deja el nombre viejo como **alias automático**, sin corte de servicio. Hoy: `soporte@vendilatam.com` = cuenta real, `holavendi@vendilatam.com` = alias.
- **Verificado:** MX intacto (`smtp.google.com` prio 1) tras el borrado de usuarios — el DNS es a nivel dominio y no lo afectan las altas/bajas de cuentas. 2do mail de prueba a `soporte@` enviado **sin rebote**.
- **El tema correo queda CERRADO** salvo deuda técnica NO bloqueante: DKIM (`google._domainkey`), DMARC (`_dmarc` → `rua=mailto:soporte@vendilatam.com`), limpiar `include:spf.improvmx.com` del SPF, y dar de baja ImprovMX.
- **Vault actualizado:** `Correo y DNS.md` (cuentas consolidadas + el truco del renombre) y `Roadmap` (correo movido a CERRADO).
### CompetADS — rutina de espionaje de ads (Notion, 2026-08-18)
Subpágina **CompetADS** en Notion bajo **VENDÍ latam** (`3c036013294f81ab9181f69729cd1c41`). **ARQUITECTURA FINAL (decisión Paolo 2026-08-18): el registro de ads es POR COMPETIDOR, no una tabla única.** Cada fila de "Los 11 rastreados" es una página que adentro tiene su propia base **Ads — [competidor]** (11 bases creadas). La tabla maestra "Registro de anuncios" se descartó. Cada base Ads tiene 10 columnas: Anuncio, Tipo de ad, Formato, Hook (literal), Ángulo, Guión, CTA, Oferta o precio, Link, Captura. **Se eliminaron a pedido de Paolo: Competidor (redundante), Fecha captura, Plataforma, Duración, Días activo, Variantes activas, Ganador, Veredicto y Notas.** Rastrea **11 competidores** en 2 prioridades: **A semanal** (Estudio Atlas, App Producter, YaVendió, 100ads, Arcads) · **B quincenal** (Pebblely, CreatorKit, Lumepixa, Claid, Product Pro AI, Photoroom). **Decisión de Paolo 2026-08-18: los de prioridad C (Canva, Mercado Libre, Shopify Magic, Gemini) se SACARON del rastreo de ads** — sus filas se movieron a la subpágina "Competidores". Siguen siendo la amenaza estructural (ver capas 1-4 arriba), pero sus ads son de marca y no enseñan nada táctico. Segunda base **Los 11 rastreados** (`collection://d0a879ab-1581-4263-a342-265718490872`) con las 11 filas ya cargadas (Prioridad, País, Categoría, Web, Por qué importa, Dónde buscar sus ads, Revisado). La página está partida en 2 toggles: **📊 Tablas** (las 2 bases) y **📖 Manual** (rutina, fuentes, ángulos, señales, reglas). Rutina: lunes, 45 min, 4 pasos. Fuentes: Biblioteca de Anuncios de Meta (la principal), TikTok Creative Center, Google Ads Transparency. Copia local del contenido en `oficina/CompetADS.md`. **La página madre ya tenía una subpágina "Competidores"** (`3b836013294f8044b5c2e5b49cf00a41`) con 6 links sueltos — de ahí salieron las URLs reales (ojo: AI Product Pro = **productproai.com**, y Lumepixa es **app de iOS**, no web). Alimenta a **Metapod**.

---

## §16 — 2026-08-19: MANEJO COMERCIAL — bibliografía de evidencia + nace El Comerciante

**El hueco que Paolo detectó:** la memoria tenía **mucho growth suelto** (Metapod, el playbook de Bilbao vía Willy, infoproductos, CompetADS, checklist anti-baneo) pero **cero manejo comercial estructurado** — sin embudo con números, sin CAC/LTV objetivo, sin plan de recompra, sin dueño ni cadencia. Esta sesión cierra ese hueco.

### 📚 Bibliografía comercial (Artifact + `oficina/bibliografia-comercial.html`)
**43 referencias en 12 bloques temáticos**, ordenadas por función comercial y con **sello A/B/C de rigor** (A = arbitrado con método real, B = benchmark serio, C = practitioner/vendor). Artifact: `https://claude.ai/code/artifact/5f929c06-325c-4c1b-9e09-8ceb5c507894`. Incluye 10 repositorios con guía de búsqueda y una advertencia metodológica que nombra las revistas de revisión dudosa y el contenido de vendor disfrazado de investigación.
- **Las 11 esenciales están rankeadas y 10 fueron LEÍDAS EN TEXTO COMPLETO.** La única sin texto completo es Koch & Benlian (2017) — paywall real de Springer, sin copia abierta.
- 🔑 **REUSABLE — cómo se leyeron las que los editores bloquean:** Wiley, MDPI (Cloudflare) y AIS eLibrary bloquean lectores automáticos con desafíos de JavaScript **aunque el artículo sea de acceso abierto**. El camino que funcionó: **Unpaywall** (`api.unpaywall.org/v2/{DOI}?email=`) para confirmar que es OA → **API de Semantic Scholar** (`api.semanticscholar.org/graph/v1/paper/DOI:{doi}`) para abstract y PDF abierto → y si sigue bloqueado, **la copia del Internet Archive** (`archive.org/wayback/available?url=`), que sirve el HTML completo por curl. Ojo: WebFetch **no puede** ir a web.archive.org, hay que usar curl. `pdftotext` está disponible en `/mingw64/bin`; `pdftoppm` NO (el Read de PDFs falla).
- ⚠️ **Corrección hecha:** una versión previa citaba "50–60% vs 80–90% de margen bruto" atribuido a Bessemer. **Esa cifra NO está en el State of AI 2025.** Los números reales del reporte: *Supernovas* ~25% (a menudo negativo), *Shooting Stars* ~60%.

### 🔑 Los hallazgos que cambian decisiones de Vendí
1. **Medición de ads (Gordon/Moakler/Zettelmeyer 2022, 663 experimentos en Facebook):** el lift real en **compra es 5%**; los métodos no experimentales estiman **24–64%** → **la atribución de compras del panel puede exagerar 5×–13×**. La medición observacional anda **mejor para registros que para compras** → al prender ads, creerle más a los signups que al ROAS.
2. **Precios (Li & Kumar 2022, POM):** el cargo por consumo es óptimo **solo si el uso es costoso Y los clientes son homogéneos** — *ambos se cumplen en Vendí*. **El modelo de créditos queda formalmente justificado.** Además: el 3PT casi no se usa en SaaS porque ahí el uso no cuesta, pero **en IA sí** → Vendí está en el régimen correcto. Y **un menú chico de tarifas de tres partes puede ganarle a cualquier menú de dos partes** → **probar "base + bolsa incluida + recarga" contra los 3 packs actuales.**
3. **Regalar mata la venta (Zhang & Duan 2025, RCT n=680.588, 190 países):** los que completaron muchas tareas en la prueba **convirtieron menos** — la necesidad satisfecha elimina el motivo de pagar. En **mercados de menor PBI la saturación llega más rápido** (aplica a LatAm). Promos por **funcionalidad** ganan; el **descuento del 20% dio efecto negativo**.
4. **Retención:** la métrica correcta es **EMPC (beneficio esperado), no exactitud** (Imani et al. 2025, 240 estudios). La pregunta correcta es **"¿a quién conviene retener?"** (Lemmens & Gupta 2020, Marketing Science). Dato incómodo: **el cliente de mayor ticket es el que más se va**; la satisfacción es el protector más fuerte (Sanches et al. 2025).
5. **La promesa del producto:** mejor foto = OR **1,17×–1,25×** de venderse (Ma et al. 2019, datos de eBay) **PERO los autores advierten poder predictivo limitado (~1%)** → ⛔ **prohibido prometer un % de aumento de ventas en un anuncio** (frágil + roza los claims que violan las Advertising Standards). El hallazgo fuerte es **confianza: la foto propia de calidad le gana al stock porque reduce asimetría de información** — ese es el posicionamiento defendible frente a un banco de imágenes. Atributos accionables para los estilos (Li/Wang/Chen 2014): objeto principal grande, baja entropía, color cálido, alto contraste, **alta profundidad de campo** (más en foco, NO bokeh) y **presencia social**.
6. **El mercado:** 98% de las pymes peruanas invertiría en digitalización, pero **68% reporta obstáculos y el principal es falta de conocimiento** → ese es el hueco de Vendí y la objeción central a desactivar.
7. **Método por defecto para fijar precio: Van Westendorp (4 preguntas)**, corrible con 30 clientes. Las preguntas textuales en español están en `.claude/agents/comerciante.md`.
8. **Libro incorporado a pedido de Paolo:** *¿Por qué no vendo más? Gestión comercial para quienes no saben nada y para quienes creen saberlo todo*, de **Pedro José de Zavala** (peruano, Penguin Random House Perú, ~S/69). ⚠️ El autor es **Pedro José de Zavala**, no "José Zavala". Es la única referencia escrita para el mercado exacto de Vendí, en español. No tiene versión gratuita legal.

### 💰 NACE EL COMERCIANTE (minion #10)
`subagent_type`: `comerciante` · archivo `.claude/agents/comerciante.md` · ficha en `MINIONS.md`. **Pedido explícito de Paolo: "debería estar prácticamente siempre invocado".**
- **Dueño de TODA decisión comercial:** precio y packs, unit economics, diseño y números del embudo, oferta y posicionamiento, activación, retención y recompra, validación de demanda, y **diagnóstico de por qué no se vende**.
- **PRIORIDAD #0: decidir con evidencia, no con opinión.** Si no hay dato ni evidencia, su entregable es **cómo conseguir el dato**.
- **Regla permanente agregada a `MINIONS.md` §2:** entra **por defecto y sin preguntar** ante cualquier tema de plata/precio/oferta/conversión/retención o "¿vale la pena?" — y entra **JUNTO** al especialista, no en su lugar. Él pone el objetivo comercial y el número a mover; el otro ejecuta.
- **Se le pasó OFFICE HOURS** (las 6 preguntas estilo YC): ahora es suyo y las corre ANTES de que se escriba código o se gaste en ads.
- **Frontera con Metapod:** El Comerciante fija el objetivo (CAC tolerable, oferta, a quién); Metapod decide cómo pautarlo. **La PRIORIDAD #0 de Metapod (políticas de Meta) gana** sobre cualquier número del Comerciante.
- **Los 6 números que definió que Vendí tiene que medir:** costo por imagen entregada y margen por pack · CAC por canal · conversión por etapa (visita→lead→registro→pago) · tasa de activación · **tasa de recarga/recompra** (la que decide si Vendí es un negocio o una venta única) · LTV y LTV:CAC (mínimo 3:1).
- **Regla de etapa que trae:** con casi cero ventas, la prioridad **NO** es optimizar el embudo sino **conseguir las primeras ventas a mano** — es la única forma de descubrir la objeción real, que después es la copy de la landing y el ángulo del primer ad.

### ⚠️ Pendiente de esta sesión
**El estado comercial en vivo NO se pudo verificar:** las consultas a Supabase por MCP dieron *connection timeout* (proyecto posiblemente dormido o red). El último dato de memoria sigue siendo el snapshot 2026-07-11 (3 profiles, 42 leads, 28 generations, 87 imágenes, 14 movs de ledger) + 1 pago real al 2026-07-06. **Primera tarea al retomar: confirmar contra la base cuántas ventas reales hay hoy** — todo el plan comercial depende de ese número.

---

## §17 — 2026-08-19: INCIDENTE "SUPABASE PAUSADO" + auditoría de 5 minions + ESTADO COMERCIAL REAL

### El incidente
**El proyecto Supabase de prod `Vendiapp` (`njmxxdaxzzzlloweudgv`) estaba PAUSADO (estado `INACTIVE`).** Lo detecté de casualidad, queriendo consultar números para la bibliografía comercial — **nadie tenía una alerta.** Paolo autorizó reactivar; corrí `restore_project` → volvió a **`ACTIVE_HEALTHY`** en ~5 min.
- **Causa raíz: NO fue una falla.** Supabase **plan Free auto-pausa** proyectos con ~7 días sin actividad. Última escritura real: 2026-07-03/07-06 (leads hasta 07-17) → se pausó sola alrededor del **2026-07-13**, o sea estuvo caída **~3-5 semanas**.
- **Daño real: CERO** — pero *por falta de usuarios, no por diseño*. **Que un mes de caída no haya roto ninguna experiencia ES el diagnóstico.**
- ⚠️ **Va a volver a pasar.** Sin tráfico o sin plan Pro, se duerme de nuevo. **Acción #0 de Paolo: pasar a Pro ANTES de prender un solo ad** (de yapa destraba el leaked-password protection). Alternativa puente: cron de ping cada 2-3 días. **Y falta una alerta que avise cuando la app deja de responder** — hoy no existe.
- 🔑 **REUSABLE:** en los primeros minutos post-restore la DB **responde pero está VACÍA** (0 tablas, ni `storage.objects`). Es el bootstrap, NO data perdida. Bujía y El Comerciante lo cazaron esperando; si reportás ahí, decís una barbaridad.

### 🔴 ESTADO COMERCIAL REAL (verificado en vivo — cierra el pendiente de §16)
| Dato | Valor |
|---|---|
| **Ingreso bruto de Vendí, desde siempre** | **S/39** (≈US$10.5), un solo pago |
| Pagadores distintos (`credit_ledger reason=purchase`) | **1** |
| El pago | `mp_payment_id` 166169299302 · 2026-06-28 · S/39 · `lifetime-pass` · 60 cr · `user_3Fjzo3…` = **`jidokaconsulting.ia@gmail.com`** · acreditado OK |
| Perfiles | **3** — y **DOS son Paolo** (`user_3F4VMb…` y `user_3G8nw1c7…`) |
| **RECOMPRAS** | **0** — no existe el denominador |
| **Activación de pagadores** | **0%** |
| Shopify | 0 pedidos, 0 unmatched |
| generations / generated_images | 28 / 87 — **el 100% de la cuenta de Paolo** |

- 🚨 **EL DATO MÁS DURO: el único que pagó NUNCA usó el producto.** Se registró 2026-06-27 23:37, pagó **menos de 6 h después**, y en **52 días** no creó un producto ni generó una imagen. Sigue con los **60 créditos intactos**.
- 🚨 **SUPOSICIÓN FUERTE A CONFIRMAR POR PAOLO: `jidokaconsulting.ia@gmail.com` probablemente NO es cliente de mercado abierto.** Patrón: registro+pago el mismo día, **al día siguiente** de activarse las credenciales MP de producción, compró el `lifetime-pass` que sólo vivía en la landing, nunca lo usó, y la memoria asocia "jidoka" a **otra tienda Shopify de Paolo**. **Si es él o un conocido, Vendí tiene 0 ventas reales.**
- ⚠️ **CORRECCIÓN — "42 leads" era un dato INFLADO ~4×.** Las 44 filas de `leads` son **~11 quizzes reales de a lo sumo 3 dispositivos**: solo 3 user agents distintos, solo 11 combos únicos de respuestas, **17 filas con `answers` vacío**, y pares a 11 segundos con contenido idéntico → **el quiz guarda varias filas por persona**. Un solo UA generó 34 de 44. *(Salvedad: el UA no identifica personas; concluye acá porque nunca se pautó un peso.)* **Toda decisión tomada con el número 42 se tomó con basura.**
- **Silencio:** 47 días sin una generación · 33 sin un lead · 52 sin un pago.
- **Márgenes recalculados** sobre $0.061/img: Inicial ~73% · Pro ~67% · Negocio ~62% · Pase ~65%. ⚠️ **NO descuentan la comisión de Mercado Pago (~4-5% en Perú)** → el margen real es ~4-5 puntos menor. Y el costo se midió una sola vez hace 2 meses y medio.
- ⚠️ **Inconsistencia de precio sin validar: la landing muestra $10 USD y Mercado Pago cobra S/39.**
- **VEREDICTO de El Comerciante: Vendí está en PRE-VALIDACIÓN.** Producto funciona, cobro funciona end-to-end, precio nunca probado con método, **y el componente roto no es ninguno de esos: NO HAY CANAL. Nadie sabe que Vendí existe.** Recomendación única: **NO prender ads; vender 10 packs a mano en 14 días** y arrancar hoy escribiéndole al único pagador (*"pagaste el 28/06 y nunca lo usaste, ¿qué pasó?"*). **Número que le haría cambiar de opinión: 5 ventas a desconocidos en 14 días sin gastar en ads.** Umbral de la etapa siguiente: **la primera RECARGA**.

### 🔒 Hallazgos de seguridad (JonSnow) — ninguno aplicado, todos propuestos
- ✅ **El fail-open del PR #12 NO volvió.** `lib/auth/paid-access.ts` es fail-closed genuino (`:82` compara estricto contra `true`; todo camino de error da `null`). Las 3 APIs de acción fallan CERRADO. **Los candados históricos sobrevivieron a la pausa:** los 7 RPC siguen revocados de PUBLIC (migr 0015) y `profiles` sin INSERT/UPDATE/DELETE para anon/authenticated (migr 0018).
- 🔴 **#1 — El rebote del fail-closed manda al PAGADOR a pagar de nuevo.** Con la DB caída, el gate (`app/(app)/layout.tsx:32`) manda a todos a `/comprar`, y `app/comprar/route.ts:26-31` crea Preference de MP igual → **doble cobro real** (la idempotencia es por `payment_id`, el segundo trae otro id). **Amplificación: NO hay rate limit** en `/comprar` ni `/api/checkout` → un logueado sin pagar puede generar Preferences ilimitadas en la cuenta de Paolo. **Fix: exponer el tri-estado (`true|false|null`) y con `null` NO crear Preference + rate limit.** → Integral + Bujía.
- 🟠 **#2 — Refund silencioso: si la DB muere entre el deduct y el refund, pierde el USUARIO.** Los 4 refunds (`generations:207,267` · `regenerate:165` · `analyze:118`) hacen `await admin.rpc("grant_credits")` **sin mirar el error**. En `/api/generations` la ventana es la más ancha: deduce hasta **5 créditos** en `:168` y reembolsa en `:266`, después de Gemini (~5 min) y N uploads. Evidencia de que ya deja basura: **9 generations colgadas en `pending`** desde 2026-05-27. → Bujía.
- 🟠 **#3 — El pago que llega con la base pausada se pierde SIN RASTRO.** El 500 está bien para un hipo, pero **los reintentos de MP son finitos (8 intentos, ~14 días 6 h — verificado en doc oficial por Integral) y una pausa es indefinida.** Agotados: plata en la cuenta, cliente sin créditos, **ni una fila local** (la escribe la RPC que nunca corrió). **Shopify tiene `shopify_unmatched_orders`; MP NO tiene estacionamiento.** → Integral + Bujía.
- 🟡 **#4 — 5 rutas devuelven el error crudo del motor al cliente** (`regenerate:263,155,214` · `generations:179,219` · `regenerate:188`), incluido el **número de proyecto GCP** de Google. ✅ La API key NO se filtra y la service key tampoco (`server-only`). → Bujía.
- 🟡 **#5 — El error de `is_unlimited` se descarta y RE-ARMA el bug de acuñar créditos** (`generations:129` · `regenerate:133` · `analyze:88`). Si la RPC falla, `null` = falsy → para una cuenta de la allowlist el deduct es no-op pero el guard del refund pasa → **`grant_credits` acuña de la nada**. **NO es teórico: explica los 2 `refund` del 2026-07-03 sin generation desde el 2026-06-11** (el "+2 benigno a favor de Paolo" que registraba §12 — ahora se sabe el mecanismo). → Bujía.
- 🟡 **#6 — El gate del layout depende 100% del proxy por un `&&`** (`app/(app)/layout.tsx:32`): sin `userId` cortocircuita y **no redirige**. Hoy lo tapa `proxy.ts:78`, pero alcanza con agregar una ruta de `(app)` a `isPublicRoute` para abrirlo **en silencio**. → Bujía.
- ⚠️ **El classifier del harness le bloqueó a JonSnow el POST REST de verificación con anon key (2 veces).** La evidencia de `proacl` es autoritativa igual. Si se quiere cinturón y tiradores, **el POST lo corre Paolo**.

### ✅ Estado de la app (Hawkeye) — OPERATIVA, nada quedó roto por la caída
9 endpoints con los códigos correctos (`/`→307 `/login`; `/comenzar`→307 `/comprar`; `/login` y `/signup` 200; el resto 307 a login), **ningún 500**, **0 runtime errors en Vercel en 7 días**, webhooks sanos (401 con firma inválida = llegan al handler → **los pagos pueden acreditar**). El fail-closed **se auto-recupera** (`cache: "no-store"`, no persiste estado) → **no hubo nada que reparar a mano.**

### ⚠️ CORRECCIONES A LA MEMORIA VIEJA (verificadas en vivo hoy)
1. 🔴 **§6 está MAL: Clerk corre una instancia de DESARROLLO en PRODUCCIÓN.** `vendilatam.com/login` sirve `pk_test_ZXRlcm5hbC1zd2lmdC0xNC5jbGVyay5hY2NvdW50cy5kZXYk` (dominio `eternal-swift-14.clerk.accounts.dev`), headers con `X-Clerk-Auth-Reason: dev-browser-missing`, y los logs de Vercel dicen que Clerk recolecta telemetría de instancias de desarrollo. **La memoria afirmaba `pk_live` — es FALSO.** Riesgos: tope de usuarios de dev instances, banner de desarrollo, OAuth de Google con credenciales compartidas de Clerk, y el **handshake de dev-browser pasa la sesión por query string** → 🔑 **riesgo REAL de que el usuario vuelva de Mercado Pago a `/pago/resultado` SIN sesión y caiga en `/login` en vez de ver "pago OK"**. **HIPÓTESIS FUERTE: eso puede explicar por qué el único pagador nunca usó el producto** — primera pregunta a hacerle. Al migrar a instancia de producción, **los usuarios de la dev NO se llevan**. → Frontero + Paolo en el panel.
2. ✅ **`maxDuration` YA ESTÁ** (la memoria decía que faltaba): `generations:35`=300, `regenerate:34`=300, `analyze:28`=120, deploy READY con esos valores.
3. **El WARN `leads_insert_anon` always-true ya no aparece** en los advisors. Menos ruido, no un agujero nuevo.
4. **Working tree local: 1 commit adelante y 57 detrás de `origin/main` (`346b0c2`).** El `tsc` local tira 26 errores `TS2307` que son **falso positivo**: `@clerk/nextjs` y `mercadopago` están en `package.json` pero no en `node_modules`. Hawkeye lo corrió en worktree limpio desde `origin/main` + `pnpm install --frozen-lockfile` → **exit 0**. Para Paolo: `pnpm install` y el tsc local da verde.
5. **El repo de GitHub `PaoNieto/Vendiapp` sigue PÚBLICO** (`githubRepoVisibility: "public"` en el deployment).

### ❓ TRES PREGUNTAS ABIERTAS PARA PAOLO (bloquean el cierre)
1. **¿Quién es `jidokaconsulting.ia@gmail.com`?** De la respuesta depende si Vendí tiene 1 venta o 0.
2. **Panel de Mercado Pago → ¿hay algún pago aprobado DESPUÉS del 2026-06-28?** (Integral no pudo consultarlo: el MCP de MP rechaza sin app OAuth y el `MP_ACCESS_TOKEN` sólo vive en Vercel.)
3. **Panel de Clerk → ¿hay más de 3 usuarios?** Si hay más, alguien se registró durante el apagón — y por el agujero de `ensureProfile()` (que **se traga los errores de Supabase**, `lib/auth/ensure-profile.ts`) **la base no lo puede delatar**.

### Orden de trabajo propuesto (consenso de los 5 minions)
1. **Paolo** — las 3 preguntas de arriba + Supabase a **Pro** antes de cualquier ad.
2. **Comercial** — escribirle HOY al único pagador; 20 charlas cara a cara con PyMEs de Lima (los rubros que más aparecen en el quiz: **cosmética y alimentos**); correr **Van Westendorp** en esas mismas charlas.
3. **Integral** — hallazgo #1 (`/comprar` no crea Preference ante `null` + rate limit) y #3 (parking `mp_unprocessed_payments`) + job de reconciliación diario MP→Supabase.
4. **Bujía** — #2 (refund con error checkeado + reconciliador), #5 (`is_unlimited`), #6 (el `&&`), #4 (mensajes de error), y que `ensureProfile()` deje de comerse los errores.
5. **Frontero + Paolo** — migrar Clerk a instancia de producción.
6. **Instrumentación mínima antes de pautar:** analytics en la landing (hoy **no existe el denominador del embudo**), deduplicar el guardado de leads, **registrar el checkout INICIADO** (hoy el abandono en MP es invisible), y alerta de base caída.

---

## 18. CLERK EN PRODUCCIÓN + VEREDICTO DE ADS (sesión 2026-08-19/20)

### ✅ RESUELTO: Clerk migrado de instancia DEV a PRODUCCIÓN (2026-08-20)
**Cierra la corrección #1 de §17** ("Clerk corre una instancia de DESARROLLO en PRODUCCIÓN"). Ya no aplica.

- **Instancia de producción creada** por Paolo en el panel (clonando la config de dev). Dominio de la app declarado: `vendilatam.com`.
- **Frontend API ahora = `clerk.vendilatam.com`** (el `pk_live` decodifica a `clerk.vendilatam.com$`). Se acabó `eternal-swift-14.clerk.accounts.dev`.
- **5 CNAME cargados en Vercel DNS por CLI** (`vercel dns add`, NO hizo falta la REST API esta vez — la CLI ya estaba autenticada como `paolonietoc-6715`; el dominio vive bajo el scope `paolos-projects-ccc3dcf6`). Los 5, verificados resolviendo contra 8.8.8.8:
  - `accounts` → `accounts.clerk.services.`
  - `clerk` → `frontend-api.clerk.services.`
  - `clk._domainkey` → `dkim1.9yw49sesb6wu.clerk.services.`
  - `clk2._domainkey` → `dkim2.9yw49sesb6wu.clerk.services.`
  - `clkmail` → `mail.9yw49sesb6wu.clerk.services.`
- ⚠️ **NO se tocó nada del correo:** siguen intactos el MX `smtp.google.com`, el TXT SPF (`include:spf.improvmx.com include:_spf.google.com`), el CNAME de verificación de Google y los CAA (`pki.goog`/`sectigo.com`/`letsencrypt.org` — el CAA permitió la emisión de Clerk sin cambios).
- **Certificados: se emitieron SOLOS** al verificarse el DNS. Nunca apareció (ni hizo falta) el botón "Deploy certificates" que la doc menciona — Paolo lo buscó y no existía. **No perder tiempo buscándolo: chequear con `curl https://clerk.<dominio>/v1/environment` (200 = listo).**
- **Claves nuevas en Vercel** (`vercel env rm` + `vercel env add`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsudmVuZGlsYXRhbS5jb20k` y `CLERK_SECRET_KEY=sk_live_…`. ⚠️ **Quedaron SOLO en Production**: la entrada vieja cubría `Preview, Production` y el `rm` se llevó las dos → **Preview quedó SIN claves de Clerk** (deuda menor, re-agregar las `pk_test/sk_test` a Preview si se usan previews).
- **Redeploy:** `vercel redeploy https://vendiapp-3sj59rr5v-…` (republica el MISMO commit con las env nuevas, **sin** publicar el working tree local que está 57 commits atrás). **Lo corrió PAOLO** — el classifier del harness bloquea al agente tanto `vercel --prod` como `vercel redeploy`. Quedó aliased a `vendilatam.com`.
- **VERIFICADO EN VIVO** en `vendilatam.com/login`: sirve `pk_live_`, dominio `clerk.vendilatam.com`, **0 ocurrencias de "Development mode"**.

**⏳ PENDIENTE INMEDIATO — remap de usuarios (otra vez).** Los usuarios de la instancia dev **NO migran**. Paolo tiene que registrarse de nuevo con `paolonietoc@gmail.com` y hay que reconectar sus datos (28 generations, 87 imágenes, créditos) al nuevo `user_id` de Clerk, en las 9 ubicaciones + paths de Storage (mismo procedimiento que el template `0012b_remap_users.sql` de §6).

**⏳ PENDIENTE — login de un clic (Google OAuth).** El checklist de Clerk lista "Set up Google sign-in" y "Set up Facebook sign-in" (credenciales propias, obligatorio en producción). **Las credenciales de Google Cloud son GRATIS** — no confundir con Google Workspace, que NO tiene nada que ver (Clerk manda sus propios mails). Es el mayor salto de percepción de seriedad y elimina el código-por-mail.

### 💰 Precios de Clerk (verificado 2026-08-20 en clerk.com/pricing)
**Free (Hobby) incluye dominio propio y el flujo completo de sign-in/sign-up.** Lo ÚNICO pago que importa acá es **quitar el "Secured by Clerk"** → Pro US$25/mes. También son Pro: MFA, passkeys, plantillas de mail custom, duración de sesión configurable. **Recomendación dada: NO pagar Pro hasta que haya ventas.**

### 🌐 Dominios — VERIFICADO EN VIVO (no confundir nunca más)
- **`vendilatam.com` (SIN www) = LA APP.** `/` → 307 a `/login`.
- **`www.vendilatam.com` = LA LANDING.**

### 📉 VEREDICTO SOBRE LOS S/900 EN META ADS (Metapod + El Comerciante, 2026-08-19)
Paolo preguntó si S/900 alcanzan para pautar. **Respuesta de los dos, por separado y coincidente: el monto no está mal, está MAL DIRIGIDO. No prender ads para vender.**

- **Estado comercial verificado en vivo 2026-08-19** (la base YA respondió, se acabó el timeout): **1 solo pago en la historia** (S/39, `2026-06-28`, hace 52 días), **0 pedidos Shopify, 0 recompras**, última generación hace 47 días, **activación de pagadores = 0%** (el único pagador nunca generó una imagen; sus 60 créditos siguen intactos).
- 🚨 **Dato nuevo y peor de lo que se creía: las 45 filas de `leads` tienen SOLO 2 emails distintos.** El quiz de la landing no guarda email en el 96% de los casos. Mandar tráfico pago ahí = tirar el 96% sin dejar rastro.
- **Comisión REAL de Mercado Pago (dato duro del `raw_event` del webhook, no estimación):** `fee_details.amount = 2.79` sobre S/39 = **7.15%**, `fee_payer: collector` (lo paga Paolo). Fórmula que ajusta al centavo: **3.50% + S/1.00 + IGV 18%**. ⚠️ Derivada de n=1 (débito Visa).
- **Margen real por venta:** Inicial S/15.82 · **Pase S/20.18** · Pro S/33.13 · Negocio S/67.97 (después de fee MP + Gemini a S/0.229/crédito).
- **La aritmética que mata el debate:** S/900 ≈ 800 clics → ~750 visitas. Para no perder plata con el Pase hacen falta **45 ventas = 5.5% de click→compra**. Lo real en tráfico frío sin marca es **0.5-1.5%** → ~8 ventas, CAC S/112 contra margen S/20.18 → **se pierden ~S/700**. Y con 8 ventas Meta **nunca sale de fase de aprendizaje** (necesita ~50 conversiones/semana POR CONJUNTO).
- **El problema NO es el presupuesto, es el TICKET.** Con S/9.000 la cuenta por unidad sería idéntica. Techo estructural: **ratio AOV/front = 1.0** (el playbook de Bilbao pide 1.5) porque **no hay backend** — sin order bump, sin upsell, sin recurrencia. **Ni una recompra del 40% haría viable el tráfico frío pago con ticket S/39.**
- ⚠️ **Error de embudo detectado:** `/comprar` (destino universal del no-pagador) empuja el **Pase S/39, el segundo margen más bajo del catálogo**. Cambiar el default a Pro (S/54.90) sube el margen **+64%** por venta — es un test, no una certeza.
- **Reparto alternativo de los S/900 (consenso):** Supabase Pro 2 meses (~S/190, habilitador — sin esto la base se duerme y el pago que llega se pierde) + compra real de prueba end-to-end (S/40) + **campaña de MENSAJES a WhatsApp (~S/400-450)** + logística de ~20 charlas con PyMEs de Lima (~S/220-270).
  - 🔑 **Por qué WhatsApp: es el ÚNICO objetivo de Meta que mide bien SIN Pixel** (la conversación pasa dentro de Meta). No compra ventas, compra conversaciones → alimenta Van Westendorp y la objeción real.
- **Si igual se prende (plan mínimo):** objetivo **Tráfico → Vistas de la página de destino** (sin Pixel el objetivo "Ventas" ni aparece), **1 campaña · 1 CONJUNTO · 4 anuncios**, S/30/día, Perú amplio sin intereses, 4 videos 9:16 de antes/después. **Piso útil por celda de test: S/25/día × 7 días.** ⚠️ **Partir el presupuesto en muchos conjuntos es el error a evitar** (ninguno aprende + se pisan en la subasta y suben tu propio CPM).
- **Umbrales:** matar anuncio si hook rate <25% / CTR <0.8% / costo por vista >S/2.00 (día 3, mín. 1.000 impresiones). Escalar solo si costo por vista <S/1.00 **Y** hay ≥1 venta a un desconocido en los primeros S/300. **Apagar todo a los S/450 gastados sin una venta a desconocido.**
- **Sobre el Pixel (aclaración que Paolo pidió):** NO es obligatorio para pautar; es obligatorio para *optimizar a compra*. Para Vendí la mitad importante es el **CAPI** (server-side desde el webhook de MP), no el Pixel del browser — la compra ocurre fuera del navegador. Y el conteo manual en `credit_ledger` va a ser **más confiable que el panel de Meta** incluso con Pixel (Gordon/Moakler/Zettelmeyer 2022: el panel exagera el lift en compras 5×-13×).

### 🚨 BLOQUEANTES ANTI-BANEO EN LA LANDING VIVA (auditados por Metapod sobre `.vendi-landing-deploy/index.html`) — NO ARREGLADOS, Paolo declinó por ahora
1. 🔴 **Precio incoherente.** El número grande dice **`$10` USD** (con **`$27` tachado que NUNCA fue un precio real** = descuento engañoso) y MP cobra **S/39**. La aclaración "el cobro se procesa en soles (S/ 39)" SÍ existe (líneas 1672 y 2759) pero en letra chica; las líneas 1832 y 2919 dicen "$10 USD" sin ninguna aclaración. **Fix propuesto: S/39 como número grande, "≈ US$10" como referencia, y reemplazar el tachado falso por la urgencia REAL que la propia landing ya declara ("después Vendí pasa a suscripción mensual").**
2. 🔴 **"Más fotos, más ventas"** + gráfico de curva de ventas inventado. Promesa de resultado comercial sin sustento (la propia bibliografía de Vendí lo desmiente: OR 1.17-1.25× con poder predictivo ~1%). **Prohibido en el anuncio.**
3. 🟠 **Mockups con dominio inventado `app.vendi.app`** (líneas **1456, 1472, 1495** → `/productos`, `/estilo`, `/fabrica`). El dominio real es `vendilatam.com`.
4. 🟠 Escasez que no se mueve ("solo 30 lugares" desde junio con 1 pago) · comparación con marcas ajenas (Canva/Midjourney/ChatGPT) — en la landing pasa, **en el anuncio NO**.
5. 🟡 "¿Vendés productos físicos? Entonces **seguro te pasa** esto…" roza la política de atributos personales. Reescribir en tercera persona sale gratis.

**Candados de cuenta antes del primer ad:** BM verificado con RUC + dominio verificado en el BM + 2FA + perfil personal de Paolo con antigüedad + página de FB/IG con 5-8 posts orgánicos previos + un solo método de pago estable + arrancar en S/20-30/día. **Si Meta restringe la cuenta: NO crear otro BM, NO borrar activos, NO cambiar el método de pago** (se lee como elusión y extiende el bloqueo).

### Preferencias de Paolo confirmadas esta sesión
- **Quiere las cosas EN FÁCIL.** Pidió tres veces bajar el nivel técnico ("no entendí, en fácil porfa", "más fácil jeje"). Analogías > jerga. Tablas cortas > párrafos. **Y cuando se pierde, re-orientarlo con un mapa de 4 pasos en vez de seguir avanzando.**
- **Se frustra con las cacerías de botones en paneles.** Si algo no aparece donde la doc dice, **verificarlo por API/curl en vez de mandarlo a buscar**. La CLI de Clerk (`npx clerk@latest`) existe y es "agent-ready", pero **`clerk auth login` requiere OAuth por navegador y NO sobrevive al harness** (venció 2 veces; y pasarle la URL a mano se corrompió al copiar). **No volver a intentar ese camino.**

### 🔄 DECISIÓN DE PRODUCTO (Paolo, 2026-08-20): el embudo es PAGAR-PRIMERO
**Flujo objetivo, dicho textual por Paolo:**

> Landing → **PRE-CHECKOUT de Vendí (NO EXISTE TODAVÍA — hay que construirlo)** → Mercado Pago → recién ahí Sign up / Login de la cuenta **QUE YA COMPRÓ**.
>
> **"Nadie llega al sign up sin pagar."**

**Es al REVÉS de lo construido.** Hoy: `/comenzar` o `/comprar` → si es anónimo lo manda a `/signup?redirect_url=/comprar` → se registra → el gate de `app/(app)/layout.tsx` lo rebota a `/comprar` → MP. O sea **hoy la cuenta existe ANTES del pago**.

⚠️ **CONSECUENCIA TÉCNICA MAYOR (identificada 2026-08-20, a resolver):** el cobro in-app identifica al comprador con `external_reference = clerkUserId` sacado de `auth()`, y el webhook acredita vía `grant_credits(clerkUserId, …)`. **Si el pago ocurre antes de que exista la cuenta, NO HAY clerkUserId** → el webhook no tiene a quién acreditarle. La única llave disponible pasa a ser el **email**, con todos los problemas que eso trae (el que paga con un mail y se registra con otro; el que paga y nunca se registra).
- **Precedente reusable en el repo:** el webhook de Shopify ya estaciona los pedidos sin match en `shopify_unmatched_orders` y matchea por email vía Clerk (ver §5). Mismo patrón aplicable a MP.
- Encargado a **Integral** (lado cobro + spec del pre-checkout) y **Bujía** (schema + RPC de estacionamiento/reconciliación). Pendiente de informe al 2026-08-20.

**Regla que Paolo exigió explícitamente:** todo lo que se diseñe tiene que **funcionar igual para TODOS los usuarios**, no depender de parches por-usuario. (Dicho a raíz de que se le dio acceso metiéndolo en `unlimited_users`, que es allowlist y no generaliza.)

### 🔓 Acceso de Paolo restaurado tras la migración (2026-08-20)
Se registró de nuevo en la instancia de producción: **`user_3IC6AAJgCAx4bJ31nGwjl7H2i6N`** (`paolonietoc@gmail.com`, verificado, 2026-08-20T20:00:56Z; es el ÚNICO usuario de la instancia prod). Al entrar lo mandó directo a `/comprar` — **comportamiento correcto del paywall**, no un bug: cuenta nueva sin compra. Se le devolvió el acceso con `INSERT INTO unlimited_users` del id nuevo (la fila del id viejo `user_3F4VMb0isZjkGmfTevJrbG7RD2B` quedó también). **El gate acepta dos señales** (`lib/auth/paid-access.ts`, leído de `origin/main`): fila `purchase` en `credit_ledger` **O** estar en `unlimited_users`; es **fail-CLOSED** (si la consulta falla tras 1 reintento con timeout 3s → devuelve `null` → deja afuera).
⏳ Falta el remap de sus datos históricos (28 generations, 87 imágenes) al id nuevo → lo prepara Bujía.

### 🔑 Google OAuth — TODO VERIFICADO por Integral (2026-08-20), listo para ejecutar
- **Redirect URI (VERIFICADO contra la instancia real, no inferido): `https://clerk.vendilatam.com/v1/oauth_callback`.** Integral arrancó un `sign_in` real con `strategy=oauth_google` y leyó la URL que Clerk arma: confirma `client_id=` **vacío** → esa es la causa exacta del `Error 400: invalid_request — Missing required parameter: client_id`. Diagnóstico cerrado.
- **Scopes que pide Clerk: solo `openid` + `userinfo.email` + `userinfo.profile`** → los tres NO son sensibles → **Google no exige verificación de la app** para publicarla. Se publica en el acto.
- ⚠️ **Google renombró la consola: "Pantalla de consentimiento de OAuth" YA NO EXISTE.** Ahora es **"Plataforma de Google Auth"** con pestañas. Links directos (no buscar botones): `console.cloud.google.com/auth/branding` (nombre de la app + soporte) · `/auth/audience` (publicar la app — en modo "Prueba" solo entran testers, tope 100, sesión cae a 7 días) · `/auth/clients` (crear el "ID de cliente de OAuth" tipo **Aplicación web**).
  - Orígenes JS autorizados: `https://vendilatam.com` + `https://www.vendilatam.com`. URI de redirección: la de arriba, **sin barra final** (una `/` de más = `redirect_uri_mismatch`).
- **En Clerk:** Configure → SSO connections → Google → toggle **"Use custom credentials"** → pegar Client ID + Secret. ⚠️ **Elegir la instancia de PRODUCCIÓN** en el selector, no la de desarrollo.
- ✅ **ACCOUNT LINKING: NO crea usuario duplicado.** Doc oficial de Clerk (*Account linking for OAuth*): si el email de OAuth viene verificado, **vincula al usuario existente, incluso si tiene contraseña**. No hay nada que configurar. Único caso raro: si el email quedó SIN verificar, Clerk pide cambiar la contraseña antes de vincular (igual vincula, un solo usuario). → **Al registrarse por mail, poner el código de verificación.**
- 🔴 **FACEBOOK: recomendación = APAGARLO, no configurarlo.** Está igual de roto (`client_id=` vacío, verificado). Configurarlo exige App de Meta + política publicada + App Review, y crear una App de Meta a las apuradas antes de pautar choca con la PRIORIDAD #0 anti-baneo de Metapod. Ruta: Configure → SSO connections → Facebook → apagar "Enable for sign-up and sign-in". ❌ Integral NO pudo verificar el nombre exacto del botón para BORRAR una conexión (Clerk no lo documenta) — si no aparece, se hace por Backend API con la `sk_live`.
- **Verificación por comando (no mira el panel, le pregunta a Clerk qué le manda a Google de verdad):** `POST https://clerk.vendilatam.com/v1/client/sign_ins` con `strategy=oauth_google` (previo `GET /v1/client` para cookie) → grep `client_id=`. Hoy da vacío; bien = `…apps.googleusercontent.com`. Y `oauth_facebook` en `/v1/environment` hoy da 3 ocurrencias; apagado = 0.

---

## §19 — 2026-08-20: DOSSIER MAESTRO de Vendí (asset reusable para armar un Proyecto en Claude)

Paolo pidió "un PDF explicativo al detalle de todo Vendí para crear un proyecto en Claude" y que se lo mandara al correo antes de salir.

**Entregado (3 formas del mismo documento):**
- **Artifact (privado, se abre del celular):** `https://claude.ai/code/artifact/5c80dcf1-e9bd-4718-a3ab-3f0bf2f52375` — tema oscuro (Cuaderno v2: forest/gold, Instrument Serif + Inter + DM Mono), rail lateral con scroll-spy, 20 secciones.
- **PDF (39 páginas):** `C:\Users\Usuario\vendiapp\vendi\output\Vendi-Dossier-Completo.pdf` — generado con Chrome headless (`--headless=new --print-to-pdf --no-pdf-header-footer`) desde `output/vendi-dossier.html`. **Este es el archivo a subir al Proyecto de Claude.**
- **Correo enviado** a paolonietoc@gmail.com con el link + la ruta + resumen ejecutivo (msg id `1a0210196cfc42fb`).

**Fuentes:** MEMORIA_DE_DIOS + MINIONS + árbol verificado de `origin/main`=`346b0c2` (se hizo `git fetch` + `git ls-tree` para no describir el working tree local, que está 57 commits atrás). Las 20 secciones: qué es Vendí · el fundador y cómo trabajar con él · créditos · producto/UX · arquitectura y stack · base de datos · Clerk · cobro · paywall · Gemini · landing y embudo · seguridad · estado comercial real · competencia · Meta Ads · correo e infra · los 10 agentes · reglas duras · pendientes priorizados · glosario en fácil.

**Archivos fuente (para regenerar o editar):** `output/p1..p6.html` (contenido por partes) → `output/vendi-dossier.html` (versión print) y `output/a-head.html` + `output/dossier-vendi.html` (versión web/artifact). Para actualizar el artifact: republicar `output/dossier-vendi.html` pasando la URL de arriba como `url`.

🔑 **LÍMITE REUSABLE: el conector de Gmail NO puede adjuntar archivos grandes.** El tool `send_message` pide el adjunto como base64 dentro del parámetro; un PDF de 1,3 MB (≈1,8 MB en base64) es imposible de emitir para el agente. **Para "mandarle un archivo por mail a Paolo": publicar Artifact + mandar el link, o dejar la ruta local.** No prometer adjuntos binarios sin chequear el tamaño primero (se le confirmó que sí se podía adjuntar antes de verificarlo — corregido en el momento).

🔑 **REUSABLE — heredocs largos fallan.** Un `cat > archivo <<'EOF'` de ~15 KB se corta y da `unexpected EOF`. Para archivos grandes: usar el tool Write por partes y concatenar con `cat`.

---

## §20 — 2026-08-21: EL EMBUDO SE DA VUELTA (registrarse primero) + onboarding + paywall `/plan`

### 🔄 DECISIÓN DE PRODUCTO (Paolo, 2026-08-21) — **REVIERTE la de §18**
§18 (2026-08-20) decía **pagar-primero** ("nadie llega al sign up sin pagar"). **Paolo lo dio vuelta el 2026-08-21: el embudo es REGISTRARSE PRIMERO, PAGAR DESPUÉS**, estilo Arcads:
`Landing → Comenzar → Sign up → **ONBOARDING (3 pasos)** → **PAYWALL** → Mercado Pago → app`

🔑 **Efecto colateral GRANDE: muere la "consecuencia técnica mayor" de §18.** Con signup-primero, el `external_reference = clerkUserId` sigue existiendo al momento del pago → **el webhook sigue teniendo a quién acreditarle**. No hace falta matchear por email, ni estacionar pagos huérfanos, ni tocar el cobro. El encargo a Integral/Bujía de §18 (pre-checkout + reconciliación por email) queda **CANCELADO**.

### Lo construido — rama `feat/onboarding-paywall`, commit `29795f4`, **PR SIN MERGEAR**
Base `origin/main`=`346b0c2`. 8 archivos, +1186/−224. `tsc`/`eslint`/`build` verdes.
- **`/onboarding`** (reescrito) + `onboarding-client.tsx` — 3 pasos: nombre del negocio → rubro (grilla de 12, un toque, auto-avance) → qué vende (placeholder dinámico por rubro). **NO salteable.**
- **`/plan`** (nuevo) + `plan-client.tsx` — el paywall. **Las dos viven FUERA del route group `(app)`** (adentro el gate las rebotaría y no se verían nunca).
- **`lib/industries.ts`** (nuevo) — vocabulario único de 12 rubros + placeholders. `mi-negocio` ahora lo importa (tenía 9; quien elegía Joyería/Cafetería/Ferretería veía el select VACÍO — bug tapado).
- **El único cambio de ruteo es UNA línea**: `app/(auth)/signup/[[...rest]]/page.tsx` → `fallbackRedirectUrl="/comprar"` **→ `forceRedirectUrl="/onboarding"`**.

🔑 **REUSABLE — precedencia de redirects de Clerk** (verificada contra la doc Y el código de `@clerk/nextjs` 7.5.x): `forceRedirectUrl` > query param `redirect_url` > `fallbackRedirectUrl` > env var. Como `/comprar` manda al anónimo a `/signup?redirect_url=/comprar`, **SOLO `force` le gana a ese query param**. Con `fallback` el onboarding no se vería nunca.

🔑 **La env de Vercel `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` YA valía `/onboarding`** (leído del bundle de prod). Lo que mandaba al recién registrado directo a MP era el **prop del componente**. **No hay que tocar Vercel.** `.env.example` decía `/comprar` y mentía → corregido.

### 🔒 Lo que NO se tocó — 14 archivos congelados, 0 diff (verificado por 2 vías)
`lib/mercadopago/{create-preference,client,catalog}.ts` · `lib/validations/checkout.ts` · `app/api/checkout/route.ts` · `app/api/webhooks/{mercadopago,shopify}/route.ts` · `lib/auth/{paid-access,ensure-profile}.ts` · `app/comprar/route.ts` · `app/comenzar/route.ts` · `app/pago/resultado/page.tsx` · **`proxy.ts`** · **`app/(app)/layout.tsx`**.
Regla del PR: el onboarding **no escribe** en `credit_ledger` ni `unlimited_users`, **no setea ninguna flag de acceso**, no usa `createAdminClient()`, no llama a las 3 APIs que gastan Gemini, y al checkout **solo le manda `{productId}`**.

### 🕳️ AGUJEROS DE SEGURIDAD — auditoría de JonSnow (2026-08-21). Veredicto: **el muro está ENTERO**
Reverificó en vivo los 3 lugares donde Vendí ya sangró (RPC a PUBLIC, self-grant en `profiles`, fail-open del paywall): **los 3 cerrados**. Probó `PATCH credits_remaining=99999` → `42501 permission denied`. `credit_ledger` no tiene policy INSERT → **la señal del paywall no es forjable**. Cero secretos en el git history.

1. ✅ **CERRADO POR ESTE PR — `/onboarding` respondía `200` a CUALQUIER anónimo en producción** (todo el resto da 307). Causa: era una página **estática** sin `auth()`. Ahora Server Component con guardas → 307. Verificado en vivo antes y después.
2. 🔴 **ABIERTO, PR aparte (Bujía) — bypass del proxy por extensión de imagen.** El matcher de `proxy.ts:94` excluye `.*\.(svg|png|jpg|...)$`, así que **cualquier ruta de app con extensión falsa saltea el middleware**. Verificado en prod: `/productos/x` → 307 pero **`/productos/x.png` → 500**, `/fabrica/x.jpg` → 500. Hoy **falla cerrado por ACCIDENTE** (toda ruta de `(app)` depende de `auth()`, que crashea sin middleware). Bomba de tiempo: el día que se agregue a `(app)` una ruta que no dependa de `auth()`, se sirve sin paywall.
3. 🟠 **ABIERTO, PR aparte (Bujía) — el gate es fail-OPEN ante `userId` null.** `app/(app)/layout.tsx:32` = `if (userId && !(await userHasPaidAccess(userId)))`. Si `userId` es null el gate **no dispara**. Hoy lo tapa el proxy. **Por eso NUNCA se puede meter una ruta de `(app)` en `isPublicRoute`: abre el muro EN SILENCIO.** Fix propuesto: `if (!userId || !...)`.
4. 🟡 `/comprar` y `/api/checkout` **sin rate-limit** → Preferences de MP infinitas. Integral, PR aparte.

### 💰 Decisiones comerciales (El Comerciante) — **PROPUESTAS, nada se cambió**
- **Paywall = 2 productos**: Pase Fundador **S/39** destacado + **Pack Negocio S/119.90** subordinado. NO el Pro (aunque §18 lo sugería por margen): **el Pase es más barato POR FOTO (S/0.65) que el Inicial (S/0.83) y el Pro (S/0.686)**, o sea el Inicial y el Pro están **DOMINADOS** mientras el Pase esté en vitrina. El Negocio (S/0.60) es la única segunda opción no dominada y tiene 3,4× el margen del Pase.
- **NO mover el default a Pro todavía**: con 1 venta en la historia la variable escasa es *información*, no margen. 10 ventas × S/13 = S/130; no vale pagar información con eso. Se testea después de las primeras 10 ventas.
- 🔴 **PROHIBIDO en el paywall** (y ya aplicado): **precio tachado** (el "US$27" de la landing **nunca fue un precio real** = descuento engañoso, bloqueante anti-baneo de §18), "más fotos más ventas", escasez que no se mueve, y sugerir créditos ilimitados. **El número grande es `S/39`** (no US$10) porque es lo que MP cobra 2 segundos después.
- ⛔ **NO generar una imagen de muestra gratis en el onboarding.** Zhang & Duan 2025 (RCT, n=680.588): los que completaron más tareas en la prueba **convirtieron MENOS**, y en mercados de menor PBI la saturación llega más rápido (= LatAm). El paywall usa **galería FIJA** (`public/estilos/*.jpg`, ya existen).

### 🔎 Research (Willy) — el onboarding de Arcads, sacado de su CÓDIGO FUENTE público
`app.arcads.ai` es Next.js y sus chunks JS son públicos sin login. **6 pantallas** entre signup y precio: `intent` → `about you` → `team-size` → `business-type` → `attribution` → `website` (la ÚNICA salteable, y el skip **se loguea como respuesta**). Reanudable (`router.replace` si ya contestaste), **NO salteable** (el paywall rebota si falta `attributionSource`), y **la segmentación rutea plata**: `companySize>=50 || monthlySpend "100K-1M"` → paywall PRO + "Talk to sales" + Calendly. Instrumentan cada respuesta (`funnel_question_answered`) y A/B testean el onboarding mismo.

🔑 **El mecanismo central del paywall: precio y prueba visual EN LA MISMA PANTALLA** (12 videos 9:16 en loop bajo los planes, **precargados durante el onboarding**). Aplicado a Vendí con las 10 fotos de estilos que ya existían.

⚠️ **Lo que NO aplica a Vendí:** todos los benchmarks buenos (RevenueCat, Cal AI 32 pantallas, Duolingo 38) son de **suscripción con trial**, y su mecanismo #1 es empujar al plan anual. Vendí es pago único de S/39 sin trial y sin plan anual. Material crudo en `output\arcads_subs\` y `C:\Users\Usuario\arcads_chunks\`.

### 🎨 Diseño (Davinci) — hallazgos reusables
- 🔑 **LA APP ARRANCA EN DARK.** `app/layout.tsx:52` setea `data-theme='dark'` si no hay `localStorage.vendi-theme`. **Un usuario recién registrado NO tiene esa preferencia → ve el onboarding y el paywall en OSCURO.** Diseñar y QA-ear dark primero.
- 🔑 **`/fundador` está HUÉRFANO** (nadie lo linkea; solo se llega tipeando la URL) y su `fundador.css` (417 líneas) está **hardcodeado en light** con las fuentes de la LANDING (Fraunces/Hanken/DM Mono). Por eso el paywall se hizo **pantalla nueva** en vez de rebrandearlo: mismo trabajo, riesgo cero. `/fundador` queda intacto como fallback.
- 🔑 **`font-mono` está MUERTO**: `globals.css:11` mapea `--font-mono` a Geist Mono, **que no se carga en ningún lado** → todo `font-mono` renderiza Inter. No se arregló (tocarlo cambia el render de toda la app). Para números usar `card-value` / `numeric-tabular`. **Ticket aparte.**
- 🔑 **Tailwind v4: la variante `data-selected:` compila a `[data-selected=true]`, NO a `[data-selected]`.** Frontero tenía `data-selected={sel ? "" : undefined}` → el estado "opción seleccionada" **no se pintaba**, y `tsc`/`eslint`/`build` pasaban igual. **Falla silenciosa: hay que grepear el CSS compilado para cazarla.**

### 🎯 QA (Hawkeye) — veredicto: **se puede mergear, el cobro no se rompe**
- `POST /api/webhooks/mercadopago` en prod hoy = **401 "Firma inválida"** → **llega al handler, NO redirige**. Ese es el canario: **si algún día devuelve 307, Vendí dejó de cobrar y hay que revertir YA.**
- Baseline de no-regresión para comparar post-merge: `/comenzar`→307 `/comprar` · `/comprar`→307 `/signup?redirect_url=/comprar` · `/dashboard`,`/upgrade`,`/fabrica`,`/mi-negocio`→307 `/login` · `/plan`→307. **Lo ÚNICO que debe cambiar es `/onboarding`: de 200 a 307.**
- Contraste medido: `text-mute-on-bg` sobre el centro del fondo en dark da **4.39:1** (AA pide 4.5 para texto chico). Falla por 0.11 en el subtítulo del wizard y 5 líneas del paywall. Fix de una línea (usar `text-mute`, 6.49:1). **No bloquea.**
- Foco no se mueve al auto-avanzar el paso 2 (lector de pantalla no anuncia el cambio de paso); `role="radiogroup"` sin roving tabindex. **No bloquea.**

### ⏳ Pendiente de Paolo
1. **Abrir y mergear el PR** (`https://github.com/PaoNieto/Vendiapp/pull/new/feat/onboarding-paywall`; cuerpo listo en `output\PR-onboarding-paywall.md`). **NO mergeado a propósito.**
2. 🚨 **Probar con OTRA cuenta**: Paolo está en `unlimited_users` → pasa el gate SIEMPRE y **nunca ve el paywall**; incógnito NO alcanza. Usar `paolonietoc+prueba1@gmail.com`.
3. **Test del registro con Google de 1 clic** — único punto NO verificable leyendo código. Si cae en `/onboarding`, bien. Si cae directo en MP, **no está roto**: se saltea el onboarding y hay plan B (cambiar `app/comprar/route.ts:23` a `redirect_url=/onboarding`).
4. Decidir si se capturan las respuestas en DB (hoy solo `localStorage`; JonSnow habilitó un INSERT fire-and-forget a la tabla `leads` que YA existe, con 5 condiciones — **quedó fuera de este PR a propósito**).
5. Decidir el motivo de "Ahora no puedo": hoy la respuesta **se tira** (`recordExitReason` es un stub). Es el dato más valioso de la etapa (la objeción real).

### 🧰 Gotchas operativos de esta sesión (reusables)
- **`gh` CLI NO está instalado** en la máquina de Paolo (ni en PATH de bash ni de PowerShell). Para entregar un PR: `git push -u origin <rama>` y pasarle a Paolo la URL `https://github.com/PaoNieto/Vendiapp/pull/new/<rama>`, con el cuerpo del PR en un `.md` aparte para copiar/pegar.
- **El `node_modules` del repo principal está VIEJO** (le faltan `@clerk/nextjs` y `mercadopago`) → un worktree nuevo con junction a ese `node_modules` da falsos errores de tipos. Correr `pnpm install --frozen-lockfile` **dentro del worktree**. `package.json`/`pnpm-lock.yaml` no difieren entre el local y `origin/main`.
- Confirmado otra vez: **heredocs largos en Bash fallan** (`unexpected EOF`). Para textos grandes: `Write` por partes + `cat` para concatenar.

---

## 19. ONBOARDING + PAYWALL EN PROD · LANDING ARREGLADA · AUDITORÍA DEL MURO (2026-08-21)

### ✅ EN PRODUCCIÓN: onboarding de 3 pasos + paywall `/plan` (PR #25, merge `2110711`)
**Decisión de flujo de Paolo (se lo pregunté explícito y eligió):**
`LANDING → SE REGISTRA (1 clic Google) → ONBOARDING → MERCADO PAGO → APP`
Quedaron **DESCARTADOS**: el flujo pagar-primero (y con él todo el sistema de "ticket de guardarropa" que había especificado Integral en §18) y la variante de hacer el onboarding dentro de la landing. **El registro va ANTES del pago ⇒ el cobro NO se toca: Vendí sabe quién paga porque ya está logueado.**

- **Qué hace:** después del signup, 3 preguntas (nombre del negocio → rubro → qué vende) → pantalla `/plan` con precio, qué incluye y ejemplos → botón al checkout de MP que ya existía. Las 3 respuestas son **los mismos datos que la app ya usa** para personalizar, así el pagador entra con perfil cargado.
- **Precio en pantalla: S/39 en soles** (antes la landing mostraba $10 USD). Tapa de paso el bloqueante anti-baneo #1 de Metapod dentro de la app.
- **Rama `feat/onboarding-paywall`, commit `29795f4`** sobre `346b0c2`. Lo construyó el Capataz delegando en Davinci/Frontero/Integral/Hawkeye. **Los 14 archivos del cobro: sin tocar.** `tsc`/`eslint`/`build` limpios. El cambio de embudo es **1 línea**, fail-safe: si falla, el usuario termina en MP igual que antes → no se pierde ninguna venta.
- ⚠️ **Paolo mergeó SIN hacer la prueba visual.** Deploy Vercel READY. **Verificado por mí en vivo post-merge:** app sin sesión → 307 a login en `/ /dashboard /productos /fabrica /ajustes /mi-negocio`; las 3 APIs de generación → 307; `/login` y `/signup` → 200; `/comprar` y `/comenzar` sin cambios. **`/plan` → 307 a login.** Nada roto.
- ✅ **Cerró un agujero real:** `/onboarding` estaba en `isPublicRoute` y respondía **200 a cualquiera sin login**. Ahora → 307 a `/signup`. Verificado antes y después.
- ⏳ **PENDIENTE: la prueba visual.** Paolo tiene que registrarse con `paolonietoc+prueba1@gmail.com` (el `+` le llega a su mismo mail pero Vendí lo ve como persona nueva) y confirmar que ve **3 preguntas → precio → MP**. **Incógnito NO alcanza: Paolo está en `unlimited_users` y pasa el gate siempre.**
- ⏳ **Decisiones abiertas de Paolo:** qué pack muestra el paywall (se propuso Pase S/39 + Pack Negocio de segunda; **no se tocó ningún precio**) y si se guardan las respuestas del onboarding en la base (hoy quedan solo en el navegador = riesgo cero). El "¿por qué no comprás?" hoy **descarta la respuesta**.

### 🟢 AUDITORÍA DEL PAYWALL (JonSnow, 2026-08-21) — VEREDICTO: **NO se puede entrar sin pagar**
Orden textual de Paolo: *"ASEGÚRATE QUE NADIE ENTRE A LA APP SIN PAGAR."* JonSnow atacó el muro por todos los flancos con la anon key y en vivo. **Aguantó todo.**

**La clave estructural:** las dos únicas llaves de acceso —una fila `purchase` en `credit_ledger` o una fila en `unlimited_users`— son **imposibles de escribir desde el browser**. Probado y bloqueado: escribir compra falsa, auto-agregarse a `unlimited_users`, inflar `credits_remaining` en `profiles` (migr 0018 sigue firme), las **7 RPC de créditos → 401 `42501`**, webhooks MP y Shopify con firma trucha → **401**, lectura cruzada de datos → `[]`, Storage dueño-only, `ensureProfile()` nace **0/0** (verificado contra el perfil no-pagador real `user_3G8nw…`). **0 secretos en el historial de git.** Sin server actions (`grep "use server"` = 0).

**3 bombas de tiempo (NO abiertas hoy, arreglar antes de prender ads):**
1. 🟠 **G1 — el gate del layout depende del proxy.** `app/(app)/layout.tsx:32`: `if (userId && !(await userHasPaidAccess(userId)))` → **si `userId` es null cortocircuita y NO redirige**. Hoy lo tapa el proxy. Agregar una ruta de `(app)` a `isPublicRoute` lo abre **en silencio**. Fix: `if (!userId || !(await userHasPaidAccess(userId))) redirect(...)`. → Frontero + Bujía.
2. 🟠 **G2 — grants de tabla anchísimos: RLS es la ÚNICA pared.** `anon`/`authenticated` tienen INSERT/UPDATE/DELETE/TRUNCATE sobre casi todo; solo RLS lo tapa. Una policy permisiva futura (o un `DISABLE ROW LEVEL SECURITY` para debuggear) = agujero instantáneo y total. Fix: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` (dejando SELECT donde haga falta e INSERT solo en `leads`). → Bujía.
3. 🟠 **G3 — sin rate limit en `/comprar` ni `/api/checkout`.** Crean una Preference de MP por request, sin tope → DoS de costo/reputación contra la cuenta real de Paolo. Agravado por el Google OAuth de 1 clic. Fix: 5–10 Preferences / 10 min por `userId`. → Integral.

**Lo nuevo de Clerk NO abrió nada:** crear cuenta ≠ entrar. Google OAuth de 1 clic solo aumenta la gente que rebota en `/comprar` (y amplifica G3). `oauth_facebook` sin credenciales es un **botón muerto** (`client_id=` vacío → Error 400), no crea usuario ni bypassea.

🧹 **Higiene:** `.gitignore` **sin regla `.env`** y el repo `PaoNieto/Vendiapp` es **PÚBLICO** → un `git add .env.local` accidental filtraría la service key y el token de MP. Fix de 10 segundos. (Hoy nunca se commiteó, verificado en todo el historial.)

⚠️ **El truco del `.png`:** agregarle `.png` a una ruta de la app hace que el guardia no corra. **Verificado en vivo: devuelve 404, nadie entra.** Cierra por casualidad, no por diseño → arreglar en PR aparte.

### ✅ LANDING ARREGLADA Y PUBLICADA (deploy `dpl_DEu1PGEV…`, alias `www.vendilatam.com`)
**El bug de captura de correos, con causa raíz encontrada:** en la pantalla del resultado del quiz había un **botón grande** (`vqGo`, "Quiero recuperar ese tiempo") que llamaba `saveLead(false)` y **avanzaba sin pedir el correo**, con la cajita del mail escondida ABAJO. Encima `saveLead` insertaba una fila en CADA paso (`vqGo` + `openCheckout`) → filas duplicadas sin email. Por eso **44 filas `landing-quiz` con 1 solo email** (2026-06-17 a 07-17): nunca fueron 44 personas.
**Fixes aplicados** (`C:\Users\Usuario\.vendi-landing-deploy\index.html`, ⚠️ NO el `landing.html` del repo, que es landmine): (1) el input de correo va ARRIBA del botón; (2) el CTA principal ahora llama a `vqSubmit` y **exige email válido**; se eliminó el botón "Enviar" separado; (3) flag `leadInserted` → **1 fila por persona**; (4) mensaje de error más claro + focus al input + Enter envía.
**+ NANO BANANA (pedido de Paolo):** mención en los features de la tarjeta Lifetime Pass, en la tarjeta del checkout, y **FAQ nueva #10** "¿Qué IA usa Vendí para generar las fotos?" (Nano Banana de Google + la dirección de arte y la fidelidad del producto las pone Vendí).
**Verificado post-deploy en vivo:** los 5 bloques de JS parsean, 466/466 divs, 20/20 `li`, 10 FAQs consistentes, las 10 fotos de `/estilos/` dan 200, `id="vqSubmit"` = 0 ocurrencias.
⚠️ **Gotchas reusables:** el archivo usa **CRLF** — los reemplazos por script tienen que convertir `\n`→`\r\n` o fallan silenciosamente. Y el respaldo `.bak` **hay que sacarlo de la carpeta de deploy** o se publica a internet (se movió a `C:\Users\Usuario\.vendi-landing-backups\`).

### 💡 HUECO DETECTADO, NO RESUELTO: falta el onboarding DE PRODUCTO (post-pago)
Son **dos onboardings distintos** y solo se construyó uno:
- **De VENTA (pre-pago)** = el que se acaba de mergear. Convierte.
- **De PRODUCTO (post-pago)** = **NO EXISTE**. Hoy el que paga cae en un **dashboard vacío**, sin guía. Activa.

Dato que lo justifica: **el único pagador de la historia nunca generó una imagen** (activación de pagadores = 0%). Puede haber sido el bug de Clerk (arreglado el 2026-08-20) o puede ser esto. **Es el que decide la RECOMPRA**, que El Comerciante marcó como la métrica que define si Vendí es un negocio o una venta única. **Paolo no respondió si sumarlo — pregunta abierta.**

### Preferencias de Paolo (refuerzo de §18)
- **Se pierde MUCHO con explicaciones largas** — pidió "en fácil" ~6 veces en dos días, incluso con resúmenes que ya eran cortos. Cuando se pierde: **una sola acción por mensaje, 5 líneas, sin tablas ni opciones**. Si hay que explicar el porqué, va DESPUÉS de la acción y en una línea.
- **No confundir "registrarse" con "entrar a la app".** Se alarmó al enterarse de que `/signup` y `/login` son públicos ("no me estás dando ninguna seguridad"). La explicación que funcionó: *la puerta de la calle está abierta porque el que ya pagó tiene que poder entrar; lo que protege la mercadería es el mostrador de adentro*.

---

## §21 — 2026-08-21 (mismo día, más tarde): BUG EN PROD — el paywall `/plan` era INALCANZABLE

### El bug (lo cazó Paolo probando el flujo real, no un test)
Textual: *"ME MANDÓ DE FRENTE A MERCADO PAGO EL BOTÓN DE QUIERO MI LIFETIME PASS Y EL DE INICIAR SESIÓN. ACUERDATE QUE AHÍ VA LA VENTANA QUE QUERÍAMOS DISEÑAR."*

El PR #25 (§20) construyó y mergeó `/plan`, pero **quedó enganchado en UN SOLO punto**: el `forceRedirectUrl="/onboarding"` del signup. O sea **sólo lo veía quien completaba el registro en ese instante exacto**. Todos los demás caminos lo esquivaban, porque `app/comprar/route.ts` para el logueado-sin-acceso hacía `createPreference()` + `redirect(initPoint)` → **saltaba derecho a Mercado Pago**:
- Landing "Quiero mi Lifetime Pass" → `/comenzar` → `/comprar` → **MP** ❌
- Landing "Iniciar sesión" → `/login` → `/dashboard` → gate → `/comprar` → **MP** ❌
- Cualquier ruta de `(app)` con sesión sin pagar → gate → `/comprar` → **MP** ❌

🔑 **LECCIÓN REUSABLE (la más importante de esta sesión):** construir la pantalla **no es** conectarla. `/plan` estaba perfecto, publicado y compilando — y era **inalcanzable**. Cuando se mete una pantalla nueva en un embudo, hay que **enumerar TODOS los caminos de entrada** (landing, login, gate, deep-link, vuelta de pago) y verificar uno por uno, **no sólo el camino feliz que uno diseñó**. Hawkeye había validado el flujo del signup y dio verde: el flujo del signup **estaba** bien. Lo que faltó fue mapear los otros 3.

### El fix — rama `fix/comprar-al-paywall`, commit `8fc2a86`, **PR SIN MERGEAR**
Base `origin/main`=`2110711`. **2 archivos**, +41/−11.
- **`app/comprar/route.ts`**: el logueado sin acceso ahora va a **`/plan`**. El botón de `/plan` dispara `POST /api/checkout`.
- **`app/plan/page.tsx`**: su fallback pasó de `redirect("/comprar")` a `redirect("/comprar?direct=1")`.

**Decisión: `/comprar` manda a `/plan`, NO a `/onboarding`.** Las 3 preguntas se las hace el que recién se registra; repetírselas a alguien que vuelve a comprar es fricción en el camino al pago. De paso resuelve "que el que ya hizo el onboarding no lo rehaga": nunca lo rehace.

### 🔴 EL ROMPE-LOOP — `?direct=1` (patrón reusable)
`/plan` caía a `/comprar` cuando no resolvía el producto. Con el fix eso sería `/comprar → /plan → /comprar → …` **infinito**, y el usuario quedaría **SIN CAMINO A PAGAR**. Se rompe con una **escotilla explícita**: `/comprar?direct=1` conserva el comportamiento histórico (Preference + salto a MP) y es la **ÚNICA** forma de saltear el paywall. El fallback de `/plan` la usa.
🔑 **Principio de diseño a repetir: cuando metés una pantalla intermedia en el camino al pago, dejá SIEMPRE una escotilla que degrade al comportamiento viejo.** Cualquier fallo de la pantalla nueva tiene que caer en lo que ya funcionaba, nunca en un callejón sin salida.
⚠️ `?direct=1` es público y adivinable: un logueado que la escriba saltea la pantalla de precio. **No es agujero** (lleva a PAGAR, no a entrar; el gate no se tocó), pero queda dicho.

### 🎯 Análisis de loops (Hawkeye) — veredicto: riesgo CERO para el embudo
- Grafo completo enumerado (proxy + 6 handlers). `next.config.ts` **no** tiene `redirects()`/`rewrites()` y **no hay `vercel.json`** → no hay reglas de plataforma escondidas.
- ✅ `/plan` tiene **una sola** referencia a `/comprar` y lleva `?direct=1`. `/comprar?direct=1` nunca vuelve a `/plan`. El query sobrevive al proxy (`createRouteMatcher` matchea por pathname).
- 🔑 **El ciclo gate↔`/comprar` YA EXISTÍA en producción** (`app/(app)/layout.tsx:33` ↔ `app/comprar/route.ts:26-27` de `origin/main`): los dos consultan la misma señal, así que si `userHasPaidAccess` flapeara, hoy ya loopea. El fix **no lo crea**, le agrega un salto — y un ciclo de 3 nodos necesita más fallos consecutivos que uno de 2, o sea es **menos** probable.
- 🔑 **Lo que desactiva el riesgo de raíz: `userHasPaidAccess` es FAIL-CLOSED** (`lib/auth/paid-access.ts:82`). Un `null` se vuelve `false`, nunca `true` ⇒ **un no-pagador NUNCA puede recibir un `true` espurio** ⇒ para el embudo el riesgo de loop es **cero**. El único expuesto al flapeo es un pagador real con Supabase intermitente.
- 🔑 **En el caso degradado el fix MEJORA:** con Supabase caído, un usuario que SÍ pagó antes aterrizaba en un **checkout de MP vivo, a un clic de pagar dos veces**; ahora ve una pantalla de precio que puede leer y abandonar.
- 🔑 **Efecto lateral bueno:** `/comprar` ya **no crea una Preference de MP en cada hit** del camino normal → baja el ruido en la cuenta real de MP. **NO cierra** el hallazgo del rate-limit (se puede pegar a `?direct=1`); sigue siendo trabajo de Integral antes de prender ads.

### Verificado
`tsc` exit 0 · `next build` verde · `/comprar`, `/plan`, `/comenzar`, `/onboarding`, `/pago/resultado` compilan **dinámicas (ƒ)** · **0 líneas de diff** en `lib/mercadopago/*`, `app/api/webhooks/*`, `app/api/checkout/route.ts`, `lib/auth/*`, `proxy.ts`, `app/(app)/layout.tsx`, `app/comenzar/route.ts`, `app/pago/resultado/page.tsx`.
**El canario en prod hoy:** `POST /api/webhooks/mercadopago` sin firma → **401** (llega al handler, NO 307) y con body vacío → 200 `{"ignored":true}`. **Si algún día da 307, Vendí dejó de cobrar → revertir YA.**
🔑 **Chequeo post-merge gratis:** este fix **sólo cambia la rama del logueado-sin-pagar**; todas las pruebas anónimas con `curl` (`/comenzar`, `/comprar`, `/plan`, `/dashboard`, `/onboarding`) tienen que salir **IDÉNTICAS** después del merge.

### Follow-ups abiertos (ninguno bloquea)
1. **Ventana webhook:** entre "MP aprobó" y "el webhook acreditó", `app/pago/resultado/page.tsx:57` y `:63` mandan al recién-pagador a `/plan` ("pagá S/39" a alguien que acaba de pagar). **Pre-existente y hoy es PEOR** (los mandaba a MP, a un clic de pagar dos veces). En `status=approved` los botones deberían ir a `/dashboard`.
2. **Rate limit** en `/comprar?direct=1` y `/api/checkout` (Integral, antes de ads).
3. **Cachear `userHasPaidAccess`** (Bujía): mata de raíz cualquier flapeo y baja la latencia de la primera pantalla.
4. Los de §20 que siguen abiertos: bypass del proxy con `.png`, gate fail-open ante `userId` null, persistencia de las respuestas del onboarding, y el motivo de "Ahora no puedo" que hoy se tira.

### ⏳ Pendiente de Paolo
- **Abrir el PR:** `https://github.com/PaoNieto/Vendiapp/pull/new/fix/comprar-al-paywall` (cuerpo listo en `output\PR-fix-comprar-al-paywall.md`). **NO mergeado a propósito.**
- 🚨 **Probar con OTRA cuenta** (`paolonietoc+prueba2@gmail.com`): está en `unlimited_users` → pasa el gate SIEMPRE y **nunca ve el paywall**; incógnito NO alcanza.
- **La prueba clave del anti-loop:** entrar a `/comprar?direct=1` (tiene que abrir MP) y verificar que en ningún momento el navegador diga "demasiados redireccionamientos".

---

## §22 — 2026-08-22: rediseño del paywall `/plan` (card + lluvia de fotos + una sola oferta)

Rama `feat/plan-lluvia-catalogo`, commits `8d257b3` + `e859a10`, base `origin/main`=`4351b4b`. **PR SIN MERGEAR.**

### Los 5 cambios pedidos por Paolo
1. **FUERA** la galería "Así se ven los estilos" (los 10 `/public/estilos`).
2. **ENTRA la lluvia de fotos por rubro**, como la de la landing: 2 carruseles infinitos con las **33 fotos reales del catálogo**, etiquetadas. **Fila A** (17 rubros, sentido izq, discreta) **arriba** de la card = ambiente; **Fila B** (16, sentido der) **debajo**, con eyebrow. **Partidas a propósito:** juntas arriba empujaban el CTA fuera del fold en un iPhone SE.
3. **Rediseño de la card.**
4. **Beneficio nuevo:** "Motor Nano Banana, el modelo de imagen de Google" (factual, sin claims).
5. **FUERA el Pack Negocio** → `/plan` = **UNA sola oferta**. ⚠️ **Sigue vendiéndose en `/upgrade`** (`listProducts()`); el catálogo NO se tocó.

### 🔑 El diagnóstico que vale para siempre: "se ve muerto" casi nunca es el color
La card no estaba muerta por falta de dorado. Estaba **4 bullets largos → precio → botón**, con el **S/39 a ~900px del tope**: en un iPhone SE había que scrollear una pantalla entera para ver el precio. **Era un problema de ORDEN, no de paleta.** Orden nuevo: **PRECIO → cápsula "S/0.65 por foto" → resumen → CTA → reaseguro → hairline → 6 beneficios → letra chica.**
- **La tensión del dorado, resuelta sin romper la regla de marca** (*"verde = interacción, dorado = joya", dorado sólo en dark*): se gasta el presupuesto de dorado que dark **ya permitía y estaba sin usar**, sobre el único objeto que califica como joya — **el precio**. El botón queda champagne. Dos materiales ⇒ el oro no se diluye. En light el mismo gesto va con `--vd-butter`.

### 🔴 REGRESIÓN QUE NOS COMIMOS Y CORREGIMOS (patrón reusable, va a volver a pasar)
El precio y el CTA iban envueltos en Motion con `initial:{opacity:0}`. **Framer-motion SERIALIZA `initial` como style inline en el HTML del server** ⇒ el `S/39` y el botón **nacían invisibles** y la card se veía **vacía** hasta que hidrataba. En 3G son segundos de tarjeta en blanco en la pantalla que decide la venta + castigo al LCP. Y en `origin/main` el precio era HTML plano, o sea **era un retroceso contra lo que ya estaba en prod**.
🔑 **REGLA: nunca envuelvas el precio ni el CTA de una pantalla de cobro en un `initial` que los oculte.** Fix = `initial={false}` (monta en el estado final, visible sin JS). La entrada se puede conservar en elementos secundarios, y los efectos que deban sobrevivir sin JS van por **CSS keyframes** (acá el barrido dorado del precio es CSS puro).
🔑 **Y el matiz que hace que esto NO sea contradictorio:** `initial={false}` es seguro **sólo cuando el valor es fijo**. Si dependiera de una preferencia del usuario (ej. `useReducedMotion()`, que devuelve `null` en el server) sería **mismatch de hidratación**. Por eso, en la misma pantalla, el reduced-motion se resuelve por `transition:{duration:0}` y el conteo de nodos de la lluvia se decide **post-mount** con un flag `hydrated`.

### 🐛 Dos bugs cazados de paso
1. 🔑 **El carrusel de la landing SALTA ~9px por vuelta** (bug real, sigue vivo en `.vendi-landing-deploy/index.html`). Usa `gap` en el `.track` junto a `translateX(-50%)`: con `gap`, medio track **no es** un set exacto, sobra medio gap. **Fix: el espaciado va por `margin-inline-end` en cada card, NUNCA `gap` en el track** — así el track mide `2N × (ancho+gap)` y el `-50%` cae clavado. En la app está corregido; **en la landing sigue pendiente**.
2. **Badge corrido:** tenía `motion` + `-translate-x-1/2` en el MISMO nodo. **Motion escribe `transform` inline y pisa el translate de Tailwind.** Fix: partir en dos capas (wrapper con el centrado, `motion.span` adentro).

### 🖼️ Assets y performance
- 33 jpg copiadas de la landing a `public/catalogo/` y **re-encodeadas a 400×400 q72** con `sharp` (ya era dependencia): **2.263 KB → 466 KB, 5× menos**. Eran 800×800 para pintar cuadros de 88-148px.
- 🔑 **`<img>` plano y NO `next/image` en la lluvia.** Verificado en el código de Next 16.2.6 (`getWidths`, `shared/lib/get-img-props.js:51-66`): con `sizes` **sin unidad `vw`** cae en `return { widths: allSizes }` → **16 candidatos de srcset por imagen** × 66 nodos. Y son **33 archivos fijos que no cambian nunca** ⇒ conviene optimizarlos **en build**, no por request (además no mete al optimizador de Vercel en el camino crítico del cobro). `next/image` **sigue siendo lo correcto** para las fotos generadas por el usuario (tamaños desconocidos, dinámicas).
- Cada `<img>`: `width/height` fijos + `loading="lazy"` + `decoding="async"` ⇒ cero CLS. El 2º set de cada track va `aria-hidden` + `alt=""` (el lector lee los 33 rubros **una** vez).

### 🔎 Research de paywalls (Willy) — el paywall de Arcads LEÍDO de su bundle público
`app.arcads.ai` sirve sus 45 chunks JS **sin login**; se leyeron `PaywallPage.tsx`, `PaywallPlans.tsx`, `PlanCard.tsx`, `faq.tsx`. **Desmiente a ~16 reviews públicas** que decían que ese paywall "no tiene headline ni prueba". Crudo en `C:\Users\Usuario\arcads_chunks\`; dossier en `output\autopsia-paywalls.html`.
Orden real de su DOM: banner con countdown → `"Select plan"` + tarjetas → **12 videos 9:16 de 360px en marquesina (6 en mobile)** → `"Trusted by 1000+ companies"` + 14 logos → **FAQ propio del paywall** → contacto humano.
- 🔑 **La prueba OCUPA ESPACIO Y SE MUEVE.** Purchasely: los paywalls de apps de foto dedican **~80% de pantalla al producto funcionando**. Valida la lluvia que pidió Paolo: no es capricho, es el patrón.
- 🔑 **Ancla de precio verificada: CreatorKit cobra US$2.99 por imagen**; el Pase de Vendí sale **US$0.18** (= S/0.65). ⚠️ **NO anclar contra "lo que cuesta un fotógrafo"**: ninguno de los 5 competidores globales lo dice en primera persona, y §15 ya lo marcaba como no-diferencial.
- ⚠️ **El lifetime más barato del rubro es US$49 → S/39 está 5-6× DEBAJO del piso del mercado.** El precio bajo **resta credibilidad**; se compensa mostrando el mecanismo, **no bajando más**.
- 🔑 **RevenueCat 2026: muro duro convierte 10,7% vs 2,1% del blando a D35, con 8× de ingreso por instalación**, y **las apps de precio ALTO convierten el doble**. ⇒ *si S/39 no convierte, el problema no es el precio: es que la pantalla no lo justifica.*
- 🔑 **"Un solo pago" es lo ÚNICO que ninguno de los 10 competidores puede decir** (todos son suscripción). Subió del puesto 6 al 2, con la fórmula de Depositphotos: *"no se renueva ni se te vuelve a cobrar, y los créditos no vencen"* — acota el costo y mata la ansiedad en una línea.
- ✅ **Tranquilizador anti-baneo: ninguno de los 10 competidores usa countdown falso, cupos falsos ni precio tachado inventado.** La prohibición interna de Vendí **es la norma del rubro**, no una desventaja.

### Verificado
`tsc` exit 0 · `eslint` exit 0 · `next build` verde · **`/plan` sigue dinámica (ƒ)** · **0 líneas de diff** en los 10 congelados del cobro + `lib/styles.ts` · al checkout viaja **sólo `{productId}`** · el `productId` ahora **sale del catálogo** (antes estaba hardcodeado en el cliente: mejoró) · `S/0.65` es `39/60` calculado, no escrito a mano · guardas server-side y el `?direct=1` anti-loop **intactos**.
🔑 **Chequeo de cascada de Tailwind v4 por byte-offset en el CSS compilado** (porque `data-selected:` ya nos mordió pasando los 3 gates): las 17 clases `vd-*` viven en `@layer utilities` **después** de las utilities de Tailwind ⇒ ganan. `.vd-plan-cta`@110616 le gana a `.min-h-[44px]`@13918.
🔑 **FALSA ALARMA a documentar (cuesta 20 min volver a caer):** en el CSS compilado los `color-mix()` parecen destruidos. No lo están: **Lightning CSS emite un rule de fallback plano + un `@supports (color:color-mix(in lab, red, red))` con la versión real justo detrás.** Hay 133 bloques así. **Si mirás el compilado, mirá siempre el `@supports` que viene atrás.**

### Follow-ups abiertos (ninguno bloquea)
1. **Prueba social — el bloque más grande que falta.** Vendí no tiene testimonios y **NO se inventan**. Lo verdadero y disponible es **Paolo**: cara, nombre, "soy de Lima y a soporte te contesto yo". Con n=1 el fundador visible reemplaza al testimonio inexistente. **Requiere OK de Paolo para usar su foto.**
2. **FAQ en el paywall** (Arcads tiene uno propio ahí). La objeción del pago único hoy muere sin respuesta.
3. **Contraste en LIGHT** del badge y la cápsula: `--vd-pill-fg` sobre `--vd-butter` = **2.09:1** en texto de 10.5-11px (AA pide 4.5). **En dark está impecable** (11.5:1 y 9.1:1) y la app arranca en dark ⇒ el recién registrado no lo ve. Es de Davinci.
4. `aria-label="Rubros que ya usan Vendí"` afirma que esos 33 rubros ya son clientes; con 1 venta no se sostiene. `"Rubros para los que sirve Vendí"` dice lo mismo y es cierto.
5. `loading="lazy"` en las 66 fotos casi no ahorra (455 KB total) y puede dar *pop-in*: evaluar `eager` en las primeras ~4 de cada fila.
6. Los de §20/§21 que siguen abiertos: bypass del proxy con `.png`, gate fail-open ante `userId` null, rate-limit en `/comprar?direct=1`, cachear `userHasPaidAccess`, persistencia de las respuestas del onboarding, y el motivo de "Ahora no puedo" que se tira.

### ⏳ Pendiente de Paolo
- **Abrir el PR:** `https://github.com/PaoNieto/Vendiapp/pull/new/feat/plan-lluvia-catalogo` (cuerpo en `output\PR-plan-lluvia.md`).
- 🚨 **Probar con OTRA cuenta** (`paolonietoc+prueba3@gmail.com`): está en `unlimited_users` → nunca ve el paywall; incógnito NO alcanza.
- **Mirarlo en el celular:** que el `S/39` se vea **sin scrollear**, que la lluvia se mueva **sin saltar**, y que **no** aparezca el Pack Negocio. ⚠️ **Riesgo declarado:** el presupuesto vertical se calculó, no se midió en navegador (no hay Playwright). Estimado precio ~415px / CTA ~600px en 375×667. **Si se ve apretado, el ajuste es `mt-7`→`mt-5` en el wrapper de la card y `mt-5`→`mt-4` en la fila A** (recupera 16px sin tocar nada más).

### 🧰 Tooling — MCP de Apify CONECTADO (2026-08-22)
- **Estado: ✅ `✔ Connected`.** Scope **`user`** en `C:\Users\Usuario\.claude.json` (top-level `mcpServers`) ⇒ disponible en **todas las carpetas**, no solo en `vendi`. NO está en `.mcp.json` (no se comparte por repo).
- **Apify NO autentica por OAuth desde `/mcp`: exige API token.** Sin header devuelve **401** con un `WWW-Authenticate` que dice literal *"Pass an Apify API token in the Authorization: Bearer <token> header"*. La solución es `-H "Authorization: Bearer <token>"` al agregarlo. Token sacado de https://console.apify.com/account/integrations, guardado en texto plano en `.claude.json` (NO se escribe acá).
- ⚠️ **Dos gotchas que costaron la sesión entera — valen para CUALQUIER MCP:**
  1. **Los MCP se cargan al ARRANCAR Claude Code.** Si se agrega uno con la sesión ya abierta, `/mcp` no lo muestra hasta cerrar y reabrir. Es la causa nº1 de "no me sale el MCP".
  2. **Scope `local` = solo esa carpeta.** Un MCP agregado sin `-s` cae en `local` y desaparece si abrís Claude desde otro directorio o worktree. **Para tooling general usar siempre `-s user`.**
- El mensaje de confirmación de `claude mcp add` imprime la URL **sin** el query string; el `?tools=...` igual queda guardado. No re-agregarlo pensando que se perdió.
- **23 tools verificadas por handshake MCP a mano** (`initialize` → `tools/list`): 21 de Apify (`search-actors`, `call-actor`, `get-dataset-items`, `search-apify-docs`, tasks, key-value stores…) + las 2 que importan: **`harvestapi--linkedin-profile-search`** y **`harvestapi--linkedin-profile-scraper`**. Herramienta natural de **Willy** (research de mercado / competidores).

---

## §23 — 2026-08-22 (bis): el precio grande vuelve a **US$10** + escala tipográfica de celular

Rama `feat/plan-precio-usd-mobile`, commit `90d4828`, base `origin/main`=`32779f7`. **PR SIN MERGEAR.** 3 archivos.

### 🔄 REVIERTE la presentación de §22
§22 dejó **`S/39` como número grande** y `≈US$10` chico. **Paolo lo dio vuelta el 2026-08-22: `US$10` es el número grande**, para que la app quede coherente con la landing (que él ya revirtió a $10).
⚠️ **El monto COBRADO no cambia:** `lifetime-pass` sigue cobrando **S/39**. Es **sólo presentación** — `priceUsdDisplay: 10` ya existía en el catálogo, que no se toca.

### 🔑 CÓMO SE RESOLVIÓ EL RIESGO REAL (patrón reusable para cualquier precio en 2 monedas)
El riesgo registrado en §18 es concreto: **la pantalla dice $10 y MP cobra S/39 ⇒ sorpresa en la caja ⇒ reclamos**. §18 lo resolvía poniendo S/39 grande; ahora que el grande es US$10, se resuelve al revés: **`S/ 39` aparece TRES veces y ninguna en letra chica.**
| dónde | tamaño |
|---|---|
| recuadro bajo el precio ("Se cobra S/ 39 en Mercado Pago") | **16px bold** |
| **DENTRO del botón** ("Pagar S/ 39 y entrar") | **15px bold** |
| letra chica del pie | 12px |
🔑 **La idea que vale: el monto real va en el ÚLTIMO objeto que el dedo toca antes de irse a pagar.** Una línea de letra chica no cumple el requisito; el texto del CTA sí.

### 🔑 La cápsula pasa de `S/0.65 por foto` a `PAGO ÚNICO` — y el motivo es de mercado
Con el número grande en dólares aparece un riesgo que con `S/39` no existía: **los 10 competidores del rubro son 100% suscripción (§22), así que un `US$10` grande y solo se LEE como `US$10/mes`** — el ojo entrenado completa el "/mes". La cápsula pegada al precio es el único lugar donde ese malentendido se mata antes de nacer. El `S/0.65 por foto` **baja al pie**, no se pierde (sigue siendo el ancla contra CreatorKit US$2.99/imagen).
⚠️ **NO se usó `US$0.17 por foto`:** `10/60 = 0.1666…` y `0.17 × 60 = US$10.20` **no cierra** con el precio mostrado. Sería el único número de la pantalla que no es aritmética exacta sobre el monto cobrado — y §22 registró como logro que `S/0.65` es `39/60` **calculado**, no escrito a mano.
⚠️ **Nota de precisión:** `US$10` no es la conversión exacta (el catálogo ancla a TC 3.9; el real ronda 3.75 ⇒ S/39 ≈ US$10.40). Por eso dice **"US$10 aprox." en palabras** y no con el símbolo `≈` — el ICP es dueño de PyME, no lee notación matemática (y el `≈` además empujaba la cápsula a wrappear a 360px).

### 📐 Escala tipográfica de celular (360/375/390/414)
Cuerpo mínimo 13px, todo lo demás ≥14px. H1 a 23px con breakpoint en 390px.
🔑 **El precio bajó de `17vw` a `15.5vw` por una razón no obvia: `US$10` son 5 glifos contra 4 de `S/39`.** A 360px con el clamp viejo la cápsula wrappeaba (272px sobre 280 disponibles). **Cambiar la moneda del precio cambia el ancho, no sólo el texto.**
**Presupuesto vertical a 375×667:** precio arranca a **335px** (antes 389), CTA termina a **545px** (antes 553), contra un fold útil de ~553px. **El recuadro de cobro de 72px ENTRA sin empeorar el fold** porque (a) el párrafo "60 fotos + 10 análisis" se absorbió en la nota del recuadro y (b) el subhead pasó a 1 línea (`"La foto que ya tenés, ahora profesional."`). ⚠️ **Esa condición es DURA: sin el subhead en 1 línea el CTA cae a 566px y empeora.** Palanca alternativa: sacar el eyebrow "ÚLTIMO PASO" (−22px).

### 🐛 Hallazgo nuevo: los tags de la lluvia se cortaban SECOS
`.vd-rain-tag` era `position:absolute` **sin `max-width`** dentro de una card con `overflow:hidden` ⇒ `"CAMAS PARA MASCOTAS"` (~126px a 9px) sobre una card de 90px se veía **`"CAMAS PARA MASC"`**, corte seco sin ellipsis. Pasaba con 5 rubros.
🔑 **Y el dato que cierra la discusión: para que entrara legible en UNA línea la card debía medir ~140px (+50px = 9% del fold) y el CTA se iba afuera. No había tamaño razonable.** Solución: **la fila A (ambiente) pierde el tag en `<640px` y se achica; la fila B (la prueba real, con eyebrow) crece y ahí sí el tag se lee** a 11px con menos tracking y hasta 2 líneas (`line-clamp`). El `alt` de cada `<img>` sigue ⇒ cero pérdida para el lector de pantalla. **Costo en el fold: 0px.**
🔑 **Reusable: en uppercase, el `letter-spacing` alto es la MITAD del problema de ancho.** Bajarlo de .09em a .055em recuperó ~13% sin perder legibilidad.

### ✅ Dos fixes de contraste cerrados (venían de §20 y §22)
1. **Badge y cápsula en LIGHT: 2.09:1 → 7.62:1.** 🔑 **Causa raíz: no era "poco contraste", era un TOKEN INVERTIDO.** `--vd-pill-fg` es **claro** en light (#f0f4e7) y **oscuro** en dark (#0b1712); sobre butter/gold —que son claros en los DOS temas— el gesto correcto siempre fue *texto oscuro sobre dorado*, y en light el token lo daba vuelta. Fix: `--vd-ink`.
2. **Texto sobre el fondo en DARK: 4.39:1 → 4.97:1** vía `.vd-onbg` (`color-mix` hacia `--vd-ink`, una sola fórmula sirve en los dos temas porque `--vd-ink` es el extremo de contraste de cada uno).
   🔴 **CORRECCIÓN IMPORTANTE A LA MEMORIA: el fix que §22 anotaba como follow-up (usar `text-mute`) estaba AL REVÉS y EMPEORABA.** `--vd-mute` (#9aa587) es **más oscuro** que `--vd-mute-on-bg` y sobre el shell da **4.10:1**. El 6.49:1 medido era contra el fondo de la **CARD**, no contra el shell. **Lección: un ratio de contraste sin decir contra QUÉ fondo se midió no sirve.**
   ⏳ El fix de raíz (subir `--vd-mute-on-bg` en dark a #adb596) arregla **toda la app** de una pero cambia el render de cada pantalla que lo use ⇒ **ticket aparte**.
+ `aria-label` de las 2 filas: *"Rubros que ya usan Vendí"* → *"para los que sirve Vendí"*. Con **1 venta** el claim anterior no se sostiene. (Cierra el follow-up 4 de §22.)

### Verificado
`tsc` exit 0 · `eslint` exit 0 · `next build` verde · **`/plan` sigue dinámica (ƒ)** · **`globals.css` = 270 insertions / 0 deletions** (aditividad probada por diff, no por promesa) · cascada Tailwind v4 verificada por **byte-offset** (las redeclaraciones `vd-*` caen después de las originales; el bloque 9 arranca en 117.108) · **0 líneas de diff en los 11 congelados** · al checkout viaja **sólo `{productId}`**.
🔑 **El HTML del server se RENDERIZÓ y se verificó** (no se dedujo): precio, recuadro de cobro y CTA **nacen visibles**; los únicos 7 nodos con `opacity:0` son el badge y los 6 beneficios — exactamente los secundarios que §22 permite animar.
🔑 **Gotcha reusable de Next:** **toda carpeta que empieza con `_` queda excluida del ruteo** (private folder) → una ruta de verificación `__ssrcheck` da 404. Y `next dev` con Clerk en **keyless mode** agrega `/.clerk/` al `.gitignore` y crea la carpeta solo: hay que revertirlo antes de commitear.

### ⏳ Pendiente de Paolo
- **Abrir el PR:** `https://github.com/PaoNieto/Vendiapp/pull/new/feat/plan-precio-usd-mobile` (cuerpo en `output\PR-precio-usd-mobile.md`).
- 🚨 **Probar con OTRA cuenta** (`paolonietoc+prueba4@gmail.com`): está en `unlimited_users` → nunca ve el paywall.
- **En el celular:** `US$10` grande, el botón diciendo **"Pagar S/ 39 y entrar"**, que el botón entre **sin scrollear**, que los nombres de rubro **se lean**, y que MP cobre **S/ 39,00**.
- ⚠️ **El presupuesto vertical sigue CALCULADO, no medido** (no hay Playwright). Si se ve apretado: `pt-7→pt-6` en la card y `mt-6→mt-5` en el wrapper (−8px).

### Nota de coherencia
**`/onboarding` NO muestra ningún precio** (verificado): las 3 preguntas no tienen números. Paolo pidió "mantenelo en la pestaña de onboarding" — no hay nada que cambiar ahí, y **no se inventó una pantalla de precio que no existe**.

### 💵 DECISIÓN DE PRECIO DE PAOLO (2026-08-22, tarde) — REVIERTE lo de §20
**Paolo revirtió los cambios de precio de Metapod. El número que manda en TODAS las superficies es US$10.** Orden textual: *"el precio va a estar en 10 dólares, eso también mantenlo en la pestaña de onboarding"*, *"EN TODO CHAT, 10 DÓLARES"*, *"EL 39 SOLES CASI QUE NI SE NOTE"*.

- **Landing revertida** al estado pre-Metapod (`cp` desde `C:\Users\Usuario\.vendi-landing-backups\index.html.bak-20260822-metapod-pre`): vuelven **$10 (4 menciones)**, el **~~$27~~ tachado (2)**, **"más fotos, más ventas" + el gráfico (3)** y los mockups con `app.vendi.app` (3). **Se conservaron** la captura de correos arreglada y las 3 menciones a Nano Banana. **DEPLOYADA** (`dpl_5PFLMWdX…`, alias `www.vendilatam.com`) y verificada en vivo.
- **Paywall `/plan`** (PR #28, merge `134f521`, commits `90d4828` + `0c89c6a`): el bloque de cobro pasó de *"Se cobra **S/ 39** en Mercado Pago"* (16px bold) a *"Pago único de **US$10**"*; el CTA dejó de cantar el monto (**"Pagar y entrar"**, antes "Pagar S/ 39 y entrar"); el `S/ 39` quedó en un span propio **`.vd-plan-charge-soles`** (`0.82em`, `opacity .62`) dentro de la nota, y el pie bajó de 12px a 11px.
- ⚠️ **El monto COBRADO no cambió: `lifetime-pass` sigue siendo S/39 PEN en el catálogo.** Mercado Pago Perú cobra en soles y no puede cobrar en dólares.
- 🔑 **Por qué el `S/ 39` se mantuvo en el DOM (decisión mía, avisada a Paolo y aceptada):** sacarlo del todo dejaría al comprador **sin ningún aviso previo del monto real** — se enteraría recién en la pantalla de Mercado Pago. Se le explicó dos veces que el riesgo es el reclamo del usuario (que pega en Account Quality de Meta) y **reafirmó la decisión**. Es su producto y su llamada. **No re-litigar.**
- **También se ajustaron los tamaños de texto para celular en las DOS superficies:** en la landing se agregó un bloque `<style id="vendi-mobile-type">` al final del body (44 textos que estaban entre 10px y 12.5px suben a 12-13px, solo bajo `max-width:560px`, con `!important` y misma especificidad ganando por orden); en el paywall lo hizo Davinci en `globals.css` (+270 líneas, aditivo puro).
- **Hallazgo lateral de Davinci:** los nombres de rubro de la lluvia **se cortaban en seco** ("CAMAS PARA MASCOTAS" → "CAMAS PARA MASC") en 5 rubros. Arreglado.

⚠️ **Estado del riesgo anti-baneo:** los 3 bloqueantes que Metapod había cerrado (precio incoherente, "más fotos más ventas", dominio inventado) **están de nuevo ABIERTOS en la landing viva, por decisión de Paolo**. El trabajo de Metapod no se perdió: está en `C:\Users\Usuario\.vendi-landing-backups\scripts\fix-landing-20260822.js` y se puede reaplicar. **Si algún día se prenden ads, esto vuelve a la mesa.**

---

## §24 — 2026-09-01: PAQUETE DE CONTEXTO `oficina/para_chat/` + re-verificación de cuál landing está viva

Paolo pidió juntar 6 archivos para subir a un chat externo (memoria, minions, landing, precios, estilos, esquema). Quedó armado en **`oficina/para_chat/`** (repo de la app, NO trackeado aún en git).

### Contenido del paquete
`00_LEEME.md` (índice, orden de carga y pesos en tokens) · `01_MEMORIA_DE_DIOS.md` y `02_MINIONS.md` (copias byte-idénticas de `cerebro_vendi/`) · `03_landing_copy.md` (**el copy de venta de la landing VIVA, extraído del HTML**: 208 KB → 13 KB, conserva orden de lectura, secciones, titulares y CTAs) · `03b_landing_VIVA_ORIGINAL.html` · `03c_repo_vs_viva.md` (diff de copy) · `04_catalog.ts` y `05_styles.ts` (copias exactas) · `06_esquema.sql`. Set principal ≈ 74k tokens.

### 🔴 RE-VERIFICADO EN VIVO: la landing del repo SIGUE stale (§8/§19 confirmadas, ahora con prueba dura)
- `curl https://www.vendilatam.com` → **208.307 bytes, byte-idéntico** a `C:\Users\Usuario\.vendi-landing-deploy\index.html`. **Ésa es la landing viva. Punto.**
- `landing.html` del repo = **177.162 bytes**, distinto. Sigue siendo landmine. **Yo mismo caí en la trampa**: busqué `.vendi-landing-deploy` dentro del repo y en `vendiapp/`, no la encontré, y extraje el copy del `landing.html` del repo. Lo detecté recién al leer §8. **Está en el HOME: `C:\Users\Usuario\.vendi-landing-deploy\`** — anotarlo así, con ruta absoluta, evita el error.
- **El repo tiene un bloqueante de Meta que la viva NO tiene:** el copy del repo todavía dice *"Arrancás con 60 fotos gratis · Sin tarjeta"* y *"60 fotos de regalo"* / *"10 análisis de regalo"*. La viva ya lo reescribió a *"Tu Lifetime Pass incluye 60 créditos… Pago único"* + nota *"el cobro se procesa en soles (S/ 39) vía Mercado Pago"*. El commit `27ae8ee` ("copy y metadatos de la copia del repo") tocó la copia stale, no la viva.
- **Precio, estado real de la viva:** `<span class="amt">$10</span>` + `"Precio de lanzamiento · luego $27"`. **4 menciones de $10, 2 de $27** → coincide con lo que Paolo fijó en §23. El repo en cambio tiene el `$27` tachado (`amt-old`) + "Ahorrás $17".
- **Bloques que sólo tiene la viva:** sección "Comprá con confianza" (4 razones + contador "30 lugares de fundador"), FAQ y beneficio sobre **Nano Banana** (el modelo de imagen de Google), galería por **RUBRO** (~35 rubros: fragancias, bolsos, café y té, mascotas…) en vez de por estilo, barra sticky de compra, y los 3 pasos reescritos en voseo mostrando la app real ("La app por dentro, en 3 pasos").

### Esquema de la DB: generado desde migraciones, no dumpeado
Supabase dio **timeout en 3 intentos** (proyecto `njmxxdaxzzzlloweudgv`, probados los DOS servidores MCP: `mcp__supabase__` y `mcp__claude_ai_Supabase__`) — mismo patrón que §17. Así que `06_esquema.sql` está **consolidado a mano desde `supabase/migrations/0001..0023`**: estado final tras todas las migraciones. Cubre **14 tablas**, índices, firmas de las **9 funciones/RPC**, mapa de RLS y los **5 buckets** de Storage. Sirve como referencia rápida del esquema sin tener que despertar el proyecto.

### Dato reusable
Extraer el copy de la landing sale barato: script de ~30 líneas que saca `<script>/<style>/<svg>`, marca `<section>`/`h1-h6`/CTAs y colapsa el resto → **16× menos tokens que el HTML crudo** con la misma información de venta. Para copy, ángulos o política de Meta, nunca hace falta subir el HTML.

---

## §25 — 2026-09-04: MIGRACIÓN DEL COBRO A WHOP (Mercado Pago sale) — EN CURSO

**Decisión de Paolo (2026-09-04):** sacar Mercado Pago de la app Vendí y de la landing; **todo el cobro pasa a Whop**. El MCP server `mercadopago` de `.mcp.json` **SE QUEDA** (orden explícita: "no borres el mcp, solo sacalo de Vendí app y la landing").

### Por qué Whop (verificado en vivo, no marketing)
- El checkout de Whop soporta **`mercado_pago`, `yape` y `pago_efectivo`** como métodos de pago nativos (están en el enum real de la API). O sea: no se pierde al comprador peruano — **Yape, que estaba DESCARTADO por ser difícil de integrar directo, viene de fábrica.**
- **`adaptive_pricing_enabled`**: Whop detecta el país por IP, muestra el precio en moneda local y procesa el pago domésticamente. El peruano ve soles.
- Suma tarjeta internacional de cualquier país, que con MP Perú no se podía.
- **Payouts a Perú FUNCIONAN** (verificado con `payouts_supported-methods`, país PE): 20+ bancos peruanos (BCP no aparece; sí Alfin, Pichincha, Santander, Citibank, ICBC, las Cajas Arequipa/Cusco/Huancayo/Ica/Piura/Sullana/Trujillo/Tacna/Metropolitana, Compartamos, Financiera Efectiva/Oh). Depósito bancario estándar, llegada 1-2 días.
- ⚠️ **Comisión de retiro FIJA de US$2.20**, no proporcional. Retirar US$100 = 2.2%; retirar US$10 = **22%**. **REGLA OPERATIVA: acumular y retirar de a ~US$200+.**
- TC que aplica Whop: **3.0749 PEN/USD** (ojo: la memoria vieja usaba ÷3.7 — verificar el spread antes de calcular márgenes finos).

### Estructura de comisiones de Whop (de su página de fees)
Tarjetas y wallets **2.7% + US$0.30** · Orchestration 0.8% · Billing (recurrente) 0.5% · Impuestos gestionados 2% · 3DS US$0.03 · Antifraude US$0.07 · **Contracargo US$15** · Retiro ACH día siguiente US$2.50 · Bank wire US$23 · Cripto 5% + US$1.
Piso realista sobre un pack: **~3.5% + US$0.30**.

### La tienda de Whop de Vendí — IDs REALES
Cuenta: **`biz_k4v3iljkFYxhCO`** ("Vendi App", país PE, creada 2026-06-16). Segunda cuenta del mismo usuario: `biz_Hbk6oEJb4hEOQI` ("HabitarIA", vacía).
Usuario Whop de Paolo: **`user_JoKkguwuiEuL9`** (@paolonieto).

| Producto catálogo | product_id | plan_id | Precio USD | Créditos |
|---|---|---|---|---|
| `lifetime-pass` | `prod_LQ9BVMZXTD6t2` | **`plan_Cgn3jEiaucHkf`** | **$10** | 60 + 10 análisis |
| `pack-inicial` | `prod_gNuk5bWqX1Wn3` | **`plan_uX5zoWJBeIDEP`** | **$9** | 30 |
| `pack-pro` | `prod_HuFo9GgVBmUdO` | **`plan_Au5BdLxtu3nJK`** | **$19** | 80 |
| `pack-negocio` | `prod_ac0JmR7Kw0b5F` | **`plan_0NIsyszmcO8dd`** | **$39** | 200 |

Los 4 planes: `one_time`, USD, `adaptive_pricing_enabled: true`, stock ilimitado, y **31 métodos de pago** (card, apple_pay, google_pay, mercado_pago, yape, pago_efectivo, pix, spei, oxxo, nequi, pse, bancolombia, efecty, rapipago, etc.). Cada plan lleva `metadata.catalog_id` = el id del catálogo de Vendí.
**Los precios en soles (S/39 / S/24.90 / S/54.90 / S/119.90) quedan OBSOLETOS.** El nuevo ancla es USD.

### ⚠️ PENDIENTE DE PAOLO (bloquea el go-live)
El MCP de Whop **NO expone herramientas de webhooks** (`webhooks_*` no existe) y `companies_api_keys` sirve solo para cuentas conectadas hijas. `access-tokens_create` da tokens de máx 3 horas. **Por eso estas dos cosas SOLO se pueden hacer desde el dashboard de Whop:**
1. Crear la **API key de cuenta** → `WHOP_API_KEY` (Dashboard > Developer).
2. Crear el **webhook** a `https://vendilatam.com/api/webhooks/whop` con el evento `payment.succeeded` → copiar el **`webhook_secret` (`ws_...`), que se muestra UNA SOLA VEZ** → `WHOP_WEBHOOK_SECRET`.
3. Setear ambas + `WHOP_ACCOUNT_ID=biz_k4v3iljkFYxhCO` en Vercel (proyecto vendiapp) + redeploy.

### ⚠️ DECISIÓN COMERCIAL ABIERTA: afiliados al 30%
Whop crea los productos con **`global_affiliate_percentage: 30` y `global_affiliate_status: "enabled"` por DEFAULT**. El Pase Fundador que creó Paolo el 2026-09-04 quedó así. Sobre US$10 son **US$3 por venta** a un afiliado, encima del ~3.5% de Whop.
Los packs Pro y Negocio se crearon con afiliados en **0/disabled**; el Pack Inicial y el Pase quedaron en **30%/enabled** (el `products_update` del MCP **no expone** los campos de afiliados — para cambiarlo hay que ir al dashboard o recrear el producto).
**Sin resolver:** El Comerciante dictaminó (2026-08-19) que el problema de Vendí es que **NO HAY CANAL**. Un programa de afiliados al 30% ES un canal. Puede convenir dejarlo. Decisión de Paolo, pendiente.

### Arquitectura elegida (el hallazgo que hizo fácil la migración)
Una **checkout configuration** de Whop devuelve `purchase_url` con forma `https://whop.com/checkout/plan_XXX/?session=ch_YYY`, acepta `metadata` libre, y **ese metadata viaja intacto al webhook `payment.succeeded` como `data.metadata`**. Es un reemplazo **1:1 del `init_point` de Mercado Pago**.
→ Si `/api/checkout` sigue devolviendo `{ initPoint }`, **los 3 call sites del cliente NO cambian** (`upgrade-store.tsx`, `plan-client.tsx`, `fundador-client.tsx`).
Se crea con **`plan_id` de nivel superior** (plan existente), NO con el objeto `plan` inline — inline crearía un plan nuevo por cada compra.

**Webhooks de Whop = spec Standard Webhooks.** Headers `webhook-id` / `webhook-timestamp` / `webhook-signature` (`v1,<base64>`). Se firma `{webhook-id}.{webhook-timestamp}.{raw body}` con HMAC-SHA256 y el secret `ws_...`. Rechazar si el timestamp difiere >5 min (anti-replay). Responder 2xx en **<5 segundos** o reintenta (12 veces, ~71hs). Mismo `webhook-id` en cada reintento → sirve de llave de idempotencia.
⚠️ **`unwrapWebhook` de `@whop/sdk/helpers` TODAVÍA NO ESTÁ RELEASEADO** (la doc de Whop lo dice explícito). Hay que verificar la firma a mano con `node:crypto`.

### Lo que NO cambia (confirmado por auditoría de 3 agentes)
La plomería de créditos ya era agnóstica al riel y está probada con dos rieles simultáneos (MP + Shopify escriben en el mismo `credit_ledger` vía el mismo `grant_credits`). **Cero call sites del gate hay que tocar**: los 8 puntos de control (`app/(app)/layout.tsx:32`, las 3 API de IA, `/comprar`, `/plan`, `/onboarding`, `/fundador`) abren solos cuando la RPC nueva escriba `credit_ledger` con `reason='purchase'`.
El riel MP resultó ser una **cáscara delgada**: 4 archivos de código, 1 dependencia npm, 3 env vars, 1 tabla, 1 RPC.

### Trampas registradas (no repetir)
- `lib/shopify/order-to-credits.ts:2` importa el catálogo desde `@/lib/mercadopago/catalog` → **mover el catálogo sin actualizar ese import rompe Shopify.**
- `app/comprar/route.ts:55` (`?direct=1`) es el **rompe-loop** del que depende `app/plan/page.tsx:74`. Matar `createPreference` sin reemplazar los dos lados juntos deja al usuario **sin ningún camino a pagar**.
- El CHECK de `profiles.plan` que permite `'founder'` vive en la migración **`0014` (Shopify)**, no en las de MP. No revertirlo al limpiar.
- **20 worktrees viejos** en `.claude/worktrees/` tienen copias del código MP → todo grep de limpieza debe excluir `.claude` y `node_modules` o devuelve decenas de falsos positivos.
- `orderToCredits` de Shopify **descarta `analysisCredits`** → un Lifetime comprado por Shopify hoy NO recibe sus 10 análisis. La RPC de Whop debe copiar la firma de 6 args de `process_mp_payment`, NO la de Shopify.

### Plan aprobado
`C:\Users\Usuario\.claude\plans\bueno-saquemos-mp-de-breezy-tiger.md` — 7 fases. Fase 0 (crear todo en Whop) **HECHA**. Fases 1-3 (catálogo + `lib/whop/` + webhook + migración `0024` + conmutar) en curso por Bujía. Faltan: 4 (copy/UI), 5 (landing), 6 (borrar MP), 7 (memorias/agentes).

### 🔑 MODELO DE PRODUCTO EN WHOP (aclarado por Paolo, 2026-09-04) — NO CONFUNDIR
- **1 Pase Fundador — US$10 — PAGO ÚNICO.** Es "comprar la app". Da 60 créditos + 10 análisis + plan `founder`.
- **3 PACKS DE CRÉDITOS — US$9 / US$19 / US$39 — RECARGAS.** Se compran **las veces que el usuario quiera**. No son suscripciones ni pagos únicos "de una sola vez en la vida": son recargas repetibles.
- **NINGUNO es suscripción.** Los 4 planes en Whop son `plan_type: "one_time"` con `billing_period: null` y `renewal_price: 0` (verificado en la respuesta de la API al crearlos). Nada se renueva solo, a nadie se le vuelve a cobrar.
- `unlimited_stock: true` en los 4 — es lo que habilita la recompra.
- ⚠️ **SIN VERIFICAR TODAVÍA:** que Whop permita **recomprar el mismo pack** con la misma cuenta (podría bloquear por membresía existente). **Prueba obligatoria en sandbox antes de prod:** comprar Pack Inicial DOS veces con la misma cuenta → deben acreditarse 60 créditos, no 30. Si Whop lo bloquea, hay que replantear la forma de vender recargas.
