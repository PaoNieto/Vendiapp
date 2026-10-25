import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { serverGenerationRequestSchema } from "@/lib/validations/generations";
import { generateOnServer, prepareProductParts } from "@/lib/ai/generate-server";
import { getStyleFragment, type StyleId } from "@/lib/styles";
import { MAX_VARIATIONS, type OutputRatio } from "@/lib/constants";
import {
  aiOutageCause,
  isInputBlocked,
  reportAiOutage,
  type GeminiError,
  type GeminiPart,
} from "@/lib/ai/gemini-client";
import { deductErrorStatus, isInsufficientCreditsError } from "@/lib/generations/format";
import { aiGate, watchAiOutage } from "@/lib/avisos/ai-gate";
import { alertAdmin } from "@/lib/avisos/alert";
import { runAfter } from "@/lib/avisos/db";
import { reapStaleGenerations } from "@/lib/avisos/maintenance";
import { maybeNotifyCreditsLow, notifyUser } from "@/lib/avisos/notify";
import {
  aiUnavailableBody,
  alertFailure,
  alertOutputBlockCapped,
  chargeFailedBody,
  claimOutputBlockRefund,
  dbDownBody,
  isOutputBlocked,
  photosUnreadableBody,
  refundOrPend,
  type AiRouteError,
} from "@/lib/avisos/rutas";
import { noticeText } from "@/lib/avisos/textos";
import { NOTICE_KEYS } from "@/lib/avisos/types";
import { persistGeneratedImage, type PersistStage } from "./_lib/persist";
import { pipelineForUser } from "@/lib/ai/v2/constants";
import {
  downloadV2Inputs,
  prepareV2,
  renderV2,
  type V2Downloads,
  type V2Snapshot,
} from "@/lib/ai/v2/generate-v2";
import { createSupabaseV2Store } from "@/lib/ai/v2/store-supabase";

/**
 * POST /api/generations — generación SERVER-SIDE (modelo de créditos).
 *
 * Flujo:
 *  1. Auth: el usuario tiene que estar logueado.
 *  2. Buscar la versión (RLS garantiza que es del usuario) → producto, refs,
 *     ratio, variaciones, prompt.
 *  2.a Portero de la IA (`aiGate`): con la IA caída, 503 ANTES de cobrar (y
 *     antes del 402: no se manda a comprar algo que no se puede usar).
 *  3. Pre-check de créditos: si no le alcanza, rechazar ANTES de gastar plata
 *     en Google.
 *  4. Crear el row `generations` (status processing) y bajar las fotos del
 *     producto: si ninguna se lee, se corta SIN descontar.
 *  5. RESERVAR créditos con `charge_batch` (deduct + fila en `batch_charges`,
 *     atómico). 402 solo si de verdad no alcanza; cualquier otro error es
 *     nuestro (503 + alerta U). `batch_charges` es lo ÚNICO que mira el reaper
 *     para devolver (amount − images_saved): la ruta suma cada imagen entregada
 *     y la cierra al terminar (closeGeneration).
 *  6. Generar con la key propia de Vendí: v1 (generateOnServer, default) o v2
 *     (lib/ai/v2/: notas cacheadas + plan + prompt ensamblado por código) según
 *     el flag VENDI_PIPELINE / VENDI_PIPELINE_V2_USERS. En v2 las fotos se bajan
 *     ANTES del deduct (paso 4.b): si ninguna es legible, no se descuenta nada.
 *  7. Subir imágenes OK a Storage + insert en generated_images, reintentando
 *     con los bytes en memoria (`persistGeneratedImage`).
 *  8. Devolver los créditos de las variaciones que no quedaron guardadas, con
 *     su aviso en la misma transacción (`refundOrPend`).
 *  9. Marcar completed y devolver { generationId, images, creditsRemaining }.
 *
 * AVISOS (protocolo de lib/avisos): toda tanda COBRADA termina con exactamente
 * un aviso de llave `gen:<id>` — lista, parcial, fallida, entrada bloqueada o
 * devolución en proceso. Es la marca server-side de "la ruta terminó": sin ella
 * el reaper del cron la trata como colgada.
 *
 * Regla de devolución (Paolo): Google dio error → se devuelve; perdimos una
 * imagen ya generada → se reintenta guardar y, si igual se pierde, se devuelve;
 * Google bloqueó la ENTRADA (foto o pedido) → NO se devuelve, solo aviso;
 * bloqueó la SALIDA → se devuelve.
 *
 * Al cliente solo `{ error, message, refunded, notificationId? }`: nunca el
 * texto crudo de Google, de Storage ni de Postgres (va a admin_alerts).
 *
 * Los créditos se mutan SOLO con el cliente admin (service_role) vía las RPC
 * deduct_credits / grant_credits — el usuario nunca las puede invocar directo.
 */

