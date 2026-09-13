import { NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { productBriefRequestSchema } from "@/lib/validations/briefs";
import { isPipelineV2User } from "@/lib/ai/v2/constants";
import { isGeminiBillingExhausted } from "@/lib/ai/gemini-client";
import {
  productBriefPrecheck,
  reserveBriefQuota,
  runProductBriefJob,
} from "@/lib/ai/v2/brief-jobs";
import { createSupabaseV2Store } from "@/lib/ai/v2/store-supabase";

/**
 * POST /api/briefs/product { productId } — calcula EN SEGUNDO PLANO la nota del
 * producto del pipeline v2 (spec §2.0).
 *
 * Lo dispara el browser (fire-and-forget, keepalive) después de dar de alta un
 * producto o de cambiarle las fotos. Responde 202 al instante y hace el trabajo
 * en `after()`, así la UI no espera nada.
 *
 * Respuestas:
 *   204 — el usuario no está en la v2: no se hace nada ni se gasta nada.
 *   200 — nada que calcular (la nota ya está en cache, o ninguna foto se puede
 *         bajar): no se reserva cupo ni se llama a Gemini.
 *   202 — encolado, con UNA nota ya reservada del tope.
 *   401/403/404/422 — sin sesión, sin compra, producto ajeno/inexistente, body.
 *   429 — pasó el tope de 40 notas por hora.
 *   503 — no se puede reservar el cupo ni guardar la nota (0026 ausente o sin
 *         key de Google): calcularla sería tirar la plata.
 */

// `after()` corre dentro de la duración de la ruta. Peor caso del trabajo:
// descarga (20s de timeout) + nota (75s) + guardado. 120s deja margen.
export const maxDuration = 120;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Primero el flag: el cliente dispara esto para TODOS los usuarios (no conoce
  // el flag, que es server-only). A quien corre v1 le cortamos acá, antes de
  // cualquier consulta a la base.
  if (!isPipelineV2User(userId)) {
    return new NextResponse(null, { status: 204 });
  }
  // Cada nota es una llamada paga a Gemini: mismo candado paga-primero que las
  // APIs de generación y análisis.
  if (!(await userHasPaidAccess(userId))) {
    return NextResponse.json(
      { error: "Necesitás una compra activa para usar esta función." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = productBriefRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { productId } = parsed.data;

  // Ownership con el token del USUARIO (RLS): si el producto no es suyo, para
  // PostgREST no existe. Recién después de esto se usa el cliente admin.
  const supabase = await createClient();
  const { data: product, error: productErr } = await supabase
    .from("projects")
    .select("id, name, description, product_images")
    .eq("id", productId)
    .maybeSingle();
  if (productErr || !product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "briefs_unavailable" }, { status: 503 });
  }
  // Sin saldo en Google: la nota fallaría igual. Se corta ANTES de reservar
  // cupo, así el usuario no pierde notas del tope por hora.
  if (isGeminiBillingExhausted()) {
    return NextResponse.json(
      { error: "briefs_unavailable", reason: "ai_billing_exhausted" },
      { status: 503 },
    );
  }

  const store = createSupabaseV2Store();
  const job = {
    userId,
    productId,
    productName: typeof product.name === "string" ? product.name : "",
    productDescription:
      typeof product.description === "string" ? product.description : null,
    productImages: product.product_images as unknown,
  };

  // Antes de reservar: un disparo que termina en cache hit (el cliente dispara
  // en cada guardado) o sin fotos bajables no gasta nada, ni cupo.
  const pre = await productBriefPrecheck(store, job);
  if (pre !== "needed") {
    return NextResponse.json({ queued: false, reason: pre }, { status: 200 });
  }

  // Reserva ATÓMICA en la base ANTES de encolar: contar filas guardadas dejaba
  // pasar una ráfaga paralela (todas veían el mismo cupo) y las notas que
  // fallaban no contaban nunca.
  const granted = await reserveBriefQuota(store, userId, 1);
  if (granted === null) {
    // No se pudo reservar = no se puede leer ni escribir el cache (lo típico:
    // la 0026 no está aplicada). Una nota que no se guarda no le sirve a nadie.
    return NextResponse.json({ error: "briefs_unavailable" }, { status: 503 });
  }
  if (granted < 1) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Admin adentro (vía el store): el token de Clerk vence a los ~60s y esto
  // termina después de responder.
  after(() => runProductBriefJob(job, { apiKey, store }));

  return NextResponse.json({ queued: true }, { status: 202 });
}
