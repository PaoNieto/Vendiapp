"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { CreditBadge } from "@/components/app/credit-badge";
import { NotificationBell } from "@/components/app/avisos/notification-bell";

/**
 * Barra superior SOLO mobile (logo, saldo y campanita). La de abajo ya tiene 5
 * ítems, así que la campanita no entra ahí (mockup, caso d). En desktop la
 * campanita vive en la fila del logo del sidebar.
 */
export function MobileTopbar({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <header className="sticky top-0 z-40 flex h-[58px] items-center justify-between border-b border-border bg-background/70 pl-4 pr-3 backdrop-blur-md lg:hidden">
      <Link
        href="/dashboard"
        className="inline-flex min-h-[44px] items-center font-display text-[26px] italic leading-none text-foreground"
      >
        Vendí
        <span className="text-sage-strong dark:text-gold">.</span>
      </Link>
      <div className="flex items-center gap-2">
        <CreditBadge showBuy={false} />
        {isAdmin ? (
          <Link
            href="/admin/avisos"
            aria-label="Panel de avisos (admin)"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-mute transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ShieldAlert className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
          </Link>
        ) : null}
        <NotificationBell variant="mobile" />
      </div>
    </header>
  );
}
