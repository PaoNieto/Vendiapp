import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/constants";

/**
 * Guardar una imagen YA GENERADA (y pagada a Google) sin tirarla por un hipo.
 *
 * Antes: un error de Storage hacía `continue` con los bytes en memoria, un link
 * firmado que no salía contaba la imagen como fallida (con el archivo subido) y
 * el error del insert no se leía (se contaba como entregada). Ahora cada paso
 * se reintenta con los bytes en memoria y se lee su error.
 *
 * Regla de JonSnow (#1) para no fabricar "imagen gratis + devolución": si al
 * final la imagen no queda visible (sin link o sin fila), se BORRA el archivo
 * antes de contarla como perdida (la ruta la devuelve). Si no se puede borrar,
 * cuenta como entregada: el archivo quedó en la carpeta del cliente.
 *
 * Excepción (hallazgo de JonSnow del 16/10): si la tanda ya no existe (el dueño
 * borró su fila `generations`, que RLS le permite, y rompió la FK a propósito),
 * NO es "la perdimos nosotros": no se borra el archivo y cuenta como entregada
 * (`ownerDeleted`), así no se puede fabricar "descargo la imagen y me la
 * devuelven". Se chequea antes de subir y también si el insert da 23503.
 *
 * Usa el cliente ADMIN: el token de Clerk vence a los ~60 s y la ruta dura más.
 * El path va namespaceado por el userId de `auth()`.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

const BUCKET = "generated-images";
const ATTEMPTS = 3;

export type PersistStage = "storage" | "signed_url" | "insert";

export type PersistResult =
  | { ok: true; url: string; row: Record<string, unknown> | null }
  | {
      ok: false;
      stage: PersistStage;
      /** Error crudo: SOLO para la alerta a Paolo. */
      error: string;
      /** El archivo quedó en Storage y no se pudo borrar: cuenta como entregada (no se devuelve). */
      countsAsDelivered: boolean;
      /** El dueño borró la tanda mientras corría: cuenta como entregada, sin devolución (alerta B). */
      ownerDeleted?: boolean;
    };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetries<T>(
  fn: () => Promise<{ value: T | null; error: string | null; fatal?: boolean }>,
): Promise<{ value: T | null; error: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    try {
      const r = await fn();
      if (r.value !== null && !r.error) return { value: r.value, error: null };
      lastError = r.error ?? "sin datos";
      if (r.fatal) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { value: null, error: lastError };
}

/**
 * Sube `buffer` a `path`, firma el link y crea la fila de `generated_images`
 * (`row` + `image_url`). Devuelve la URL y la fila insertada (si `selectRow`).
 */
export async function persistGeneratedImage(
  admin: AdminClient,
  input: {
    path: string;
    buffer: Buffer;
    contentType: string;
    row: Record<string, unknown>;
    selectRow?: boolean;
  },
): Promise<PersistResult> {
  // 0. ¿La tanda sigue existiendo? Si el dueño la borró, cortamos sin subir y
  //    sin devolver. Un error de lectura NO corta (no castigamos un hipo).
  const generationId =
    typeof input.row.generation_id === "string" ? input.row.generation_id : null;
  if (generationId && (await generationGone(admin, generationId))) {
    return {
      ok: false,
      stage: "insert",
      error: "owner_deleted: la tanda ya no existe",
      countsAsDelivered: true,
      ownerDeleted: true,
    };
  }

  // 1. Storage. upsert: el path es nuestro y único por imagen, y un reintento
  //    puede encontrar el archivo que subió un intento cuya respuesta se perdió.
  const upload = await withRetries<true>(async () => {
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(input.path, input.buffer, { contentType: input.contentType, upsert: true });
    return { value: error ? null : true, error: error ? error.message : null };
  });
  if (!upload.value) {
    return { ok: false, stage: "storage", error: upload.error ?? "upload", countsAsDelivered: false };
  }

  // 2. Link firmado.
  const signed = await withRetries<string>(async () => {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(input.path, SIGNED_URL_TTL_SECONDS);
    const url = data?.signedUrl ?? "";
    return { value: url || null, error: error ? error.message : url ? null : "sin link" };
  });
  if (!signed.value) {
    const removed = await removeObject(admin, input.path);
    return {
      ok: false,
      stage: "signed_url",
      error: signed.error ?? "sin link",
      countsAsDelivered: !removed,
    };
  }
  const url = signed.value;

  // 3. Fila. Se LEE el error. Una FK rota (23503) = el dueño borró la tanda o
  //    el producto mientras corría: no tiene sentido reintentar.
  const inserted = await withRetries<Record<string, unknown>>(async () => {
    const base = admin.from("generated_images").insert({ ...input.row, image_url: url });
    if (input.selectRow) {
      const { data, error } = await base.select().single();
      return {
        value: error ? null : ((data as Record<string, unknown> | null) ?? {}),
        error: error ? `${error.code ?? ""} ${error.message}`.trim() : null,
        fatal: error?.code === "23503",
      };
    }
    const { error } = await base;
    return {
      value: error ? null : {},
      error: error ? `${error.code ?? ""} ${error.message}`.trim() : null,
      fatal: error?.code === "23503",
    };
  });
  if (!inserted.value) {
    if (inserted.error?.startsWith("23503")) {
      // FK rota = el dueño borró la tanda (o el producto) mientras corría. El
      // archivo se queda en su carpeta y cuenta como entregada: sin devolución.
      return {
        ok: false,
        stage: "insert",
        error: `owner_deleted: ${inserted.error}`,
        countsAsDelivered: true,
        ownerDeleted: true,
      };
    }
    const removed = await removeObject(admin, input.path);
    return {
      ok: false,
      stage: "insert",
      error: inserted.error ?? "insert",
      countsAsDelivered: !removed,
    };
  }
  return { ok: true, url, row: input.selectRow ? inserted.value : null };
}

/** true = confirmamos que la fila de la tanda NO existe. Ante un error, false. */
async function generationGone(admin: AdminClient, generationId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("generations")
      .select("id")
      .eq("id", generationId)
      .maybeSingle();
    return !error && !data;
  } catch {
    return false;
  }
}

/** Borra el archivo (con reintento). true = ya no está. */
async function removeObject(admin: AdminClient, path: string): Promise<boolean> {
  const r = await withRetries<true>(async () => {
    const { error } = await admin.storage.from(BUCKET).remove([path]);
    return { value: error ? null : true, error: error ? error.message : null };
  });
  return r.value === true;
}
