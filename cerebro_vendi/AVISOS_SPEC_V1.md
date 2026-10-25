# Sistema de Avisos de Vendí: especificación v1 + revisión

**Estado (15/10/2026):** esperando el OK de Paolo sobre el mockup. Todavía no se escribió código.
**Mockup:** https://claude.ai/artifact/7cmkagCMW73ufszCgsMiNG
**Pedido de Paolo:** avisos dentro de la app. Lo que le importa al cliente lo ve el cliente (ej. 100ads: "error de nuestro lado, no te cobramos esos créditos"); lo interno le llega a Paolo.

**Cómo leer este archivo:**
1. La especificación del Capataz (v1).
2. El ataque de JonSnow. **Sus cambios mandan sobre la v1**, sobre todo el #1 (fotos gratis borrando la tanda: la devolución sale de un contador server-only en `credit_holds`, nunca de `generations` ni de `generated_images`) y el #3 (RLS + revoke en todas las tablas nuevas de la 0028).
3. Los huecos de Hawkeye. Suma 5 eventos, que en el mockup son las filas 20 a 24, casos borde (`timeout` no existe en `generations.status`; regenerar cobra sobre la tanda madre; el análisis no tiene generación) y los 5 tests mínimos.

**Textos que ya cambiaron en el mockup respecto de la v1:**
- #1: «Mientras dure, no se descuentan créditos. Podés seguir cargando tus productos y te avisamos acá cuando vuelva.»
- #2: «quedaste con {saldo}» en vez de «tenés {saldo}».
- #3: «Ya te devolvimos {n−k} créditos por las que faltaron.» (no afirma la causa).
- #10: «Entraron tus {n} créditos del {pack}.» (sin monto ni tarjeta).
- #12: «Recibimos tu pago y estamos terminando de acreditarlo…» («lo estamos revisando» sonaba a fraude).
- #14 y #15: mail urgente solo si Whop rechaza la clave o falta el secret, o si el cruce con Whop encuentra ventas sin procesar. Las firmas inválidas sueltas van al panel.
- #9: el cliente ve «No pudimos verificar tu cuenta. Si ya pagaste, no vuelvas a pagar: probá de nuevo en un minuto.», nunca la pantalla de compra.

**Hallazgos sueltos para arreglar aunque no se apruebe nada:**
- Hoy la respuesta de las rutas lleva el texto crudo de Google (`detail: result.error`, gen:464, regen:214). Ver JonSnow #6.
- Los packs traen 0 análisis, pero «Comprá más» en Análisis manda a `/upgrade` (Hawkeye).
- Si el chequeo de acceso no responde, `app/(app)/layout.tsx:32` manda a un cliente que ya pagó a comprar de nuevo (Hawkeye).

---

# Sistema de Avisos de Vendí: especificación v1

