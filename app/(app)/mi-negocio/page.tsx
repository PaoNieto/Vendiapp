"use client";

import { useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  CircleX,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { useNegocio } from "@/lib/negocio/store";
import { validateGoogleApiKey } from "@/lib/ai/validate-key";
import { cn } from "@/lib/utils";

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

type KeyStatus =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "valid" }
  | { kind: "invalid"; reason: string };

export default function MiNegocioPage() {
  const { state, setState, hydrated } = useNegocio();
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(
    state.apiKeyValidated ? { kind: "valid" } : { kind: "idle" },
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleValidate() {
    setKeyStatus({ kind: "validating" });
    const result = await validateGoogleApiKey(state.apiKey);
    if (result.ok) {
      setKeyStatus({ kind: "valid" });
      setState({ apiKeyValidated: true });
    } else {
      setKeyStatus({ kind: "invalid", reason: result.reason });
      setState({ apiKeyValidated: false });
    }
  }

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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Mi Negocio
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Contanos sobre tu marca y conectá tu API key de Google. Sin esto, la
          Fábrica no puede generar.
        </p>

        {/* Perfil de marca */}
        <Card className="glass mt-6 rounded-3xl border-0 p-6">
          <h2 className="text-base font-semibold text-foreground">
            Perfil de marca
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            La IA usa esto para mantener tu estilo consistente.
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

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={!state.brandName}
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-9 rounded-lg disabled:opacity-50",
              )}
            >
              {savedAt ? "Guardado ✓" : "Guardar perfil"}
            </button>
          </div>
        </Card>

        {/* API key Google */}
        <Card className="glass mt-4 rounded-3xl border-0 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              API key de Google AI Studio
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            La key se guarda solo en tu navegador. Vendí no la almacena en
            servidores. La usamos para generar tus imágenes con Gemini.
          </p>

          <div className="mt-5 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Tu API key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="apiKey"
                    type={showKey ? "text" : "password"}
                    value={state.apiKey}
                    onChange={(e) => {
                      setState({
                        apiKey: e.target.value,
                        apiKeyValidated: false,
                      });
                      setKeyStatus({ kind: "idle" });
                    }}
                    placeholder="AIza…"
                    className="pr-10 font-mono text-xs"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={
                    !state.apiKey ||
                    keyStatus.kind === "validating"
                  }
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "h-10 shrink-0 rounded-lg px-4 disabled:opacity-50",
                  )}
                >
                  {keyStatus.kind === "validating" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Validar"
                  )}
                </button>
              </div>
            </div>

            {keyStatus.kind === "valid" && (
              <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Key validada — ya podés generar.
              </div>
            )}

            {keyStatus.kind === "invalid" && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <CircleX className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{keyStatus.reason}</span>
              </div>
            )}

            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              Conseguí tu API key gratis en Google AI Studio
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
