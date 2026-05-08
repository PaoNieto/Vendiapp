import Link from "next/link";
import { Coins, User, Bell, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const SECTIONS = [
  {
    title: "Cuenta",
    icon: User,
    items: [
      { label: "Nombre y avatar", href: "/settings/profile" },
      { label: "Email y contraseña", href: "/settings/security" },
    ],
  },
  {
    title: "Plan y créditos",
    icon: Coins,
    items: [
      { label: "Cambiar de plan", href: "/settings/billing" },
      { label: "Historial de uso", href: "/settings/usage" },
    ],
  },
  {
    title: "Notificaciones",
    icon: Bell,
    items: [{ label: "Preferencias", href: "/settings/notifications" }],
  },
];

export default function SettingsPage() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Ajustes
        </h1>

        {/* Plan summary */}
        <Card className="glass mt-6 rounded-3xl border-0 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Plan actual
              </p>
              <p className="text-xl font-semibold tracking-tight text-foreground">
                Free
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                10 créditos por mes · 10 restantes
              </p>
            </div>
            <Link
              href="/settings/billing"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Mejorar plan
            </Link>
          </div>
        </Card>

        {/* Sections */}
        <div className="mt-4 space-y-3">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Card
                key={section.title}
                className="glass rounded-3xl border-0 p-2"
              >
                <div className="flex items-center gap-2 px-4 py-3">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {section.title}
                  </span>
                </div>
                <Separator className="bg-border" />
                <div>
                  {section.items.map((item, i) => (
                    <div key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between px-4 py-3 text-sm text-foreground hover:bg-foreground/5"
                      >
                        <span>{item.label}</span>
                        <span className="text-muted-foreground">→</span>
                      </Link>
                      {i < section.items.length - 1 && (
                        <Separator className="bg-border/50" />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Logout */}
        <button
          type="button"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
