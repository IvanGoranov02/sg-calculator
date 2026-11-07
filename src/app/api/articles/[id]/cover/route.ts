import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin";
import { imageSchema } from "@/lib/editorialContent";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = await requireAdminSession();
  try {
    const row = await prisma.article.findFirst({
      where: { id, ...(admin.ok ? {} : { published: true }) },
      select: { cover: true },
    });
    const parsed = imageSchema.safeParse(row?.cover);
    if (!parsed.success || !parsed.data.src)
      return new Response(null, { status: 404 });
    const source = parsed.data.src;
    const match = source.match(
      /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/,
    );
    if (match)
      return new Response(Buffer.from(match[2], "base64"), {
        headers: {
          "Content-Type": match[1],
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    return Response.redirect(new URL(source, request.url), 302);
  } catch {
    return new Response(null, { status: 503 });
  }
}
