/**
 * PRUEBA LADO A LADO — pipeline v1 (lib/ai/generate-server.ts) vs v2 (lib/ai/v2)
 * con datos REALES y el MISMO modelo de imagen en las dos ramas, para medir el
 * PROMPT y no el modelo (spec v2 §3: riesgo 2 y punto 17).
 *
 * Uso:
 *   GOOGLE_API_KEY=... npx --yes tsx scripts/ab-compare.ts --cases <cases.json> --out <dir>
 *       [--only idA,idB] [--budget 2] [--smoke] [--v2-only]
 *   (también por env: AB_CASES, AB_OUT, AB_BUDGET_USD, AB_V2_ONLY=1)
 *
 * --v2-only: corre SOLO la rama v2 (la v1 no llama a Gemini ni escribe v1-*); el caso queda
 *   con v1 = { skipped: true } en el manifest. --out elige el directorio de salida.
 *
 * cases.json:
 *   { supabaseUrl,
 *     products: { <key>: { productId, versionId, name, description, productImages[], referenceImages[],
 *                          localCopies?: { product?: string[], reference?: string[] } } },
 *     cases: [{ id, product, styleId, useRef, ratio, variations, why? }] }
 *
 * Qué corre cada rama (igual que app/api/generations/route.ts hoy):
 *   v1: generateOnServer({ productImages, referenceImages (si useRef), ratio, variations,
 *       styleFragment: getStyleFragment(styleId) || undefined }) — sin brand ni userPrompt.
 *   v2: downloadV2Inputs → prepareV2 → renderV2 con createMemoryStore(), UNO POR PRODUCTO:
 *       las notas se calculan una vez y los casos siguientes del mismo producto las reusan,
 *       como en producción. NEXT_PUBLIC_SUPABASE_URL = supabaseUrl (lo exige el allowlist).
 *
 * Mismo modelo: v1 tiene hardcodeado el preview (GEMINI_IMAGE_MODEL). El script envuelve
 * globalThis.fetch y reescribe en la URL "gemini-3.1-flash-image-preview" →
 * "gemini-3.1-flash-image" (el GA de v2). v1 sigue SIN imageConfig, como en producción.
 *
 * Reintento: una llamada a Gemini que falla por bloqueo (200 sin imagen), 429, 5xx o error
 * de red se reintenta UNA vez a nivel fetch, igual en las dos ramas. Producción NO
 * reintenta: queda anotado en el manifest y cada intento queda registrado.
 *
 * sharp: si `sharp` no carga desde node_modules, AB_SHARP_PATH=<carpeta de un paquete sharp
 * que funcione> lo resuelve ahí (post-proceso REAL); si tampoco, un stub pass-through
 * (las imágenes quedan tal cual las devolvió el modelo) y se anota en el manifest.
 *
 * Presupuesto: antes de cada llamada a Gemini se estima el costo; si se pasaría de --budget
 * (default US$2), la llamada no sale (HTTP 499 sintético, queda como falla).
 *
 * --smoke: sin llamadas a Gemini. Chequea sharp, el allowlist, baja las fotos (Storage) y
 * copia los insumos. Costo cero.
 *
 * La key nunca se imprime ni se escribe: el manifest guarda modelo y versión de API, no URLs.
 */

import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import type { OutputRatio } from "@/lib/constants";
import type { StyleId } from "@/lib/styles";
import type { GeminiError } from "@/lib/ai/gemini-client";
import type { GenerateV2Deps, GenerateV2Input, V2Snapshot } from "@/lib/ai/v2/generate-v2";
import type { V2Store } from "@/lib/ai/v2/store";

/* -------------------------------------------------------------------------- */
/*  Tipos y argumentos                                                          */
/* -------------------------------------------------------------------------- */

type Product = {
  productId: string;
  versionId: string;
  name: string;
  description: string | null;
  productImages: string[];
  referenceImages: string[];
  localCopies?: { product?: string[]; reference?: string[] };
};
type Case = {
  id: string;
  product: string;
  styleId: string | null;
  useRef: boolean;
  ratio: OutputRatio;
  variations: number;
  why?: string;
};
type CasesFile = { supabaseUrl: string; products: Record<string, Product>; cases: Case[] };

