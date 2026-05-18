import Link from "next/link";
import { Sparkles, ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// TODO: reemplazar con query real a Supabase cuando lleguen las keys
const RECENT_GENERATIONS = [
  {
    id: "1",
    project: "Sneakers verano",
    ratio: "4:5" as const,
    status: "completed" as const,
    variations: 5,
    createdAt: "Hace 2 horas",
  },
  {
    id: "2",
    project: "Botellas reusables",
    ratio: "1:1" as const,
    status: "completed" as const,
    variations: 8,
    createdAt: "Ayer",
  },
  {
    id: "3",
    project: "Skincare line",
    ratio: "9:16" as const,
    status: "processing" as const,
    variations: 5,
    createdAt: "Hace 5 minutos",
  },
];

const STATUS_LABEL = {
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Listo",
  failed: "Error",
};

export default function DashboardPage() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              ¡Hola!
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Empezá una nueva generación o seguí con tus proyectos.
            </p>
          </div>
          <Link
            href="/producto"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 hidden rounded-xl px-5 sm:inline-flex",
            )}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Empezar recorrido
          </Link>
        </div>

        {/* Mobile primary CTA */}
        <Link
          href="/producto"
          className={cn(
            buttonVariants({ size: "lg" }),
            "mt-5 flex h-12 w-full rounded-xl text-base sm:hidden",
          )}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Empezar recorrido
        </Link>

        {/* Plan card en mobile (en desktop sale en sidebar) */}
        <Card className="glass mt-6 rounded-2xl border-0 p-5 lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Plan</p>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                Pro
              </p>
            </div>
            <Link
              href="/ajustes"
              className="text-xs font-medium text-primary hover:underline"
            >
              Administrar →
            </Link>
          </div>
        </Card>

        {/* Recientes */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Generaciones recientes
          </h2>

          {RECENT_GENERATIONS.length === 0 ? (
            <Card className="glass mt-4 rounded-3xl border-0 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <ImageIcon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                Todavía no generaste nada
              </h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                Subí fotos de tu producto y referencias visuales para empezar.
              </p>
              <Link
                href="/producto"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "mt-5 inline-flex h-11 rounded-xl px-5",
                )}
              >
                Crear primera generación
              </Link>
            </Card>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {RECENT_GENERATIONS.map((gen) => (
                <Link
                  key={gen.id}
                  href="/fabrica"
                  className="glass group block overflow-hidden rounded-2xl transition-all hover:scale-[1.02]"
                >
                  <div className="aspect-[4/5] bg-gradient-to-br from-primary/10 to-accent/20" />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {gen.project}
                      </h3>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "shrink-0 rounded-md text-[10px]",
                          gen.status === "completed" &&
                            "bg-success/15 text-success",
                          gen.status === "processing" &&
                            "bg-warning/15 text-warning",
                        )}
                      >
                        {STATUS_LABEL[gen.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {gen.variations} variaciones · {gen.ratio} · {gen.createdAt}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