Rutas relativas a `C:\Users\Usuario\vendiapp\vendi\`. Los file:line los verifiqué hoy contra el working tree de `feat/cobro-whop`.

## A) Principios
1. **Mismo evento, dos mensajes.** Al cliente le contamos la consecuencia: qué pasó con su plata, en pasado, con un botón. A Paolo le contamos la causa. El cliente nunca ve nombres de proveedores, "sin saldo" ni códigos. El "Kie sin saldo" de 100ads no se copia.
2. **Todo dentro de la app.** El cliente lo ve en la tanda, en el banner o en la campanita. Mail al cliente solo cuando no sabemos quién es, más el recibo de compra que ya existe. Paolo tiene el panel `/admin/avisos` y recibe mail solo de lo urgente.
3. **No se promete nada que el sistema no haga.** El aviso de devolución se crea en la misma transacción que la devolución. A un ilimitado no se le dice "te devolvimos".
4. **Un evento, un aviso.** Si se repite, sube un contador. Lo que el cliente ya vio en pantalla se marca leído solo.

**Severidad:** U = mail en el momento + panel · M = panel + resumen diario · B = solo panel.

**Contradicciones resueltas:**
- 3 niveles y no 4: CRÍT y ALTA iban por el mismo canal.
- Falla de un cliente pagador: U (Comerciante), no B (Bujía). Con 0–1 clientes, cada falla es una relación (ver F3).
- Nombres `admin_*` y no `founder_*`: "founder" ya es el plan del Pase.
- `customer_email` (Integral) se usa si viene. La memoria decía que no venía.
- Aviso de créditos bajos solo para los de imagen: los packs no traen análisis (`lib/billing/catalog.ts:113-145`).
- Sin mail al cliente cuando vuelve el servicio: Paolo pidió que fuera dentro de la app.

## B) Catálogo de eventos
Abreviaturas: `gen` = `app/api/generations/route.ts` · `regen` = `app/api/generations/regenerate/route.ts` · `ana` = `app/api/analyze/route.ts` · `gem` = `lib/ai/gemini-client.ts` · `whop` = `app/api/webhooks/whop/route.ts`. Pagador = compró y no es admin.

| # | Evento | Origen | Quién | Dónde (cliente) | Texto exacto al cliente | A Paolo | Sev |
|---|---|---|---|---|---|---|---|
| 1 | IA caída (Google sin saldo o key mala) | `gem:279,283,340`; cortes `gen:188`, `regen:151`, `ana:106` | Ambos | Banner global; al volver, campanita | «Ahora no podemos generar ni analizar imágenes por un problema nuestro. No se te descontó nada. Te avisamos acá cuando vuelva; mientras, podés cargar tus productos.» Al volver: «Ya podés generar de nuevo.» | Mail con la causa («Google sin saldo: recargá»); otro al resolverse | U |
| 2 | Falla después de cobrar | `gen:437,547`; `regen:206`; `ana:130` | Ambos | Tanda o modal; campanita si se fue | «No pudimos terminar tus imágenes. Fue un problema nuestro, no de tus fotos. Ya te devolvimos {n} créditos: tenés {saldo}.» (En regenerar y análisis: «la imagen» / «el análisis», y «el crédito».) | Mail si es pagador; si no, panel | U/M |
| 3 | Entrega parcial | `gen:532` | Ambos | Tanda; campanita si se fue | «Salieron {k} de {n} imágenes. Las que faltaron fueron un problema nuestro: ya te devolvimos {n−k} créditos.» | Panel (pagador: mail) | M |
| 4 | Tanda colgada (Vercel corta a los 300 s) | `gen:53` → reaper | Ambos | Campanita; la tanda dice "Error" | «Tu tanda de {producto} no terminó por un problema nuestro. Ya te devolvimos {n} créditos.» | Panel | M |
| 5 | Devolución que falla | `gen:441,537`; `regen:179`; `ana:132` | Ambos | Tanda o modal | «No pudimos terminar por un problema nuestro. Tu devolución de {n} créditos está en proceso: te avisamos acá cuando entre.» | Mail | U |
| 6 | Falla al descontar (hoy le dice "sin créditos") | `gen:317`; `regen:167`; `ana:120` | Ambos | En la acción | «No pudimos empezar por un problema nuestro. No se te descontó nada. Probá de nuevo en un minuto.» | Mail | U |
| 7 | Foto bloqueada o ilegible | `lib/ai/generate-server.ts:420`; `gen:292` | Cliente | Tanda | «No pudimos usar estas fotos. Probá con otras o cambiá la descripción. {Te devolvimos los n créditos. / No se te descontó nada.}» | Contador | B |
| 8 | Quedan menos de 5 créditos | `settle_hold` | Cliente | Campanita, una por compra | «Te quedan {n} créditos: alcanzan para {n} imágenes.» [Recargar] | Resumen | B |
| 9 | Falla el chequeo de acceso (puede rebotar a un pagador) | `lib/auth/paid-access.ts:82` | Paolo | — (el gate no se toca) | — | Panel; mail si son ≥5 en 10 min | M |
| 10 | Compra acreditada | `whop:215` | Ambos | Pantalla de pago + campanita | «Entraron tus {n} créditos. Pagaste US${x}; en tu tarjeta figura a nombre de Whop.» | Resumen | B |
| 11 | Pago demorado (más de 90 s) | `app/pago/resultado/esperar-creditos.tsx:44`; `app/api/pago/estado/route.ts:32` | Ambos | Pantalla de pago | Cobrado: «Ya recibimos tu pago y tus créditos vienen en camino. No lo vuelvas a pagar: te avisamos acá cuando entren.» Sin confirmar: «Tu pago todavía se está confirmando. No lo vuelvas a pagar: te avisamos acá apenas se confirme.» | Mail si Whop cobró y no se acreditó | U |
| 12 | Pago en verificación (sabemos quién pagó) | `whop:146` | Ambos | Pantalla de pago + campanita | «Recibimos tu pago y lo estamos revisando. Tus créditos llegan en menos de 24 h; no lo vuelvas a pagar.» | Mail con monto, email y plan | U |
| 13 | Pago sin dueño (afiliado o link directo) | `whop:146` | Ambos | Mail (único canal) | «Recibimos tu pago. Entrá a vendilatam.com con este mismo email y tus créditos te esperan.» | Mail | U |
| 14 | No se abre el checkout | `lib/whop/create-checkout.ts:159` | Ambos | Pantalla de pago (ya existe) | «No pudimos abrir el pago. No se hizo ningún cargo. Probá de nuevo en un minuto.» | Mail si Whop da 401/403 o pasa ≥3 veces en 10 min | U/B |
| 15 | Webhook roto: falta el secret o está mal cargado, ≥3 firmas inválidas en 10 min, JSON roto o sin id (hoy responde 200 y el pago se pierde) | `whop:66,85,97,121`; `lib/whop/verify-webhook.ts:150` | Paolo | — | — | Mail | U |
| 16 | Cobrado sin acreditar (falla al acreditar o lo detecta el cruce con Whop) | `whop:165,181,198` | Paolo | El cliente lo vive como #11 | — | Mail; cada reintento sube el contador | U |
| 17 | Contracargo o reembolso | hoy se ignora (`whop:101`) | Paolo | — | — | Mail (cada contracargo cuesta US$15) | U |
| 18 | No salió el mail de compra | `whop:239,258` | Paolo | — | — | Panel | M |
| 19 | Base caída | todo | Ambos | Pantalla de error | «Tenemos un problema técnico de nuestro lado. Probá de nuevo en unos minutos.» | Mail directo, sin pasar por la base | U |

## C) Datos y servidor
- **Tablas** (`0028_avisos.sql`; la 0027 sigue sin aplicar):
  - `user_notifications` y `admin_alerts`.
  - `service_status`, con una sola fila `ai`.
  - `credit_holds`, más la columna `generated_images.hold_id`.
  - `checkout_sessions`: guarda el `ch_…` con su usuario (el id ya sale de `create-checkout.ts:185`).
  - Columna `customer_email` en `whop_unmatched_payments`.
  - Índice único parcial por `dedupe_key` sobre lo que está abierto: si el evento se repite sube `occurrences`, aunque lo vean varias instancias de Vercel a la vez.
  - La base guarda el hecho y el texto lo arma `lib/avisos/textos.ts`, así la copy cambia sin migración.
- **RLS:**
  - `user_notifications`: cada usuario lee solo lo suyo (`auth.jwt()->>'sub'`) y solo puede actualizar `read_at` (lección 0018). No puede insertar.
  - `service_status`: la lee cualquiera.
  - El resto, sin policies. Las RPC se revocan a PUBLIC/anon/authenticated (lección 0015).
- **Helpers** en `lib/avisos/` (solo server, nunca tiran error): `notifyUser()` y `alertAdmin()`.
  - Mail a `ADMIN_ALERT_EMAIL` por `lib/email/transport.ts`, dentro de `after()`.
  - Se manda cuando se abre una U, a las 6 h si sigue abierta y cuando se resuelve sola.
  - Si la base no responde, mail directo con freno: 1 por tipo cada 10 min.
- **Estado de la IA:**
  - `aiGate()` (memoria + la fila, cache de 15 s) reemplaza a `isGeminiBillingExhausted()` en los cortes de #1 y en `app/api/briefs/product/route.ts:86` y `app/api/briefs/reference/route.ts:84`.
  - `noteBillingExhausted` marca la fila como caída y alerta, en lugar del `console.error` de `gem:348`.
  - Vuelve a "ok" por cualquiera de estos caminos:
    - una respuesta OK de Gemini (`gem:207`);
    - la prueba: `claim_ai_probe()` deja probar a una sola instancia, con una llamada de texto barata, cada 2 a 15 min;
    - el botón [Ya recargué] del panel;
    - el cron.
- **Reserva con recibo:**
  - `hold_credits()` reemplaza los descuentos de hoy (`gen:312`, `regen:162`, `ana:117`). A los ilimitados les reserva 0.
  - `settle_hold()` hace todo en una transacción: devuelve lo no entregado (con `generation_id`), cierra la generación y crea el aviso.
  - Se puede reintentar sin devolver dos veces (pasa de `held` a `settled` con FOR UPDATE). Si falla, el cliente ve #5 y el reaper reintenta.
  - El paywall no se entera.
- **Cron:**
  - `reap_stale_holds()` en pg_cron cada 5 min (`0029`, se aplica después del deploy). Toma las reservas de más de 10 min, devuelve lo no entregado, marca la tanda `timeout` y dispara #4.
  - Vercel Cron diario a las 8:00 de Lima, con `Bearer CRON_SECRET`. Es diario porque, si el plan es Hobby, Vercel no permite más seguido. Hace de respaldo del reaper y además prueba la IA, cruza los pagos con Whop, aplica la retención y manda el resumen a Paolo.
  - Hay que sumar `/api/cron/(.*)` a `proxy.ts:42`. Si no, el cron recibe un 307 a /login.
- **Pagos:**
  - `/api/pago/estado` pasa a usar el `pay_…` de la URL de vuelta. Hoy busca "cualquier compra reciente" y muestra "¡Listo!" falsos.
    - Está en los pagos procesados: listo.
    - Está en los pagos sin atribuir (`whop_unmatched_payments`): #12.
    - No está en ninguna tabla pero Whop dice `paid`: #11 + U.
  - Pago sin `clerk_user_id` (se resuelve en `after()`):
    - primero se busca en `checkout_sessions`;
    - después, por `customer_email` en Clerk (solo si hay un único usuario con ese email, la regla de Shopify);
    - si no aparece, #13.
  - El cruce con Whop (`GET /payments?status=paid`) corre también al abrir el panel y a los 90 s de espera del cliente.
  - Hay que filtrar el pago de prueba (`pay_xxxxxxxxxxxxxx`, US$50, 13/10).
- **Cómo lee el cliente:**
  - Directo a Supabase con el token de Clerk, igual que los créditos (`lib/creditos/use-creditos.tsx:87`). Sin Realtime: el token vive 60 s y habría que renovarlo en el socket.
  - Lee al montar, al cambiar de ruta o de pestaña, cada 60 s y después de cada acción.
  - Con la IA caída, el banner llama a `POST /api/avisos/probe` cada 60 s y anota a quien lo vio, para avisarle cuando vuelva.
  - La pantalla marca leído el `notification_id` que ya mostró.

## D) UI del cliente
- **Campanita:** en desktop, en la fila del logo del sidebar (`components/app/sidebar.tsx:70`). En mobile, una barra superior nueva (logo, campanita y saldo) en `app/(app)/layout.tsx`, porque la barra de abajo ya tiene 5 ítems.
- **Centro de avisos:** `DropdownMenu` en desktop y `Dialog` a pantalla completa en mobile.
- **Banner de servicio** (componente de cliente): primer hijo de `<main>` (`app/(app)/layout.tsx:47`). Aparece solo con la IA caída y apaga los botones de IA.
- **En la tanda:**
  - el banner rojo de hoy, con los textos nuevos;
  - `PartialDeliveryBanner` también en "Más variaciones";
  - "Error" en vez de "En cola" (`app/(app)/fabrica/page.tsx:403`).
- **Overlay de generación** (`components/app/generating-overlay.tsx:57`): «Reservamos {n} créditos. Si alguna imagen no sale, te los devolvemos solos.» Sale el "entre 30 y 60 segundos".
- **Limpieza:**
  - fuera el "Failed to fetch" (`app/(app)/analisis/page.tsx:250`);
  - fuera el texto de la API key propia (`app/(app)/productos/[id]/versiones/[versionId]/page.tsx:961`);
  - el "Reembolso" de Ajustes dice de qué tanda es (`app/(app)/ajustes/page.tsx:192`).
- **Sin toasts en v1:** Sonner está montado pero nadie lo usa, y pinta con el tema del sistema en vez del de la app (`components/ui/sonner.tsx:8`).

## E) Panel de Paolo
- **Protección:**
  - `app/(app)/admin/avisos/page.tsx` (Server Component, lee con service_role) más `app/(app)/admin/layout.tsx`.
  - El layout da `notFound()` si el id no está en `ADMIN_USER_IDS` (variable solo de server).
  - Cada server action vuelve a chequear el id, porque el layout no las protege.
  - El sidebar recibe `isAdmin` desde el layout.
- **Semáforo:** IA, cobro y base.
- **Alertas abiertas**, de U a B: causa, cliente (con su email de Clerk), cuántas veces, desde cuándo y [Resolver].
- **Plata pendiente:** pagos sin dueño, ventas sin acreditar y reservas abiertas, con [Acreditar a…].
- **[Ya recargué]** prueba la IA en el momento. El cruce con Whop corre al abrir el panel.
- **Últimas 24 h:** tandas, % de fallas, créditos devueltos y ventas.

## F) Decisiones de Paolo
1. **¿Regalar créditos por fallas?** Recomiendo 1 crédito solo cuando la falla fue nuestra y le costó más que un intento:
   - segunda falla seguida;
   - espera de más de 2 min;
   - compra acreditada con más de 10 min de demora.

   Máximo 1 por día. Nunca a ilimitados, ni por foto rechazada, ni si se cortó antes de cobrar. Al #2 se le suma: «…y te sumamos 1 por la molestia: tenés {saldo}.» Cada crédito cuesta ~US$0,07; un contracargo, US$15. Si nuestras fallas pasan el 10% de las tandas, se corta el regalo.
2. **Afiliados al 30% (Pase y Pack Inicial).** Cada venta que trae un afiliado entra sin nuestros datos y cae en #13. Recomiendo apagarlos hasta tener el reclamo por email (paso 9). Si los quiere ya, ese paso se hace junto con el 5.
3. **Mail por cada falla de un cliente que pagó**, hasta tener 50 pagadores o 5 mails por día, para que Paolo le escriba en persona. Recomiendo que sí.
4. **Plazo en #12.** Recomiendo prometer "menos de 24 h": se cumple con el mail urgente y el botón [Acreditar a…]. Si no quiere comprometer plazo, el texto queda: «Te avisamos acá apenas entren tus créditos; no lo vuelvas a pagar.»

## G) Plan de implementación
1. **Bujía:** texto honesto ya.
   - Fuera "sin saldo" y "ya estamos avisados" (`lib/generations/format.ts:68`).
   - 402 solo cuando el error dice "Créditos insuficientes" (`supabase/migrations/0012_clerk_user_ids.sql:121`); el resto, 503.
2. **Frontero:** fuera "van a aparecer solos" y "escribinos" (`app/pago/resultado/esperar-creditos.tsx:93-95`).
3. **Bujía:** `0028`, `lib/avisos/`, `aiGate` y la prueba. Paolo carga `ADMIN_USER_IDS` y `ADMIN_ALERT_EMAIL` en Vercel.
4. **Bujía:**
   - Alertas donde hoy solo hay `console.error` (#1, #5, #6, #9).
   - Los 4 reembolsos pasan a revisar el error desde ya.
   - `gen:518` cuenta como fallida la imagen que no se guardó.
   - `regen:308` devuelve el crédito.
5. **Integral:**
   - Eventos #10 a #18, `checkout_sessions`, el `pay_…`, el filtro del pago de prueba y la causa del error en `create-checkout.ts:159`.
   - Con el primer cobro real, confirmar `customer_email` y cómo figura el cargo en la tarjeta.
   - Paolo suma `dispute.created` y `refund.created` al webhook en el dashboard de Whop.
6. **Davinci:** mockup en Artifact (campanita, centro de avisos, banner, barra mobile y panel) con estos textos. Paolo lo aprueba antes de codear.
7. **Frontero:** UI del cliente (D) y `/admin/avisos`. Las acciones que mueven plata, junto con Bujía.
8. **Bujía:** reserva con recibo, `0029` (pg_cron), Vercel Cron, `CRON_SECRET` y `proxy.ts`.
9. **Integral:** reclamo por email del pago sin dueño.
10. **Hawkeye:** en cada paso, provocar el evento y verificar tres cosas: el cliente ve el texto, a Paolo le llega una sola alerta y los créditos cuadran.
    - Casos: key falsa, timeout, devolución caída, firma falsa, pago de prueba y la misma falla en dos instancias.
    - JonSnow revisa RLS, admin y cron antes del push.

---

# Revisión de seguridad (JonSnow)

**JonSnow (seguridad): ataque a la spec de Avisos v1**

Las rutas son relativas a `C:\Users\Usuario\vendiapp\vendi\`. Lo verifiqué en prod con SQL y advisors:
- Todo objeto nuevo en `public` nace con todos los permisos de tabla y EXECUTE para anon y authenticated (lo da el default ACL).
- `generations_all_own` es FOR ALL.
- `generated_images_update_own` no limita columnas.
- La FK `generated_images→generations` es ON DELETE CASCADE.
- Los advisors no muestran nada nuevo.

**1. CRÍTICA: G4 fabrica "imagen gratis + reembolso".** Si `gen:518` y `regen:308` devuelven el crédito cuando falla el insert:
- **Ataque:** POST /api/generations y a los ~10 s `DELETE /rest/v1/generations?id=eq.<id>` con tu propio token (o borrás el producto y cae en cascada). `gen:501` sube igual los archivos, los inserts mueren por la FK y se devuelve todo. Las imágenes quedan en tu carpeta de Storage.
- **Daño:** 100 tandas por día ≈ US$30/día de Gemini por cuenta.
- El reaper cae igual: la cascada borra las filas con `hold_id`, o el dueño le pone `hold_id=null`.
- **Cambio:**
  - "Entregado" pasa a ser un contador en `credit_holds` que solo escribe el server. Settle y reaper leen solo ese contador.
  - Si el insert falla después de subir, se borra el objeto antes de devolver; si no se puede borrar, cuenta como entregada.
  - `regen:308` sigue sin devolver.
  - Nada de `hold_id` en `generated_images`.
  - El cron nunca reembolsa leyendo `generations`: el dueño puede insertar ahí una tanda "processing" falsa.
- Dueño: Bujía (backend).

**2. ALTA: el panel admin queda protegido solo en el layout.** La doc de Next (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350`) avisa que el layout no se re-ejecuta en partial rendering.
- **Ataque:** un request RSC con `Next-Router-State-Tree` que declare `/admin` ya montado renderiza solo el page, que lee con service_role. Quedan expuestos los emails y pagos de todos los clientes. El panel todavía no existe: Hawkeye (testing-qa) lo reproduce con curl antes del push.
- **Cambio:**
  - `requireAdmin()` en `page.tsx`, en cada server action y en la función que trae los datos.
  - `ADMIN_USER_IDS` como lista exacta; si está vacía, no es admin nadie.
  - `[Acreditar a…]` solo vía `process_whop_payment` con el `pay_` original, marcando `reconciled` en la misma transacción. Con `grant_credits` directo, el reintento de Whop acredita doble.