type ImageInfo = { mime: string; width: number | null; height: number | null; bytes: number };

type CallRecord = {
  ctx: string;
  kind: "image" | "text";
  model: string;
  requested_model: string;
  api: string;
  attempt: number;
  status: number | string;
  ms: number;
  cost_usd: number;
  finish_reason?: string;
  block_reason?: string;
  usage?: Record<string, unknown>;
  image?: ImageInfo;
  error?: string;
  retry?: string;
  parts?: string[];
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/* -------------------------------------------------------------------------- */
/*  Constantes del A/B                                                          */
/* -------------------------------------------------------------------------- */

const GEMINI_HOST = "https://generativelanguage.googleapis.com/";
const V1_MODEL_FROM = "gemini-3.1-flash-image-preview";
const SAME_IMAGE_MODEL = "gemini-3.1-flash-image";
const AB_USER_ID = "ab-compare";
const RETRY_TIMEOUT_MS = 60_000;

/**
 * Tarifas ASUMIDAS para estimar (USD). La imagen a 1K sale del número de
 * referencia del proyecto (~US$0.067); las de texto son las públicas del modelo
 * Pro preview. Es una estimación, no la factura.
 */
const PRICING = {
  text: { inputPerM: 2.0, outputPerM: 12.0 },
  image: { perImage1K: 0.067, inputPerM: 0.5 },
  preEstimate: { image: 0.075, text: 0.05 },
};

/* -------------------------------------------------------------------------- */
/*  Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

/** cases.json a veces trae rutas de Windows sin escapar ("C:\Users\..."): se toleran. */
function readJsonLenient(file: string): unknown {
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(raw.replace(/\\(["\\])|\\/g, (m, g1: string | undefined) => (g1 ? m : "\\\\")));
  }
}

function sniffExt(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return ".png";
  if (buf.toString("ascii", 0, 4) === "RIFF") return ".webp";
  return ".bin";
}

/** Saca tokens y keys de cualquier texto que vaya al manifest o a la consola. */
function redact(s: string): string {
  return s.replace(/([?&](?:token|key)=)[^&\s"']+/gi, "$1REDACTED");
}

function redactDeep<T>(v: T): T {
  return JSON.parse(redact(JSON.stringify(v ?? null))) as T;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

function describeError(e: GeminiError | unknown): { kind: string; reason: string } {
  if (e && typeof e === "object" && "kind" in e) {
    const g = e as { kind: string; message?: unknown; reason?: unknown };
    return { kind: g.kind, reason: redact(String(g.message ?? g.reason ?? "")).slice(0, 300) };
  }
  return { kind: "exception", reason: redact(e instanceof Error ? e.message : String(e)).slice(0, 300) };
}

/* -------------------------------------------------------------------------- */
/*  sharp                                                                       */
/* -------------------------------------------------------------------------- */

type SharpSetup = { mode: "installed" | "alias" | "stub"; version: string | null; note: string };

function setupSharp(): SharpSetup {
  const req = createRequire(path.join(process.cwd(), "package.json"));
  try {
    const s = req("sharp") as { versions?: Record<string, string> };
    return { mode: "installed", version: s.versions?.sharp ?? null, note: "sharp de node_modules del repo (post-proceso real)." };
  } catch {
    // node_modules/sharp roto o vacío: probamos el alias y después el stub.
  }

  const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const original = M._resolveFilename;
  const redirect = (target: string) => {
    M._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
      if (request === "sharp") return target;
      return original.call(this, request, ...rest);
    };
  };

  const alias = process.env.AB_SHARP_PATH?.trim();
  if (alias) {
    try {
      const entry = req.resolve(path.resolve(alias));
      const s = req(entry) as { versions?: Record<string, string> };
      redirect(entry);
      return {
        mode: "alias",
        version: s.versions?.sharp ?? null,
        note: "sharp resuelto por AB_SHARP_PATH (otro paquete sharp funcional en disco): post-proceso REAL, igual que producción.",
      };
    } catch (err) {
      console.warn(`[ab] AB_SHARP_PATH no carga (${err instanceof Error ? err.message.split("\n")[0] : err}); uso stub.`);
    }
  }

  // Stub pass-through: resize/jpeg/rotate encadenan y toBuffer devuelve la entrada.
  const stubId = path.join(process.cwd(), "__ab_sharp_stub__.js");
  const stubModule = new Module(stubId);
  stubModule.filename = stubId;
  stubModule.loaded = true;
  const stub = (input: Buffer) => {
    const chain = {
      resize: () => chain,
      jpeg: () => chain,
      rotate: () => chain,
      toBuffer: async () => Buffer.from(input),
    };
    return chain;
  };
  stubModule.exports = stub;
  (req.cache as Record<string, unknown>)[stubId] = stubModule;
  redirect(stubId);
  return {
    mode: "stub",
    version: null,
    note: "STUB pass-through: sin resize ni re-encode; las imágenes quedan tal cual las devolvió el modelo.",
  };
}

/* -------------------------------------------------------------------------- */
/*  fetch instrumentado: mismo modelo, reintento, costo, presupuesto            */
/* -------------------------------------------------------------------------- */

let ctx = "setup";
const calls: CallRecord[] = [];
let spentUsd = 0;
const fingerprints = new Map<string, string>();
const lastImagePrompt = new Map<string, string>();
let sizeOf: (buf: Buffer) => { width: number; height: number } | null = () => null;

const fp = (b64: string) => `${b64.length}:${b64.slice(200, 264)}`;

function partsLayout(body: string): { layout: string[]; prompt: string | null } {
  try {
    const j = JSON.parse(body) as { contents?: Array<{ parts?: Array<Record<string, unknown>> }> };
    const parts = j.contents?.[0]?.parts ?? [];
    let prompt: string | null = null;
    const layout = parts.map((p) => {
      if (typeof p.text === "string") {
        prompt = p.text;
        return `text(${p.text.length}): ${p.text.slice(0, 100).replace(/\s+/g, " ")}`;
      }
      const d = p.inlineData as { mimeType?: string; data?: string } | undefined;
      if (d?.data) {
        const bytes = Math.floor((d.data.length * 3) / 4);
        return `image ${d.mimeType ?? "?"} ~${bytes}B = ${fingerprints.get(fp(d.data)) ?? "desconocida"}`;
      }
      return "otro";
    });
    return { layout, prompt };
  } catch {
    return { layout: ["body no parseable"], prompt: null };
  }
}

async function inspect(
  res: Response,
  kind: "image" | "text",
): Promise<{ fields: Partial<CallRecord>; cost: number; hasImage: boolean }> {
  try {
    const j = (await res.json()) as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<Record<string, unknown>> } }>;
      usageMetadata?: Record<string, unknown>;
      promptFeedback?: { blockReason?: string };
    };
    const usage = j.usageMetadata ?? {};
    const num = (k: string) => (typeof usage[k] === "number" ? (usage[k] as number) : 0);
    const cand = j.candidates?.[0];
    let image: ImageInfo | undefined;
    for (const p of cand?.content?.parts ?? []) {
      const d = p.inlineData as { mimeType?: string; data?: string } | undefined;
      if (d?.data) {
        const buf = Buffer.from(d.data, "base64");
        const s = sizeOf(buf);
        image = { mime: d.mimeType ?? "?", width: s?.width ?? null, height: s?.height ?? null, bytes: buf.length };
        break;
      }
    }
    const cost =
      kind === "text"
        ? (num("promptTokenCount") * PRICING.text.inputPerM +
            (num("candidatesTokenCount") + num("thoughtsTokenCount")) * PRICING.text.outputPerM) /
          1e6
        : (image ? PRICING.image.perImage1K : 0) + (num("promptTokenCount") * PRICING.image.inputPerM) / 1e6;
    return {
      fields: {
        finish_reason: cand?.finishReason,
        block_reason: j.promptFeedback?.blockReason,
        usage: j.usageMetadata,
        image,
      },
      cost,
      hasImage: !!image,
    };
  } catch {
    return { fields: { error: "respuesta no parseable" }, cost: 0, hasImage: false };
  }
}

function installFetch(budgetUsd: number): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(GEMINI_HOST)) return realFetch(input, init);

    const m = /\/(v1beta|v1)\/models\/([^:/?]+):/.exec(url);
    const api = m?.[1] ?? "?";
    const requested = m ? decodeURIComponent(m[2]) : "?";
    const rewritten = requested === V1_MODEL_FROM;
    const model = rewritten ? SAME_IMAGE_MODEL : requested;
    const target = rewritten ? url.replace(`/models/${V1_MODEL_FROM}:`, `/models/${SAME_IMAGE_MODEL}:`) : url;
    const kind: "image" | "text" = model.includes("image") ? "image" : "text";
    const body = typeof init?.body === "string" ? init.body : null;
    const pl = kind === "image" && body ? partsLayout(body) : null;
    if (pl?.prompt) lastImagePrompt.set(ctx, pl.prompt);
    const myCtx = ctx;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const rec: CallRecord = { ctx: myCtx, kind, model, requested_model: requested, api, attempt, status: 0, ms: 0, cost_usd: 0 };
      if (pl && attempt === 1) rec.parts = pl.layout;
      if (spentUsd + PRICING.preEstimate[kind] > budgetUsd) {
        rec.status = 499;
        rec.error = "ab_budget_exhausted";
        calls.push(rec);
        console.warn(`[ab] ${myCtx} llamada ${kind} NO enviada: presupuesto (gastado ~US$${spentUsd.toFixed(3)})`);
        return new Response(JSON.stringify({ error: { code: 499, message: "ab_budget_exhausted", status: "ABORTED" } }), {
          status: 499,
          headers: { "content-type": "application/json" },
        });
      }
      const t0 = Date.now();
      let res: Response;
      try {
        res = await realFetch(target, attempt === 1 ? init : { ...init, signal: AbortSignal.timeout(RETRY_TIMEOUT_MS) });
      } catch (err) {
        rec.ms = Date.now() - t0;
        rec.status = "network";
        const name = (err as { name?: string })?.name ?? "";
        rec.error = redact(`${name}: ${err instanceof Error ? err.message : String(err)}`).slice(0, 200);
        calls.push(rec);
        // Un timeout de producción (AbortError del callGemini) NO se reintenta: es la falla real.
        if (attempt === 1 && name !== "AbortError" && name !== "TimeoutError") {
          rec.retry = "network";
          continue;
        }
        throw err;
      }
      rec.ms = Date.now() - t0;
      rec.status = res.status;
      let retryReason: string | null = null;
      if (res.ok) {
        const info = await inspect(res.clone(), kind);
        Object.assign(rec, info.fields);
        rec.cost_usd = round(info.cost, 5);
        spentUsd += info.cost;
        if (kind === "image" && !info.hasImage) {
          retryReason = `no_image(${info.fields.block_reason ?? info.fields.finish_reason ?? "?"})`;
        }
      } else {
        rec.error = redact((await res.clone().text()).slice(0, 300));
        if (res.status === 429 || res.status >= 500) retryReason = `http_${res.status}`;
      }
      calls.push(rec);
      console.log(
        `[ab] ${myCtx} ${kind} ${model}${rewritten ? " (reescrito desde preview)" : ""} intento ${attempt}: ` +
          `${rec.status}${rec.image ? ` ${rec.image.mime} ${rec.image.width}x${rec.image.height}` : ""}` +
          `${rec.finish_reason && rec.finish_reason !== "STOP" ? ` finish=${rec.finish_reason}` : ""} ${rec.ms}ms` +
          ` ~US$${rec.cost_usd}`,
      );
      if (retryReason && attempt === 1) {
        rec.retry = retryReason;
        console.warn(`[ab] ${myCtx} reintento por ${retryReason}`);
        continue;
      }
      return res;
    }
    throw new Error("unreachable");
  }) as typeof fetch;
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const casesPath = arg("cases") ?? process.env.AB_CASES;
  const outDir = arg("out") ?? process.env.AB_OUT;
  if (!casesPath || !outDir) {
    console.error("Uso: GOOGLE_API_KEY=... npx --yes tsx scripts/ab-compare.ts --cases <cases.json> --out <dir> [--only a,b] [--budget 2] [--smoke] [--v2-only]");
    process.exit(2);
  }
  const smoke = flag("smoke");
  const v2Only = flag("v2-only") || process.env.AB_V2_ONLY === "1";
  const budget = Number(arg("budget") ?? process.env.AB_BUDGET_USD ?? "2");
  const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const apiKey = process.env.GOOGLE_API_KEY?.trim() ?? "";
  if (!apiKey && !smoke) {
    console.error("Falta GOOGLE_API_KEY.");
    process.exit(2);
  }

  const cf = readJsonLenient(casesPath) as CasesFile;
  process.env.NEXT_PUBLIC_SUPABASE_URL = cf.supabaseUrl;

  const sharpSetup = setupSharp();
  installFetch(smoke ? 0 : budget);

  // Imports dinámicos DESPUÉS del alias de sharp (generate-server lo importa al cargar).
  const v1mod = await import("@/lib/ai/generate-server");
  const v2mod = await import("@/lib/ai/v2/generate-v2");
  const { createMemoryStore } = await import("@/lib/ai/v2/store");
  const { getStyleFragment } = await import("@/lib/styles");
  const { buildImageParts } = await import("@/lib/ai/v2/assemble");
  const { refBriefHash } = await import("@/lib/ai/v2/hash");
  const { isAllowedImageUrl } = await import("@/lib/ai/v2/sanitize");
  sizeOf = v2mod.readImageSize;

  fs.mkdirSync(outDir, { recursive: true });
  const inputsDir = path.join(outDir, "inputs");
  fs.mkdirSync(inputsDir, { recursive: true });

  /* ---- Insumos: copias locales para los jueces + huellas para mapear las parts ---- */
  const inputs: Array<Record<string, unknown>> = [];
  for (const [key, p] of Object.entries(cf.products)) {
    const copy = (src: string, name: string) => {
      if (!fs.existsSync(src)) return null;
      const dest = path.join(inputsDir, `${name}${path.extname(src) || ".bin"}`);
      fs.copyFileSync(src, dest);
      return path.basename(dest);
    };
    const groups: Array<["product" | "reference", string[], string[]]> = [
      ["product", p.productImages, p.localCopies?.product ?? []],
      ["reference", p.referenceImages, p.localCopies?.reference ?? []],
    ];
    for (const [role, urls, locals] of groups) {
      for (let k = 0; k < urls.length; k++) {
        const name = `${key}-${role}-${k + 1}`;
        const entry: Record<string, unknown> = { name, product: key, role, allowed_url: isAllowedImageUrl(urls[k]) };
        entry.local_copy = locals[k] ? copy(locals[k], name) : null;
        try {
          const img = await v2mod.downloadImage(urls[k]);
          const buf = Buffer.from(img.data, "base64");
          const s = sizeOf(buf);
          fingerprints.set(fp(img.data), `${key}:${role}_${k + 1}`);
          Object.assign(entry, { mime: img.mimeType, bytes: img.bytes, width: s?.width ?? null, height: s?.height ?? null });
          if (!entry.local_copy) {
            const dest = path.join(inputsDir, `${name}${sniffExt(buf)}`);
            fs.writeFileSync(dest, buf);
            entry.local_copy = path.basename(dest);
          }
        } catch (err) {
          entry.download_error = redact(err instanceof Error ? err.message : String(err));
        }
        inputs.push(entry);
      }
    }
  }

  /* ---- Probe de sharp con una foto real ---- */
  let sharpProbe: Record<string, unknown> = {};
  try {
    const first = Object.values(cf.products)[0];
    const img = await v2mod.downloadImage(first.productImages[0]);
    const out = await v1mod.enforceRatioServer(Buffer.from(img.data, "base64"), "4:5");
    sharpProbe = { input_mime: img.mimeType, output_ext: sniffExt(out), output_size: sizeOf(out) };
  } catch (err) {
    sharpProbe = { error: err instanceof Error ? err.message : String(err) };
  }
  console.log(`[ab] sharp: ${sharpSetup.mode} ${sharpSetup.version ?? ""} probe=${JSON.stringify(sharpProbe)}`);

  if (smoke) {
    console.log(JSON.stringify({ sharp: sharpSetup, sharpProbe, inputs }, null, 2));
    return;
  }

  /* ---- Manifest (incremental: se reescribe después de cada caso) ---- */
  const manifestPath = path.join(outDir, "manifest.json");
  let previousCases: Array<Record<string, unknown>> = [];
  if (only && fs.existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { cases?: Array<Record<string, unknown>> };
      previousCases = (prev.cases ?? []).filter((c) => !only.includes(String(c.id)));
    } catch {
      previousCases = [];
    }
  }
  const caseResults: Array<Record<string, unknown>> = [];
  const runStarted = Date.now();

  const costOf = (c: string) => round(calls.filter((r) => r.ctx === c).reduce((s, r) => s + r.cost_usd, 0));
  const callsOf = (c: string) => calls.filter((r) => r.ctx === c);

  const writeManifest = () => {
    const all = [...previousCases, ...caseResults];
    const sum = (pipe: "v1" | "v2") =>
      round(all.reduce((s, c) => s + Number((c[pipe] as { cost_usd?: number } | undefined)?.cost_usd ?? 0), 0));
    const manifest = {
      generated_at: new Date().toISOString(),
      script: "scripts/ab-compare.ts",
      settings: {
        branches: v2Only ? ["v2"] : ["v1", "v2"],
        image_model_both: SAME_IMAGE_MODEL,
        v1_model_rewrite: {
          from: V1_MODEL_FROM,
          to: SAME_IMAGE_MODEL,
          how: "globalThis.fetch envuelto: se reescribe el nombre del modelo en la URL de generateContent. v1 sigue sin imageConfig (como producción); v2 manda imageConfig {aspectRatio, imageSize:'1K'}.",
        },
        v1_inputs: "productImages, referenceImages (si useRef), ratio, variations, styleFragment=getStyleFragment(styleId)||undefined; sin brand ni userPrompt",
        v2_inputs: "createMemoryStore() por producto (notas reusadas entre casos del mismo producto), imageModel=GA, sin brand ni userPrompt, startedAt al empezar la rama",
        sharp: { ...sharpSetup, probe: sharpProbe },
        retry_policy:
          "harness: 1 reintento por llamada a Gemini ante 200-sin-imagen (bloqueo), 429, 5xx o error de red (no ante timeout de producción ni 4xx). Producción no reintenta.",
        pricing_assumptions_usd: PRICING,
        budget_usd: budget,
        cost_attribution:
          "el costo de las notas de v2 cae en el caso que las calculó (el primero de cada producto); los siguientes las leen del store",
      },
      inputs,
      totals: {
        cost_usd: round(spentUsd + previousCases.reduce((s, c) => s + Number((c as { cost_usd?: number }).cost_usd ?? 0), 0)),
        cost_usd_this_run: round(spentUsd),
        cost_usd_v1: sum("v1"),
        cost_usd_v2: sum("v2"),
        gemini_calls_this_run: calls.length,
        wall_ms_this_run: Date.now() - runStarted,
      },
      cases: all,
      calls: redactDeep(calls),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  };

  /* ---- Stores v2: uno por producto ---- */
  const stores = new Map<string, ReturnType<typeof createMemoryStore>>();
  const storeFor = (key: string) => {
    let s = stores.get(key);
    if (!s) {
      s = createMemoryStore();
      stores.set(key, s);
    }
    return s;
  };

  const v2Log: Array<{ ctx: string; event: string; data?: unknown }> = [];
  const logger = (event: string, data?: Record<string, unknown>) => {
    v2Log.push({ ctx, event, data: redactDeep(data) });
    console.log(`[ab] ${ctx} v2:${event}`);
  };

  const cases = cf.cases.filter((c) => !only || only.includes(c.id));
  for (const c of cases) {
    const p = cf.products[c.product];
    if (!p) {
      caseResults.push({ id: c.id, error: `producto desconocido: ${c.product}` });
      continue;
    }
    const dir = path.join(outDir, c.id);
    fs.mkdirSync(dir, { recursive: true });
    const referenceImages = c.useRef ? p.referenceImages : [];
    const fragment = c.styleId ? getStyleFragment(c.styleId as StyleId) : "";
    console.log(`\n[ab] ===== ${c.id} (${c.product}, estilo=${c.styleId ?? "—"}, ref=${c.useRef}, ${c.ratio} x${c.variations})`);

    /* ---------------- v1 ---------------- */
    ctx = `${c.id}/v1`;
    const v1: Record<string, unknown> = {};
    if (v2Only) {
      v1.skipped = true;
    } else {
      const t0 = Date.now();
      let r: Awaited<ReturnType<typeof v1mod.generateOnServer>> | null = null;
      let thrown: unknown = null;
      try {
        r = await v1mod.generateOnServer({
          productImages: p.productImages,
          referenceImages,
          ratio: c.ratio,
          variations: c.variations,
          styleFragment: fragment || undefined,
        });
      } catch (err) {
        thrown = err;
      }
      const files: Array<Record<string, unknown>> = [];
      const failures: Array<{ kind: string; reason: string }> = [];
      if (r?.ok) {
        r.images.forEach((img, i) => {
          const name = `v1-${i + 1}${sniffExt(img.buffer)}`;
          fs.writeFileSync(path.join(dir, name), img.buffer);
          const s = sizeOf(img.buffer);
          files.push({ file: name, width: s?.width ?? null, height: s?.height ?? null, bytes: img.buffer.length });
        });
        r.failures.forEach((f) => failures.push(describeError(f)));
      } else if (r) {
        failures.push(describeError(r.error));
      } else {
        failures.push(describeError(thrown));
      }
      const prompt = r?.ok ? r.finalPrompt : lastImagePrompt.get(ctx) ?? null;
      if (prompt) fs.writeFileSync(path.join(dir, "v1-prompt.txt"), prompt);
      const my = callsOf(ctx);
      Object.assign(v1, {
        ok: !!r?.ok,
        files,
        prompt_file: prompt ? "v1-prompt.txt" : null,
        prompt_source: r?.ok ? "finalPrompt" : prompt ? "capturado del request de imagen" : null,
        director_fallback: prompt ? prompt.includes("Generate a professional commercial product photo, ") : null,
        time_ms: Date.now() - t0,
        failures,
        model_outputs: my.filter((x) => x.kind === "image" && x.image).map((x) => x.image),
        gemini_calls: my.length,
        retries: my.filter((x) => x.retry).length,
        cost_usd: costOf(ctx),
      });
      console.log(`[ab] ${ctx} listo: ${files.length}/${c.variations} imágenes, ${v1.time_ms}ms, ~US$${v1.cost_usd}`);
    }

    /* ---------------- v2 ---------------- */
    ctx = `${c.id}/v2`;
    const v2: Record<string, unknown> = {};
    {
      const t0 = Date.now();
      const store = storeFor(c.product);
      const deps: GenerateV2Deps = { apiKey, store: store as V2Store, imageModel: SAME_IMAGE_MODEL, startedAt: t0, log: logger };
      const input: GenerateV2Input = {
        userId: AB_USER_ID,
        productId: p.productId,
        versionId: p.versionId,
        productName: p.name,
        productDescription: p.description,
        productImages: p.productImages,
        referenceImages,
        styleId: c.styleId,
        styleFragment: fragment || undefined,
        ratio: c.ratio,
        variations: c.variations,
      };
      const files: Array<Record<string, unknown>> = [];
      const failures: Array<{ kind: string; reason: string }> = [];
      const phases: Record<string, number> = {};
      let snapshot: V2Snapshot | null = null;
      let extra: Record<string, unknown> = {};
      try {
        const downloads = await v2mod.downloadV2Inputs(input, deps);
        phases.download_ms = Date.now() - t0;
        const t1 = Date.now();
        const prep = await v2mod.prepareV2(input, downloads, deps);
        phases.prepare_ms = Date.now() - t1;
        if (!prep.ok) {
          failures.push(describeError(prep.error));
        } else {
          const t2 = Date.now();
          const rendered = await v2mod.renderV2(prep.prepared, deps);
          phases.render_ms = Date.now() - t2;
          snapshot = rendered.snapshot;
          if (rendered.ok) {
            for (const img of rendered.images) {
              const name = `v2-${img.index + 1}${sniffExt(img.buffer)}`;
              fs.writeFileSync(path.join(dir, name), img.buffer);
              const s = sizeOf(img.buffer);
              files.push({
                file: name,
                width: s?.width ?? null,
                height: s?.height ?? null,
                bytes: img.buffer.length,
                shot_index: img.metadata.shot_index,
                ratio_mismatch: img.ratioMismatch,
              });
            }
            rendered.failures.forEach((f) => failures.push(describeError(f)));
          } else {
            failures.push(describeError(rendered.error));
          }

          // Notas tal cual quedaron en el store (el snapshot solo guarda sus hashes).
          const productNote = snapshot?.productBriefHash
            ? await store.getProductBrief(p.productId, snapshot.productBriefHash)
            : null;
          const refNotes = await Promise.all(
            downloads.refs.map(async (img, k) => {
              const h = refBriefHash(p.name, img.url);
              const brief = await store.getReferenceBrief(p.productId, h);
              return { ref: k + 1, input: fingerprints.get(fp(img.data)) ?? null, hash: h, brief };
            }),
          );
          const nameOf = (data: string) => fingerprints.get(fp(data)) ?? "desconocida";
          const partsPerImage = prep.prepared.batch.prompts.map((_, i) =>
            buildImageParts(prep.prepared.batch, i, prep.prepared.images, { labels: true }).map((part) =>
              "text" in part
                ? `text(${part.text.length}): ${part.text.slice(0, 120).replace(/\s+/g, " ")}`
                : `image ${part.inlineData.mimeType} = ${nameOf(part.inlineData.data)}`,
            ),
          );
          extra = {
            notes: { product: productNote, references: refNotes },
            ab_image_parts: partsPerImage,
            ab_downloads: {
              product_photos: downloads.productPhotos.map((x) => nameOf(x.data)),
              refs: downloads.refs.map((x) => nameOf(x.data)),
              skipped: downloads.skippedUrls.length,
              failed: downloads.failedDownloads,
            },
          };
        }
      } catch (err) {
        failures.push(describeError(err));
      }
      if (snapshot) {
        snapshot.final_prompts.forEach((pr, i) => fs.writeFileSync(path.join(dir, `v2-prompt-${i + 1}.txt`), pr));
      }
      fs.writeFileSync(
        path.join(dir, "v2-snapshot.json"),
        JSON.stringify(redactDeep({ ...(snapshot ?? { snapshot: null }), ...extra, ab_log: v2Log.filter((l) => l.ctx === ctx) }), null, 2),
      );
      const my = callsOf(ctx);
      Object.assign(v2, {
        ok: files.length > 0,
        files,
        prompt_files: snapshot ? snapshot.final_prompts.map((_, i) => `v2-prompt-${i + 1}.txt`) : [],
        snapshot_file: "v2-snapshot.json",
        plan_source: snapshot?.plan_meta.plan_source ?? null,
        case_kind: snapshot?.case ?? null,
        director_error: snapshot?.plan_meta.director_error ?? null,
        director_attempts: snapshot?.plan_meta.director_attempts ?? null,
        cache: snapshot?.plan_meta.cache ?? null,
        repairs: snapshot?.plan_meta.repairs ?? [],
        dropped_refs: snapshot?.plan_meta.dropped_refs ?? [],
        effective_lock: snapshot?.plan_meta.effective_lock ?? null,
        image_failures: snapshot?.plan_meta.image_failures ?? [],
        time_ms: Date.now() - t0,
        phases,
        failures,
        model_outputs: my.filter((x) => x.kind === "image" && x.image).map((x) => x.image),
        gemini_calls: my.length,
        retries: my.filter((x) => x.retry).length,
        cost_usd: costOf(ctx),
      });
      console.log(`[ab] ${ctx} listo: ${files.length}/${c.variations} imágenes, plan=${v2.plan_source}, ${v2.time_ms}ms, ~US$${v2.cost_usd}`);
    }

    caseResults.push({
      id: c.id,
      product: c.product,
      styleId: c.styleId,
      useRef: c.useRef,
      ratio: c.ratio,
      variations: c.variations,
      why: c.why ?? null,
      cost_usd: round(Number(v1.cost_usd ?? 0) + Number(v2.cost_usd ?? 0)),
      v1,
      v2,
    });
    writeManifest();
  }

  writeManifest();
  console.log(`\n[ab] manifest: ${manifestPath}  costo estimado de esta corrida ~US$${spentUsd.toFixed(3)}`);
}

main().catch((err) => {
  console.error("[ab] fatal:", redact(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
