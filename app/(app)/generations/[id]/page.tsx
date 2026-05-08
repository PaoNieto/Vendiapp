"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { ArrowLeft, Heart, Download, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Variation = {
  id: string;
  variationIndex: number;
  isFavorite: boolean;
};

export default function GenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [status, setStatus] = useState<
    "pending" | "processing" | "completed" | "failed"
  >("processing");
  const [progress, setProgress] = useState(0);
  const [variations, setVariations] = useState<Variation[]>([]);

  // Mock progress simulation — TODO: reemplazar con realtime subscription a generations
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return 100;
        return Math.min(100, p + Math.random() * 15);
      });
    }, 800);
    const done = setTimeout(() => {
      setStatus("completed");
      setVariations(
        Array.from({ length: 5 }, (_, i) => ({
          id: `${id}-${i}`,
          variationIndex: i,
          isFavorite: false,
        })),
      );
    }, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(done);
    };
  }, [id]);

  function toggleFavorite(varId: string) {
    setVariations((vs) =>
      vs.map((v) =>
        v.id === varId ? { ...v, isFavorite: !v.isFavorite } : v,
      ),
    );
    // TODO: PATCH /api/generated-images/:id { is_favorite }
  }

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Tu generación
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">ID: {id}</p>
          </div>
          {status === "completed" && (
            <Link
              href="/studio"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 hidden rounded-xl px-5 sm:inline-flex",
              )}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Generar más
            </Link>
          )}
        </div>

        {/* Processing state */}
        {status === "processing" && (
          <Card className="glass mt-6 rounded-3xl border-0 p-7 sm:p-9">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-6 w-6 animate-pulse text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
                Generando variaciones…
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Esto suele tardar entre 30 y 60 segundos.
              </p>
              <Progress value={progress} className="mx-auto mt-6 max-w-sm" />
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                {Math.round(progress)}%
              </p>
            </div>

            {/* Skeletons mientras procesa */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
              ))}
            </div>
          </Card>
        )}

        {/* Completed state */}
        {status === "completed" && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {variations.map((v) => (
                <div
                  key={v.id}
                  className="glass group relative overflow-hidden rounded-2xl"
                >
                  <div className="aspect-[4/5] bg-gradient-to-br from-primary/15 to-accent/30" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(v.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-foreground hover:bg-white"
                        aria-label="Marcar favorito"
                      >
                        <Heart
                          className={cn(
                            "h-4 w-4",
                            v.isFavorite && "fill-destructive text-destructive",
                          )}
                        />
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-foreground hover:bg-white"
                        aria-label="Descargar"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="absolute left-2 top-2 rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                    #{v.variationIndex + 1}
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/studio"
              className={cn(
                buttonVariants({ size: "lg" }),
                "mt-6 flex h-12 w-full rounded-xl text-base sm:hidden",
              )}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Generar más variaciones
            </Link>
          </>
        )}

        {/* Failed state */}
        {status === "failed" && (
          <Card className="glass mt-6 rounded-3xl border-0 p-9 text-center">
            <h2 className="text-lg font-semibold text-destructive">
              Algo falló al generar
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Probá de nuevo. No descontamos los créditos.
            </p>
            <Link
              href="/studio"
              className={cn(
                buttonVariants({ size: "lg" }),
                "mt-5 inline-flex h-11 rounded-xl px-5",
              )}
            >
              Volver al studio
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
