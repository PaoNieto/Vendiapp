"use client";

import { UserProvider } from "@/lib/auth/use-user";
import { AnalysesProvider } from "@/lib/analyses/store";
import { CreditosProvider } from "@/lib/creditos/use-creditos";
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
                <CreditosProvider>
                  <GeneracionProvider>
                    <RecorridoProvider>{children}</RecorridoProvider>
                  </GeneracionProvider>
                </CreditosProvider>
              </AnalysesProvider>
            </NegocioProvider>
          </GenerationsProvider>
        </VersionsProvider>
      </ProductsProvider>
    </UserProvider>
  );
}
