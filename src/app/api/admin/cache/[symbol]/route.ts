import { requireAdminSession } from "@/lib/admin";
import { adminEditableBundleSchema } from "@/lib/adminCacheSchema";
import {
  asCachePayload,
  editableToStockBundle,
  payloadToEditableBundle,
} from "@/lib/adminCacheApi";
import {
  buildCachePayload,
  mergeAdminEditableIntoCache,
  readAdminEditedAt,
} from "@/lib/stockCache";
import { prisma } from "@/lib/prisma";
import { isValidStockSymbolInput, normalizeStockSymbol } from "@/lib/stockSymbol";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ symbol: string }> };

function resolveSymbol(raw: string): string | null {
  const trimmed = decodeURIComponent(raw).trim();
  if (!isValidStockSymbolInput(trimmed)) return null;
  return normalizeStockSymbol(trimmed);
}

export async function GET(_request: Request, ctx: RouteCtx) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return Response.json({ error: gate.status === 401 ? "Unauthorized" : "Forbidden" }, { status: gate.status });
  }

  const sym = resolveSymbol((await ctx.params).symbol);
  if (!sym) {
    return Response.json({ error: "Invalid symbol." }, { status: 400 });
  }

  const row = await prisma.stockAnalysisCache.findUnique({ where: { symbol: sym } });
  if (!row) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const bundle = payloadToEditableBundle(row.payload);
  if (!bundle) {
    return Response.json({ error: "Cache payload is not editable." }, { status: 422 });
  }

  return Response.json({
    symbol: row.symbol,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    adminEditedAt: readAdminEditedAt(asCachePayload(row.payload)),
    bundle,
  });
}

export async function PUT(request: Request, ctx: RouteCtx) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return Response.json({ error: gate.status === 401 ? "Unauthorized" : "Forbidden" }, { status: gate.status });
  }

  const sym = resolveSymbol((await ctx.params).symbol);
  if (!sym) {
    return Response.json({ error: "Invalid symbol." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = adminEditableBundleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed.", details: parsed.error.flatten() }, { status: 400 });
  }

  const edited = parsed.data;
  if (normalizeStockSymbol(edited.quote.symbol) !== sym) {
    return Response.json({ error: "Quote symbol must match URL." }, { status: 400 });
  }

  const existingRow = await prisma.stockAnalysisCache.findUnique({ where: { symbol: sym } });
  const existingPayload = asCachePayload(existingRow?.payload ?? null);
  const merged = mergeAdminEditableIntoCache(editableToStockBundle(edited), existingPayload);
  merged.quote.symbol = sym;

  const adminEditedAt = new Date().toISOString();
  const plain = buildCachePayload(merged, adminEditedAt);
  const row = await prisma.stockAnalysisCache.upsert({
    where: { symbol: sym },
    create: { symbol: sym, payload: plain },
    update: { payload: plain },
  });

  const bundle = payloadToEditableBundle(row.payload);
  return Response.json({
    symbol: row.symbol,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    adminEditedAt,
    bundle,
  });
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return Response.json({ error: gate.status === 401 ? "Unauthorized" : "Forbidden" }, { status: gate.status });
  }

  const sym = resolveSymbol((await ctx.params).symbol);
  if (!sym) {
    return Response.json({ error: "Invalid symbol." }, { status: 400 });
  }

  const deleted = await prisma.stockAnalysisCache.deleteMany({ where: { symbol: sym } });
  if (deleted.count === 0) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
