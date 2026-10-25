import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Plomería interna de lib/avisos. Todo lo de avisos corre con service_role: las
 * tablas de la 0028 no tienen grants para el cliente (salvo leer sus avisos y
 * el estado público de la IA).
 */

export type AdminClient = ReturnType<typeof createAdminClient>;

/** Cliente admin, o null si falta la config (nunca tira). */
export function adminClientOrNull(): AdminClient | null {
  try {
    return createAdminClient();
  } catch (err) {
    console.error("[avisos] Sin cliente admin de Supabase:", errorText(err));
    return null;
  }
}

/**
 * Corre `task` DESPUÉS de responder (`after()` de next/server) si hay un request
 * en curso; si no (script, fuera de request), la lanza ya sin esperarla. Nunca
 * tira, ni acá ni adentro de la tarea.
 */
export function runAfter(task: () => Promise<unknown>): void {
  const safe = async () => {
    try {
      await task();
    } catch (err) {
      console.error("[avisos] Falló una tarea en segundo plano:", errorText(err));
    }
  };
  try {
    after(safe);
  } catch {
    // `after` fuera de un request scope tira sincrónico: corremos igual.
    void safe();
  }
}

/** Mensaje de error legible sin filtrar objetos enteros a los logs. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(err);
}

/** Supabase-js devuelve el jsonb de una RPC escalar como objeto; aceptamos [objeto] también. */
export function rpcObject(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Array jsonb de una RPC (o [] si vino otra cosa). */
export function rpcArray(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
