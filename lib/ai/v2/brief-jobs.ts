import "server-only";

/**
 * Trabajos EN SEGUNDO PLANO de las notas del pipeline v2 (spec §2.0 "Cómo se
 * escriben y se disparan"). Los corren `/api/briefs/product` y
 * `/api/briefs/reference` adentro de `after()`, o sea DESPUÉS de responder 202:
 * el usuario nunca espera esto.
 *
 * Por qué existe: la nota del producto tarda 10-20s. Si se calcula al subir las
 * fotos, cuando el usuario aprieta "Generar" ya está en cache y la tanda arranca
 * directo por el Director. Si no llegó a estar (o falló), la generación la
 * calcula sola (camino lazy): esto es una optimización, nunca un requisito.
 *
 * Reusa EXACTAMENTE las mismas piezas que la generación (`downloadV2Inputs`,
 * `ensureProductBrief`, `ensureReferenceBrief`): mismas URLs elegidas, mismo
 * hash → la nota que se calcula acá es la que la generación encuentra en cache.
 *
 * Idempotencia (lo que hace barato que el cliente dispare de más):
 *   1. Antes de DESCARGAR nada se calcula el hash "optimista" (asumiendo que
 *      todas las fotos bajan) y se busca en cache. Si está, se termina ahí: 0
 *      descargas, 0 llamadas a Gemini.
 *   2. Si no está, `ensure*` vuelve a mirar el cache con el hash REAL (el de las
 *      fotos que efectivamente bajaron) antes de llamar a Gemini.
 *   3. Dentro de una misma instancia, dos pedidos con el mismo hash al mismo
 *      tiempo corren UNA vez (set en memoria). Entre instancias no hay candado:
 *      la escritura es `on conflict do nothing` y el techo lo pone el tope por
 *      hora, que la RUTA reserva de forma atómica en la base ANTES de encolar
 *      (`reserveBriefQuota` → RPC check_brief_rate_limit de la 0026). Cuenta
 *      INTENTOS, no notas guardadas: una nota que falla también consume cupo.
 *
 * Nada de esto lanza: todo error se loguea y el trabajo termina.
 */

import { isGeminiBillingExhausted } from "@/lib/ai/gemini-client";
import {
  BRIEFS_PER_USER_PER_HOUR,
  PRODUCT_BRIEF_MAX_PHOTOS,
  PRODUCT_DOWNLOAD_CANDIDATES,
  REF_MAX_PROCESSED,
  TIMEOUTS,
} from "@/lib/ai/v2/constants";
import {
  downloadV2Inputs,
  ensureProductBrief,
  ensureReferenceBrief,
  type BriefDeps,
} from "@/lib/ai/v2/generate-v2";
import { productBriefHash, refBriefHash, urlKey } from "@/lib/ai/v2/hash";
import { partitionUrls } from "@/lib/ai/v2/sanitize";
import type { V2Store } from "@/lib/ai/v2/store";
import { defaultV2Logger } from "@/lib/ai/v2/types";

/**
 * Reserva hasta `cost` notas del tope de 40 por hora (spec §2.0) ANTES de
 * encolar el trabajo. Desvío de la spec ("se cuentan filas con created_at"):
 * contar filas guardadas y encolar después era check-then-act. N pedidos en
 * paralelo veían el mismo cupo (las filas recién aparecen 10-45s después, cuando
 * termina Gemini) y una nota que fallaba nunca contaba. Devuelve lo reservado
 * (0 = sin cupo) o `null` = no se pudo reservar (típicamente: la 0026 no está
 * aplicada) → la ruta responde 503 sin gastar nada.
 */
export async function reserveBriefQuota(store: V2Store, userId: string, cost: number): Promise<number | null> {
  if (cost < 1) return 0;
  return store.reserveBriefQuota(userId, Math.min(cost, BRIEFS_PER_USER_PER_HOUR), BRIEFS_PER_USER_PER_HOUR);
}

// Claves de trabajos corriendo en ESTA instancia (ver punto 3 del encabezado).
const inFlight = new Set<string>();

