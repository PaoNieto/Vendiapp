/**
 * Orquestación del pipeline v2 (spec §2.6 "Orquestación").
 *
 *   1. Descarga ÚNICA en paralelo de fotos de producto y referencias. Los parts
 *      inlineData se reusan en las notas lazy y en las N llamadas de imagen (v1
 *      bajaba cada foto dos veces, en serie).
 *   2. Notas por hash (cache); las que faltan se calculan lazy EN PARALELO
 *      (35-75s, según lo que quede del presupuesto de la ruta).
 *   3. Caso + plan por hash; si no está: Director (45s) → validación → reintento
 *      condicional (solo con ≥130s de presupuesto) → fallback determinístico.
 *   4. Ensamblado puro (compose.ts) → N llamadas de imagen en paralelo con
 *      `imageConfig` nativo → post-proceso → snapshot.
 *
 * Tres fases exportadas por separado para que la ruta pueda abortar ANTES de
 * descontar créditos si no hay ninguna foto legible (`downloadV2Inputs`), y una
 * función que las encadena (`generateV2`). Dependencias inyectables (store,
 * callGemini, fetch, post-proceso, reloj): el A/B corre esto sin base de datos.
 *
 * Todo lo que toca las tablas nuevas es best-effort: un error del store es un
 * cache miss logueado, nunca una tanda caída.
 */

import {
  callGemini,
  isGeminiBillingExhausted,
  type GeminiError,
  type GeminiPart,
  type GeminiResponse,
} from "@/lib/ai/gemini-client";
import { enforceRatioServer, RATIO_TARGETS, type GeneratedImageBuffer } from "@/lib/ai/generate-server";
import { MAX_VARIATIONS, type OutputRatio } from "@/lib/constants";
import type { BrandContext } from "@/lib/validations/generations";
import { buildImageParts, type AssembledBatch } from "@/lib/ai/v2/assemble";
import { assembleV2, fallbackPlanFor, frameV2, type ComposeContext, type ComposeFrame } from "@/lib/ai/v2/compose";
import {
  ASSEMBLY_VERSION,
  DIRECTOR_PROMPT_VERSION,
  DIRECTOR_RETRY_MIN_REMAINING_MS,
  GEMINI_IMAGE_MODEL_V2,
  GEMINI_IMAGE_MODEL_V2_FALLBACK,
  IMAGE_SIZE_V2,
  lazyBriefTimeoutMs,
  MAX_IMAGE_BYTES,
  PIPELINE_V2_VERSION,
  PRODUCT_BRIEF_MAX_PHOTOS,
  PRODUCT_BRIEF_PROMPT_VERSION,
  PRODUCT_DOWNLOAD_CANDIDATES,
  RATIO_TOLERANCE,
  REF_BRIEF_PROMPT_VERSION,
  REF_MAX_PROCESSED,
  ROUTE_BUDGET_MS,
  STYLE_LOCK_OVER_REFERENCE,
  STYLE_SPLIT_VERSION,
  TIMEOUTS,
} from "@/lib/ai/v2/constants";
import { buildRetryFeedback, runDirector, type Plan } from "@/lib/ai/v2/director";
import type { V2CallError } from "@/lib/ai/v2/gemini-json";
import { noteContentHash, planHash, productBriefHash, refBriefHash, urlKey } from "@/lib/ai/v2/hash";
import { normalizeProductBrief, runProductBrief, type ProductBrief } from "@/lib/ai/v2/product-brief";
import { normalizeReferenceBrief, runReferenceBrief, type ReferenceBrief } from "@/lib/ai/v2/reference-brief";
import { partitionUrls } from "@/lib/ai/v2/sanitize";
import type { V2Store } from "@/lib/ai/v2/store";
import { resolveStyle, type ResolvedStyle } from "@/lib/ai/v2/style-parts";
import {
  defaultV2Logger,
  type CallGeminiFn,
  type CaseKind,
  type InlineImage,
  type PlanSource,
  type V2Logger,
} from "@/lib/ai/v2/types";
import { validatePlan, type PlanValidationContext } from "@/lib/ai/v2/validate-plan";

// Re-export de la capa pura, para que un solo import sirva a la ruta y al A/B.
export { assembleV2, composeV2, decideCase, fallbackPlanFor, frameV2 } from "@/lib/ai/v2/compose";
export type { ComposeContext, ComposeFrame } from "@/lib/ai/v2/compose";

/* -------------------------------------------------------------------------- */
/*  Tipos públicos                                                              */
/* -------------------------------------------------------------------------- */

export type GenerateV2Input = {
  userId: string;
  productId: string;
  versionId: string;
  productName: string;
  productDescription?: string | null;
  /** Crudos de la base: pueden traer `blob:`/`data:`, se filtran acá. */
  productImages: unknown;
  referenceImages: unknown;
  /** `versions.style_id` (autoritativo). */
  styleId: string | null;
  /** Solo se usa si `styleId` es null (búsqueda inversa en el catálogo). */
  styleFragment?: string;
  ratio: OutputRatio;
  variations: number;
  userPrompt?: string | null;
  brand?: BrandContext;
};

export type PostProcessed = {
  buffer: Buffer;
  contentType: "image/jpeg";
  ratioMismatch: boolean;
  width?: number;
  height?: number;
};
export type PostProcessFn = (buf: Buffer, ratio: OutputRatio, mimeType: string) => Promise<PostProcessed>;

export type GenerateV2Deps = {
  /** Key propia de Vendí (`process.env.GOOGLE_API_KEY`), la pasa la ruta. */
  apiKey: string;
  store: V2Store;
  call?: CallGeminiFn;
  fetchImpl?: typeof fetch;
  postProcess?: PostProcessFn;
  log?: V2Logger;
  now?: () => number;
  /** `Date.now()` al entrar la request: el reintento del Director mira el presupuesto de la RUTA. */
  startedAt?: number;
  /** Variante B del A/B: mismas imágenes sin las etiquetas "Image N: …". Default true. */
  interleaveLabels?: boolean;
  /** Override del modelo de imagen (A/B con el mismo modelo en v1 y v2). */
  imageModel?: string;
  /** Solo pruebas offline: política de URLs. En producción es `isAllowedImageUrl`. */
  allowUrl?: (url: unknown) => boolean;
};

export type BriefDeps = Pick<GenerateV2Deps, "apiKey" | "store" | "call" | "log">;

