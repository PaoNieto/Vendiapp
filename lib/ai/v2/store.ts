/**
 * Almacén de notas y planes de la v2 — interfaz INYECTABLE.
 *
 * La orquestación (generate-v2.ts) no sabe de Supabase: recibe un `V2Store`. En
 * producción es `createSupabaseV2Store()` (service_role, tablas de la migración
 * 0026); en el A/B o en un dry-run es `createMemoryStore()` o `nullStore`, así
 * se puede correr el pipeline completo sin base de datos.
 *
 * Contrato: los métodos NUNCA lanzan. Una lectura que falla (tabla inexistente
 * porque la 0026 no se aplicó, red, lo que sea) es un cache miss; una escritura
 * que falla se loguea y la generación sigue. Los `get` devuelven el JSON crudo:
 * el que llama lo RE-VALIDA con zod antes de usarlo (lo que está en la base
 * pudo escribirlo una versión anterior del código).
 */

import type { Plan } from "@/lib/ai/v2/director";
import type { ProductBrief } from "@/lib/ai/v2/product-brief";
import type { ReferenceBrief } from "@/lib/ai/v2/reference-brief";

export type ProductBriefRow = {
  productId: string;
  userId: string;
  inputsHash: string;
  /** URLs en el orden en que se mandaron (photo_index 1..P). */
  photoUrls: string[];
  brief: ProductBrief;
};

export type ReferenceBriefRow = {
  productId: string;
  userId: string;
  url: string;
  inputsHash: string;
  brief: ReferenceBrief;
};

/** Solo planes de origen `director`: los del fallback no se cachean. */
export type PlanRow = {
  versionId: string;
  userId: string;
  inputsHash: string;
  plan: Plan;
};

export interface V2Store {
  getProductBrief(productId: string, inputsHash: string): Promise<unknown | null>;
  putProductBrief(row: ProductBriefRow): Promise<void>;
  getReferenceBrief(productId: string, inputsHash: string): Promise<unknown | null>;
  putReferenceBrief(row: ReferenceBriefRow): Promise<void>;
  getPlan(versionId: string, inputsHash: string): Promise<unknown | null>;
  /**
   * `overwrite: true` pisa la fila de esa clave. Solo se usa cuando el plan
   * cacheado ya no pasa la validación: con `on conflict do nothing` un plan
   * inválido quedaba para siempre y cada tanda pagaba el Director.
   */
  putPlan(row: PlanRow, opts?: { overwrite?: boolean }): Promise<void>;
  /**
   * RESERVA de forma atómica hasta `cost` notas del tope por hora (RPC
   * `check_brief_rate_limit` de la 0026) ANTES de llamar a Gemini. Cuenta
   * INTENTOS, no notas guardadas: una nota que falla también consume cupo.
   * Devuelve cuántas se reservaron (0 = sin cupo) o `null` si no se pudo
   * reservar (RPC ausente, red): el que llama no gasta nada en ese caso.
   */
  reserveBriefQuota(userId: string, cost: number, perHour: number): Promise<number | null>;
}

/** Siempre cache miss, nunca escribe. Para dry-runs que quieren llamar a todo. */
export const nullStore: V2Store = {
  getProductBrief: async () => null,
  putProductBrief: async () => undefined,
  getReferenceBrief: async () => null,
  putReferenceBrief: async () => undefined,
  getPlan: async () => null,
  putPlan: async () => undefined,
  reserveBriefQuota: async (_userId, cost) => cost,
};

type Stamped<T> = { value: T; userId: string; createdAt: number };

/**
 * Store en memoria con la MISMA semántica que la base: la primera escritura por
 * clave gana (on conflict do nothing). Útil para el A/B: la segunda corrida del
 * mismo caso reusa notas y plan, igual que en producción.
 */
export function createMemoryStore(): V2Store & {
  dump(): { productBriefs: number; referenceBriefs: number; plans: number };
} {
  const productBriefs = new Map<string, Stamped<ProductBrief>>();
  const referenceBriefs = new Map<string, Stamped<ReferenceBrief>>();
  const plans = new Map<string, Stamped<Plan>>();
  const attempts: Array<{ userId: string; cost: number; at: number }> = [];
  const key = (a: string, b: string) => `${a}|${b}`;
  const putOnce = <T>(m: Map<string, Stamped<T>>, k: string, value: T, userId: string) => {
    if (!m.has(k)) m.set(k, { value, userId, createdAt: Date.now() });
  };

  return {
    getProductBrief: async (productId, h) => productBriefs.get(key(productId, h))?.value ?? null,
    putProductBrief: async (row) => putOnce(productBriefs, key(row.productId, row.inputsHash), row.brief, row.userId),
    getReferenceBrief: async (productId, h) => referenceBriefs.get(key(productId, h))?.value ?? null,
    putReferenceBrief: async (row) => putOnce(referenceBriefs, key(row.productId, row.inputsHash), row.brief, row.userId),
    getPlan: async (versionId, h) => plans.get(key(versionId, h))?.value ?? null,
    putPlan: async (row, opts) => {
      const k = key(row.versionId, row.inputsHash);
      if (opts?.overwrite) plans.set(k, { value: row.plan, userId: row.userId, createdAt: Date.now() });
      else putOnce(plans, k, row.plan, row.userId);
    },
    // Misma semántica que la RPC: reserva lo que entre del pedido (parcial para
    // las referencias) y cuenta intentos de la última hora.
    reserveBriefQuota: async (userId, cost, perHour) => {
      const since = Date.now() - 60 * 60 * 1000;
      const used = attempts.filter((a) => a.userId === userId && a.at > since).reduce((s, a) => s + a.cost, 0);
      const grant = Math.min(cost, perHour - used);
      if (grant < 1) return 0;
      attempts.push({ userId, cost: grant, at: Date.now() });
      return grant;
    },
    dump: () => ({ productBriefs: productBriefs.size, referenceBriefs: referenceBriefs.size, plans: plans.size }),
  };
}
