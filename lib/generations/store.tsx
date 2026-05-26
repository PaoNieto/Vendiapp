"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { OutputRatio } from "@/lib/constants";
import { useUser } from "@/lib/auth/use-user";
import { createClient } from "@/lib/supabase/client";
import {
  isPersistedUrl,
  uploadImagesToBucket,
  type UploadResult,
} from "@/lib/supabase/storage";

// LEGACY: hasta 2026-05-24 este store leía/escribía a localStorage en la key
// `vendi:generations` (con generations + images embebidas). Ya no se escribe
// ni lee — los datos viven en Supabase (tablas `public.generations` y
// `public.generated_images`, filtradas por `auth.uid()` vía RLS). Si encontrás
// un `vendi:generations` viejo en tu browser, ignoralo: ya no es la fuente
// de verdad.

// TODO(migration): script one-off para migrar dataURLs existentes de la DB a
// Storage. Por ahora se manejan en cliente con backwards compat — las URLs
// http/https subidas conviven en `image_url` con dataURLs viejos.

/**
 * Shape espejo de la tabla `public.generations` de Supabase.
 *
 * Diferencias intencionales:
 * - `user_id` se omite del tipo del cliente (lo inyecta el INSERT + RLS filtra).
 * - `product_images` / `reference_images` se tipan como `string[]` (URLs o paths
 *   a Storage). En Postgres son `jsonb`; un array de strings serializa 1:1.
 * - `enriched_prompt` es `Record<string, unknown> | null` — el director de arte
 *   devuelve un objeto con keys (scene, lighting, etc.) que no vale la pena
 *   tipar fino acá porque su contrato lo define el backend, no el cliente.
 * - Timestamps como ISO 8601 (`string`) — Postgres los devuelve así via PostgREST.
 */
