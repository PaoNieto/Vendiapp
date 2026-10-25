"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/auth/use-user";
import { createClient } from "@/lib/supabase/client";
import { renderNotice, type NoticeAction } from "./textos";
import {
  SERVICE_STATUS_PUBLIC_COLUMNS,
  USER_NOTIFICATION_COLUMNS,
  type UserNotificationRow,
} from "./types";

/**
 * Avisos en el CLIENTE: la campanita y el estado de la IA (banner).
 *
 * Lee directo de Supabase con el token de Clerk, igual que los créditos
 * (lib/creditos/use-creditos.tsx). Sin Realtime (el token vive ~60 s): relee al
 * montar, al cambiar de ruta, al volver a la pestaña, cada 60 s y cuando una
 * pantalla llama a `refresh()` después de una acción.
 *
 * Solo importa `types.ts` y `textos.ts` de lib/avisos (lo demás es server-only).
 */

const POLL_MS = 60_000;
const MAX_ROWS = 50;

export type NoticeItem = {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
  text: string;
  action: NoticeAction | null;
};

export type AiState = {
  /** true = la IA está caída (service_status.ok = false). */
  down: boolean;
  since: string | null;
};

type AvisosContextValue = {
  notices: NoticeItem[];
  unreadCount: number;
  /** Primera carga en curso. */
  loading: boolean;
  /** La última lectura falló (sin tabla, sin red). La campanita queda vacía. */
  failed: boolean;
  refresh: () => Promise<void>;
  markRead: (ids: readonly string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Aviso guardado con esa llave (ej. `gen:<id>`), si está entre los últimos. */
  findByKey: (dedupeKey: string) => NoticeItem | undefined;
  ai: AiState;
  /** Una ruta respondió `ai_unavailable`: prende el banner ya y relee el estado. */
  reportAiUnavailable: () => void;
};

const AvisosContext = createContext<AvisosContextValue | null>(null);

type RowWithKey = UserNotificationRow & { dedupe_key: string | null };

function toItem(row: RowWithKey): NoticeItem | null {
  const rendered = renderNotice({ kind: row.kind, data: row.data });
  if (!rendered) return null;
  return {
    id: row.id,
    kind: row.kind,
    data: row.data && typeof row.data === "object" ? row.data : {},
    dedupeKey: row.dedupe_key ?? null,
    readAt: row.read_at,
    createdAt: row.created_at,
    text: rendered.text,
    action: rendered.action,
  };
}

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const userId = user?.id ?? null;
  const pathname = usePathname();

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ai, setAi] = useState<AiState>({ down: false, since: null });

  // Evita lecturas solapadas (pestaña + intervalo + ruta a la vez).
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setNotices([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [listRes, countRes, aiRes] = await Promise.all([
        supabase
          .from("user_notifications")
          .select(`${USER_NOTIFICATION_COLUMNS}, dedupe_key`)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(MAX_ROWS),
        supabase
          .from("user_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("read_at", null),
        supabase
          .from("service_status")
          .select(SERVICE_STATUS_PUBLIC_COLUMNS)
          .eq("id", "ai")
          .maybeSingle(),
      ]);

      if (listRes.error) {
        setFailed(true);
      } else {
        setFailed(false);
        const rows = (listRes.data ?? []) as RowWithKey[];
        setNotices(rows.map(toItem).filter((n): n is NoticeItem => n !== null));
      }
      if (!countRes.error && typeof countRes.count === "number") {
        setUnreadCount(countRes.count);
      }
      // Sin fila o sin tabla: la IA se considera disponible (nunca bloqueamos
      // por no poder leer el estado: la ruta igual corta con aiGate).
      if (!aiRes.error) {
        const row = aiRes.data as { ok?: boolean; since?: string } | null;
        setAi({ down: row?.ok === false, since: row?.since ?? null });
      }
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [supabase, userId]);

  // Al montar / cambiar de usuario / cambiar de ruta.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronización con Supabase (sistema externo); el setState ocurre tras el await.
    void refresh();
  }, [refresh, pathname]);

  // Cada 60 s y al volver a la pestaña.
  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, userId]);

  // Con la IA caída: anotarse para que avise al volver y, cada 60 s, pedirle al
  // server que pruebe si volvió (watch corre aiGate, que prueba cada 2 a 15 min
  // sin martillar a Google). Si contesta que ya no está caída, se refresca y el
  // banner se apaga solo.
  useEffect(() => {
    if (!ai.down || !userId) return;
    let cancelled = false;
    const ping = async () => {
      try {
        const res = await fetch("/api/avisos/watch", { method: "POST", keepalive: true });
        const data = (await res.json().catch(() => null)) as { watching?: boolean } | null;
        if (!cancelled && data?.watching === false) void refresh();
      } catch {
        // Sin red: el próximo intento lo reintenta.
      }
    };
    void ping();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void ping();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ai.down, userId, refresh]);

  // markRead estable (no cambia con cada lectura): lee la lista por ref y no
  // reenvía ids que ya mandó a marcar.
  const noticesRef = useRef<NoticeItem[]>([]);
  useEffect(() => {
    noticesRef.current = notices;
  }, [notices]);
  const sentRead = useRef<Set<string>>(new Set());

  const markRead = useCallback(
    async (ids: readonly string[]) => {
      if (!userId) return;
      const current = noticesRef.current;
      const targets = ids.filter((id) => {
        if (sentRead.current.has(id)) return false;
        const known = current.find((n) => n.id === id);
        return !known || !known.readAt;
      });
      if (targets.length === 0) return;
      for (const id of targets) sentRead.current.add(id);
      const knownUnread = targets.filter((id) => current.some((n) => n.id === id)).length;
      const now = new Date().toISOString();
      setNotices((prev) => prev.map((n) => (targets.includes(n.id) ? { ...n, readAt: now } : n)));
      setUnreadCount((c) => Math.max(0, c - knownUnread));
      const { error } = await supabase
        .from("user_notifications")
        .update({ read_at: now })
        .in("id", targets)
        .is("read_at", null);
      if (error) {
        for (const id of targets) sentRead.current.delete(id);
        void refresh();
      } else if (knownUnread < targets.length) {
        // Había ids que la lista todavía no traía: releemos el contador.
        void refresh();
      }
    },
    [refresh, supabase, userId],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setNotices((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    const { error } = await supabase
      .from("user_notifications")
      .update({ read_at: now })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) void refresh();
  }, [refresh, supabase, userId]);

  const findByKey = useCallback(
    (dedupeKey: string) => notices.find((n) => n.dedupeKey === dedupeKey),
    [notices],
  );

  const reportAiUnavailable = useCallback(() => {
    setAi((prev) => (prev.down ? prev : { down: true, since: prev.since }));
    void refresh();
  }, [refresh]);

  const value = useMemo<AvisosContextValue>(
    () => ({
      notices,
      unreadCount,
      loading,
      failed,
      refresh,
      markRead,
      markAllRead,
      findByKey,
      ai,
      reportAiUnavailable,
    }),
    [notices, unreadCount, loading, failed, refresh, markRead, markAllRead, findByKey, ai, reportAiUnavailable],
  );

  return <AvisosContext.Provider value={value}>{children}</AvisosContext.Provider>;
}

