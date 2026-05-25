"use client";

/**
 * ThemeToggle — botón pill compacto para alternar light/dark.
 *
 * Diseñado como prima compacta del PillButton — mismo lenguaje (pill,
 * radius full, shadow sutil) pero más chico, sin texto pesado, solo icono
 * + etiqueta breve.
 *
 * Implementación: usamos `useSyncExternalStore` para leer el tema actual
 * desde el `data-theme` del `<html>` sin caer en patrones `setState in
 * useEffect`. El "store externo" en este caso es el atributo del root
 * element, que se modifica desde el script anti-flash en el head y desde
 * el propio `toggle()`. Suscribimos a cambios via MutationObserver para
 * que múltiples toggles en distintos lugares de la app se mantengan en
 * sync sin contexto adicional.
 */

import { useCallback, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const STORAGE_KEY = "vendi-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

// Snapshot del server: en SSR no hay `data-theme`, devolvemos "light"
// como valor neutro. El script anti-flash setea el atributo antes del
// primer paint en cliente, así que el primer render post-hidratación
// ya ve el valor correcto.
function getServerSnapshot(): Theme {
  return "light";
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage puede tirar en modo privado de algunos browsers.
      // Silencioso: el toggle sigue funcionando en memoria (data-theme
      // del root se actualizó arriba; solo perdemos persistencia).
    }
  }, []);

  const label = theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full",
        "border border-glass-border bg-glass/60 px-3 py-1.5",
        "text-[11px] font-medium text-green-text",
        "shadow-[0_2px_8px_rgba(15,40,24,0.08)]",
        "transition-all duration-150 ease-out",
        "hover:bg-glass/80 hover:text-green-dark hover:shadow-[0_4px_12px_rgba(15,40,24,0.12)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        "min-h-[36px]",
        className,
      )}
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-3.5 w-3.5" strokeWidth={2} />
          <span>Claro</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5" strokeWidth={2} />
          <span>Oscuro</span>
        </>
      )}
    </button>
  );
}