export type GenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type Generation = {
  id: string;
  /**
   * FK al producto (en el lenguaje del UI). El nombre de la columna en Postgres
   * sigue siendo `project_id` para preservar la migración 0001 — no renombrar.
   * Conceptualmente apunta a un `Product` del store `lib/products/store`.
   */
  project_id: string | null;
  /**
   * FK a la versión que originó esta generación. Migración 0003 introduce la
   * tabla `versions` y agrega `version_id` a `generations`. Sigue siendo
   * nullable para preservar compat con generaciones viejas que se crearon
   * antes del concepto de versión.
   */
  version_id: string | null;
  status: GenerationStatus;
  product_images: string[];
  reference_images: string[];
  user_prompt: string | null;
  enriched_prompt: Record<string, unknown> | null;
  output_ratio: OutputRatio;
  variations_requested: number;
  cost_credits: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

/**
 * Shape espejo de `public.generated_images`. Lo guardamos en el mismo store que
 * `generations` porque siempre se consultan juntos.
 */
export type GeneratedImage = {
  id: string;
  generation_id: string;
  image_url: string;
  thumbnail_url: string | null;
  variation_index: number;
  metadata: Record<string, unknown> | null;
  user_rating: 1 | 2 | 3 | 4 | 5 | null;
  is_favorite: boolean;
  is_downloaded: boolean;
  /**
   * Prompt editable por usuario asociado a esta variación. Cuando el usuario
   * regenera la imagen, este texto pisa el estilo + referencias de la versión.
   * Default: `""` (vacío) — el frontend lo puede poblar con
   * `buildPromptFromBrief(version)` al crear la imagen.
   */
  strict_prompt: string;
  created_at: string;
};

export type GenerationCreateInput = {
  project_id?: string;
  /**
   * Versión que originó la generación. Opcional para conservar el flujo
   * legacy sin versión, pero recomendado para todo flujo nuevo.
   */
  version_id?: string;
  product_images: string[];
  reference_images: string[];
  user_prompt?: string;
  output_ratio: OutputRatio;
  variations_requested: number;
  cost_credits?: number;
};

export type GenerationStats = {
  thisWeek: number;
  activeProjects: number;
  lastGeneratedAt: string | null;
};

type GenerationsState = {
  generations: Generation[];
  images: GeneratedImage[];
};

const INITIAL: GenerationsState = {
  generations: [],
  images: [],
};

type GenerationsContextValue = {
  state: GenerationsState;
  hydrated: boolean;
  error: string | null;
  createGeneration: (input: GenerationCreateInput) => Generation;
  markProcessing: (id: string) => void;
  markCompleted: (id: string) => void;
  markFailed: (id: string, error_message: string) => void;
  /**
   * Adjunta imagenes generadas a una generation. `finalPrompt` (opcional)
   * es el prompt que efectivamente uso Nano Banana — se persiste como
   * `strict_prompt` de cada imagen para que el modo estricto post-gen
   * tenga base editable. Si no se pasa, queda en "".
   */
  attachImages: (
    generationId: string,
    urls: string[],
    finalPrompt?: string,
  ) => void;
  toggleFavorite: (imageId: string) => void;
  rate: (imageId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  /**
   * Actualiza el prompt estricto de una imagen generada. Lo usa la UI de
   * "Generador" para que cada variación tenga su prompt editable propio.
   */
  setImagePrompt: (imageId: string, prompt: string) => void;
  getRecent: (limit?: number) => Generation[];
  /** Devuelve las generaciones de una versión, orden desc por created_at. */
  getByVersionId: (versionId: string) => Generation[];
  getStats: () => GenerationStats;
  seedDevData: () => void;
};

const GenerationsContext = createContext<GenerationsContextValue | null>(null);

const ALLOWED_RATIOS: ReadonlyArray<OutputRatio> = [
  "1:1",
  "4:5",
  "9:16",
  "16:9",
];

function isOutputRatio(v: unknown): v is OutputRatio {
  return typeof v === "string" && (ALLOWED_RATIOS as readonly string[]).includes(v);
}

function isGenerationStatus(v: unknown): v is GenerationStatus {
  return v === "pending" || v === "processing" || v === "completed" || v === "failed";
}

function isRating(v: unknown): v is 1 | 2 | 3 | 4 | 5 | null {
  if (v === null) return true;
  return typeof v === "number" && v >= 1 && v <= 5 && Number.isInteger(v);
}

function parseGenerationRow(row: unknown): Generation | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const status = isGenerationStatus(r.status) ? r.status : "pending";
  const ratio = isOutputRatio(r.output_ratio) ? r.output_ratio : "1:1";
  // `enriched_prompt` puede venir como objeto (jsonb) o `null`.
  let enriched: Record<string, unknown> | null = null;
  if (r.enriched_prompt && typeof r.enriched_prompt === "object" && !Array.isArray(r.enriched_prompt)) {
    enriched = r.enriched_prompt as Record<string, unknown>;
  }
  return {
    id: r.id,
    project_id: typeof r.project_id === "string" ? r.project_id : null,
    version_id: typeof r.version_id === "string" ? r.version_id : null,
    status,
    product_images: Array.isArray(r.product_images)
      ? r.product_images.filter((u): u is string => typeof u === "string")
      : [],
    reference_images: Array.isArray(r.reference_images)
      ? r.reference_images.filter((u): u is string => typeof u === "string")
      : [],
    user_prompt: typeof r.user_prompt === "string" ? r.user_prompt : null,
    enriched_prompt: enriched,
    output_ratio: ratio,
    variations_requested:
      typeof r.variations_requested === "number" ? r.variations_requested : 5,
    cost_credits: typeof r.cost_credits === "number" ? r.cost_credits : 1,
    error_message: typeof r.error_message === "string" ? r.error_message : null,
    created_at:
      typeof r.created_at === "string"
        ? r.created_at
        : new Date().toISOString(),
    completed_at: typeof r.completed_at === "string" ? r.completed_at : null,
  };
}

function parseGeneratedImageRow(row: unknown): GeneratedImage | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  if (typeof r.generation_id !== "string") return null;
  if (typeof r.image_url !== "string") return null;
  const rating = isRating(r.user_rating) ? r.user_rating : null;
  let metadata: Record<string, unknown> | null = null;
  if (r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)) {
    metadata = r.metadata as Record<string, unknown>;
  }
  return {
    id: r.id,
    generation_id: r.generation_id,
    image_url: r.image_url,
    thumbnail_url: typeof r.thumbnail_url === "string" ? r.thumbnail_url : null,
    variation_index:
      typeof r.variation_index === "number" ? r.variation_index : 0,
    metadata,
    user_rating: rating,
    is_favorite: typeof r.is_favorite === "boolean" ? r.is_favorite : false,
    is_downloaded:
      typeof r.is_downloaded === "boolean" ? r.is_downloaded : false,
    strict_prompt: typeof r.strict_prompt === "string" ? r.strict_prompt : "",
    created_at:
      typeof r.created_at === "string"
        ? r.created_at
        : new Date().toISOString(),
  };
}

