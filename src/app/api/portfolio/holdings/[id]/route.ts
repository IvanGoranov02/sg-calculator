import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { normalizePortfolioCurrency } from "@/lib/portfolioFx";
import { prisma } from "@/lib/prisma";
import { prismaErrorToHttp } from "@/lib/prismaHttpError";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const row = await prisma.portfolioHolding.findFirst({ where: { id, userId } });
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const data: Prisma.PortfolioHoldingUpdateInput = {};

  if (o.quantity !== undefined || o.avgPrice !== undefined) {
    if (row.source !== "manual") {
      return Response.json({ error: "Only manual holdings can edit quantity or average price" }, { status: 400 });
    }
  }
  if (o.quantity !== undefined) {
    const n = typeof o.quantity === "number" ? o.quantity : typeof o.quantity === "string" ? Number(o.quantity) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      return Response.json({ error: "quantity must be a positive number" }, { status: 400 });
    }
    data.quantity = new Prisma.Decimal(n);
  }
  if (o.avgPrice !== undefined) {
    const n = typeof o.avgPrice === "number" ? o.avgPrice : typeof o.avgPrice === "string" ? Number(o.avgPrice) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      return Response.json({ error: "avgPrice must be a positive number" }, { status: 400 });
    }
    data.avgPrice = new Prisma.Decimal(n);
  }
  if (typeof o.currency === "string" && o.currency.trim().length >= 3) {
    data.currency = normalizePortfolioCurrency(o.currency);
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.portfolioHolding.update({
      where: { id, userId },
      data,
    });

    return Response.json({
      id: updated.id,
      symbolYahoo: updated.symbolYahoo,
      symbolT212: updated.symbolT212,
      quantity: updated.quantity.toString(),
      avgPrice: updated.avgPrice.toString(),
      currency: updated.currency,
      source: updated.source,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const row = await prisma.portfolioHolding.findFirst({ where: { id, userId } });
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (row.source !== "manual") {
    return Response.json({ error: "Only manual holdings can be deleted here; clear Trading 212 or resync" }, { status: 400 });
  }

  try {
    await prisma.portfolioHolding.delete({ where: { id, userId } });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