// Peor caso de la tanda: Director (45s) + 5 llamadas de imagen (60s c/u, en
// paralelo) + sharp + uploads a Storage. Sin techo explícito Vercel corta antes
// y la función muere ENTRE el deduct y el refund → el cliente pierde créditos.
export const maxDuration = 300;

/** Texto interno de un GeminiError, SOLO para Paolo (admin_alerts). */
function describeGeminiError(error: GeminiError): string {
  switch (error.kind) {
    case "unknown":
      return error.message;
    case "billing":
      return `billing${error.message ? `: ${error.message}` : ""}`;
    case "model_not_found":
      return `model_not_found${error.model ? ` (${error.model})` : ""}${error.message ? `: ${error.message}` : ""}`;
    case "content_blocked":
      return `content_blocked:${error.stage ?? "?"}${error.reason ? ` (${error.reason})` : ""}`;
    case "rate_limit":
      return `rate_limit${error.retryAfterSec ? ` (${error.retryAfterSec}s)` : ""}`;
    default:
      return error.kind;
  }
}

/**
 * Cierra la tanda (admin, un reintento cada paso): la fila de `generations` y
 * el cobro de `batch_charges` (desde ahí el reaper no la toca más; si no hubo
 * cobro, es no-op). Nunca tira.
 */