- Dueños: Frontero (frontend) y Bujía (backend).

**3. ALTA: las tablas nuevas nacen abiertas.** "Sin policies" solo protege si la tabla tiene RLS prendido.
- **Ataque:** si `service_status` queda sin RLS, anon hace `PATCH …?id=eq.ai` y apaga la IA para todos. Si `credit_holds` es escribible, se mete una reserva falsa y el reaper la "devuelve".
- "Solo actualiza `read_at`" exige `GRANT UPDATE (read_at)`, porque RLS no limita columnas (la lección de la 0018 otra vez).
- **Cambio en 0028:**
  - RLS en todas, `revoke all` a anon/authenticated y grants mínimos.
  - `revoke execute` de `hold_credits`, `settle_hold`, `reap_stale_holds` y `claim_ai_probe`. Si `claim_ai_probe` queda abierta, cualquiera acapara la prueba y la IA no vuelve sola.
  - `service_status` expone solo `ok` y `since`.
  - Probar con un POST real usando la anon key.
- Dueño: Bujía (backend).

**4. MEDIA: el cron queda público al sumarlo a `proxy.ts:42`.**
- **Ataque:** el bug clásico `!== \`Bearer ${CRON_SECRET}\`` sin la variable cargada deja pasar `Bearer undefined`.
- **Cambio:**
  - 503 si falta el secret, comparar con `timingSafeEqual` y un candado diario (`cron_runs`).
  - La retención no toca las tablas `*_processed_*`, `credit_ledger` ni reservas abiertas. Si borra el candado de un pago, el cruce con Whop lo ve como #16 y se acredita dos veces.
  - Cruce limitado a las últimas 72 h.
