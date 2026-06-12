import { requireAdminSession } from "@/lib/admin";
import { payloadToEditableBundle } from "@/lib/adminCacheApi";
import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";
import { prisma } from "@/lib/prisma";
import { isValidStockSymbolInput, normalizeStockSymbol } from "@/lib/stockSymbol";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ symbol: string }> };

export async function POST(_request: Request, ctx: RouteCtx) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return Response.json({ error: gate.status === 401 ? "Unauthorized" : "Forbidden" }, { status: gate.status });
  }

  const raw = decodeURIComponent((await ctx.params).symbol).trim();
  if (!isValidStockSymbolInput(raw)) {
    return Response.json({ error: "Invalid symbol." }, { status: 400 });
  }
  const sym = normalizeStockSymbol(raw);

  const { bundle, error } = await loadStockAnalysis(sym, {
    forceRefresh: true,
    overwriteAdminEdits: true,
  });
  if (!bundle || error) {
    return Response.json({ error: error ?? "Refresh failed." }, { status: 502 });
  }

  const row = await prisma.stockAnalysisCache.findUnique({ where: { symbol: sym } });
  if (!row) {
    return Response.json({ error: "Cache row missing after refresh." }, { status: 500 });
  }

  const editable = payloadToEditableBundle(row.payload);
  return Response.json({
    symbol: row.symbol,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    adminEditedAt: null,
    bundle: editable,
  });
}
