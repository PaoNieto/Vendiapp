"use client";

import Link from "next/link";
import { Coins, Plus } from "lucide-react";
import { useCreditos } from "@/lib/creditos/use-creditos";
import { cn } from "@/lib/utils";

/**
 * Chip reutilizable que muestra el saldo de créditos del usuario.
 * Reutilizable en topbar, sidebar, fábrica, etc. Linkea a /upgrade para
 * comprar más. Cambia a tono de alerta cuando el saldo está bajo o en cero.
 */
export function CreditBadge({
  className,
  showBuy = true,
}: {
  className?: string;
  showBuy?: boolean;
}) {
  const { stats, loading } = useCreditos();
  const balance = stats.balance;
  const unlimited = stats.unlimited;
  const low = balance <= 5;
  const empty = balance <= 0;

  // Usuarios en la allowlist de créditos ilimitados: chip neutral con ∞,
  // sin alertas de saldo y sin botón de compra.
  if (unlimited) {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-pill-bg/10 px-3 py-1.5 text-sm font-semibold text-foreground"
          title="Créditos ilimitados"
        >
          <Coins className="h-4 w-4 dark:text-gold" aria-hidden />
          {loading ? "…" : "∞"}
          <span className="hidden sm:inline font-normal text-muted-foreground">
            ilimitado
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
          empty
            ? "bg-destructive/10 text-destructive"
            : low
              ? "bg-warning/15 text-foreground"
              : "bg-pill-bg/10 text-foreground",
        )}
        title={`${balance} créditos disponibles`}
      >
        <Coins className={cn("h-4 w-4", !empty && !low && "dark:text-gold")} aria-hidden />
        {loading ? "…" : balance}
        <span className="hidden sm:inline font-normal text-muted-foreground">
          {balance === 1 ? "crédito" : "créditos"}
        </span>
      </span>

      {showBuy ? (
        <Link
          href="/upgrade"
          className={cn(
            "inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90",
            empty
              ? "bg-pill-bg text-pill-fg"
              : "border border-border bg-card text-foreground",
          )}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {empty ? "Comprar créditos" : "Más"}
        </Link>
      ) : null}
    </div>
  );
}
