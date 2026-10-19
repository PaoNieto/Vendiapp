"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  Coins,
  ShieldCheck,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAvisos, type NoticeItem } from "@/lib/avisos/client";
import { cn } from "@/lib/utils";

/**
 * Campanita + centro de avisos (mockup aprobado, caso d).
 *  - desktop: en la fila del logo del sidebar, abre un DropdownMenu.
 *  - mobile:  en la barra superior, abre un Dialog a pantalla completa.
 * El texto de cada aviso sale de lib/avisos/textos.ts (renderNotice).
 */
export function NotificationBell({ variant }: { variant: "desktop" | "mobile" }) {
  const { unreadCount } = useAvisos();
  const label = unreadCount > 0 ? `Avisos, ${unreadCount} sin leer` : "Avisos";

  const bellButtonClass =
    "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-foreground/5 text-ink-soft transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-foreground/10 data-[popup-open]:text-foreground";

  const badge =
    unreadCount > 0 ? (
      <span
        aria-hidden
        className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-success px-1 font-mono text-[10.5px] font-semibold leading-none text-background ring-2 ring-background"
      >
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null;

  if (variant === "desktop") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={label} className={bellButtonClass}>
          <Bell className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden />
          {badge}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          sideOffset={12}
          className="w-[396px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border p-0"
        >
          <NoticeCenter variant="desktop" />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return <MobileBell label={label} buttonClass={bellButtonClass} badge={badge} />;
}

function MobileBell({
  label,
  buttonClass,
  badge,
}: {
  label: string;
  buttonClass: string;
  badge: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={label} className={buttonClass} onClick={() => setOpen(true)}>
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
        {badge}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-popover p-0 sm:max-w-none"
        >
          <NoticeCenter variant="mobile" onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Centro de avisos                                                          */
/* -------------------------------------------------------------------------- */

function NoticeCenter({
  variant,
  onNavigate,
}: {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const { notices, unreadCount, loading, failed, markAllRead, markRead } = useAvisos();

  const count =
    unreadCount > 0 ? (
      <span className="font-mono text-[11px] tracking-wide text-success">
        {unreadCount === 1 ? "1 sin leer" : `${unreadCount} sin leer`}
      </span>
    ) : null;

  const markAllClass =
    "inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-sage-strong transition-colors hover:text-foreground disabled:cursor-default disabled:text-mute";

  return (
    <div className={cn("flex min-h-0 flex-col", variant === "mobile" && "h-full")}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        {variant === "mobile" ? (
          <DialogTitle className="font-display text-[26px] italic leading-none text-foreground">
            Avisos
          </DialogTitle>
        ) : (
          <p className="flex items-baseline gap-2.5">
            <span className="font-display text-[22px] italic leading-none text-foreground">Avisos</span>
            {count}
          </p>
        )}
        {variant === "desktop" ? (
          <DropdownMenuItem
            closeOnClick={false}
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
            className={cn(markAllClass, "focus:bg-foreground/5")}
          >
            Marcar todo como leído
          </DropdownMenuItem>
        ) : (
          <DialogClose
            aria-label="Cerrar avisos"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-mute transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </DialogClose>
        )}
      </div>

      {variant === "mobile" ? (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-1">
          {count ?? <span className="text-xs text-mute">Todo leído</span>}
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
            className={markAllClass}
          >
            Marcar todo como leído
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "overflow-y-auto p-1.5",
          variant === "desktop" ? "max-h-[min(520px,70vh)]" : "flex-1 pb-8",
        )}
      >
        {loading ? (
          <div className="flex flex-col gap-2 p-2" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-foreground/5" />
            ))}
          </div>
        ) : notices.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mute">
            {failed ? "No pudimos cargar tus avisos. Probá de nuevo en un minuto." : "No tenés avisos todavía."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {notices.map((n) => (
              <NoticeRow
                key={n.id}
                notice={n}
                variant={variant}
                onAction={() => {
                  void markRead([n.id]);
                  onNavigate?.();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Tone = "sage" | "gold" | "butter" | "clay";

function noticeLook(n: NoticeItem): { eyebrow: string; icon: React.ComponentType<{ className?: string }>; tone: Tone } {
  const refunded = typeof n.data.refunded === "number" && n.data.refunded > 0;
  switch (n.kind) {
    case "ai_restored":
      return { eyebrow: "Servicio", icon: CheckCircle2, tone: "sage" };
    case "batch_ready":
      return { eyebrow: "Tanda lista", icon: Sparkles, tone: "sage" };
    case "batch_partial":
      return { eyebrow: "Tanda incompleta", icon: Undo2, tone: "gold" };
    case "batch_failed":
    case "batch_timeout":
    case "regen_failed":
    case "analysis_failed":
      return refunded
        ? { eyebrow: "Crédito devuelto", icon: Undo2, tone: "gold" }
        : { eyebrow: "No salió", icon: AlertCircle, tone: "clay" };
    case "refund_landed":
      return { eyebrow: "Crédito devuelto", icon: Undo2, tone: "gold" };
    case "refund_pending":
      return { eyebrow: "Devolución en proceso", icon: Clock, tone: "butter" };
    case "input_blocked":
      return { eyebrow: "Fotos rechazadas", icon: AlertCircle, tone: "clay" };
    case "credits_low":
      return { eyebrow: "Créditos bajos", icon: Coins, tone: "butter" };
    case "purchase_credited":
      return { eyebrow: "Pago acreditado", icon: Coins, tone: "sage" };
    case "payment_unmatched":
      return { eyebrow: "Pago recibido", icon: ShieldCheck, tone: "butter" };
    default:
      return { eyebrow: "Aviso", icon: Bell, tone: "sage" };
  }
}

const TONE_CLASSES: Record<Tone, string> = {
  sage: "bg-sage-strong/15 text-sage-strong",
  gold: "bg-gold/15 text-gold",
  butter: "bg-butter/15 text-butter",
  clay: "bg-clay/15 text-clay",
};

function NoticeRow({
  notice,
  variant,
  onAction,
}: {
  notice: NoticeItem;
  variant: "desktop" | "mobile";
  onAction: () => void;
}) {
  const look = noticeLook(notice);
  const Icon = look.icon;
  const unread = !notice.readAt;
  const action = notice.action;
  const isRecharge = notice.kind === "credits_low";

  const actionClass = isRecharge
    ? "inline-flex min-h-[36px] items-center rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
    : "inline-flex min-h-[36px] items-center text-xs font-semibold text-sage-strong hover:underline";

  return (
    <li
      className={cn(
        "relative flex gap-3 rounded-xl py-3 pl-4 pr-3",
        unread && "bg-success/[0.07]",
      )}
    >
      {unread ? (
        <span aria-hidden className="absolute left-1.5 top-[26px] h-1.5 w-1.5 rounded-full bg-success" />
      ) : null}
      <span
        aria-hidden
        className={cn("grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full", TONE_CLASSES[look.tone])}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="eyebrow text-[10px]">
          {look.eyebrow}
          {unread ? <span className="sr-only"> (sin leer)</span> : null}
        </span>
        <p className="text-[13px] leading-snug text-foreground">{notice.text}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-3">
          <time dateTime={notice.createdAt} className="font-mono text-[10.5px] tracking-wide text-mute">
            {formatNoticeTime(notice.createdAt)}
          </time>
          {action ? (
            variant === "desktop" ? (
              <DropdownMenuItem
                render={<Link href={action.href} />}
                onClick={onAction}
                className={cn(actionClass, "px-0 focus:bg-transparent", isRecharge && "px-3.5 focus:bg-primary")}
              >
                {isRecharge ? action.label : `${action.label} →`}
              </DropdownMenuItem>
            ) : (
              <Link href={action.href} onClick={onAction} className={actionClass}>
                {isRecharge ? action.label : `${action.label} →`}
              </Link>
            )
          ) : null}
        </div>
      </div>
    </li>
  );
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «hace 2 min» · «hace 1 h» · «ayer, 18:40» · «lun, 12:15» · «03/10». */
function formatNoticeTime(iso: string): string {
  const date = new Date(iso);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "";
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (diffMin < 1) return "recién";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 12) return `hace ${diffH} h`;
  const hhmm = date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ms >= startOfToday) return `hoy, ${hhmm}`;
  if (ms >= startOfToday - 86_400_000) return `ayer, ${hhmm}`;
  if (ms >= startOfToday - 6 * 86_400_000) return `${WEEKDAYS[date.getDay()]}, ${hhmm}`;
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}
