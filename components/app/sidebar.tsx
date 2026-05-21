"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Factory,
  Package,
  Briefcase,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

// El sidebar quedó reducido a 5 items principales. El concepto de "recorrido"
// como navegación de menú desapareció: las pantallas `/referencias` y `/formato`
// siguen existiendo pero solo se accede a ellas desde el flujo "+ Nueva Versión"
// o desde los botones "Editar referencias"/"Editar configuración" del drawer
// o del detalle de versión.

type SidebarProps = {
  plan: string;
};

export function Sidebar({ plan }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 flex-col border-r border-border/50 bg-glass/30 px-4 py-5 backdrop-blur-xl lg:flex">
      <Link
        href="/dashboard"
        className="px-2 text-lg font-semibold tracking-tight text-foreground"
      >
        Vendí
      </Link>

      <nav className="mt-8 flex-1 space-y-1 overflow-y-auto">
        <NavItem
          href="/dashboard"
          label="Dashboard"
          icon={Home}
          active={isActive(pathname, "/dashboard")}
        />

        <NavItem
          href="/productos"
          label="Catálogo de Productos"
          icon={Package}
          active={isActive(pathname, "/productos")}
        />

        <NavItem
          href="/fabrica"
          label="Fábrica"
          icon={Factory}
          active={isActive(pathname, "/fabrica")}
          emphasize
        />

        <NavItem
          href="/mi-negocio"
          label="Mi Negocio"
          icon={Briefcase}
          active={isActive(pathname, "/mi-negocio")}
        />
        <NavItem
          href="/ajustes"
          label="Ajustes"
          icon={Settings}
          active={isActive(pathname, "/ajustes")}
        />
      </nav>

      <div className="glass mt-4 rounded-2xl p-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Plan
        </div>
        <div className="mt-1 text-base font-medium tracking-tight text-foreground">
          {plan}
        </div>
      </div>
    </aside>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

type NavItemProps = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  emphasize?: boolean;
};

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  emphasize,
}: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : emphasize
            ? "text-foreground hover:bg-primary/10 hover:text-primary"
            : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  );
}
