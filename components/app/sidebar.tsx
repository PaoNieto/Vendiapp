"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Package,
  Images,
  Palette,
  Crop,
  MessageSquare,
  Factory,
  FolderOpen,
  Briefcase,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATIONS = [
  { href: "/producto", n: "01", label: "Producto", icon: Package },
  { href: "/referencias", n: "02", label: "Referencias", icon: Images },
  { href: "/estilo", n: "03", label: "Estilo", icon: Palette },
  { href: "/formato", n: "04", label: "Formato", icon: Crop },
  { href: "/prompt", n: "05", label: "Prompt", icon: MessageSquare },
];

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
          label="Inicio"
          icon={Home}
          active={isActive(pathname, "/dashboard")}
        />

        <SectionLabel>Recorrido</SectionLabel>
        {STATIONS.map((s) => (
          <NavItem
            key={s.href}
            href={s.href}
            label={s.label}
            icon={s.icon}
            number={s.n}
            active={isActive(pathname, s.href)}
          />
        ))}

        <SectionDivider />
        <NavItem
          href="/fabrica"
          label="Fábrica"
          icon={Factory}
          active={isActive(pathname, "/fabrica")}
          emphasize
        />
        <NavItem
          href="/proyectos"
          label="Proyectos"
          icon={FolderOpen}
          active={isActive(pathname, "/proyectos")}
        />

        <SectionDivider />
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
        <div className="mt-1 text-base font-semibold tracking-tight text-foreground">
          {plan}
        </div>
      </div>
    </aside>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function SectionDivider() {
  return <div className="my-2 h-px bg-border/60" />;
}

type NavItemProps = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  number?: string;
  emphasize?: boolean;
};

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  number,
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
      {number && (
        <span
          className={cn(
            "font-mono text-[10px]",
            active ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {number}
        </span>
      )}
      <span>{label}</span>
    </Link>
  );
}
