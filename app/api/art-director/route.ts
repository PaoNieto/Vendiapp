import { NextResponse } from "next/server";
import { artDirectorRequestSchema } from "@/lib/validations/generations";
import { generateEnrichedPrompt } from "@/lib/ai/art-director";

// Endpoint independiente para enriquecer un prompt sin generar imágenes.
// Útil para preview del prompt antes de gastar créditos.

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = artDirectorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación falló", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY no configurada. Setealá en .env.local antes de usar el director de arte.",
      },
      { status: 503 },
    );
  }

  try {
    const enriched = await generateEnrichedPrompt({
      productImages: parsed.data.productImages,
      referenceImages: parsed.data.referenceImages,
      ratio: parsed.data.ratio,
      userPrompt: parsed.data.userPrompt,
    });
    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
