"use client";

import { UserProvider } from "@/lib/auth/use-user";
import { AnalysesProvider } from "@/lib/analyses/store";
import { GeneracionProvider } from "@/lib/generacion/store";
import { GenerationsProvider } from "@/lib/generations/store";
import { NegocioProvider } from "@/lib/negocio/store";
import { ProductsProvider } from "@/lib/products/store";
import { RecorridoProvider } from "@/lib/recorrido/store";
import { VersionsProvider } from "@/lib/versions/store";

// UserProvider va MUY arriba en el árbol: cualquier store o componente
// que necesite saber quién está logueado (para hidratar desde Supabase,
// filtrar por user_id, etc.) puede leerlo via useUser().
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ProductsProvider>
        <VersionsProvider>
          <GenerationsProvider>
            <NegocioProvider>
              <AnalysesProvider>
                <GeneracionProvider>
                  <RecorridoProvider>{children}</RecorridoProvider>
                </GeneracionProvider>
              </AnalysesProvider>
            </NegocioProvider>
          </GenerationsProvider>
        </VersionsProvider>
      </ProductsProvider>
    </UserProvider>
  );
}
