"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, FolderOpen, Settings, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/studio", label: "Studio", icon: Sparkles },
  { href: "/projects", label: "Proyectos", icon: FolderOpen },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function Sidebar({ creditsRemaining }: { creditsRemaining: number }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 flex-col border-r border-border/50 bg-glass/30 px-4 py-5 backdrop-blur-xl lg:flex">
      <Link
        href="/dashboard"
        className="px-2 text-lg font-semibold tracking-tight text-foreground"
      >
        Vendí
      </Link>

      <nav className="mt-8 flex-1 space-y-1">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Credits widget */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Coins className="h-3.5 w-3.5" />
          Créditos restantes
        </div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {creditsRemaining}
        </div>
        <Link
          href="/settings/billing"
          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
        >
          Conseguí más →
        </Link>
      </div>
    </aside>
  );
}
