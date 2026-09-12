import "server-only";

/**
 * `V2Store` sobre Supabase (tablas de la migración 0026), con SERVICE ROLE.
 *
 * Por qué admin y no el cliente del usuario:
 *   - Las tablas tienen RLS prendido SIN policies: el usuario no las puede ni
 *     leer (la nota es texto que después llega al modelo de imagen; dejar que la
 *     edite sería abrir una puerta de inyección).
 *   - Se escribe DESPUÉS de llamadas largas a Gemini, cuando el token de Clerk
 *     (~60s de vida) ya venció. Mismo motivo que los uploads de route.ts:281.
 *
 * Todo es BEST-EFFORT: si la 0026 no está aplicada, cada lectura da error
 * ("relation does not exist"), se loguea y cuenta como cache miss; la generación
 * sigue con notas calculadas en el momento. Nada de esto puede tumbar una tanda.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { V2Store } from "@/lib/ai/v2/store";
import { defaultV2Logger, type V2Logger } from "@/lib/ai/v2/types";

type AdminClient = ReturnType<typeof createAdminClient>;

export function createSupabaseV2Store(log: V2Logger = defaultV2Logger): V2Store {
  // Perezoso: si faltan las env vars, `createAdminClient` lanza; lo atrapamos en
  // cada operación y queda como miss en vez de romper al construir el store.
  let client: AdminClient | null = null;
  const admin = (): AdminClient => {
    if (!client) client = createAdminClient();
    return client;
  };

  async function read(
    table: "product_briefs" | "reference_briefs" | "version_plans",
    keyColumn: "product_id" | "version_id",
    keyValue: string,
    inputsHash: string,
    column: "brief" | "plan",
  ): Promise<unknown | null> {
    try {
      const { data, error } = await admin()
        .from(table)
        .select(column)
        .eq(keyColumn, keyValue)
        .eq("inputs_hash", inputsHash)
        .maybeSingle();
      if (error) {
        log("store_read_error", { table, code: error.code, message: error.message });
        return null;
      }
      const row = data as Record<string, unknown> | null;
      return row?.[column] ?? null;
    } catch (err) {
      log("store_read_error", { table, message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  // upsert + ignoreDuplicates = `on conflict do nothing`: puede haber carrera
  // entre el cálculo en segundo plano (after()) y el lazy de la generación. El
  // primero gana; el segundo no pisa (y no es error). `overwrite` (solo planes
  // cacheados que ya no validan) = `on conflict do update`.
  async function write(
    table: "product_briefs" | "reference_briefs" | "version_plans",
    row: Record<string, unknown>,
    onConflict: string,
    overwrite = false,
  ): Promise<void> {
    try {
      const { error } = await admin().from(table).upsert(row, { onConflict, ignoreDuplicates: !overwrite });
      if (error) log("store_write_error", { table, code: error.code, message: error.message });
    } catch (err) {
      log("store_write_error", { table, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    getProductBrief: (productId, h) => read("product_briefs", "product_id", productId, h, "brief"),
    putProductBrief: (row) =>
      write(
        "product_briefs",
        { product_id: row.productId, user_id: row.userId, inputs_hash: row.inputsHash, photo_urls: row.photoUrls, brief: row.brief },
        "product_id,inputs_hash",
      ),
    getReferenceBrief: (productId, h) => read("reference_briefs", "product_id", productId, h, "brief"),
    putReferenceBrief: (row) =>
      write(
        "reference_briefs",
        { product_id: row.productId, user_id: row.userId, url: row.url, inputs_hash: row.inputsHash, brief: row.brief },
        "product_id,inputs_hash",
      ),
    getPlan: (versionId, h) => read("version_plans", "version_id", versionId, h, "plan"),
    putPlan: (row, opts) =>
      write(
        "version_plans",
        { version_id: row.versionId, user_id: row.userId, inputs_hash: row.inputsHash, plan: row.plan },
        "version_id,inputs_hash",
        opts?.overwrite === true,
      ),
    // La reserva vive en Postgres (advisory lock por usuario + insert en la misma
    // transacción): contar filas y encolar después dejaba pasar N pedidos
    // paralelos que veían el mismo cupo. Fail-closed: cualquier error → null.
    reserveBriefQuota: async (userId, cost, perHour) => {
      try {
        const { data, error } = await admin().rpc("check_brief_rate_limit", {
          p_user_id: userId,
          p_cost: cost,
          p_per_hour: perHour,
        });
        if (error) {
          log("store_quota_error", { code: error.code, message: error.message });
          return null;
        }
        // PostgREST devuelve el jsonb como objeto; aceptamos [objeto] también
        // (mismo criterio que check_generation_rate_limit en la ruta).
        const r = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; granted?: number } | null;
        if (!r || typeof r.granted !== "number") {
          log("store_quota_error", { message: "respuesta inesperada de check_brief_rate_limit" });
          return null;
        }
        return r.allowed ? r.granted : 0;
      } catch (err) {
        log("store_quota_error", { message: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
  };
}
