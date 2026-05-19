"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { StationShell } from "@/components/app/station-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { buildPromptFromBrief } from "@/lib/recorrido/build-prompt";
import { useRecorrido } from "@/lib/recorrido/store";
import { isBriefValid } from "@/lib/validations/recorrido";

export default function PromptPage() {
  const { state, setState, hydrated } = useRecorrido();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const autoFilledRef = useRef(false);

  // Autocompletar la primera vez si el prompt está vacío. Solo después de hidratar.
  useEffect(() => {
    if (!hydrated) return;
    if (autoFilledRef.current) return;
    autoFilledRef.current = true;
    if (state.userPrompt.trim().length === 0) {
      setState({ userPrompt: buildPromptFromBrief(state) });
    }
  }, [hydrated, state, setState]);

  const briefValid = useMemo(() => isBriefValid(state), [state]);
  const charCount = state.userPrompt.length;

  function handleRegenerate() {
    const fresh = buildPromptFromBrief(state);
    if (state.userPrompt.trim().length > 0 && state.userPrompt !== fresh) {
      setConfirmOpen(true);
      return;
    }
    setState({ userPrompt: fresh });
  }

  function confirmRegenerate() {
    setState({ userPrompt: buildPromptFromBrief(state) });
    setConfirmOpen(false);
  }

  return (
    <StationShell
      number="05"
      title="Prompt"
      description="Acá ves en lenguaje natural lo que la IA va a generar. Editá libremente si querés ajustar algún detalle antes de mandar a la Fábrica."
      prevHref="/formato"
      prevLabel="Volver"
      nextHref="/fabrica"
      nextLabel="Mandar a la Fábrica"
      nextDisabled={!briefValid}
      nextDisabledHint={
        !briefValid
          ? "Faltan datos del brief — revisá las estaciones anteriores"
          : undefined
      }
    >
      {!hydrated ? (
        <div
          aria-busy
          className="glass min-h-[260px] animate-pulse rounded-2xl border border-dashed border-white/70"
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="user-prompt"
              className="text-sm font-medium text-foreground"
            >
              Prompt para la IA
            </label>
            <div className="glass rounded-2xl border border-white/60 p-3">
              <Textarea
                id="user-prompt"
                value={state.userPrompt}
                onChange={(e) => setState({ userPrompt: e.target.value })}
                placeholder="Describí cómo querés que se vea la imagen…"
                className="min-h-[200px] resize-y border-0 bg-transparent p-1 text-sm focus-visible:ring-0"
              />
              <div className="mt-2 flex items-center justify-end">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {charCount}{" "}
                  {charCount === 1 ? "caracter" : "caracteres"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Podés editarlo a mano o regenerarlo desde el brief.
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleRegenerate}
              className="h-11 rounded-xl"
            >
              <RotateCcw className="h-4 w-4" />
              Regenerar desde el brief
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Sobrescribir tu prompt?</DialogTitle>
            <DialogDescription>
              Ya editaste el prompt. Si regenerás desde el brief, vamos a
              reemplazar tu texto por uno nuevo basado en lo que elegiste en las
              estaciones anteriores.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={confirmRegenerate}>
              Sí, regenerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StationShell>
  );
}