function claim(key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

/** Mismo recorte que `downloadV2Inputs`: dedupe + primeras N candidatas permitidas. */
function httpCandidates(urls: unknown, max: number): string[] {
  return [...new Set(partitionUrls(urls).http)].slice(0, max);
}

/** Hash "optimista" de la nota del producto (asumiendo que todas las candidatas bajan). */
function optimisticProductHash(args: {
  productName: string;
  productDescription: string | null;
  productImages: unknown;
}): string | null {
  const candidates = httpCandidates(args.productImages, PRODUCT_DOWNLOAD_CANDIDATES);
  if (candidates.length === 0) return null;
  return productBriefHash(args.productName, args.productDescription, candidates.slice(0, PRODUCT_BRIEF_MAX_PHOTOS));
}

/**
 * Lo mira la ruta ANTES de reservar cupo: el cliente dispara de más (cada
 * guardado), y un disparo que va a terminar en cache hit, o que no tiene ninguna
 * foto que se pueda bajar, no tiene por qué comerse una nota del tope.
 */
export async function productBriefPrecheck(
  store: V2Store,
  args: { productId: string; productName: string; productDescription: string | null; productImages: unknown },
): Promise<"no_photos" | "cached" | "needed"> {
  const hash = optimisticProductHash(args);
  if (!hash) return "no_photos";
  return (await store.getProductBrief(args.productId, hash)) ? "cached" : "needed";
}

/** Referencias de la versión SIN nota (máx 5): es el costo que la ruta reserva. */
export async function referenceBriefMisses(
  store: V2Store,
  args: { productId: string; productName: string; referenceImages: unknown },
): Promise<string[]> {
  const misses: string[] = [];
  for (const url of httpCandidates(args.referenceImages, REF_MAX_PROCESSED)) {
    if (!(await store.getReferenceBrief(args.productId, refBriefHash(args.productName, url)))) misses.push(url);
  }
  return misses;
}

/* -------------------------------------------------------------------------- */
/*  Nota del producto                                                           */
/* -------------------------------------------------------------------------- */

export async function runProductBriefJob(
  args: {
    userId: string;
    productId: string;
    productName: string;
    productDescription: string | null;
    /** Crudo de `projects.product_images`: puede traer `blob:`/`data:`. */
    productImages: unknown;
  },
  deps: BriefDeps,
): Promise<void> {
  const log = deps.log ?? defaultV2Logger;
  const base = { productId: args.productId };
  try {
    // Sin saldo en Google (lo vio esta instancia hace <2 min): ni descargas ni
    // nota. La ruta ya corta antes de reservar cupo; esto cubre el hueco entre
    // la reserva y el after().
    if (isGeminiBillingExhausted()) {
      log("brief_job_skipped", { ...base, kind: "product", reason: "billing" });
      return;
    }
    // Hash optimista: si todas las candidatas bajan, la nota ve las primeras 8.
    const optimisticHash = optimisticProductHash(args);
    if (!optimisticHash) {
      log("brief_job_skipped", { ...base, kind: "product", reason: "no_http_photos" });
      return;
    }
    const key = `pb:${args.productId}:${optimisticHash}`;
    if (!claim(key)) {
      log("brief_job_skipped", { ...base, kind: "product", reason: "in_flight" });
      return;
    }
    try {
      const cached = await deps.store.getProductBrief(args.productId, optimisticHash);
      if (cached) {
        log("brief_job_cache_hit", { ...base, kind: "product" });
        return;
      }

      const downloads = await downloadV2Inputs(
        { productImages: args.productImages, referenceImages: [] },
        { log },
      );
      if (downloads.productPhotos.length === 0) {
        log("brief_job_skipped", { ...base, kind: "product", reason: "no_readable_photos" });
        return;
      }

      const outcome = await ensureProductBrief(
        {
          productId: args.productId,
          userId: args.userId,
          productName: args.productName,
          productDescription: args.productDescription,
          photos: downloads.productPhotos,
        },
        deps,
        { timeoutMs: TIMEOUTS.briefBackground },
      );
      log("brief_job_done", {
        ...base,
        kind: "product",
        source: outcome.source,
        ms: outcome.ms,
        error: outcome.error,
      });
    } finally {
      inFlight.delete(key);
    }
  } catch (err) {
    log("brief_job_error", {
      ...base,
      kind: "product",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Notas de las referencias                                                    */
/* -------------------------------------------------------------------------- */

export async function runReferenceBriefJob(
  args: {
    userId: string;
    productId: string;
    versionId: string;
    productName: string;
    /** Crudo de `versions.reference_images`. */
    referenceImages: unknown;
    /** Cuántas notas NUEVAS se pueden calcular sin pasar el tope por hora. */
    maxToCompute: number;
  },
  deps: BriefDeps,
): Promise<void> {
  const log = deps.log ?? defaultV2Logger;
  const base = { productId: args.productId, versionId: args.versionId };
  const claimed: string[] = [];
  try {
    if (isGeminiBillingExhausted()) {
      log("brief_job_skipped", { ...base, kind: "reference", reason: "billing" });
      return;
    }
    const urls = httpCandidates(args.referenceImages, REF_MAX_PROCESSED);
    if (urls.length === 0) {
      log("brief_job_skipped", { ...base, kind: "reference", reason: "no_http_refs" });
      return;
    }

    // Solo se descargan las referencias SIN nota: una versión con 5 refs a la
    // que le sacaron una no vuelve a pagar las otras 4.
    const misses: string[] = [];
    for (const url of urls) {
      const hash = refBriefHash(args.productName, url);
      const key = `rb:${args.productId}:${hash}`;
      if (inFlight.has(key)) continue;
      const cached = await deps.store.getReferenceBrief(args.productId, hash);
      if (cached) continue;
      if (misses.length >= args.maxToCompute) {
        log("brief_job_quota_cut", { ...base, kind: "reference", url: urlKey(url) });
        continue;
      }
      if (!claim(key)) continue;
      claimed.push(key);
      misses.push(url);
    }
    if (misses.length === 0) {
      log("brief_job_cache_hit", { ...base, kind: "reference", refs: urls.length });
      return;
    }

    const downloads = await downloadV2Inputs({ productImages: [], referenceImages: misses }, { log });
    const outcomes = await Promise.all(
      downloads.refs.map((image) =>
        ensureReferenceBrief(
          { productId: args.productId, userId: args.userId, productName: args.productName, image },
          deps,
          { timeoutMs: TIMEOUTS.briefBackground },
        ),
      ),
    );
    log("brief_job_done", {
      ...base,
      kind: "reference",
      requested: misses.length,
      downloaded: downloads.refs.length,
      sources: outcomes.map((o) => o.source),
    });
  } catch (err) {
    log("brief_job_error", {
      ...base,
      kind: "reference",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    for (const key of claimed) inFlight.delete(key);
  }
}