export type FailedDownload = { kind: "product" | "reference"; url: string; error: string };

export type V2Downloads = {
  /** Las primeras 8 fotos de producto que bajaron, en orden: las que ve la nota (photo_index 1..P). */
  productPhotos: InlineImage[];
  /** Referencias que bajaron, en orden de la versión (máx 5). */
  refs: InlineImage[];
  skippedUrls: string[];
  failedDownloads: FailedDownload[];
};

export type ProductBriefOutcome = {
  hash: string | null;
  brief: ProductBrief | null;
  source: "cache" | "computed" | "failed" | "no_photos";
  error?: string;
  /** Tipo de la falla (`billing`, `network`, `bad_json`, `exception`…), para decidir qué hacer. */
  errorKind?: string;
  ms?: number;
};

export type ReferenceBriefOutcome = {
  url: string;
  hash: string;
  brief: ReferenceBrief | null;
  source: "cache" | "computed" | "failed";
  error?: string;
  /** Tipo de la falla: separa "la nota falló por el servicio" (G2) de "la imagen no sirve". */
  errorKind?: string;
  ms?: number;
};

export type PlanMeta = {
  plan_source: PlanSource;
  repairs: string[];
  dropped_refs: Array<{ url: string; reason: string }>;
  /**
   * G2 (v2.2): la referencia que viajó al modelo de imagen SIN nota (su nota
   * falló por un error transitorio o de servicio) con un rol genérico. Vacío si
   * no pasó.
   */
  ref_without_note: Array<{ url: string; reason: string }>;
  skipped_urls: string[];
  failed_downloads: FailedDownload[];
  selected_photos: number[];
  director_error: string | null;
  director_attempts: number;
  style_source: ResolvedStyle["source"];
  style_unmatched_fragment: boolean;
  style_lock_over_reference: boolean;
  effective_lock: boolean;
  cache: {
    product_brief: ProductBriefOutcome["source"];
    ref_briefs: Array<ReferenceBriefOutcome["source"]>;
    plan: "hit" | "miss" | "skipped";
  };
  /** Timeout que tuvieron las notas lazy de esta tanda (depende de lo que quedaba de la ruta). */
  lazy_brief_timeout_ms: number;
  image_model?: string;
  ratio_mismatch?: number[];
  /** Una entrada por imagen que falló: índice en la tanda, tipo y detalle. */
  image_failures?: Array<{ index: number; kind: string; detail: string }>;
};

/** Va a `generations.enriched_prompt`. */
export type V2Snapshot = {
  pipeline: "v2";
  versions: { pipeline: string; pb: string; rb: string; dir: string; ss: string; asm: string };
  case: CaseKind;
  planHash: string | null;
  productBriefHash: string | null;
  refBriefHashes: string[];
  plan: Plan;
  plan_meta: PlanMeta;
  final_prompts: string[];
};

export type V2Prepared = {
  input: GenerateV2Input;
  frame: ComposeFrame;
  plan: Plan;
  planSource: PlanSource;
  batch: AssembledBatch;
  images: { productPhotos: InlineImage[]; refs: InlineImage[] };
  snapshot: V2Snapshot;
};

/** Va a `generated_images.metadata`. */
export type V2ImageMetadata = {
  base_prompt: string;
  pipeline: "v2";
  plan_source: PlanSource;
  shot_index: number;
  model: string;
};

export type V2GeneratedImage = GeneratedImageBuffer & {
  /** Índice de la imagen en la tanda (0..N-1), el mismo `i` del prompt. */
  index: number;
  metadata: V2ImageMetadata;
  ratioMismatch: boolean;
};

export type GenerateV2Result =
  | { ok: true; images: V2GeneratedImage[]; failures: GeminiError[]; finalPrompt: string; snapshot: V2Snapshot }
  | { ok: false; error: GeminiError; snapshot: V2Snapshot | null };

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function describeError(e: { kind: string; message?: unknown; reason?: unknown }): string {
  const extra = e.message ?? e.reason;
  return extra ? `${e.kind}: ${String(extra).slice(0, 200)}` : e.kind;
}

function normalizeError(err: unknown): GeminiError {
  if (err && typeof err === "object" && "kind" in err) return err as GeminiError;
  if (err instanceof Error) return { kind: "unknown", message: err.message };
  return { kind: "unknown", message: String(err) };
}

/** El store promete no lanzar; igual lo envolvemos: un store roto es un miss. */
async function safeStore<T>(fn: () => Promise<T>, log: V2Logger, op: string): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    log("store_error", { op, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Imágenes: descarga, mime, tamaño                                            */
/* -------------------------------------------------------------------------- */

const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Mime por los bytes (Storage a veces responde `application/octet-stream`). */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp" && /hei[cfsx]|mif1|msf1/.test(buf.toString("ascii", 8, 12))) {
    return "image/heic";
  }
  return null;
}

/** Ancho/alto leyendo el header (PNG, JPEG, WEBP), sin decodificar la imagen. */
export function readImageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
      return null;
    }
    if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Lee el cuerpo cortando apenas pasa `maxBytes`. `arrayBuffer()` acumulaba sin
 * techo: un stream infinito × 17 descargas en paralelo durante 20s podía tirar
 * la instancia por memoria, y en Fluid compute eso mata requests de otros
 * usuarios que ya pasaron el deduct y todavía no llegaron al refund.
 */
