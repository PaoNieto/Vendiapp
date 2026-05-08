import { NextResponse } from "next/server";
import { generationRequestSchema } from "@/lib/validations/generations";

// TODO: orquestación real con Supabase + art-director + image-generator
// Pipeline:
// 1. Validar con Zod ✓
// 2. Verificar auth + créditos del usuario
// 3. Insert en `generations` (status: pending)
// 4. Llamar a generateEnrichedPrompt() del director de arte
// 5. Llamar a generateImageVariations() en paralelo
// 6. Subir imágenes a Supabase Storage
// 7. Insert en `generated_images`
// 8. Update `generations.status = completed`, descontar créditos
// 9. Devolver { id }

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Body inválido" },
      { status: 400 },
    );
  }

  const parsed = generationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación falló", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Mock: generar id y devolver — el frontend abrirá /generations/[id]
  // que simula el processing → completed con setTimeout
  const id = crypto.randomUUID();

  return NextResponse.json(
    {
      id,
      status: "pending",
      ...parsed.data,
    },
    { status: 201 },
  );
}
