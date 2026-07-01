"use client";

import { useState } from "react";
import { Briefcase } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PillButton } from "@/components/dashboard";
import { useNegocio } from "@/lib/negocio/store";

const INDUSTRIES = [
  "Moda y ropa",
  "Belleza y cosmética",
  "Comida y bebida",
  "Hogar y deco",
  "Tecnología",
  "Niños y bebés",
  "Mascotas",
  "Deporte y fitness",
  "Otro",
];

/**
 * Mi Negocio — perfil de marca.
 *
 * Modelo de CRÉDITOS: el usuario ya NO pega ninguna API key. La generación
 * corre server-side con la key de Vendí. Acá solo va el perfil de marca, que
 * la IA usa para mantener consistencia de estilo.
 */
export default function MiNegocioPage() {
  const { state, setState, hydrated } = useNegocio();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSaveProfile() {
    setSavedAt(Date.now());
    window.setTimeout(() => setSavedAt(null), 2000);
  }

  if (!hydrated) {
    return (
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-3xl">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <Briefcase className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            Mi <span className="text-gold-glossy">Negocio</span>
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Contanos sobre tu marca. La IA usa esto para mantener tu estilo
          consistente en cada generación.
        </p>

        <Card className="glass mt-6 rounded-3xl border-0 p-6">
          <h2 className="text-base font-medium text-foreground">
            Perfil de marca
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Mientras más completo, mejores resultados.
          </p>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brandName">Nombre de la marca</Label>
              <Input
                id="brandName"
                value={state.brandName}
                onChange={(e) => setState({ brandName: e.target.value })}
                placeholder="Ej: Vendí"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Rubro</Label>
              <select
                id="industry"
                value={state.industry}
                onChange={(e) => setState({ industry: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-input/50 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Elegí un rubro…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción corta</Label>
              <Textarea
                id="description"
                value={state.description}
                onChange={(e) => setState({ description: e.target.value })}
                placeholder="Ej: Marca de skincare natural para mujeres 25-40 que buscan productos limpios y eficaces."
                rows={3}
                maxLength={300}
                className="resize-none"
              />
              <div className="text-right text-[10px] text-muted-foreground">
                {state.description.length}/300
              </div>
            </div>

            <PillButton
              size="sm"
              onClick={handleSaveProfile}
              disabled={!state.brandName}
            >
              {savedAt ? "Guardado ✓" : "Guardar perfil"}
            </PillButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