async function readCapped(res: Response, maxBytes: number, controller: AbortController): Promise<Buffer> {
  if (!res.body) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error(`archivo demasiado grande (${ab.byteLength} bytes)`);
    return Buffer.from(ab);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      controller.abort();
      await reader.cancel().catch(() => undefined);
      throw new Error(`archivo demasiado grande (más de ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

export async function downloadImage(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
): Promise<InlineImage> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? MAX_IMAGE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUTS.download);
  try {
    // `redirect: "error"`: Storage responde el archivo directo. Seguir un 3xx
    // podía llevar la descarga a cualquier host y anulaba el allowlist de URLs.
    const res = await fetchImpl(url, { signal: controller.signal, redirect: "error" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? "");
    if (declared > maxBytes) throw new Error(`archivo demasiado grande (${declared} bytes)`);
    const buf = await readCapped(res, maxBytes, controller);
    if (buf.length === 0) throw new Error("archivo vacío");
    const header = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const mimeType = sniffImageMime(buf) ?? (SUPPORTED_MIME.has(header) ? header : null);
    if (!mimeType) throw new Error(`formato no soportado (${header || "desconocido"})`);
    return { url, mimeType, data: buf.toString("base64"), bytes: buf.length };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * FASE 1 — descarga única, en paralelo. Cada URL distinta se baja UNA vez
 * aunque aparezca repetida. Producto: las primeras 12 candidatas http(s), se
 * quedan las primeras 8 que bajaron (en orden); referencias: las primeras 5.
 *
 * Los endpoints de notas usan esta MISMA función, así el hash de la nota
 * calculada en segundo plano coincide con el de la generación.
 */
// En el snapshot (que el usuario lee por RLS en generations.enriched_prompt) va
// SOLO este código: el detalle ("HTTP 403", "formato no soportado (text/html)",
// timeout) servía de oráculo para escanear hosts. El detalle queda en el log.
const DOWNLOAD_FAILED = "download_failed";

export async function downloadV2Inputs(
  input: { productImages: unknown; referenceImages: unknown },
  deps: Pick<GenerateV2Deps, "fetchImpl" | "log" | "allowUrl"> = {},
): Promise<V2Downloads> {
  const log = deps.log ?? defaultV2Logger;
  const prod = partitionUrls(input.productImages, deps.allowUrl);
  const refs = partitionUrls(input.referenceImages, deps.allowUrl);
  const productUrls = [...new Set(prod.http)].slice(0, PRODUCT_DOWNLOAD_CANDIDATES);
  const refUrls = [...new Set(refs.http)].slice(0, REF_MAX_PROCESSED);

  const cache = new Map<string, Promise<InlineImage>>();
  const get = (u: string) => {
    let p = cache.get(u);
    if (!p) {
      p = downloadImage(u, { fetchImpl: deps.fetchImpl });
      cache.set(u, p);
    }
    return p;
  };
  const [prodSettled, refSettled] = await Promise.all([
    Promise.allSettled(productUrls.map(get)),
    Promise.allSettled(refUrls.map(get)),
  ]);

  const failedDownloads: FailedDownload[] = [];
  const failedDetail: FailedDownload[] = [];
  const fail = (kind: FailedDownload["kind"], url: string, reason: unknown) => {
    failedDownloads.push({ kind, url: urlKey(url), error: DOWNLOAD_FAILED });
    failedDetail.push({ kind, url: urlKey(url), error: String((reason as Error)?.message ?? reason) });
  };
  const productPhotos: InlineImage[] = [];
  prodSettled.forEach((s, k) => {
    if (s.status === "fulfilled") productPhotos.push(s.value);
    else fail("product", productUrls[k], s.reason);
  });
  const refImages: InlineImage[] = [];
  refSettled.forEach((s, k) => {
    if (s.status === "fulfilled") refImages.push(s.value);
    else fail("reference", refUrls[k], s.reason);
  });

  const skippedUrls = [...prod.skipped, ...refs.skipped];
  if (skippedUrls.length || failedDetail.length) {
    log("downloads_incomplete", { skipped: skippedUrls.length, failed: failedDetail });
  }
  return {
    productPhotos: productPhotos.slice(0, PRODUCT_BRIEF_MAX_PHOTOS),
    refs: refImages,
    skippedUrls,
    failedDownloads,
  };
}

/* -------------------------------------------------------------------------- */
/*  Notas (cache por hash + cálculo)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Nota del producto: cache por hash → si no, se calcula y se guarda. Nunca lanza.
 * La usan la generación (lazy, 35-75s) y el endpoint en segundo plano (75s).
 */
export async function ensureProductBrief(
  args: {
    productId: string;
    userId: string;
    productName: string;
    productDescription?: string | null;
    photos: InlineImage[];
  },
  deps: BriefDeps,
  opts: { timeoutMs: number; thinkingLevel?: "low" | "medium" },
): Promise<ProductBriefOutcome> {
  const log = deps.log ?? defaultV2Logger;
  const photos = args.photos.slice(0, PRODUCT_BRIEF_MAX_PHOTOS);
  if (photos.length === 0) return { hash: null, brief: null, source: "no_photos" };
  const hash = productBriefHash(args.productName, args.productDescription, photos.map((p) => p.url));
  try {
    const cached = await safeStore(() => deps.store.getProductBrief(args.productId, hash), log, "get_product_brief");
    if (cached) {
      const n = normalizeProductBrief(cached, photos.length);
      if (n.ok) return { hash, brief: n.value, source: "cache" };
      log("product_brief_cache_invalid", { productId: args.productId, error: n.error });
    }
    // Sin saldo en Google (esta instancia lo vio hace <2 min): la nota fallaría
    // igual. Un cache hit sí se sirve (arriba): no cuesta nada.
    if (isGeminiBillingExhausted()) {
      log("product_brief_skipped", { productId: args.productId, reason: "billing" });
      return { hash, brief: null, source: "failed", error: "billing: sin saldo en Google (no se llamó)", errorKind: "billing" };
    }
    const t0 = Date.now();
    const r = await runProductBrief({
      apiKey: deps.apiKey,
      photos,
      productName: args.productName,
      productDescription: args.productDescription,
      timeoutMs: opts.timeoutMs,
      thinkingLevel: opts.thinkingLevel,
      call: deps.call,
      log,
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const error = describeError(r.error);
      log("product_brief_failed", { productId: args.productId, error, ms });
      return { hash, brief: null, source: "failed", error, errorKind: r.error.kind, ms };
    }
    log("product_brief_computed", { productId: args.productId, ms, mode: r.mode, usage: r.usage });
    await safeStore(
      () =>
        deps.store.putProductBrief({
          productId: args.productId,
          userId: args.userId,
          inputsHash: hash,
          photoUrls: photos.map((p) => p.url),
          brief: r.brief,
        }),
      log,
      "put_product_brief",
    );
    // Releer la fila: si otra corrida (after() o una tanda en paralelo) ganó la
    // carrera, `on conflict do nothing` descartó la nuestra y la que vale es la
    // guardada. Usarla deja a esta tanda alineada con las siguientes (misma nota
    // → mismo hash de plan → cache hit). Sin la 0026 la lectura es un miss y se
    // sigue con la calculada.
    const persisted = await safeStore(() => deps.store.getProductBrief(args.productId, hash), log, "reread_product_brief");
    if (persisted) {
      const n = normalizeProductBrief(persisted, photos.length);
      if (n.ok) {
        if (noteContentHash(n.value) !== noteContentHash(r.brief)) {
          log("product_brief_race_lost", { productId: args.productId });
        }
        return { hash, brief: n.value, source: "computed", ms };
      }
    }
    return { hash, brief: r.brief, source: "computed", ms };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log("product_brief_failed", { productId: args.productId, error });
    return { hash, brief: null, source: "failed", error, errorKind: "exception" };
  }
}

/**
 * Tipo de la falla de la nota de una referencia. Un 400 (o 413) que sobrevivió
 * al reintento de formato de gemini-json dice "este pedido no se puede
 * procesar": típicamente la IMAGEN ("Unable to process input image"). No es
 * transitorio: si esa referencia viajara igual (G2), las N llamadas de imagen
 * darían el mismo 400 y se caería la tanda entera. `bad_request` no está en
 * TRANSIENT_NOTE_FAILURES → se descarta, como antes de G2.
 */
function referenceNoteFailureKind(err: { kind: string; message?: unknown }): string {
  return err.kind === "unknown" && /^HTTP 4(?:00|13)\b/.test(String(err.message ?? "")) ? "bad_request" : err.kind;
}

/** Nota de UNA referencia. Por producto + URL (no por versión). Nunca lanza. */
export async function ensureReferenceBrief(
  args: { productId: string; userId: string; productName: string; image: InlineImage },
  deps: BriefDeps,
  opts: { timeoutMs: number },
): Promise<ReferenceBriefOutcome> {
  const log = deps.log ?? defaultV2Logger;
  const url = args.image.url;
  const hash = refBriefHash(args.productName, url);
  try {
    const cached = await safeStore(() => deps.store.getReferenceBrief(args.productId, hash), log, "get_reference_brief");
    if (cached) {
      const n = normalizeReferenceBrief(cached);
      if (n.ok) return { url, hash, brief: n.value, source: "cache" };
      log("reference_brief_cache_invalid", { productId: args.productId, error: n.error });
    }
    if (isGeminiBillingExhausted()) {
      log("reference_brief_skipped", { productId: args.productId, url: urlKey(url), reason: "billing" });
      return { url, hash, brief: null, source: "failed", error: "billing: sin saldo en Google (no se llamó)", errorKind: "billing" };
    }
    const t0 = Date.now();
    const r = await runReferenceBrief({
      apiKey: deps.apiKey,
      image: args.image,
      productName: args.productName,
      timeoutMs: opts.timeoutMs,
      call: deps.call,
      log,
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const error = describeError(r.error);
      log("reference_brief_failed", { productId: args.productId, url: urlKey(url), error, ms });
      return { url, hash, brief: null, source: "failed", error, errorKind: referenceNoteFailureKind(r.error), ms };
    }
    log("reference_brief_computed", { productId: args.productId, ms, mode: r.mode, usage: r.usage, usable: r.brief.usable });
    await safeStore(
      () =>
        deps.store.putReferenceBrief({ productId: args.productId, userId: args.userId, url, inputsHash: hash, brief: r.brief }),
      log,
      "put_reference_brief",
    );
    // Misma relectura que la nota del producto (ver ensureProductBrief).
    const persisted = await safeStore(
      () => deps.store.getReferenceBrief(args.productId, hash),
      log,
      "reread_reference_brief",
    );
    if (persisted) {
      const n = normalizeReferenceBrief(persisted);
      if (n.ok) {
        if (noteContentHash(n.value) !== noteContentHash(r.brief)) {
          log("reference_brief_race_lost", { productId: args.productId, url: urlKey(url) });
        }
        return { url, hash, brief: n.value, source: "computed", ms };
      }
    }
    return { url, hash, brief: r.brief, source: "computed", ms };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log("reference_brief_failed", { productId: args.productId, url: urlKey(url), error });
    return { url, hash, brief: null, source: "failed", error, errorKind: "exception" };
  }
}

/* -------------------------------------------------------------------------- */
/*  Director con validación + reintento condicional                             */
/* -------------------------------------------------------------------------- */

// Reintentar estos no cambia nada: el mismo prompt se vuelve a bloquear, la key
// sigue siendo inválida, la cuenta de Google sigue sin saldo.
const NON_RETRYABLE = new Set<V2CallError["kind"]>(["content_blocked", "invalid_key", "missing_key", "billing"]);

/**
 * G2 (v2.2): fallas de la NOTA de una referencia que no dicen nada malo de la
 * IMAGEN (timeout y 5xx llegan como `network`, 429, JSON roto, schema que no
 * pasó, excepción): la referencia sigue viajando con un rol genérico. No entran
 * `content_blocked` (la imagen disparó el filtro de seguridad: mandarla al
 * modelo de imagen arriesga bloquear la tanda), `bad_request` (un 400: Gemini
 * no pudo procesar la imagen; ver referenceNoteFailureKind),
 * `invalid_key`/`missing_key` y `billing` (esos cortan la tanda entera).
 */
const TRANSIENT_NOTE_FAILURES = new Set<string>(["network", "rate_limit", "bad_json", "unknown", "invalid", "exception"]);

type DirectorOutcome = {
  plan: Plan | null;
  repairs: string[];
  attempts: number;
  error: string | null;
  /** Tipo de la última falla del Director (null si salió bien). */
  errorKind: V2CallError["kind"] | null;
};

async function planWithDirector(
  message: string,
  vctx: PlanValidationContext,
  deps: GenerateV2Deps,
  clock: { now: () => number; startedAt: number },
): Promise<DirectorOutcome> {
  const log = deps.log ?? defaultV2Logger;
  const errors: string[] = [];
  let feedback: string | undefined;

  // Sin saldo en Google: el Director fallaría igual (y después las imágenes).
  if (isGeminiBillingExhausted()) {
    return { plan: null, repairs: [], attempts: 0, error: "billing: sin saldo en Google (no se llamó)", errorKind: "billing" };
  }

  const t0 = clock.now();
  const first = await runDirector({
    apiKey: deps.apiKey,
    message,
    thinkingLevel: "medium",
    timeoutMs: TIMEOUTS.director,
    call: deps.call,
    log,
  });
  log("director_attempt", { attempt: 1, ok: first.ok, ms: clock.now() - t0, mode: first.mode, usage: first.ok ? first.usage : undefined });
  if (first.ok) {
    const v = validatePlan(first.json, vctx);
    if (v.ok) return { plan: v.plan, repairs: v.repairs, attempts: 1, error: null, errorKind: null };
    errors.push(`intento 1: ${v.errors.join(" | ")}`);
    feedback = buildRetryFeedback(v.errors);
  } else {
    errors.push(`intento 1: ${describeError(first.error)}`);
    if (NON_RETRYABLE.has(first.error.kind)) {
      return { plan: null, repairs: [], attempts: 1, error: errors.join(" || "), errorKind: first.error.kind };
    }
    if (first.error.kind === "bad_json") {
      feedback = buildRetryFeedback(["H1: the response was not valid JSON matching the schema"]);
    }
  }
  const firstKind = first.ok ? null : first.error.kind;

  const remaining = ROUTE_BUDGET_MS - (clock.now() - clock.startedAt);
  if (remaining < DIRECTOR_RETRY_MIN_REMAINING_MS) {
    errors.push(`sin reintento: quedan ${Math.round(remaining / 1000)}s del presupuesto`);
    return { plan: null, repairs: [], attempts: 1, error: errors.join(" || "), errorKind: firstKind };
  }

  const t1 = clock.now();
  const second = await runDirector({
    apiKey: deps.apiKey,
    message,
    feedback,
    thinkingLevel: "low",
    timeoutMs: TIMEOUTS.director,
    call: deps.call,
    log,
  });
  log("director_attempt", { attempt: 2, ok: second.ok, ms: clock.now() - t1, mode: second.mode });
  if (second.ok) {
    const v = validatePlan(second.json, vctx);
    // Aun con éxito se guarda el error del intento 1: sirve para ajustar el prompt.
    if (v.ok) return { plan: v.plan, repairs: v.repairs, attempts: 2, error: errors.join(" || "), errorKind: null };
    errors.push(`intento 2: ${v.errors.join(" | ")}`);
  } else {
    errors.push(`intento 2: ${describeError(second.error)}`);
  }
  return { plan: null, repairs: [], attempts: 2, error: errors.join(" || "), errorKind: second.ok ? firstKind : second.error.kind };
}

/* -------------------------------------------------------------------------- */
/*  FASE 2 — notas + plan + ensamblado                                          */
/* -------------------------------------------------------------------------- */

export async function prepareV2(
  input: GenerateV2Input,
  downloads: V2Downloads,
  deps: GenerateV2Deps,
): Promise<{ ok: true; prepared: V2Prepared } | { ok: false; error: GeminiError }> {
  const log = deps.log ?? defaultV2Logger;
  const now = deps.now ?? Date.now;
  const startedAt = deps.startedAt ?? now();

  // Sin ninguna foto legible no hay producto que fotografiar. La ruta debería
  // chequear esto ANTES de descontar créditos (downloadV2Inputs → length).
  if (downloads.productPhotos.length === 0) {
    return { ok: false, error: { kind: "unknown", message: "No pudimos leer ninguna foto del producto." } };
  }

  const style = resolveStyle(input.styleId, input.styleFragment);
  if (style.unmatchedFragment) log("style_fragment_unmatched", { versionId: input.versionId });

  // Notas: producto y referencias EN PARALELO (lazy, sin reintento). El timeout
  // sale de lo que queda de la ruta (35-75s): con 35s fijos una nota de 8 fotos
  // se cortaba y la tanda caía al fallback sin Director.
  const lazyTimeoutMs = lazyBriefTimeoutMs(now() - startedAt);
  const [pb, refOutcomes] = await Promise.all([
    ensureProductBrief(
      {
        productId: input.productId,
        userId: input.userId,
        productName: input.productName,
        productDescription: input.productDescription,
        photos: downloads.productPhotos,
      },
      deps,
      { timeoutMs: lazyTimeoutMs },
    ),
    Promise.all(
      downloads.refs.map((image) =>
        ensureReferenceBrief(
          { productId: input.productId, userId: input.userId, productName: input.productName, image },
          deps,
          { timeoutMs: lazyTimeoutMs },
        ),
      ),
    ),
  ]);

  // Sin saldo en Google (G1, v2.2): ninguna llamada más va a salir bien. Se corta
  // acá: sin Director, sin imágenes y sin cachear nada. La ruta reembolsa.
  if (pb.errorKind === "billing" || refOutcomes.some((o) => o.errorKind === "billing")) {
    log("billing_exhausted_abort", { versionId: input.versionId, stage: "notes" });
    return { ok: false, error: { kind: "billing" } };
  }

  // Qué pasa con cada referencia:
  //   - con nota y usable → entra al plan (Director o fallback) y al modelo de imagen;
  //   - la nota dice usable:false → afuera (not_usable);
  //   - la imagen bajó pero su nota falló por un error transitorio o de servicio
  //     → G2 (v2.2): si no queda NINGUNA referencia con nota, la primera viaja
  //     igual con un rol genérico escrito por el código (ref_without_note). Antes
  //     se descartaba y un caso "solo referencia" terminaba en un packshot gris;
  //   - la nota la bloqueó el filtro de seguridad, o la key no sirve → afuera.
  const usable: Array<{ image: InlineImage; brief: ReferenceBrief; hash: string }> = [];
  const withoutNote: Array<{ image: InlineImage; url: string; reason: string }> = [];
  const droppedRefs: PlanMeta["dropped_refs"] = downloads.failedDownloads
    .filter((f) => f.kind === "reference")
    .map((f) => ({ url: f.url, reason: f.error }));
  refOutcomes.forEach((o, k) => {
    const image = downloads.refs[k];
    const url = urlKey(o.url);
    const failed = `note_failed: ${o.error ?? o.source}`;
    if (o.brief?.usable) usable.push({ image, brief: o.brief, hash: o.hash });
    else if (o.brief) droppedRefs.push({ url, reason: "not_usable" });
    else if (TRANSIENT_NOTE_FAILURES.has(o.errorKind ?? "exception")) withoutNote.push({ image, url, reason: failed });
    else droppedRefs.push({ url, reason: failed });
  });
  // Con al menos una referencia con nota, esas mandan (como antes) y las que no
  // tienen nota quedan afuera: el Director necesita la nota para planear.
  const genericRef = usable.length === 0 ? (withoutNote[0] ?? null) : null;
  for (const w of withoutNote) {
    if (w !== genericRef) droppedRefs.push({ url: w.url, reason: w.reason });
  }
  if (genericRef) log("ref_without_note", { versionId: input.versionId, url: genericRef.url, reason: genericRef.reason });

  const ctx: ComposeContext = {
    productBrief: pb.brief,
    availablePhotoCount: downloads.productPhotos.length,
    usableRefs: usable.map((u) => u.brief),
    genericRef: genericRef !== null,
    style,
    ratio: input.ratio,
    // Tope también acá (además de la ruta): `renderV2` lanza las N llamadas
    // juntas, cada una con hasta 8 imágenes inline. Un N sin techo (por PostgREST
    // se puede escribir `variations_default=40`) podía tirar la instancia por
    // memoria entre el deduct y el refund.
    variations: Math.min(MAX_VARIATIONS, Math.max(1, input.variations)),
    userPrompt: input.userPrompt ?? "",
    productName: input.productName,
    brand: input.brand,
  };
  const frame = frameV2(ctx);

  let plan: Plan | null = null;
  let planSource: PlanSource = "fallback";
  let repairs: string[] = [];
  let directorError: string | null = null;
  let attempts = 0;
  let planCache: PlanMeta["cache"]["plan"] = "skipped";
  let pHash: string | null = null;

  if (pb.brief && pb.hash && frame.directorMessage && frame.validationCtx) {
    // Las notas entran por su CONTENIDO (no por el hash de sus insumos): un plan
    // nunca se sirve con una nota distinta de la que lo produjo (ver hash.ts).
    const hashNow = planHash({
      productNoteHash: noteContentHash(pb.brief),
      refNoteHashes: usable.map((u) => noteContentHash(u.brief)),
      styleId: style.styleId,
      ratio: input.ratio,
      userPrompt: input.userPrompt ?? "",
      productName: input.productName,
      brand: input.brand,
    });
    pHash = hashNow;
    let cachedPlanInvalid = false;
    const cached = await safeStore(() => deps.store.getPlan(input.versionId, hashNow), log, "get_plan");
    if (cached) {
      const v = validatePlan(cached, frame.validationCtx);
      if (v.ok) {
        plan = v.plan;
        planSource = "director";
        repairs = v.repairs;
        planCache = "hit";
      } else {
        cachedPlanInvalid = true;
        log("plan_cache_invalid", { versionId: input.versionId, errors: v.errors });
      }
    }
    if (!plan) {
      planCache = "miss";
      const d = await planWithDirector(frame.directorMessage, frame.validationCtx, deps, { now, startedAt });
      if (d.errorKind === "billing") {
        // Sin saldo: sin reintento (NON_RETRYABLE) y sin mandar N imágenes que
        // van a fallar igual. Nada se cachea.
        log("billing_exhausted_abort", { versionId: input.versionId, stage: "director" });
        return { ok: false, error: { kind: "billing" } };
      }
      attempts = d.attempts;
      directorError = d.error;
      if (d.plan) {
        const directorPlan = d.plan;
        plan = directorPlan;
        planSource = "director";
        repairs = d.repairs;
        // Solo planes del Director se cachean (los del fallback no). Si el
        // cacheado ya no validaba, se PISA: con `on conflict do nothing` quedaba
        // para siempre y cada tanda de esta versión pagaba el Director.
        await safeStore(
          () =>
            deps.store.putPlan(
              { versionId: input.versionId, userId: input.userId, inputsHash: hashNow, plan: directorPlan },
              { overwrite: cachedPlanInvalid },
            ),
          log,
          "put_plan",
        );
      }
    }
  } else {
    // Sin nota del producto NO se llama al Director: directo al fallback. Con una
    // referencia sin nota tampoco (G2): el Director planea leyendo la nota de la
    // referencia y acá no la hay; el fallback le da el rol genérico.
    const why: string[] = [];
    if (!pb.brief) why.push(`no_product_brief (${pb.source}${pb.error ? `: ${pb.error}` : ""})`);
    if (frame.genericRef) why.push("ref_without_note");
    directorError = why.join(" + ") || "sin mensaje al Director";
  }

  if (!plan || planSource === "fallback") {
    plan = fallbackPlanFor(ctx, frame);
    planSource = "fallback";
    log("plan_fallback", { versionId: input.versionId, reason: directorError });
  }

  const batch = assembleV2(ctx, frame, plan, planSource);

  const snapshot: V2Snapshot = {
    pipeline: "v2",
    versions: {
      pipeline: PIPELINE_V2_VERSION,
      pb: PRODUCT_BRIEF_PROMPT_VERSION,
      rb: REF_BRIEF_PROMPT_VERSION,
      dir: DIRECTOR_PROMPT_VERSION,
      ss: STYLE_SPLIT_VERSION,
      asm: ASSEMBLY_VERSION,
    },
    case: frame.caseKind,
    planHash: pHash,
    productBriefHash: pb.hash,
    refBriefHashes: usable.map((u) => u.hash),
    plan,
    plan_meta: {
      plan_source: planSource,
      repairs,
      dropped_refs: droppedRefs,
      ref_without_note: genericRef ? [{ url: genericRef.url, reason: genericRef.reason }] : [],
      skipped_urls: downloads.skippedUrls,
      failed_downloads: downloads.failedDownloads,
      selected_photos: batch.selectedPhotos,
      director_error: directorError,
      director_attempts: attempts,
      style_source: style.source,
      style_unmatched_fragment: style.unmatchedFragment,
      style_lock_over_reference: STYLE_LOCK_OVER_REFERENCE,
      effective_lock: frame.effectiveLock !== null,
      cache: {
        product_brief: pb.source,
        ref_briefs: refOutcomes.map((o) => o.source),
        plan: planCache,
      },
      lazy_brief_timeout_ms: lazyTimeoutMs,
    },
    final_prompts: batch.prompts,
  };

  return {
    ok: true,
    prepared: {
      input,
      frame,
      plan,
      planSource,
      batch,
      // Con referencia sin nota (G2) viaja SU imagen como la referencia 1.
      images: { productPhotos: downloads.productPhotos, refs: genericRef ? [genericRef.image] : usable.map((u) => u.image) },
      snapshot,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  FASE 3 — N llamadas de imagen + post-proceso                                */
/* -------------------------------------------------------------------------- */

// Si el GA da 404 y el preview SÍ responde, las llamadas siguientes de este
// proceso van directo al preview (y queda logueado): no tiene sentido pagar un
// 404 por imagen. Dos reglas:
//   1. Se pega recién cuando el preview RESPONDIÓ bien. Antes se pegaba antes de
//      saberlo: si el preview ya estaba dado de baja (fecha publicada:
//      25-06-2026), la instancia quedaba fallando cada tanda aunque el GA
//      volviera a andar.
//   2. Vence a los 10 minutos: un hipo del GA no deja la instancia en el preview
//      hasta que se recicle (y no ensucia el A/B).
const STICKY_PREVIEW_MS = 10 * 60_000;
let stickyPreview: { model: string; until: number } | null = null;

function currentStickyPreview(now: number): string | null {
  if (stickyPreview && stickyPreview.until > now) return stickyPreview.model;
  stickyPreview = null;
  return null;
}

// Los de v1 + los finishReason propios del modelo de imagen. Sin estos, una
// tanda entera bloqueada salía "unknown" y `batch_fully_blocked` nunca saltaba.
const BLOCK_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
  "IMAGE_RECITATION",
]);

function isHttpStatus(err: GeminiError, status: number): err is Extract<GeminiError, { kind: "unknown" }> {
  return err.kind === "unknown" && err.message.startsWith(`HTTP ${status}`);
}

/**
 * Plan B `/v1`: cualquier 400 "genérico" (callGemini ya separa key inválida y
 * safety en otros kinds). Antes exigía que el mensaje nombrara
 * image_config/aspect_ratio/image_size, pero la API a veces responde "Request
 * contains an invalid argument." sin nombrar el campo (gemini-json.ts) y ahí el
 * plan B ni se intentaba. Los 400 no se cobran: probar la otra forma es gratis.
 */
function isPlanBCandidate(err: GeminiError): boolean {
  return isHttpStatus(err, 400);
}

/**
 * Forma `/v1` de la config de imagen: ahí `ImageResponseFormat` usa ENUMS, no
 * los strings de `imageConfig` ("4:5", "1K"). Es la misma trampa que
 * `TextResponseFormat.mimeType` (400 con "application/json", 200 con
 * "APPLICATION_JSON"). Nombres de la referencia de la API
 * (ImageResponseFormat.AspectRatio / ImageSize).
 */
const V1_ASPECT_RATIO: Record<OutputRatio, string> = {
  "1:1": "ASPECT_RATIO_ONE_BY_ONE",
  "4:5": "ASPECT_RATIO_FOUR_BY_FIVE",
  "9:16": "ASPECT_RATIO_NINE_BY_SIXTEEN",
  "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
};
const V1_IMAGE_SIZE: Record<string, string> = {
  "512": "IMAGE_SIZE_FIVE_TWELVE",
  "1K": "IMAGE_SIZE_ONE_K",
  "2K": "IMAGE_SIZE_TWO_K",
  "4K": "IMAGE_SIZE_FOUR_K",
};

function extractImage(
  response: GeminiResponse,
): { ok: true; mimeType: string; data: string } | { ok: false; error: GeminiError } {
  const candidate = response.candidates?.[0];
  if (!candidate) return { ok: false, error: { kind: "unknown", message: "Gemini no devolvió candidatos." } };
  if (candidate.finishReason && BLOCK_REASONS.has(candidate.finishReason)) {
    return { ok: false, error: { kind: "content_blocked", reason: candidate.finishReason } };
  }
  for (const part of candidate.content?.parts ?? []) {
    if ("inlineData" in part && part.inlineData?.data) {
      return { ok: true, mimeType: part.inlineData.mimeType ?? "image/png", data: part.inlineData.data };
    }
  }
  return { ok: false, error: { kind: "unknown", message: `Gemini no devolvió imagen (finishReason ${candidate.finishReason ?? "?"}).` } };
}

/**
 * Una llamada de imagen. Verificado en vivo (2026-09-10): el GA
 * `gemini-3.1-flash-image` en v1beta acepta `imageConfig` y devolvió image/jpeg
 * 464x576 para 4:5 a 512 (0.8056, dentro del ±1%). Sin temperature, sin
 * thinkingConfig (queda en minimal), sin systemInstruction, sin mediaResolution:
 * nada de eso está documentado para este modelo.
 *   - 404 → una vez con el preview (se loguea); si el que da 404 es el preview
 *     al que estábamos pegados, se suelta y se vuelve una vez al GA.
 *   - 400 genérico → `/v1` con `responseFormat.image` en forma de enums (nunca
 *     las dos formas juntas).
 */
async function callImageModel(
  parts: GeminiPart[],
  ratio: OutputRatio,
  deps: GenerateV2Deps,
  log: V2Logger,
): Promise<{ ok: true; mimeType: string; data: string; model: string } | { ok: false; error: GeminiError }> {
  const call = deps.call ?? callGemini;
  const now = deps.now ?? Date.now;
  const sticky = deps.imageModel ? null : currentStickyPreview(now());
  let model = deps.imageModel ?? sticky ?? GEMINI_IMAGE_MODEL_V2;
  const contents = [{ role: "user" as const, parts }];
  const imageConfig = { aspectRatio: ratio, imageSize: IMAGE_SIZE_V2 };
  const once = (m: string) =>
    call({
      apiKey: deps.apiKey,
      model: m,
      contents,
      generationConfig: { responseModalities: ["IMAGE"], imageConfig },
      timeoutMs: TIMEOUTS.image,
    });

  let res = await once(model);
  if (!res.ok && isHttpStatus(res.error, 404)) {
    if (sticky && model === sticky) {
      // El preview al que quedamos pegados tampoco existe (lo dieron de baja):
      // se suelta y se prueba el GA una vez.
      stickyPreview = null;
      log("image_model_sticky_preview_404", { from: model, to: GEMINI_IMAGE_MODEL_V2 });
      model = GEMINI_IMAGE_MODEL_V2;
      res = await once(model);
    } else if (model !== GEMINI_IMAGE_MODEL_V2_FALLBACK) {
      log("image_model_404_fallback", { from: model, to: GEMINI_IMAGE_MODEL_V2_FALLBACK });
      model = GEMINI_IMAGE_MODEL_V2_FALLBACK;
      res = await once(model);
      // Recién ahora sabemos que el preview existe: recién ahí se pega (y vence solo).
      if (res.ok && !deps.imageModel) stickyPreview = { model, until: now() + STICKY_PREVIEW_MS };
    }
  }
  if (!res.ok && isPlanBCandidate(res.error)) {
    log("image_config_rejected_try_v1", { model, error: res.error });
    res = await call({
      apiKey: deps.apiKey,
      model,
      contents,
      apiVersion: "v1",
      generationConfig: {
        responseModalities: ["IMAGE"],
        responseFormat: {
          image: { aspectRatio: V1_ASPECT_RATIO[ratio], imageSize: V1_IMAGE_SIZE[IMAGE_SIZE_V2] ?? "IMAGE_SIZE_ONE_K" },
        },
      },
      timeoutMs: TIMEOUTS.image,
    });
  }
  if (!res.ok) return { ok: false, error: res.error };
  const img = extractImage(res.response);
  if (!img.ok) return img;
  return { ok: true, mimeType: img.mimeType, data: img.data, model };
}

/**
 * Post-proceso default. Con `imageConfig` el modelo ya devuelve la proporción
 * pedida: dentro de ±1% es solo un resize a RATIO_TARGETS (el cover recorta <1%,
 * invisible y sin deformar); fuera de eso es el mismo cover-crop de v1 y se
 * loguea `ratio_mismatch`. Reusa `enforceRatioServer` de v1 (JPEG 92).
 */
export const defaultPostProcess: PostProcessFn = async (buf, ratio, mimeType) => {
  const size = readImageSize(buf);
  const target = RATIO_TARGETS[ratio];
  const want = target.w / target.h;
  const ratioMismatch = !!size && Math.abs(size.width / size.height - want) / want > RATIO_TOLERANCE;
  try {
    const out = await enforceRatioServer(buf, ratio);
    return { buffer: out, contentType: "image/jpeg", ratioMismatch, width: size?.width, height: size?.height };
  } catch {
    // Sin sharp funcional, un JPEG del modelo sirve tal cual (ya viene en la
    // proporción pedida). Otro formato no: no podemos subirlo como image/jpeg.
    if (mimeType === "image/jpeg") {
      return { buffer: buf, contentType: "image/jpeg", ratioMismatch, width: size?.width, height: size?.height };
    }
    throw { kind: "unknown", message: "Post-proceso falló." } satisfies GeminiError;
  }
};

export async function renderV2(prepared: V2Prepared, deps: GenerateV2Deps): Promise<GenerateV2Result> {
  const log = deps.log ?? defaultV2Logger;
  const post = deps.postProcess ?? defaultPostProcess;
  const { batch, images, input, snapshot, planSource } = prepared;

  // Sin saldo en Google (lo vio esta instancia hace <2 min): las N llamadas
  // fallarían igual. Se corta sin mandarlas.
  if (isGeminiBillingExhausted()) {
    log("billing_exhausted_abort", { versionId: input.versionId, stage: "images" });
    return { ok: false, error: { kind: "billing" }, snapshot };
  }

  const settled = await Promise.allSettled(
    batch.prompts.map(async (_prompt, i) => {
      const parts = buildImageParts(batch, i, images, { labels: deps.interleaveLabels ?? true });
      const r = await callImageModel(parts, input.ratio, deps, log);
      if (!r.ok) throw r.error;
      const processed = await post(Buffer.from(r.data, "base64"), input.ratio, r.mimeType);
      return { processed, model: r.model };
    }),
  );

  const out: V2GeneratedImage[] = [];
  const failures: GeminiError[] = [];
  const imageFailures: NonNullable<PlanMeta["image_failures"]> = [];
  const mismatches: number[] = [];
  const models = new Set<string>();
  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      const err = normalizeError(s.reason);
      failures.push(err);
      imageFailures.push({ index: i, kind: err.kind, detail: describeError(err) });
      return;
    }
    const { processed, model } = s.value;
    models.add(model);
    if (processed.ratioMismatch) mismatches.push(i);
    out.push({
      buffer: processed.buffer,
      contentType: processed.contentType,
      index: i,
      ratioMismatch: processed.ratioMismatch,
      metadata: {
        base_prompt: batch.prompts[i],
        pipeline: "v2",
        plan_source: planSource,
        shot_index: batch.shotIndexes[i],
        model,
      },
    });
  });

  snapshot.plan_meta.image_model =
    [...models].join(",") ||
    (deps.imageModel ?? currentStickyPreview((deps.now ?? Date.now)()) ?? GEMINI_IMAGE_MODEL_V2);
  snapshot.plan_meta.ratio_mismatch = mismatches;
  if (mismatches.length) log("ratio_mismatch", { versionId: input.versionId, images: mismatches, ratio: input.ratio });
  // Cada falla por imagen queda en el snapshot y en el log: en una entrega
  // parcial (3 de 5) antes no quedaba NINGÚN rastro de por qué fallaron las
  // otras, que es justo el dato para ajustar la redacción de la persona (§3.9).
  snapshot.plan_meta.image_failures = imageFailures;
  if (imageFailures.length) {
    log("image_failures", {
      versionId: input.versionId,
      case: snapshot.case,
      requested: batch.prompts.length,
      failures: imageFailures,
    });
  }
  if (failures.some((f) => f.kind === "content_blocked") && out.length === 0) {
    // Toda la tanda bloqueada: dato para ajustar la redacción (persona de stock).
    log("batch_fully_blocked", { versionId: input.versionId, case: snapshot.case });
  }

  if (out.length === 0) {
    // Si alguna falló por saldo, ese es EL error: define el mensaje al usuario.
    const error = failures.find((f) => f.kind === "billing") ?? failures[0] ?? { kind: "unknown", message: "Sin imágenes." };
    return { ok: false, error, snapshot };
  }
  return { ok: true, images: out, failures, finalPrompt: batch.prompts[0], snapshot };
}

/* -------------------------------------------------------------------------- */
/*  Todo junto                                                                  */
/* -------------------------------------------------------------------------- */

export async function generateV2(input: GenerateV2Input, deps: GenerateV2Deps): Promise<GenerateV2Result> {
  const now = deps.now ?? Date.now;
  const withClock: GenerateV2Deps = { ...deps, startedAt: deps.startedAt ?? now() };
  const downloads = await downloadV2Inputs(input, withClock);
  const prep = await prepareV2(input, downloads, withClock);
  if (!prep.ok) return { ok: false, error: prep.error, snapshot: null };
  return renderV2(prep.prepared, withClock);
}
