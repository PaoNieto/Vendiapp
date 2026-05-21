"use client";

import { GenerationsProvider } from "@/lib/generations/store";
import { NegocioProvider } from "@/lib/negocio/store";
import { ProductsProvider } from "@/lib/products/store";
import { RecorridoProvider } from "@/lib/recorrido/store";
import { VersionsProvider } from "@/lib/versions/store";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ProductsProvider>
      <VersionsProvider>
        <GenerationsProvider>
          <NegocioProvider>
            <RecorridoProvider>{children}</RecorridoProvider>
          </NegocioProvider>
        </GenerationsProvider>
      </VersionsProvider>
    </ProductsProvider>
  );
}