- Dueño: Bujía (backend).

**5. MEDIA: IDOR en `/api/pago/estado` por `pay_…`.** Hoy filtra por `userId` (`route.ts:32-38`).
- **Ataque:** buscando por `pay_`, cualquiera logueado ve pagos ajenos (monto, `customer_email`). Si el pago se atribuye a quien presenta el `pay_`, se lo roba.
- **Cambio:**
  - Responder solo si el pago corresponde a quien pregunta (metadata o `checkout_sessions`).
  - Presentar un `pay_` nunca atribuye.
  - El match por email solo vale con email verificado en Clerk.
- Dueño: Integral (integraciones).

**6. MEDIA: la spec no tapa la filtración.** Cambia el `message`, pero la respuesta sigue llevando:
- `detail: result.error` (gen:464, regen:214), con el texto crudo de Google (`gem:280`, "prepayment credits are depleted");
- `upErr.message` (regen:258);
- nombres de constraints de Postgres (regen:312);
- el código `ai_billing_exhausted` (regen:154).

Cambio: al cliente solo `{error: enum, message, refunded}`; el detalle va a `admin_alerts`. Dueño: Bujía (backend).

**7. MEDIA: inundación de mails.** Hay avisos urgentes (mail inmediato) que cualquiera puede disparar:
- #15: basura enviada al webhook, que es público;
- #14: un loop a `/api/checkout`, que no tiene límite de pedidos y crea una configuración nueva en cada intento (`create-checkout.ts:155`). Encima quema la cuota de la API de Whop y frena a compradores reales.