export function useAvisos(): AvisosContextValue {
  const ctx = useContext(AvisosContext);
  if (!ctx) throw new Error("useAvisos must be inside AvisosProvider");
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Respuesta de las rutas de IA (generations / regenerate / analyze)         */
/* -------------------------------------------------------------------------- */

/**
 * Lo que devuelven las rutas de IA al fallar (contrato de lib/avisos/rutas.ts):
 * `{ error, message, refunded, notificationId? }`. `message` ya es el texto
 * exacto de la spec; nunca trae texto crudo del proveedor.
 */
export type AiRouteFailure = {
  error: string | null;
  message: string | null;
  refunded: number;
  notificationId: string | null;
};

export async function readAiRouteFailure(res: Response): Promise<AiRouteFailure> {
  const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const error = typeof raw?.error === "string" ? raw.error : null;
  const message = typeof raw?.message === "string" && raw.message.trim() ? raw.message : null;
  const refunded = typeof raw?.refunded === "number" ? raw.refunded : 0;
  const notificationId = typeof raw?.notificationId === "string" ? raw.notificationId : null;
  return { error, message, refunded, notificationId };
}

/**
 * Parte un aviso en título (primera oración) y cuerpo (el resto), para la
 * tarjeta de la tanda y el overlay: «No pudimos terminar tus imágenes.» +
 * «Fue un problema nuestro…».
 */
export function splitNotice(text: string): { title: string; body: string } {
  const idx = text.indexOf(". ");
  if (idx === -1) return { title: text, body: "" };
  return { title: text.slice(0, idx + 1), body: text.slice(idx + 2) };
}
