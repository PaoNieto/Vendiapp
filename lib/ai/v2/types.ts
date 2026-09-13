/**
 * Tipos compartidos del pipeline v2. Viven aparte para que los módulos puros
 * (assemble, validate-plan, fallback) no importen el orquestador ni nada con I/O.
 */

import type { callGemini } from "@/lib/ai/gemini-client";

/** Inyectable: el A/B y un dry-run pueden pasar un doble de `callGemini`. */
export type CallGeminiFn = typeof callGemini;

/** Una imagen ya descargada, lista para ir como `inlineData`. Se baja UNA vez por request. */
export type InlineImage = {
  url: string;
  mimeType: string;
  /** base64 */
  data: string;
  bytes: number;
};

/** Lo decide el CÓDIGO, nunca el modelo (spec §2.5). */
export type CaseKind = "ref_and_style" | "ref_only" | "style_only" | "none";

export type PlanSource = "director" | "fallback";

export const ITEM_IDS = ["A", "B", "C", "D", "E", "F"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export function isItemId(v: unknown): v is ItemId {
  return typeof v === "string" && (ITEM_IDS as readonly string[]).includes(v);
}

/** Log estructurado. Default: consola del server (Vercel lo junta por request). */
export type V2Logger = (event: string, data?: Record<string, unknown>) => void;

export const defaultV2Logger: V2Logger = (event, data) => {
  console.info(`[pipeline-v2] ${event}`, data ? JSON.stringify(data) : "");
};