**Cambio:**
- Firma inválida pasa a severidad baja (solo panel).
- Los urgentes del cobro salen solo por secret faltante o por el cruce con Whop (cobrado y sin procesar).
- Límite de pedidos de checkout en Postgres, como la 0025.
- Tope global de mails urgentes guardado en la base.
- El cruce con un candado global, nunca disparado por el polling del cliente.

Dueño: Integral (integraciones).

**8. BAJA: XSS.** La pantalla está bien: React escapa y los textos salen del código. El riesgo es el mail HTML a Paolo con textos que escribe el atacante: nombre del producto, `data.user.name` y la atribución utm (`create-checkout.ts:145`). Sirve para meter phishing dentro de un mail legítimo de Vendí. Cambio: `escapeHtml` (`lib/email/credits-granted.ts:310`) o texto plano, y el botón sale del `kind`, sin columna `href`.

**9. BAJA: regalo de F1.** Se puede forzar con el truco del punto 1, aunque el tope lo deja en ~US$0,07/día. Cambio: solo por causas del lado del server en una lista cerrada, y como mucho uno por usuario por día.

---

# Huecos y tests (Hawkeye)

**Hawkeye (testing-qa)**: esto es solo análisis, no toqué ningún archivo. Las rutas son relativas a `C:\Users\Usuario\vendiapp\vendi\` y uso las abreviaturas de la spec (`gen`, `regen`, `ana`, `gem`, `whop`).

**Faltantes en el catálogo**
1. **Al que ya pagó lo mandamos a pagar de nuevo.** Si el chequeo de acceso no responde (base lenta), `app/(app)/layout.tsx:32` lo manda a `/comprar` y de ahí a `/plan`, donde le vendemos el Pase otra vez. La pantalla de error de #19 nunca llega a salir. Se enteran los dos, U: «No pudimos verificar tu cuenta. Si ya pagaste, no vuelvas a pagar: probá en un minuto.» Sumar el evento **Pase pagado dos veces** → Paolo, U.
2. **Pago en efectivo pendiente o vencido** (OXXO, SPEI, PagoEfectivo). Whop tiene `payment.pending` y `payment.failed`: hay que suscribirlos, y hoy el webhook los ignora (`whop:101`). Los dos, B: «Tenés hasta {fecha} para pagar el código en {método}; después tus créditos entran solos.» / «Tu código venció. No se te cobró nada.»
3. **Tanda que termina con el cliente afuera.** No hay aviso de éxito. Además, si se corta la red, la pantalla dice «intentá de nuevo» (`versiones/[versionId]/page.tsx:242`) y el cliente lanza otra tanda que también se le cobra. Cliente, B: «Tus {k} fotos de {producto} ya están en la Fábrica.» / «Tu tanda sigue en curso: no la lances otra vez.»
4. **IA caída por algo que no es falta de saldo:** key mala o faltante (`gem:153,283`), modelo retirado (un 404 sale como `unknown`), seguidillas de errores 5xx o 429 (`gem:287-295`). Solo el caso de saldo llega a `noteBillingExhausted` (`gem:202`), así que acá no se corta el servicio ni salta alerta: cada intento cobra y devuelve. El cliente ve #1; Paolo, U.
5. **Devolución que entra tarde.** #5 promete avisar cuando entre y no hay evento para eso. El reaper manda #4 («no terminó»), que es falso si el cliente ya vio fotos. Texto: «Ya entró tu devolución de {n} créditos.» Falta también el texto de salida parcial con devolución caída (#3 + #5).
6. **El canal de alertas puede estar muerto:** las variables de SMTP en Vercel siguen sin verificar (memoria §28). El resumen de las 8:00 tiene que salir aunque esté vacío, así Paolo se da cuenta si deja de llegar.
7. Paolo, B: **pago rechazado** (`pagar-client.tsx:426`). Y el `status ≠ paid` que hoy se contesta con 200 (`whop:113-115`) va a #15.

**Casos borde**
- `timeout` no está permitido en `generations.status` (`0001_initial_schema.sql:64`). Si la 0028 no lo agrega, `settle_hold` falla entero y la devolución no entra nunca.
- Regenerar cobra sobre la tanda madre (`regen:165`): el reaper no la puede marcar fallida porque ya tiene fotos. El análisis no tiene generación: `credit_holds` necesita saber de qué bolsa es y aceptar `generation_id` vacío.
- Culpa mal asignada: el error total que se informa es solo el primero (`failures[0]`, `generate-server.ts:246`). Además, una foto borrada en v1 sale como `unknown` y #2 le dice «no de tus fotos».
- Primera compra: la campanita está detrás del muro de pago y `esperar-creditos.tsx:44` deja de preguntar a los 90 s. Para ese comprador, «acá» tiene que ser esa pantalla, sin rendirse, más un mail.
- Que el `pay_…` venga en la URL de vuelta no está documentado para el checkout embebido: lo que vuelve es `state_id`, y el id solo sale por `onComplete`, que no usamos. Mejor buscar por el `ch_…`, que llega en `data.checkout_configuration_id` (`whop:57`, confirmado en la doc de Whop).
- Cuando vuelve el servicio: el paso de caído a ok tiene que ser atómico (así sale un solo «Ya podés generar» por usuario) y con margen contra idas y vueltas. El corte en memoria (`gem:338`) tiene que obedecer a la fila. Avisar también a quien recibió el 503 desde la API, no solo a quien vio el banner.
- Sin créditos con la IA caída: regenerar y analizar responden 402 antes que 503 (`regen:138`, `ana:93`), o sea que lo mandan a comprar algo que no puede usar. El banner tiene que estar también en `/plan` y `/pagar`.
- Con la base caída, el límite de 1 mail cada 10 min vive en memoria, así que es uno por instancia. Las firmas inválidas las puede mandar cualquiera: la U salta solo si el cruce con Whop encuentra pagos sin procesar.

**Textos que confunden**
- #1 «No se te descontó nada» queda al lado de #2 «te devolvimos 5». Mejor: «Mientras dure, no se descuentan créditos.»
- #2 «tenés {saldo}» queda viejo en la campanita: «quedaste con {saldo}». #3 dice «fueron un problema nuestro» sin saber la causa. #8 queda raro con n=0.
- #10 «Pagaste US${x}… tarjeta»: con precio en moneda local el cliente pagó en su moneda, y con OXXO no hay tarjeta. #12 «lo estamos revisando» suena a sospecha de fraude.
- Análisis sin saldo: «Comprá más» lleva a `/upgrade` (`analisis/page.tsx:931,947`), pero los packs traen 0 análisis (`catalog.ts:113-146`). Paga y sigue sin poder analizar.

**5 tests mínimos** (antes hay que instalar Vitest y Playwright y levantar una base local con `supabase start`)
1. **Vitest + Postgres:** `settle_hold` y `reap_stale_holds` en paralelo sobre la misma reserva → 1 devolución con `generation_id`, 1 aviso y saldo exacto. Ilimitado: sin movimientos. Análisis: vuelve a su bolsa. Tanda madre: intacta.
2. **Vitest de ruta con Gemini simulado:** falta de saldo o key mala → corte abierto y 1 alerta; el intento siguiente da 503 sin reservar. Salida parcial 3/5 → devuelve 2. `settle_hold` caído → texto #5 y la reserva sigue `held`.
3. **Vitest del webhook:** el mismo evento 12 veces más 2 en paralelo → 1 acreditación, 1 aviso, 1 mail. RPC caída en el primer intento → la alerta #16 se abre y se cierra sola al acreditar. Pago de prueba filtrado.
4. **Vitest de avisos:** misma `dedupe_key` en simultáneo → 1 fila, `occurrences=2`, 1 mail. Caído a ok en simultáneo → 1 aviso por usuario. RLS: cada uno lee solo lo suyo y solo puede tocar `read_at`.
5. **Playwright a 375px:** falla forzada → texto en la tanda, sin duplicado en la campanita. Pestaña cerrada a mitad → 1 aviso al volver. Leído en una pestaña → desaparece de la otra. Chequeo de acceso que no responde → pantalla de error, nunca `/plan`.

---

# Anexo (16/10/2026): cuándo Google ya cobró aunque devolvamos

Lo relevaron dos Bujías (código + docs oficiales). Paolo pidió los casos, no los montos.

**Los casos**
1. **Google responde con error** (400/500, key mala, caído): **no cobra**. Cita oficial: "If your request fails with a 400 or 500 error, you won't be charged for the tokens used." (https://ai.google.dev/gemini-api/docs/billing). Devolver acá no cuesta nada.
2. **Google genera la imagen (200) y la perdemos nosotros**: **cobrada entera**. Puntos del código:
   - Storage falla y hace `continue` sin reintento, con los bytes en memoria (`app/api/generations/route.ts:504`); si fallan todas, `upload_failed` (`:547`).
   - Falla el link firmado: la imagen queda en Storage pero se cuenta como fallida (`route.ts:512`).
   - Falla el insert: el error no se lee y se cuenta como entregada (`route.ts:518`).
   - Todo se sube al final y de a una (`route.ts:499`): si Vercel corta a los 300 s, se pierde todo.
   - Falla el post-proceso con sharp (`lib/ai/generate-server.ts:266`).
   - Regenerar: `regenerate/route.ts:253`, `:268`, `:308`.
   - El Director se paga aunque después fallen todas las imágenes (`route.ts:437`).
   - Análisis: un 200 que no valida se tira entero (`lib/ai/image-analyzer.ts:201`). Hay que mandarle el schema a Google.
3. **Google responde 200 pero bloquea o manda texto en vez de imagen**: no hay doc oficial. Asumir que cobra la entrada y el texto (poco) y no la imagen. Hoy `generate-server.ts:414-418` no separa IMAGE_PROHIBITED_CONTENT, IMAGE_RECITATION, IMAGE_OTHER ni NO_IMAGE: hay que separarlos para saber si la culpa fue de la foto del cliente.
4. **Cortamos nosotros por tiempo** (imagen a los 60 s en `lib/ai/gemini-client.ts:172`, Director a los 45 s): no confirmado. Asumir que Google termina y cobra. Subir a ~90 s.
5. **El cliente relanza** cuando se le corta la red (`app/(app)/productos/[id]/versiones/[versionId]/page.tsx:242`): Google puede cobrar la tanda dos veces.

**Regla propuesta (falta el OK de Paolo; él planteó "solo avisos, sin devolver")**
- Caso 1: devolver. A Paolo no le cuesta nada y el cliente no recibió nada.
- Casos 2, 4 y 5: arreglar para que no pasen (reintentar el guardado con los bytes en memoria, subir cada imagen apenas llega, firmar al leer, esperar ~90 s, avisar "tu tanda sigue en curso"). Si igual pasa, devolver: la culpa es nuestra.
- Caso 3, cuando el bloqueo es por la foto o el pedido del cliente: solo aviso, sin devolver.

**Urgentes que salieron de paso**
- **Sin saldo ahora es 402**, no 429 (https://ai.google.dev/gemini-api/docs/billing y /api-errors). `gemini-client.ts:279` solo reconoce 429/403: con un 402 no salta el corte ni el aviso #1. Además, el prepago puede quedar negativo por la demora de ~10 min en la facturación.
- **Modelo de imagen v1 retirado:** `gemini-3.1-flash-image-preview` (`gemini-client.ts:46`) figura con apagado el 25/06/2026 en https://ai.google.dev/gemini-api/docs/deprecations (actualizada el 12/10/2026). El reemplazo GA es `gemini-3.1-flash-image`, que v2 ya usa (`lib/ai/v2/constants.ts:137`). La última tanda completada en prod fue el 08/09, y desde el 14/09 no hubo tandas. Probar ya si v1 sigue andando.
- **Para no quedarse sin saldo:** AI Studio > Billing > Manage auto-reload (recarga automática con tope mensual). Las alertas de presupuesto de Cloud Billing miden lo gastado, no el saldo, y pueden tardar horas.
