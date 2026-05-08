import { NextResponse } from "next/server";

// TODO: query real a Supabase
// const supabase = await createClient();
// const { data, error } = await supabase
//   .from("generations")
//   .select("*, generated_images(*)")
//   .eq("id", id)
//   .single();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // Mock: devolver una generación completed con 5 variaciones
  return NextResponse.json({
    id,
    status: "completed",
    variations_requested: 5,
    output_ratio: "4:5",
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    generated_images: Array.from({ length: 5 }, (_, i) => ({
      id: `${id}-img-${i}`,
      generation_id: id,
      variation_index: i,
      image_url: `/mock/generation-${i}.jpg`,
      thumbnail_url: null,
      is_favorite: false,
      is_downloaded: false,
    })),
  });
}
