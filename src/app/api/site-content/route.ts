import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin";
import { siteContentSchema } from "@/lib/siteContentSchema";
import { readEditorialJson } from "@/lib/editorialServer";
export async function GET() {
  try {
    const row = await prisma.siteContent.findUnique({
      where: { locale: "site" },
    });
    const copy = row
      ? { ...(row.payload as object), version: row.updatedAt.toISOString() }
      : { en: {}, bg: {}, images: {}, version: null };
    return Response.json(
      { copy },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Page content could not be loaded." },
      { status: 503 },
    );
  }
}
export async function PUT(request: Request) {
  const admin = await requireAdminSession();
  if (!admin.ok)
    return Response.json(
      { error: "Admin access required." },
      { status: admin.status },
    );
  let raw;
  try {
    raw = await readEditorialJson(request);
  } catch {
    return Response.json(
      { error: "Invalid or oversized page content." },
      { status: 400 },
    );
  }
  const parsed = siteContentSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues.map((e) => e.message).join(" ") },
      { status: 400 },
    );
  const { version, ...payload } = parsed.data;
  try {
    if (version === null) {
      try {
        const row = await prisma.siteContent.create({
          data: { locale: "site", payload },
        });
        return Response.json({
          copy: { ...payload, version: row.updatedAt.toISOString() },
        });
      } catch {
        return Response.json(
          { error: "Content may have changed. Reload before saving." },
          { status: 409 },
        );
      }
    }
    if (!Number.isFinite(Date.parse(version)))
      return Response.json({ error: "Invalid version." }, { status: 400 });
    const result = await prisma.siteContent.updateMany({
      where: { locale: "site", updatedAt: new Date(version) },
      data: { payload },
    });
    if (!result.count)
      return Response.json(
        { error: "Content changed in another tab. Reload before saving." },
        { status: 409 },
      );
    const row = await prisma.siteContent.findUniqueOrThrow({
      where: { locale: "site" },
    });
    return Response.json({
      copy: { ...payload, version: row.updatedAt.toISOString() },
    });
  } catch {
    return Response.json(
      { error: "Page content could not be saved." },
      { status: 503 },
    );
  }
}
