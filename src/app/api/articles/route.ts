import { requireAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { articleSchema } from "@/lib/editorialContent";
import { readEditorialJson, serializeArticle } from "@/lib/editorialServer";
export async function GET() {
  const admin = await requireAdminSession();
  try {
    // Keep uploaded base64 covers out of the listing response. Images load individually.
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        excerpt: string;
        published: boolean;
        publishedAt: Date | null;
        updatedAt: Date;
        cover: unknown;
      }>
    >`
      SELECT "id", "title", "excerpt", "published", "publishedAt", "updatedAt",
        jsonb_build_object(
          'src', CASE WHEN "cover"->>'src' <> '' THEN '/api/articles/' || "id" || '/cover' ELSE '' END,
          'alt', "cover"->>'alt', 'x', "cover"->'x', 'y', "cover"->'y'
        ) AS "cover"
      FROM "Article" WHERE "published" = true OR ${admin.ok}
      ORDER BY "createdAt" DESC LIMIT 100
    `;
    return Response.json(
      { articles: rows.map((row) => ({ ...row, blocks: [] })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Articles could not be loaded." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin.ok)
    return Response.json(
      { error: "Admin access required." },
      { status: admin.status },
    );
  let input;
  try {
    input = articleSchema.parse(await readEditorialJson(request));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid article." },
      { status: 400 },
    );
  }
  try {
    const row = await prisma.article.create({
      data: { ...input, publishedAt: input.published ? new Date() : null },
    });
    return Response.json({ article: serializeArticle(row) }, { status: 201 });
  } catch {
    return Response.json(
      { error: "The article could not be saved." },
      { status: 503 },
    );
  }
}
