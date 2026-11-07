import { requireAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { articleSchema } from "@/lib/editorialContent";
import { readEditorialJson, serializeArticle } from "@/lib/editorialServer";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const admin = await requireAdminSession();
  try {
    const row = await prisma.article.findFirst({
      where: { id, ...(admin.ok ? {} : { published: true }) },
    });
    if (!row)
      return Response.json({ error: "Article not found." }, { status: 404 });
    return Response.json(
      { article: serializeArticle(row) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Article could not be loaded." },
      { status: 503 },
    );
  }
}
export async function PUT(request: Request, { params }: Context) {
  const admin = await requireAdminSession();
  if (!admin.ok)
    return Response.json(
      { error: "Admin access required." },
      { status: admin.status },
    );
  const { id } = await params;
  let body;
  try {
    body = await readEditorialJson(request);
  } catch {
    return Response.json(
      { error: "Invalid or oversized article." },
      { status: 400 },
    );
  }
  const parsed = articleSchema.safeParse(body);
  const version = (body as { updatedAt?: unknown })?.updatedAt;
  if (
    !parsed.success ||
    typeof version !== "string" ||
    !Number.isFinite(Date.parse(version))
  )
    return Response.json(
      { error: "Invalid article or missing version." },
      { status: 400 },
    );
  try {
    const current = await prisma.article.findUnique({ where: { id } });
    if (!current)
      return Response.json({ error: "Article not found." }, { status: 404 });
    const result = await prisma.article.updateMany({
      where: { id, updatedAt: new Date(version) },
      data: {
        ...parsed.data,
        publishedAt: parsed.data.published
          ? (current.publishedAt ?? new Date())
          : null,
      },
    });
    if (result.count === 0)
      return Response.json(
        {
          error: "This article changed in another tab. Reload before editing.",
        },
        { status: 409 },
      );
    const row = await prisma.article.findUniqueOrThrow({ where: { id } });
    return Response.json({ article: serializeArticle(row) });
  } catch {
    return Response.json(
      { error: "The article could not be saved." },
      { status: 503 },
    );
  }
}