async function closeGeneration(
  admin: ReturnType<typeof createAdminClient>,
  generationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await admin.from("generations").update(patch).eq("id", generationId);
      if (!error) break;
      console.error("[generations] No se pudo cerrar la tanda:", error.message);
    } catch (err) {
      console.error("[generations] Cierre de la tanda tiró:", err instanceof Error ? err.message : err);
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await admin.rpc("batch_charge_close", { p_generation_id: generationId });
      if (!error) return;
      console.error("[generations] No se pudo cerrar el cobro de la tanda:", error.message);
    } catch (err) {
      console.error("[generations] Cierre del cobro tiró:", err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Suma una imagen entregada al cobro de la tanda (lo que el reaper NO devuelve
 * si la ruta muere antes de cerrar). Un reintento; nunca tira. Si igual falla,
 * el peor caso es que el reaper devuelva de más una imagen entregada: nunca se
 * le cobra de más al cliente.
 */
async function markImageSaved(
  admin: ReturnType<typeof createAdminClient>,
  generationId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await admin.rpc("batch_charge_image_saved", {
        p_generation_id: generationId,
      });
      if (!error) return;
      console.error("[generations] batch_charge_image_saved falló:", error.message);
    } catch (err) {
      console.error("[generations] batch_charge_image_saved tiró:", err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Imagen lista para subir, con la MISMA forma para los dos pipelines. Así
 * créditos, refunds, uploads y respuesta al cliente son un único código: lo
 * único que cambia entre v1 y v2 es quién produce las imágenes.
 *   - v1: `variationIndex` = posición en la tanda y `metadata` = { base_prompt }
 *     (idéntico a como se guardaba antes del flag).
 *   - v2: `variationIndex` = índice de la imagen en la tanda (el mismo `i` de su
 *     prompt) y `metadata` = { base_prompt (el prompt final de ESA imagen),
 *     pipeline, plan_source, shot_index, model } (spec §2.6).
 */
type UploadableImage = {
  buffer: Buffer;
  contentType: string;
  variationIndex: number;
  metadata: Record<string, unknown>;
};

/** `snapshot` = lo que va a `generations.enriched_prompt` (solo v2; v1 = null). */
type GenerationOutcome =
  | { ok: true; images: UploadableImage[]; failures: GeminiError[]; snapshot: V2Snapshot | null }
  | { ok: false; error: GeminiError; snapshot: V2Snapshot | null };

export async function POST(req: Request) {
  // Reloj de la RUTA: el pipeline v2 decide si reintentar al Director mirando
  // cuánto queda de los 300s, contados desde que entró la request.
  const startedAt = Date.now();

  // 1. Auth (Clerk). El id canónico del usuario es el id de Clerk (string
  // `user_xxx`), que viaja como `sub` en el JWT y resuelve la RLS de Supabase
  // (`auth.jwt()->>'sub'`). El cliente de `lib/supabase/server.ts` ya inyecta
  // ese token, así que las queries de abajo respetan ownership.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Pipeline por request: VENDI_PIPELINE (global, default v1) o
  // VENDI_PIPELINE_V2_USERS (lista de ids de Clerk con v2 forzado). Con v1 todo
  // lo de abajo corre exactamente como antes del flag.
  const pipeline = pipelineForUser(userId);
  // Candado PAGA-PRIMERO también en la API (no solo en el proxy de páginas): un
  // usuario logueado que NUNCA pagó no puede generar, aunque arrastre saldo
  // heredado de antes del paywall. Misma fuente de verdad que el middleware:
  // una compra en `credit_ledger` o estar en la allowlist de acceso libre.
  if (!(await userHasPaidAccess(userId))) {
    return NextResponse.json(
      { error: "Necesitás una compra activa para usar esta función." },
      { status: 403 },
    );
  }
  // Red de seguridad: si el usuario Clerk todavía no tiene perfil (ej. primera
  // acción antes de cargar una página del shell), lo creamos acá. Idempotente.
  await ensureProfile();
  const supabase = await createClient();

  // Validación del body
  const body = await req.json().catch(() => null);
  const parsed = serverGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { versionId, styleFragment, brand } = parsed.data;

  // 2. Versión (RLS: solo si es del usuario)
  const { data: version, error: versionErr } = await supabase
    .from("versions")
    .select(
      "id, product_id, reference_images, output_ratio, variations_default, user_prompt, style_id",
    )
    .eq("id", versionId)
    .single();
  if (versionErr || !version) {
    return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  }

  // Producto padre (tabla projects). `name` y `description` los usa solo la v2
  // (nota del producto y hashes); para v1 son dos columnas más que no se miran.
  const { data: product, error: productErr } = await supabase
    .from("projects")
    .select("id, name, description, product_images")
    .eq("id", version.product_id)
    .single();
  if (productErr || !product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const productImages: string[] = Array.isArray(product.product_images)
    ? (product.product_images as string[])
    : [];
  const referenceImages: string[] = Array.isArray(version.reference_images)
    ? (version.reference_images as string[])
    : [];
  const ratio = version.output_ratio as OutputRatio;
  // Techo server-side (MAX_VARIATIONS = 10, el mismo del stepper). La columna
  // `variations_default` se escribe directo por PostgREST (RLS FOR ALL): sin
  // techo, un usuario de `unlimited_users` (o una sesión robada) pedía 1000
  // imágenes EN PARALELO por tanda y el tope de 30 tandas/hora de la 0025 dejaba
  // de servir. Para todo valor que la UI puede producir (1..10) no cambia nada.
  const variations = Math.min(MAX_VARIATIONS, Math.max(1, version.variations_default ?? 1));
  const userPrompt: string | undefined =
    typeof version.user_prompt === "string" && version.user_prompt.trim().length > 0
      ? version.user_prompt
      : undefined;

  if (productImages.length === 0) {
    return NextResponse.json(
      { error: "Este producto no tiene fotos cargadas" },
      { status: 400 },
    );
  }

  // Cliente admin (service_role): se usa para el chequeo de ilimitados y para
  // las mutaciones de créditos (deduct/grant) más abajo.
  const admin = createAdminClient();
  const productName =
    typeof product.name === "string" && product.name.trim() ? product.name.trim() : null;

  // 2.a Portero de la IA (lib/avisos/ai-gate.ts): con la IA caída (sin saldo en
  // Google, key mala, modelo inexistente) cortamos ANTES del tope por hora (un
  // 503 no gasta una tanda del tope), del 402 (no lo mandamos a comprar algo que
  // no puede usar), de crear la fila y de descontar. Anota al usuario para
  // avisarle «Ya podés generar de nuevo» cuando vuelva.
  const gate = await aiGate({ watchUserId: userId });
  if (!gate.open) {
    return NextResponse.json(aiUnavailableBody(), { status: 503 });
  }

  // Tandas colgadas de este usuario (> 15 min): se resuelven después de
  // responder, sin demorar esta tanda. El cron diario hace lo mismo para todos.
  runAfter(() => reapStaleGenerations({ userId, limit: 5 }));

  // 2.b Tope de generaciones por usuario (migración 0025). Va ANTES del
  // pre-check de créditos y de cualquier llamada a Google: cada tanda cuesta
  // plata real y la ruta no tenía ningún freno para un bucle automatizado. A
  // los que pagan los frena el saldo; a un usuario de `unlimited_users`, nada.
  //
  // Los topes son holgados (30/hora, 100/día): están para cortar un script, no
  // para racionar el uso legítimo.
  //
  // FAIL-OPEN a propósito: si la RPC falla, dejamos pasar. Mismo criterio que
  // `userHasPaidAccess` — un limitador roto no puede convertirse en una app
  // rota para el que sí quiere generar.
  const { data: rateRaw, error: rateErr } = await admin.rpc(
    "check_generation_rate_limit",
    { p_user_id: userId },
  );
  if (!rateErr) {
    // PostgREST devuelve el jsonb de una función escalar como objeto, pero
    // aceptamos [objeto] también: si eso cambiara y sólo leyéramos una forma,
    // el limitador quedaría mudo (siempre "allowed") sin que nadie se entere.
    const rate = (Array.isArray(rateRaw) ? rateRaw[0] : rateRaw) as {
      allowed?: boolean;
      limit_hour?: number;
      limit_day?: number;
    } | null;
    if (rate?.allowed === false) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: `Llegaste al máximo de tandas por ahora (${rate.limit_hour ?? 30} por hora). Esperá un rato y seguí.`,
          refunded: 0,
        },
        { status: 429 },
      );
    }
  }

  // 3. Pre-check de créditos (early reject, no gastamos en Google)
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .single();
  if (profileErr || !profile) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }
  // Usuarios ilimitados (allowlist) saltan el rechazo por saldo. El deduct de
  // abajo ya es no-op server-side para ellos.
  const { data: isUnlimitedRaw } = await admin.rpc("is_unlimited", {
    p_user_id: userId,
  });
  const isUnlimited = isUnlimitedRaw === true;
  if (!isUnlimited && (profile.credits_remaining ?? 0) < variations) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: `Necesitás ${variations} créditos y tenés ${profile.credits_remaining ?? 0}.`,
        creditsRemaining: profile.credits_remaining ?? 0,
        refunded: 0,
      },
      { status: 402 },
    );
  }

  // 4. Crear el row de generación (processing)
  const { data: generation, error: genErr } = await supabase
    .from("generations")
    .insert({
      user_id: userId,
      project_id: product.id,
      version_id: version.id,
      status: "processing",
      product_images: productImages,
      reference_images: referenceImages,
      user_prompt: userPrompt ?? null,
      output_ratio: ratio,
      variations_requested: variations,
    })
    .select("id")
    .single();
  if (genErr || !generation) {
    await alertAdmin({
      kind: "db_down",
      severity: "U",
      dedupeKey: "db_down:generations_insert",
      userId,
      details: { where: "POST /api/generations (insert generations)", error: genErr?.message ?? "sin fila" },
    });
    return NextResponse.json(dbDownBody(), { status: 503 });
  }
  const generationId = generation.id as string;
  const noticeKey = NOTICE_KEYS.batch(generationId);
  const batchRef = {
    generation_id: generationId,
    version_id: version.id as string,
    product: productName,
  };

  // 4.b Fotos del producto ANTES de reservar créditos: si ninguna se puede
  // leer (borradas del bucket, `blob:`/`data:`, formato raro), no hay producto
  // que fotografiar y cortamos acá SIN descontar nada. Va después del INSERT
  // (que usa el token del usuario, mientras está fresco). Los bytes bajados se
  // reusan para el Director y para las N imágenes.
  //   - v2: descarga única de fotos + referencias (spec §2.7).
  //   - v1: las fotos del producto (las referencias siguen best-effort).
  let v2Downloads: V2Downloads | null = null;
  let v1ProductParts: GeminiPart[] | null = null;
  let photosOk = true;
  if (pipeline === "v2") {
    v2Downloads = await downloadV2Inputs({ productImages, referenceImages });
    photosOk = v2Downloads.productPhotos.length > 0;
  } else {
    const prepared = await prepareProductParts(productImages);
    if (prepared.ok) v1ProductParts = prepared.parts;
    else photosOk = false;
  }
  if (!photosOk) {
    // Admin: la descarga pudo tardar y el token de Clerk vive ~60s.
    await closeGeneration(admin, generationId, {
      status: "failed",
      error_message: "no_readable_product_photos",
    });
    return NextResponse.json(photosUnreadableBody(), { status: 422 });
  }

  // 5. RESERVAR créditos: deduct + registro del cobro en `batch_charges`, en
  // una sola transacción (`charge_batch`, migración 0028). Mismos errores que
  // deduct_credits (el 402 se sigue distinguiendo por el mensaje).
  let { error: deductErr } = await admin.rpc("charge_batch", {
    p_user_id: userId,
    p_amount: variations,
    p_generation_id: generationId,
  });
  if (deductErr?.code === "PGRST202") {
    // La 0028 todavía no está aplicada (PostgREST no conoce la función): se
    // cobra como antes para no apagar las tandas. Sin fila en batch_charges, el
    // reaper no devuelve nada de esta tanda si se cuelga.
    console.error("[generations] charge_batch no existe (¿falta la 0028?): uso deduct_credits.");
    ({ error: deductErr } = await admin.rpc("deduct_credits", {
      p_user_id: userId,
      p_amount: variations,
      p_generation_id: generationId,
    }));
  }
  if (deductErr) {
    // Admin: la descarga de fotos (paso 4.b) corre ANTES del deduct y puede
    // tardar; el token de Clerk vive ~60s. El ownership ya quedó probado
    // arriba (versión y producto leídos con RLS).
    const insufficient = isInsufficientCreditsError(deductErr.message);
    await closeGeneration(admin, generationId, {
      status: "failed",
      error_message: insufficient ? "Créditos insuficientes" : "charge_failed",
    });
    if (insufficient) {
      return NextResponse.json(
        {
          error: "insufficient_credits",
          message: `No te alcanzan los créditos: esta tanda necesita ${variations}.`,
          refunded: 0,
        },
        { status: deductErrorStatus(deductErr.message) },
      );
    }
    // No es falta de saldo: es nuestro (base caída, timeout). Antes se le
    // decía "sin créditos" a alguien que tenía.
    await alertAdmin({
      kind: "charge_failed",
      severity: "U",
      dedupeKey: "charge_failed:generations",
      userId,
      details: { route: "POST /api/generations", error: deductErr.message },
    });
    return NextResponse.json(chargeFailedBody(), { status: 503 });
  }
  const charged = isUnlimited ? 0 : variations;

  // 6. Generar con la key propia. Las dos ramas terminan en `GenerationOutcome`,
  // así lo que sigue (refunds, uploads, respuesta) es uno solo para ambas.
  let result: GenerationOutcome;
  if (pipeline === "v2" && v2Downloads) {
    // v2 (lib/ai/v2/): notas cacheadas por hash + plan del Director sin
    // imágenes + prompt ensamblado por código. Si algo falla usa el fallback
    // determinístico de la spec (queda en plan_meta), NUNCA el texto de v1.
    // Las tablas de cache van por admin y son best-effort: sin la 0026 cada
    // lectura es un miss y la tanda sigue igual.
    const apiKey = process.env.GOOGLE_API_KEY?.trim() ?? "";
    if (!apiKey) {
      // Mismo resultado que v1 sin key: fallo total → devolución de abajo, y
      // la IA queda marcada caída (alerta U a Paolo).
      const missing: GeminiError = { kind: "missing_key" };
      await reportAiOutage(missing);
      result = { ok: false, error: missing, snapshot: null };
    } else {
      const deps = { apiKey, store: createSupabaseV2Store(), startedAt };
      try {
        const prep = await prepareV2(
          {
            userId,
            productId: product.id as string,
            versionId: version.id as string,
            productName: typeof product.name === "string" ? product.name : "",
            productDescription:
              typeof product.description === "string" ? product.description : null,
            productImages,
            referenceImages,
            // Autoritativo: el estilo persistido. El fragment del body solo se
            // usa si la versión no tiene style_id (búsqueda inversa).
            styleId: typeof version.style_id === "string" ? version.style_id : null,
            styleFragment,
            ratio,
            variations,
            userPrompt,
            brand,
          },
          v2Downloads,
          deps,
        );
        if (!prep.ok) {
          result = { ok: false, error: prep.error, snapshot: null };
        } else {
          const rendered = await renderV2(prep.prepared, deps);
          result = rendered.ok
            ? {
                ok: true,
                snapshot: rendered.snapshot,
                failures: rendered.failures,
                images: rendered.images.map((img) => ({
                  buffer: img.buffer,
                  contentType: img.contentType,
                  variationIndex: img.index,
                  metadata: img.metadata,
                })),
              }
            : { ok: false, error: rendered.error, snapshot: rendered.snapshot };
        }
      } catch (err) {
        // prepareV2/renderV2 están hechas para no lanzar. Si igual algo explota,
        // lo convertimos en fallo total: una excepción suelta ACÁ (entre el
        // deduct y el refund) le costaría los créditos al usuario.
        console.error("[pipeline-v2] unexpected_error", err);
        result = {
          ok: false,
          error: {
            kind: "unknown",
            message: err instanceof Error ? err.message : String(err),
          },
          snapshot: null,
        };
      }
    }
  } else {
    // v1 — el motor de siempre. Las fotos del producto ya se bajaron (4.b).
    // El estilo AUTORITATIVO es el persistido en la versión (style_id, migración
    // 0010): así el server no depende de lo que mande el cliente. Si la versión
    // no tiene estilo, caemos al styleFragment del body (compat / override).
    const versionStyleFragment = getStyleFragment(
      version.style_id as StyleId | null,
    );
    const effectiveStyleFragment = versionStyleFragment || styleFragment;
    const v1 = await generateOnServer({
      productImages,
      referenceImages,
      ratio,
      variations,
      userPrompt,
      styleFragment: effectiveStyleFragment,
      brand,
      productParts: v1ProductParts ?? undefined,
    });
    result = v1.ok
      ? {
          ok: true,
          snapshot: null,
          failures: v1.failures,
          images: v1.images.map((img, i) => ({
            buffer: img.buffer,
            contentType: img.contentType,
            variationIndex: i,
            // El prompt original/base (lo que produjo el modelo) queda
            // read-only acá; el estricto del usuario arranca vacío.
            metadata: { base_prompt: v1.finalPrompt },
          })),
        }
      : { ok: false, error: v1.error, snapshot: null };
  }

  // Si falló TODO.
  if (!result.ok) {
    const error = result.error;
    const outage = aiOutageCause(error) !== null;
    const snapshotPatch = result.snapshot ? { enriched_prompt: result.snapshot } : {};

    // a) Google bloqueó la ENTRADA (la foto o el pedido): NO se devuelve.
    //    Bloqueo de la SALIDA: se devuelve, salvo que el cliente ya pasó el tope
    //    de devoluciones por bloqueo de la salida (3 en 24 h): ahí se trata
    //    igual que la entrada bloqueada y se abre una alerta M.
    const outputCapped =
      charged > 0 && isOutputBlocked(error) && !(await claimOutputBlockRefund(userId));
    if (isInputBlocked(error) || outputCapped) {
      const notificationId = await notifyUser(userId, "input_blocked", batchRef, noticeKey);
      await closeGeneration(admin, generationId, {
        status: "failed",
        error_message: outputCapped ? "output_blocked_capped" : "input_blocked",
        ...snapshotPatch,
      });
      const blockDetails = {
        ...batchRef,
        charged,
        refunded: 0,
        block_reason: error.kind === "content_blocked" ? error.reason ?? null : null,
      };
      if (outputCapped) {
        await alertOutputBlockCapped({ userId, route: "POST /api/generations", details: blockDetails });
      } else {
        await alertAdmin({
          kind: "input_blocked",
          severity: "B",
          dedupeKey: `input_blocked:${generationId}`,
          userId,
          details: blockDetails,
        });
      }
      const body: AiRouteError = {
        error: "input_blocked",
        message: noticeText("input_blocked", batchRef),
        refunded: 0,
        notificationId,
      };
      return NextResponse.json(body, { status: 422 });
    }

    // b) Falla nuestra o de Google (incluye bloqueo de la SALIDA): se devuelve
    //    todo, con el aviso en la misma transacción. Ilimitados: aviso sin
    //    «te devolvimos» (su descuento fue no-op).
    const refund = await refundOrPend({
      userId,
      amount: variations,
      bucket: "generation",
      kind: "batch_failed",
      data: batchRef,
      noticeKey,
      generationId,
      versionId: version.id as string,
      product: productName,
    });
    await closeGeneration(admin, generationId, {
      status: "failed",
      error_message: error.kind,
      // v2: el snapshot (plan, notas, prompts) se guarda también en el fallo:
      // es justo el caso que hay que poder diagnosticar. v1: no se toca.
      ...snapshotPatch,
    });
    if (outage) await watchAiOutage(userId);
    await alertFailure({
      kind: "batch_failed",
      userId,
      dedupeKey: `batch_failed:${generationId}`,
      outage,
      details: {
        ...batchRef,
        charged,
        refunded: refund.refunded,
        delivered: 0,
        requested: variations,
        cause: error.kind,
        raw: describeGeminiError(error),
      },
    });
    const body: AiRouteError = {
      error: refund.status === "pending" ? "refund_pending" : "generation_failed",
      message: refund.message,
      refunded: refund.refunded,
      notificationId: refund.notificationId,
    };
    return NextResponse.json(body, { status: outage ? 503 : 502 });
  }

  // 7. Subir imágenes OK a Storage + insert en generated_images.
  //
  // TODO lo que va de acá para abajo usa el cliente ADMIN (service_role), no el
  // del usuario. Motivo, con evidencia de prod (2026-09-09): el token de sesión
  // de Clerk vive ~60s, pero esta ruta puede tardar hasta 300s (maxDuration). El
  // token llega con la request y NO se renueva mientras corre, así que para
  // cuando el Director + las imágenes terminan, ya venció. Storage rechazaba las
  // subidas con `400 · "exp" claim timestamp check failed` y la tanda entera
  // moría en `upload_failed` — con las imágenes YA generadas y pagadas.
  //
  // El ownership ya quedó probado ARRIBA: la versión y el producto se leyeron
  // con el token del usuario bajo RLS, y el `path` va namespaceado por `userId`,
  // que sale de `auth()` y no del body.
  //
  // Cada imagen se reintenta con los bytes en memoria (Storage, link firmado e
  // insert) y se lee el error del insert. Ver `persistGeneratedImage`.
  const urls: string[] = [];
  let keptWithoutRow = 0;
  const lost: Array<{ index: number; stage: PersistStage; error: string; ownerDeleted: boolean }> = [];
  for (const img of result.images) {
    const saved = await persistGeneratedImage(admin, {
      path: `${userId}/${generationId}/${img.variationIndex}.jpg`,
      buffer: img.buffer,
      contentType: img.contentType,
      row: {
        generation_id: generationId,
        user_id: userId,
        variation_index: img.variationIndex,
        // El prompt estricto del usuario arranca vacío; es lo que él edita luego.
        strict_prompt: "",
        // v1: { base_prompt } (el prompt original, read-only). v2: además
        // pipeline, plan_source, shot_index y model, para comparar el A/B.
        metadata: img.metadata,
      },
    });
    if (saved.ok) {
      urls.push(saved.url);
      await markImageSaved(admin, generationId);
    } else {
      if (saved.countsAsDelivered) {
        keptWithoutRow++;
        await markImageSaved(admin, generationId);
      }
      lost.push({
        index: img.variationIndex,
        stage: saved.stage,
        error: saved.error,
        ownerDeleted: saved.ownerDeleted === true,
      });
    }
  }

  // 8. Devolver las variaciones que NO quedaron guardadas (Google no las dio, o
  // las perdimos nosotros aun reintentando). Una imagen cuyo archivo no se pudo
  // borrar cuenta como entregada (JonSnow #1: nada de "imagen gratis").
  const delivered = urls.length;
  const refundCount = Math.max(0, variations - delivered - keptWithoutRow);
  const generationFailures = Math.max(0, variations - result.images.length);
  // El dueño borró la tanda mientras corría: no es una falla nuestra (sin
  // devolución por esas imágenes) y la alerta baja a B.
  const ownerDeleted = lost.length > 0 && lost.every((l) => l.ownerDeleted);
  const lostDetails =
    lost.length > 0
      ? {
          lost: lost.length,
          owner_deleted: lost.filter((l) => l.ownerDeleted).length,
          lost_stages: lost.map((l) => `${l.index}:${l.stage}`).join(", "),
          raw: lost.map((l) => l.error).join(" | ").slice(0, 900),
        }
      : {};

  // 9. Cerrar la generación. Con 0 imágenes guardadas no hay nada "completado":
  // queda failed y se devuelve todo.
  if (delivered === 0) {
    const refund =
      refundCount > 0
        ? await refundOrPend({
            userId,
            amount: refundCount,
            bucket: "generation",
            kind: "batch_failed",
            data: batchRef,
            noticeKey,
            generationId,
            versionId: version.id as string,
            product: productName,
          })
        : null;
    // Sin nada que devolver (archivos que no se pudieron borrar): el aviso
    // igual cierra la tanda.
    const notificationId =
      refund?.notificationId ??
      (await notifyUser(userId, "batch_failed", { ...batchRef, refunded: 0 }, noticeKey));
    await closeGeneration(admin, generationId, {
      status: "failed",
      error_message: "upload_failed",
      ...(result.snapshot ? { enriched_prompt: result.snapshot } : {}),
    });
    const uploadFailedDetails = {
      ...batchRef,
      charged,
      refunded: refund?.refunded ?? 0,
      delivered: 0,
      requested: variations,
      cause: ownerDeleted ? "owner_deleted" : "upload_failed",
      ...lostDetails,
    };
    if (ownerDeleted) {
      await alertAdmin({
        kind: "image_lost",
        severity: "B",
        dedupeKey: `image_lost:${generationId}`,
        userId,
        details: uploadFailedDetails,
      });
    } else {
      await alertFailure({
        kind: "batch_failed",
        userId,
        dedupeKey: `batch_failed:${generationId}`,
        details: uploadFailedDetails,
      });
    }
    const body: AiRouteError = {
      error: refund?.status === "pending" ? "refund_pending" : "generation_failed",
      message: refund?.message ?? noticeText("batch_failed", { ...batchRef, refunded: 0 }),
      refunded: refund?.refunded ?? 0,
      notificationId,
    };
    return NextResponse.json(body, { status: 502 });
  }

  // 9.b Entrega parcial o completa: el aviso `gen:<id>` cierra la tanda.
  let notificationId: string | null = null;
  let refunded = 0;
  let partialMessage: string | null = null;
  if (refundCount > 0) {
    const refund = await refundOrPend({
      userId,
      amount: refundCount,
      bucket: "generation",
      kind: "batch_partial",
      data: { ...batchRef, k: delivered, n: variations },
      noticeKey,
      generationId,
      versionId: version.id as string,
      product: productName,
    });
    notificationId = refund.notificationId;
    refunded = refund.refunded;
    partialMessage = refund.message;
    await alertFailure({
      kind: "batch_partial",
      userId,
      dedupeKey: `batch_partial:${generationId}`,
      details: {
        ...batchRef,
        charged,
        refunded,
        delivered,
        requested: variations,
        cause: generationFailures > 0 ? "generation" : "upload_failed",
        generation_failures: generationFailures,
        failures: result.failures.map(describeGeminiError).join(" | ").slice(0, 900) || null,
        ...lostDetails,
      },
    });
  } else {
    // Tanda completa. El aviso nace SIN leer: «Tus {k} fotos de {producto} ya
    // están en la Fábrica.» Va el `notificationId` en el 201 y la pantalla lo
    // marca leído solo si de verdad mostró la tanda. No se usa
    // `req.signal.aborted`: Next no garantiza que se active cuando el cliente
    // se va, y el aviso nacía leído justo para el que no estaba mirando.
    notificationId = await notifyUser(
      userId,
      "batch_ready",
      { ...batchRef, k: delivered },
      noticeKey,
    );
    if (lost.length > 0) {
      // Imágenes cuyo archivo quedó sin fila (no se pudo borrar, o el dueño
      // borró la tanda): cuentan como entregadas, pero Paolo tiene que saberlo.
      await alertAdmin({
        kind: "image_lost",
        severity: ownerDeleted ? "B" : "M",
        dedupeKey: `image_lost:${generationId}`,
        userId,
        details: { ...batchRef, delivered, requested: variations, ...lostDetails },
      });
    }
  }

  await closeGeneration(admin, generationId, {
    status: "completed",
    completed_at: new Date().toISOString(),
    // v2: snapshot completo (versiones de prompt, caso, hashes, plan,
    // plan_meta, prompts finales) en la columna que v1 nunca escribió.
    ...(result.snapshot ? { enriched_prompt: result.snapshot } : {}),
  });
  if (result.snapshot) {
    // Una línea por tanda v2 en los logs de Vercel: alcanza para ver en vivo
    // cuántas salen del Director y cuántas caen al fallback.
    console.info(
      "[pipeline-v2] generation_done",
      JSON.stringify({
        generationId,
        case: result.snapshot.case,
        plan_source: result.snapshot.plan_meta.plan_source,
        delivered,
        requested: variations,
        ms: Date.now() - startedAt,
      }),
    );
  }

  const { data: finalProfile } = await admin
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .single();
  const creditsRemaining =
    typeof finalProfile?.credits_remaining === "number" ? finalProfile.credits_remaining : null;
  // «Te quedan {n} créditos…» (1 a 4, una vez por compra), después de responder.
  runAfter(() =>
    maybeNotifyCreditsLow({ userId, balance: creditsRemaining, unlimited: isUnlimited }),
  );

  return NextResponse.json(
    {
      generationId,
      images: urls,
      delivered,
      requested: variations,
      // Cuántos créditos volvieron por las variaciones que no salieron. 0 para
      // un ilimitado (nunca pagó esa tanda) o si la devolución quedó en proceso.
      refunded,
      creditsRemaining,
      notificationId,
      // Solo en una entrega parcial: «Salieron {k} de {n} imágenes. Ya te
      // devolvimos {n−k} créditos por las que faltaron.»
      ...(partialMessage ? { message: partialMessage } : {}),
    },
    { status: 201 },
  );
}
