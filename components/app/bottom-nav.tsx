"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Factory, FolderOpen, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/fabrica", label: "Fábrica", icon: Factory },
  { href: "/proyectos", label: "Proyectos", icon: FolderOpen },
  { href: "/mi-negocio", label: "Negocio", icon: Briefcase },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 lg:hidden">
      <div className="glass-strong mx-auto flex max-w-md items-center justify-around rounded-2xl px-2 py-2 shadow-xl">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
