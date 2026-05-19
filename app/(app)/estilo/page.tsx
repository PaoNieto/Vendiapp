"use client";

import {
  Activity,
  Briefcase,
  Coffee,
  Heart,
  Minus,
  Moon,
  Newspaper,
  PartyPopper,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { StationShell } from "@/components/app/station-shell";
import { MoodCard, SelectableChip } from "@/components/fabrica";
import {
  MOOD_OPTIONS,
  OCCASION_OPTIONS,
  PALETTE_OPTIONS,
} from "@/lib/recorrido/build-prompt";
import { useRecorrido } from "@/lib/recorrido/store";

type MoodMeta = {
  description: string;
  icon: LucideIcon;
  gradient: string;
};

const MOOD_META: Record<string, MoodMeta> = {
  minimalista: {
    description: "Limpio, espacios en blanco, foco en el producto.",
    icon: Minus,
    gradient: "linear-gradient(135deg, #F8F4EC 0%, #E4DCC8 100%)",
  },
  calido: {
    description: "Luz dorada, texturas suaves, sensación hogareña.",
    icon: Sun,
    gradient: "linear-gradient(135deg, #F7D9A1 0%, #D89C5C 100%)",
  },
  vibrante: {
    description: "Colores saturados, alto contraste, energía.",
    icon: Sparkles,
    gradient: "linear-gradient(135deg, #F4C2C2 0%, #D4A33B 100%)",
  },
  editorial: {
    description: "Composición de revista, dramático, sofisticado.",
    icon: Newspaper,
    gradient: "linear-gradient(135deg, #2B2A28 0%, #6C6A65 100%)",
  },
  lifestyle: {
    description: "Producto en uso, escenas cotidianas con personajes.",
    icon: Coffee,
    gradient: "linear-gradient(135deg, #C8E6D5 0%, #A0C9B0 100%)",
  },
  nocturno: {
    description: "Luces neón, ambiente urbano, contraste nocturno.",
    icon: Moon,
    gradient: "linear-gradient(135deg, #1F3B5B 0%, #0E1A2D 100%)",
  },
};

const OCCASION_ICON: Record<string, LucideIcon> = {
  "dia-a-dia": Coffee,
  salida: PartyPopper,
  trabajo: Briefcase,
  deporte: Activity,
  especial: Heart,
};

const MAX_PALETTE = 3;

export default function EstiloPage() {
  const { state, setState, hydrated } = useRecorrido();

  const canContinue = Boolean(state.mood) && Boolean(state.occasion);
  const paletteReachedMax = state.palette.length >= MAX_PALETTE;

  function togglePalette(hex: string) {
    const isSelected = state.palette.includes(hex);
    if (isSelected) {
      setState({ palette: state.palette.filter((c) => c !== hex) });
      return;
    }
    if (paletteReachedMax) return;
    setState({ palette: [...state.palette, hex] });
  }

  return (
    <StationShell
      number="03"
      title="Estilo"
      description="Definí el mood, la paleta y la ocasión. La IA usa esto para decidir cómo iluminar, componer y ambientar tu producto."
      prevHref="/referencias"
      prevLabel="Volver"
      nextHref="/formato"
      nextLabel="Continuar a Formato"
      nextDisabled={!canContinue}
      nextDisabledHint={
        !canContinue ? "Elegí un mood y una ocasión para seguir" : undefined
      }
    >
      {!hydrated ? (
        <div
          aria-busy
          className="glass min-h-[400px] animate-pulse rounded-2xl border border-dashed border-white/70"
        />
      ) : (
        <div className="space-y-8">
          {/* Mood */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Mood</h2>
              <p className="text-xs text-muted-foreground">
                Elegí la atmósfera general de las imágenes.
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Mood"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {MOOD_OPTIONS.map((opt) => {
                const meta = MOOD_META[opt.value];
                return (
                  <MoodCard
                    key={opt.value}
                    title={opt.label}
                    description={meta?.description}
                    icon={meta?.icon}
                    gradient={meta?.gradient}
                    selected={state.mood === opt.value}
                    onSelect={() =>
                      setState({
                        mood: state.mood === opt.value ? null : opt.value,
                      })
                    }
                  />
                );
              })}
            </div>
          </section>

          {/* Paleta */}
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Paleta</h2>
                <p className="text-xs text-muted-foreground">
                  Hasta {MAX_PALETTE} colores. Opcional.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/50 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
                {state.palette.length}/{MAX_PALETTE}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PALETTE_OPTIONS.map((opt) => {
                const selected = state.palette.includes(opt.value);
                const disabled = !selected && paletteReachedMax;
                return (
                  <SelectableChip
                    key={opt.value}
                    label={opt.label}
                    color={opt.value}
                    variant="multi"
                    selected={selected}
                    disabled={disabled}
                    onSelect={() => togglePalette(opt.value)}
                  />
                );
              })}
            </div>
          </section>

          {/* Ocasión */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ocasión</h2>
              <p className="text-xs text-muted-foreground">
                ¿En qué contexto se usa tu producto?
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {OCCASION_OPTIONS.map((opt) => (
                <SelectableChip
                  key={opt.value}
                  label={opt.label}
                  icon={OCCASION_ICON[opt.value]}
                  variant="single"
                  selected={state.occasion === opt.value}
                  onSelect={() =>
                    setState({
                      occasion:
                        state.occasion === opt.value ? null : opt.value,
                    })
                  }
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </StationShell>
  );
}
