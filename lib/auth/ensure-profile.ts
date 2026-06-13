import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Crea la fila `profiles` del usuario Clerk si todavía no existe (idempotente).
 *
 * Reemplaza al trigger `handle_new_user` (migración 0001), que con Clerk queda
 * MUERTO: los usuarios ya no nacen en `auth.users`, así que nada dispara la
 * creación del perfil. Sin esto, un usuario nuevo no tendría fila en `profiles`
 * ni sus créditos de regalo, y la app tiraría "Perfil no encontrado".
 *
 * Los créditos de regalo (60 de generación / 10 de análisis) los pone el
 * DEFAULT de las columnas `credits_remaining` / `analysis_credits_remaining`
 * (ver migraciones 0001/0008) — igual que cuando los creaba el trigger. Por eso
 * un INSERT con solo el id ya entrega el bono, sin necesidad de llamar a las
 * RPC de créditos.
 *
 * Usa el cliente admin (service_role) a propósito: insertar el propio perfil
 * ANTES de que exista no encaja en el modelo RLS dueño-only. El upsert con
 * `ignoreDuplicates` lo hace idempotente y a prueba de carreras (dos requests
 * concurrentes del mismo usuario nuevo no rompen con violación de PK).
 *
 * Se invoca desde el layout de la sección autenticada (`app/(app)/layout.tsx`)
 * y como red de seguridad al tope de las API routes que consumen créditos.
 */
export async function ensureProfile(): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;

  const admin = createAdminClient();

  // Fast path: si el perfil ya existe, no hacemos nada (una query indexada por
  // PK). Es el caso normal en cada request de un usuario ya provisto.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing) return;

  // Primera vez: enriquecemos el perfil con datos de Clerk (display_name /
  // avatar), igual que el viejo trigger tomaba de los metadatos de auth.users.
  const user = await currentUser();
  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    null;

  await admin.from("profiles").upsert(
    {
      id: userId,
      display_name: displayName,
      avatar_url: user?.imageUrl ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
}
