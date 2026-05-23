import { requireAdminSession } from "@/lib/admin";
import { readQuoteName } from "@/lib/adminCacheApi";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return Response.json({ error: gate.status === 401 ? "Unauthorized" : "Forbidden" }, { status: gate.status });
  }

  try {
    const rows = await prisma.stockAnalysisCache.findMany({
      orderBy: { updatedAt: "desc" },
      select: { symbol: true, createdAt: true, updatedAt: true, payload: true },
    });

    return Response.json({
      items: rows.map((r) => ({
        symbol: r.symbol,
        name: readQuoteName(r.payload),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
}
