import Link from "next/link";
import { Plus, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// TODO: reemplazar con query a Supabase projects
const PROJECTS = [
  { id: "1", name: "Sneakers verano", generations: 12, lastUsed: "Hoy" },
  { id: "2", name: "Botellas reusables", generations: 6, lastUsed: "Ayer" },
  { id: "3", name: "Skincare line", generations: 8, lastUsed: "Hace 3 días" },
];

export default function ProjectsPage() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Proyectos
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Organizá tus generaciones por producto o campaña.
            </p>
          </div>
          <button
            type="button"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 rounded-xl px-5",
            )}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo
          </button>
        </div>

        {PROJECTS.length === 0 ? (
          <Card className="glass mt-6 rounded-3xl border-0 p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <FolderOpen className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              Sin proyectos aún
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Creá tu primer proyecto para agrupar generaciones.
            </p>
          </Card>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PROJECTS.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="glass block rounded-2xl p-5 transition-all hover:scale-[1.02]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-foreground">
                  {p.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.generations} generaciones · {p.lastUsed}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
