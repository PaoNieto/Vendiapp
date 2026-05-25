"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Factory,
  Package,
  Briefcase,
  ScanSearch,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

// Sidebar Cuaderno v2 — sage claro SÓLIDO (NO glass).
// Ancho 220px (handoff: "más restrained que 240+"). Branding "Vendí." en
// Instrument Serif italic 30px con un punto sage-strong como acento de
// marca. Eyebrow "ESPACIO" sobre la nav. 5 items: Dashboard, Catálogo
// de Productos, Fábrica, Mi Negocio, Ajustes. Item activo: pill forest
// (--primary) con texto cream (--primary-foreground); inactivos: ink
// con weight 500 + hover ink-soft. Footer Plan PRO (SIN créditos —
// Vendí es BYOK) + ThemeToggle al final.
//
// Antes el sidebar usaba bg-glass/30 + backdrop-blur-xl. El handoff v2
// pide sólido sage claro (#C6D6B2 via --vd-sidebar-bg) sin blur. Más
// liviano en GPU y coherente con la sensación "cuaderno" cálida.

type SidebarProps = {
  plan: string;
};

export function Sidebar({ plan }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col border-r border-border bg-sidebar-bg px-[18px] py-7 lg:flex">
      {/*
        Branding: "Vendí." en serif italic 30px. El punto pintado en
        sage-strong como acento sutil de marca. font-display resuelve
        a Instrument Serif via @theme inline.
      */}
      <Link
        href="/dashboard"
        className="px-2.5 font-display text-[30px] italic leading-none text-foreground"
      >
        Vendí<span className="text-sage-strong">.</span>
      </Link>

      {/* Eyebrow "ESPACIO" — micro-label sobre la nav. */}
      <div className="eyebrow mt-8 px-2.5 pb-2">Espacio</div>

      <nav className="flex flex-col gap-0.5">
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
        />
        <NavItem
          href="/analisis"
          label="Análisis con IA"
          icon={ScanSearch}
          active={isActive(pathname, "/analisis")}
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

      {/* Spacer flex — empuja Plan + ThemeToggle al fondo. */}
      <div className="flex-1" />

      {/*
        Footer PLAN — sin barra de créditos. Vendí es BYOK (el usuario
        pone su propia API key), por lo que el concepto de "créditos
        consumidos" no aplica. Mantenemos eyebrow + plan + renovación +
        link discreto a Administrar.

        NO usamos .glass-card acá aunque sea sólido por defecto: queremos
        el plan card "fusionado" con el sidebar sage claro, no levantado
        como una card cream. Solo un border-top sutil que separa.
      */}
      <div className="mt-4 flex flex-col gap-1 border-t border-border pt-4">
        <div className="eyebrow">Plan</div>
        <div className="text-sm font-semibold text-foreground">{plan}</div>
        <div className="text-[11.5px] font-medium text-mute">
          Se renueva el 1 de junio
        </div>
        <Link
          href="/ajustes"
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sage-strong transition-colors hover:text-foreground"
        >
          Administrar <span aria-hidden>→</span>
        </Link>
      </div>

      {/* ThemeToggle al fondo del sidebar. */}
      <div className="mt-3 flex justify-center">
        <ThemeToggle />
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
};

function NavItem({ href, label, icon: Icon, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        // Pill activo: bg forest + text cream + weight 600. Radius 8px
        // (el handoff pide rounded suave, no rounded-full pill — esto
        // queda en el border-radius interno de cada item, no su forma).
        "flex items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-[13.5px] transition-colors",
        active
          ? "bg-primary font-semibold text-primary-foreground"
          : "font-medium text-foreground hover:bg-foreground/5",
      )}
    >
      <Icon
        className={cn("h-[18px] w-[18px]", active ? "opacity-100" : "opacity-75")}
        strokeWidth={1.6}
      />
      <span>{label}</span>
    </Link>
  );
}
