import { getReadImage } from "@/lib/reads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const img = await getReadImage(id);
    if (!img) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(img.data), {
      headers: {
        "Content-Type": img.mime,
        // Image ids are content-immutable (a new upload gets a new id).
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
}
