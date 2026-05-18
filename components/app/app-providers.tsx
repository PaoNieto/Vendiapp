"use client";

import { NegocioProvider } from "@/lib/negocio/store";
import { RecorridoProvider } from "@/lib/recorrido/store";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NegocioProvider>
      <RecorridoProvider>{children}</RecorridoProvider>
    </NegocioProvider>
  );
}
