"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Buckets disponibles en Supabase Storage (migración 0006).
 *
 * Convención de path para los 4 privados:
 *   `<userId>/<resourceId>/<uuid>.<ext>`
 * Las RLS policies validan que `<userId>` coincida con `auth.uid()` en cada
 * operación. Si querés cambiar el layout, actualizá también
 * `0006_storage_buckets.sql` para que `storage.foldername(name)[1]` siga
 * apuntando al `user_id`.
 */
export type StorageBucket =
  | "product-uploads"
  | "references-uploads"
  | "generated-images"
  | "analysis-uploads"
  | "starter-references";

/** Resultado discriminado para `Promise.all` sin tirar la operación entera. */
export type UploadResult =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string };

/**
 * Límite blando para evitar levantar fotos enormes desde el browser. Si la
 * imagen pesa más, devolvemos un error friendly antes de pegarle a Storage.
 * (Supabase Storage admite hasta 50MB por archivo en el plan free; bajamos
 * a 5MB para experiencia mobile aceptable + ahorro de banda.)
 */
const MAX_BYTES = 5 * 1024 * 1024;

/** Buckets cuya URL es pública (no requiere signed URL). */
const PUBLIC_BUCKETS = new Set<StorageBucket>(["starter-references"]);

/** Mapeo de mimetype → extensión para nombre de archivo y `contentType`. */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
};

type DecodedInput = {
  blob: Blob;
  contentType: string;
  extension: string;
};

/**
 * Convierte el input (dataURL `data:image/...;base64,...`, `blob:` o `http(s):`)
 * a un `Blob` listo para subir. Si el input ya es una URL http(s) válida la
 * tratamos como "ya subida": el caller la pasa al state directo sin reupload.
 */
async function inputToBlob(
  input: string,
  fallbackExtension: string,
): Promise<DecodedInput | { error: string }> {
  // Caso 1: dataURL base64. `data:image/png;base64,iVBORw0KGgo...`
  if (input.startsWith("data:")) {
    const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/.exec(input);
    if (!match) return { error: "DataURL malformado" };
    const declaredMime = match[1] ?? "application/octet-stream";
    const isBase64 = input.includes(";base64,");
    const payload = match[2] ?? "";

    // ArrayBuffer "fresco" — TS 5.7 distingue Uint8Array<ArrayBuffer> de
    // Uint8Array<SharedArrayBuffer>; Blob() acepta sólo el primero. Allocamos
    // un ArrayBuffer concreto para mantener el tipo correcto.
    let arrayBuffer: ArrayBuffer;
    if (isBase64) {
      try {
        const binary = atob(payload);
        arrayBuffer = new ArrayBuffer(binary.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < binary.length; i += 1) {
          view[i] = binary.charCodeAt(i);
        }
      } catch {
        return { error: "Base64 inválido en dataURL" };
      }
    } else {
      // dataURL sin base64 (ej. svg+xml,utf8) — decodificamos como UTF-8.
      try {
        const text = decodeURIComponent(payload);
        const encoded = new TextEncoder().encode(text);
        arrayBuffer = new ArrayBuffer(encoded.byteLength);
        new Uint8Array(arrayBuffer).set(encoded);
      } catch {
        return { error: "DataURL utf8 inválido" };
      }
    }

    if (arrayBuffer.byteLength > MAX_BYTES) {
      return { error: "La imagen supera el límite de 5MB" };
    }
    const extension = MIME_TO_EXT[declaredMime] ?? fallbackExtension;
    const contentType = declaredMime;
    const blob = new Blob([arrayBuffer], { type: contentType });
    return { blob, contentType, extension };
  }

  // Caso 2: blob URL del browser. Pedimos al runtime que la materialice.
  if (input.startsWith("blob:")) {
    try {
      const response = await fetch(input);
      if (!response.ok) {
        return { error: `Blob URL no accesible (${response.status})` };
      }
      const blob = await response.blob();
      if (blob.size > MAX_BYTES) {
        return { error: "La imagen supera el límite de 5MB" };
      }
      const contentType = blob.type || EXT_TO_MIME[fallbackExtension] || "image/png";
      const extension = MIME_TO_EXT[contentType] ?? fallbackExtension;
      return { blob, contentType, extension };
    } catch (err) {
      return {
        error: `No pude leer la blob URL: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Caso 3: ya es una URL http(s) — el caller probablemente la pasó por error;
  // devolvemos error explícito para que decida qué hacer (típicamente
  // saltearla en el upload y guardarla tal cual).
  return { error: "Input ya es una URL remota (no necesita upload)" };
}

/**
 * Heurística: detecta si `input` ya es una URL persistente (http/https). En ese
 * caso, los stores deberían dejarla pasar sin re-subir.
 */
export function isPersistedUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

/**
 * Sube un dataURL (o blob URL) al bucket dado. La key se arma como
 * `{userId}/{resourceId}/{uuid}.{ext}` para que RLS valide ownership.
 * Devuelve la URL pública (signed o public según el bucket).
 */
export async function uploadImageToBucket(opts: {
  bucket: StorageBucket;
  userId: string;
  resourceId: string;
  dataUrl: string;
  extension?: string;
}): Promise<UploadResult> {
  const { bucket, userId, resourceId, dataUrl, extension } = opts;
  const fallbackExtension = extension ?? "png";

  if (!userId) {
    return { ok: false, error: "userId requerido para subir a Storage" };
  }
  if (!resourceId) {
    return { ok: false, error: "resourceId requerido para subir a Storage" };
  }

  const decoded = await inputToBlob(dataUrl, fallbackExtension);
  if ("error" in decoded) {
    return { ok: false, error: decoded.error };
  }

  const path = `${userId}/${resourceId}/${crypto.randomUUID()}.${decoded.extension}`;
  const supabase = createClient();

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, decoded.blob, {
      contentType: decoded.contentType,
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  if (PUBLIC_BUCKETS.has(bucket)) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { ok: true, url: data.publicUrl, path };
  }

  // Bucket privado → URL firmada de larga duración (1 año). En fase 2, cuando
  // rotemos firmas o usemos un proxy con permisos, esto se reemplaza por
  // signedUrls de minutos + refresh.
  const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ONE_YEAR_SECONDS);
  if (signError || !signed?.signedUrl) {
    return {
      ok: false,
      error: signError?.message ?? "No pude firmar la URL del archivo",
    };
  }
  return { ok: true, url: signed.signedUrl, path };
}

/**
 * Sube N imágenes en paralelo. Devuelve array con un UploadResult por imagen
 * (mismo orden que el input). Si alguna falla, el resto sigue.
 */
export async function uploadImagesToBucket(opts: {
  bucket: StorageBucket;
  userId: string;
  resourceId: string;
  dataUrls: string[];
  extension?: string;
}): Promise<UploadResult[]> {
  const { bucket, userId, resourceId, dataUrls, extension } = opts;
  return Promise.all(
    dataUrls.map((dataUrl) =>
      uploadImageToBucket({
        bucket,
        userId,
        resourceId,
        dataUrl,
        extension,
      }),
    ),
  );
}