export function GenerationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [state, setLocalState] = useState<GenerationsState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch en paralelo de ambas tablas para no esperar 2 round-trips serial.
  // Mismo patrón que ProductsProvider: sync con external auth state.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync con external auth state (Supabase Context).
      setLocalState(INITIAL);
      setHydrated(false);
      return;
    }
    let cancelled = false;
    setHydrated(false);

    Promise.all([
      supabase
        .from("generations")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("generated_images")
        .select("*")
        .order("created_at", { ascending: false }),
    ]).then(([gensResult, imagesResult]) => {
      if (cancelled) return;
      if (gensResult.error) {
        console.error("Failed to fetch generations:", gensResult.error);
        setError(gensResult.error.message);
        setHydrated(true);
        return;
      }
      if (imagesResult.error) {
        console.error("Failed to fetch generated_images:", imagesResult.error);
        setError(imagesResult.error.message);
        setHydrated(true);
        return;
      }
      const genRows = Array.isArray(gensResult.data) ? gensResult.data : [];
      const imgRows = Array.isArray(imagesResult.data) ? imagesResult.data : [];
      const parsedGens: Generation[] = [];
      for (const row of genRows) {
        const g = parseGenerationRow(row);
        if (g) parsedGens.push(g);
      }
      const parsedImages: GeneratedImage[] = [];
      for (const row of imgRows) {
        const img = parseGeneratedImageRow(row);
        if (img) parsedImages.push(img);
      }
      setLocalState({ generations: parsedGens, images: parsedImages });
      setError(null);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const createGeneration = useCallback(
    (input: GenerationCreateInput): Generation => {
      const currentUser = user;
      const now = new Date().toISOString();
      const optimistic: Generation = {
        id: crypto.randomUUID(),
        project_id: input.project_id ?? null,
        version_id: input.version_id ?? null,
        status: "pending",
        product_images: input.product_images,
        reference_images: input.reference_images,
        user_prompt: input.user_prompt ?? null,
        enriched_prompt: null,
        output_ratio: input.output_ratio,
        variations_requested: input.variations_requested,
        cost_credits: input.cost_credits ?? 1,
        error_message: null,
        created_at: now,
        completed_at: null,
      };
      setLocalState((prev) => ({
        ...prev,
        generations: [optimistic, ...prev.generations],
      }));

      if (!currentUser) {
        console.error("createGeneration called without a logged-in user");
        setError("No hay sesión activa.");
        setLocalState((prev) => ({
          ...prev,
          generations: prev.generations.filter((g) => g.id !== optimistic.id),
        }));
        return optimistic;
      }

      void supabase
        .from("generations")
        .insert({
          id: optimistic.id,
          user_id: currentUser.id,
          project_id: optimistic.project_id,
          version_id: optimistic.version_id,
          status: optimistic.status,
          product_images: optimistic.product_images,
          reference_images: optimistic.reference_images,
          user_prompt: optimistic.user_prompt,
          output_ratio: optimistic.output_ratio,
          variations_requested: optimistic.variations_requested,
          cost_credits: optimistic.cost_credits,
        })
        .select()
        .single()
        .then(({ data, error: insertError }) => {
          if (insertError) {
            console.error("Failed to insert generation:", insertError);
            setError(insertError.message);
            setLocalState((prev) => ({
              ...prev,
              generations: prev.generations.filter(
                (g) => g.id !== optimistic.id,
              ),
            }));
            return;
          }
          const parsed = parseGenerationRow(data);
          if (!parsed) return;
          setLocalState((prev) => ({
            ...prev,
            generations: prev.generations.map((g) =>
              g.id === parsed.id ? parsed : g,
            ),
          }));
          setError(null);
        });

      return optimistic;
    },
    [supabase, user],
  );

  // Helper privado para updates parciales de una generation (status, etc).
  // Hace optimistic update + persist + rollback si falla.
  const patchGeneration = useCallback(
    (id: string, patch: Partial<Generation>) => {
      let snapshot: Generation | undefined;
      setLocalState((prev) => {
        snapshot = prev.generations.find((g) => g.id === id);
        return {
          ...prev,
          generations: prev.generations.map((g) =>
            g.id === id ? { ...g, ...patch, id: g.id } : g,
          ),
        };
      });
      if (!user || !snapshot) return;
      const captured = snapshot;

      const dbPatch: Record<string, unknown> = {};
      if ("status" in patch) dbPatch.status = patch.status;
      if ("completed_at" in patch) dbPatch.completed_at = patch.completed_at;
      if ("error_message" in patch) dbPatch.error_message = patch.error_message;
      if ("enriched_prompt" in patch)
        dbPatch.enriched_prompt = patch.enriched_prompt;

      if (Object.keys(dbPatch).length === 0) return;

      void supabase
        .from("generations")
        .update(dbPatch)
        .eq("id", id)
        .then(({ error: updateError }) => {
          if (updateError) {
            console.error("Failed to patch generation:", updateError);
            setError(updateError.message);
            setLocalState((prev) => ({
              ...prev,
              generations: prev.generations.map((g) =>
                g.id === id ? captured : g,
              ),
            }));
            return;
          }
          setError(null);
        });
    },
    [supabase, user],
  );

  const markProcessing = useCallback(
    (id: string) => {
      patchGeneration(id, { status: "processing" });
    },
    [patchGeneration],
  );

  const markCompleted = useCallback(
    (id: string) => {
      patchGeneration(id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: null,
      });
    },
    [patchGeneration],
  );

  const markFailed = useCallback(
    (id: string, error_message: string) => {
      patchGeneration(id, {
        status: "failed",
        error_message,
        completed_at: new Date().toISOString(),
      });
    },
    [patchGeneration],
  );

  const attachImages = useCallback(
    (generationId: string, urls: string[], finalPrompt?: string) => {
      const currentUser = user;
      const now = new Date().toISOString();
      // Optimistic: insertamos las imágenes con los dataURLs originales para
      // que la UI las pinte de inmediato. Luego de subir a Storage, pisamos
      // `image_url` con la URL persistida.
      // `strict_prompt` arranca con el prompt que produjo la imagen (si el
      // caller lo paso). Sin esto, el modo "Prompt estricto" post-gen no
      // tendria base editable — el usuario veria un textarea vacio.
      const initialStrictPrompt = finalPrompt ?? "";
      const newImages: GeneratedImage[] = urls.map((url, index) => ({
        id: crypto.randomUUID(),
        generation_id: generationId,
        image_url: url,
        thumbnail_url: null,
        variation_index: index,
        metadata: null,
        user_rating: null,
        is_favorite: false,
        is_downloaded: false,
        strict_prompt: initialStrictPrompt,
        created_at: now,
      }));
      setLocalState((prev) => ({
        ...prev,
        images: [...newImages, ...prev.images],
      }));

      if (!currentUser) {
        console.error("attachImages called without a logged-in user");
        setError("No hay sesión activa.");
        const newIds = new Set(newImages.map((img) => img.id));
        setLocalState((prev) => ({
          ...prev,
          images: prev.images.filter((img) => !newIds.has(img.id)),
        }));
        return;
      }

      void (async () => {
        // Partimos los inputs en "ya URL persistida" vs "para subir".
        type Slot =
          | { kind: "kept"; value: string; idx: number }
          | { kind: "pending"; value: string; idx: number };
        const slots: Slot[] = urls.map((u, idx) =>
          isPersistedUrl(u)
            ? { kind: "kept", value: u, idx }
            : { kind: "pending", value: u, idx },
        );
        const pendingInputs = slots
          .filter((s): s is Extract<Slot, { kind: "pending" }> => s.kind === "pending")
          .map((s) => s.value);

        let uploaded: UploadResult[] = [];
        if (pendingInputs.length > 0) {
          uploaded = await uploadImagesToBucket({
            bucket: "generated-images",
            userId: currentUser.id,
            resourceId: generationId,
            dataUrls: pendingInputs,
          });
        }

        const failures: string[] = [];
        let uploadCursor = 0;
        const finalUrls = slots.map((slot) => {
          if (slot.kind === "kept") return slot.value;
          const res = uploaded[uploadCursor];
          uploadCursor += 1;
          if (!res || !res.ok) {
            if (res && !res.ok) failures.push(res.error);
            return slot.value;
          }
          return res.url;
        });

        if (failures.length > 0) {
          console.error("Some generated-image uploads failed:", failures);
          setError(`No pude subir ${failures.length} imagen(es) generada(s).`);
        }

        // Sync state local con las URLs reales.
        const persistedById = new Map<string, string>();
        newImages.forEach((img, i) => {
          persistedById.set(img.id, finalUrls[i]);
        });
        setLocalState((prev) => ({
          ...prev,
          images: prev.images.map((img) => {
            const next = persistedById.get(img.id);
            return next ? { ...img, image_url: next } : img;
          }),
        }));

        // Bulk insert con las URLs reales (o dataURLs degradados si fallaron).
        const payload = newImages.map((img, i) => ({
          id: img.id,
          generation_id: img.generation_id,
          user_id: currentUser.id,
          image_url: finalUrls[i],
          thumbnail_url: img.thumbnail_url,
          variation_index: img.variation_index,
          metadata: img.metadata,
          is_favorite: img.is_favorite,
          is_downloaded: img.is_downloaded,
          strict_prompt: img.strict_prompt,
        }));

        const { data, error: insertError } = await supabase
          .from("generated_images")
          .insert(payload)
          .select();
        if (insertError) {
          console.error("Failed to insert generated_images:", insertError);
          setError(insertError.message);
          const newIds = new Set(newImages.map((img) => img.id));
          setLocalState((prev) => ({
            ...prev,
            images: prev.images.filter((img) => !newIds.has(img.id)),
          }));
          return;
        }
        // Reemplazamos los optimistas por las rows reales del server.
        const returned = Array.isArray(data) ? data : [];
        const parsedById = new Map<string, GeneratedImage>();
        for (const row of returned) {
          const parsed = parseGeneratedImageRow(row);
          if (parsed) parsedById.set(parsed.id, parsed);
        }
        setLocalState((prev) => ({
          ...prev,
          images: prev.images.map((img) => parsedById.get(img.id) ?? img),
        }));
        if (failures.length === 0) setError(null);
      })();
    },
    [supabase, user],
  );

  // Helper privado para patches a generated_images.
  const patchImage = useCallback(
    (imageId: string, patch: Partial<GeneratedImage>) => {
      let snapshot: GeneratedImage | undefined;
      setLocalState((prev) => {
        snapshot = prev.images.find((img) => img.id === imageId);
        return {
          ...prev,
          images: prev.images.map((img) =>
            img.id === imageId ? { ...img, ...patch, id: img.id } : img,
          ),
        };
      });
      if (!user || !snapshot) return;
      const captured = snapshot;

      const dbPatch: Record<string, unknown> = {};
      if ("is_favorite" in patch) dbPatch.is_favorite = patch.is_favorite;
      if ("is_downloaded" in patch) dbPatch.is_downloaded = patch.is_downloaded;
      if ("user_rating" in patch) dbPatch.user_rating = patch.user_rating;
      if ("strict_prompt" in patch) dbPatch.strict_prompt = patch.strict_prompt;
      if ("thumbnail_url" in patch) dbPatch.thumbnail_url = patch.thumbnail_url;

      if (Object.keys(dbPatch).length === 0) return;

      void supabase
        .from("generated_images")
        .update(dbPatch)
        .eq("id", imageId)
        .then(({ error: updateError }) => {
          if (updateError) {
            console.error("Failed to patch generated_image:", updateError);
            setError(updateError.message);
            setLocalState((prev) => ({
              ...prev,
              images: prev.images.map((img) =>
                img.id === imageId ? captured : img,
              ),
            }));
            return;
          }
          setError(null);
        });
    },
    [supabase, user],
  );

  const toggleFavorite = useCallback(
    (imageId: string) => {
      const current = state.images.find((img) => img.id === imageId);
      if (!current) return;
      patchImage(imageId, { is_favorite: !current.is_favorite });
    },
    [state.images, patchImage],
  );

  const rate = useCallback(
    (imageId: string, rating: 1 | 2 | 3 | 4 | 5) => {
      patchImage(imageId, { user_rating: rating });
    },
    [patchImage],
  );

  const setImagePrompt = useCallback(
    (imageId: string, prompt: string) => {
      patchImage(imageId, { strict_prompt: prompt });
    },
    [patchImage],
  );

  const getRecent = useCallback(
    (limit = 6): Generation[] => {
      return [...state.generations]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit);
    },
    [state.generations],
  );

  const getByVersionId = useCallback(
    (versionId: string): Generation[] => {
      return state.generations
        .filter((g) => g.version_id === versionId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
    [state.generations],
  );

  const getStats = useCallback((): GenerationStats => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let thisWeek = 0;
    // `activeProjects` (nombre legacy) ahora cuenta **versiones distintas**
    // con al menos una generación pending/processing. Si la generación no
    // tiene version_id (compat con datos viejos), cae al project_id como
    // bucket — así el contador no queda subestimado durante la migración.
    const activeBuckets = new Set<string>();
    let lastCompletedMs = -Infinity;
    let lastGeneratedAt: string | null = null;

    for (const g of state.generations) {
      const createdMs = Date.parse(g.created_at);
      if (!Number.isNaN(createdMs) && createdMs >= weekAgo) {
        thisWeek += 1;
      }
      if (g.status === "processing" || g.status === "pending") {
        const bucket = g.version_id ?? g.project_id;
        if (bucket) activeBuckets.add(bucket);
      }
      if (g.status === "completed" && g.completed_at) {
        const completedMs = Date.parse(g.completed_at);
        if (!Number.isNaN(completedMs) && completedMs > lastCompletedMs) {
          lastCompletedMs = completedMs;
          lastGeneratedAt = g.completed_at;
        }
      }
    }

    return {
      thisWeek,
      activeProjects: activeBuckets.size,
      lastGeneratedAt,
    };
  }, [state.generations]);

  /**
   * Siembra 5 generaciones de ejemplo en Supabase para el usuario actual.
   * Antes leíamos versiones del localStorage; ahora consultamos Supabase
   * directamente. Si no hay versiones cargadas, las generations quedan con
   * `version_id: null` (compat con flujo legacy). NO duplicamos si el usuario
   * ya tiene >= 1 generation.
   */
  const seedDevData = useCallback(() => {
    if (!user) return;
    if (state.generations.length > 0) return;

    void supabase
      .from("versions")
      .select("id")
      .then(({ data, error: queryError }) => {
        if (queryError) {
          console.error("Failed to read versions for gen seed:", queryError);
          setError(queryError.message);
          return;
        }
        const versionIds = Array.isArray(data)
          ? data
              .map((row) => {
                if (!row || typeof row !== "object") return null;
                const r = row as Record<string, unknown>;
                return typeof r.id === "string" ? r.id : null;
              })
              .filter((id): id is string => id !== null)
          : [];

        const pick = (idx: number): string | undefined =>
          versionIds.length > 0
            ? versionIds[idx % versionIds.length]
            : undefined;

        const blueprints: Array<{
          input: GenerationCreateInput;
          finalStatus: "completed" | "failed" | "processing";
          errorMessage?: string;
        }> = [
          {
            input: {
              version_id: pick(0),
              product_images: [],
              reference_images: [],
              user_prompt: "Botella de perfume sobre mármol",
              output_ratio: "1:1",
              variations_requested: 5,
            },
            finalStatus: "processing",
          },
          {
            input: {
              version_id: pick(1),
              product_images: [],
              reference_images: [],
              user_prompt: "Café en taza minimalista",
              output_ratio: "4:5",
              variations_requested: 5,
            },
            finalStatus: "completed",
          },
          {
            input: {
              version_id: pick(2),
              product_images: [],
              reference_images: [],
              user_prompt: "Sérum facial fondo pastel",
              output_ratio: "9:16",
              variations_requested: 5,
            },
            finalStatus: "completed",
          },
          {
            input: {
              product_images: [],
              reference_images: [],
              user_prompt: "Zapatillas escena urbana",
              output_ratio: "16:9",
              variations_requested: 5,
            },
            finalStatus: "failed",
            errorMessage: "El director de arte no pudo procesar las referencias.",
          },
          {
            input: {
              product_images: [],
              reference_images: [],
              user_prompt: "Vela aromática banner web",
              output_ratio: "16:9",
              variations_requested: 5,
            },
            finalStatus: "completed",
          },
        ];

        for (const bp of blueprints) {
          const created = createGeneration(bp.input);
          if (bp.finalStatus === "completed") {
            markCompleted(created.id);
          } else if (bp.finalStatus === "failed" && bp.errorMessage) {
            markFailed(created.id, bp.errorMessage);
          } else if (bp.finalStatus === "processing") {
            markProcessing(created.id);
          }
        }
      });
  }, [
    supabase,
    user,
    state.generations.length,
    createGeneration,
    markCompleted,
    markFailed,
    markProcessing,
  ]);

  const value = useMemo<GenerationsContextValue>(
    () => ({
      state,
      hydrated,
      error,
      createGeneration,
      markProcessing,
      markCompleted,
      markFailed,
      attachImages,
      toggleFavorite,
      rate,
      setImagePrompt,
      getRecent,
      getByVersionId,
      getStats,
      seedDevData,
    }),
    [
      state,
      hydrated,
      error,
      createGeneration,
      markProcessing,
      markCompleted,
      markFailed,
      attachImages,
      toggleFavorite,
      rate,
      setImagePrompt,
      getRecent,
      getByVersionId,
      getStats,
      seedDevData,
    ],
  );

  return (
    <GenerationsContext.Provider value={value}>
      {children}
    </GenerationsContext.Provider>
  );
}

export function useGenerations() {
  const ctx = useContext(GenerationsContext);
  if (!ctx) throw new Error("useGenerations must be inside GenerationsProvider");
  return ctx;
}
