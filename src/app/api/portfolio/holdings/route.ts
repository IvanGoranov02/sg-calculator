import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { prismaErrorToHttp } from "@/lib/prismaHttpError";
import { normalizeTicker } from "@/lib/watchlistStorage";

function parsePositiveDecimal(raw: unknown, label: string): Prisma.Decimal {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return new Prisma.Decimal(n);
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const symbolRaw = typeof o.symbolYahoo === "string" ? o.symbolYahoo : "";
  const symbolYahoo = normalizeTicker(symbolRaw);
  if (!symbolYahoo) {
    return Response.json({ error: "symbolYahoo is required" }, { status: 400 });
  }

  let quantity: Prisma.Decimal;
  let avgPrice: Prisma.Decimal;
  try {
    quantity = parsePositiveDecimal(o.quantity, "quantity");
    avgPrice = parsePositiveDecimal(o.avgPrice, "avgPrice");
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid numbers" }, { status: 400 });
  }

  const currency =
    typeof o.currency === "string" && o.currency.trim().length >= 3
      ? o.currency.trim().toUpperCase().slice(0, 8)
      : "USD";

  try {
    const existingManual = await prisma.portfolioHolding.findFirst({
      where: { userId, symbolYahoo, source: "manual" },
    });
    if (existingManual) {
      return Response.json(
        { error: "You already have a manual row for this symbol" },
        { status: 409 },
      );
    }

    const { row, replacedBrokerRow } = await prisma.$transaction(async (tx) => {
      const brokerRow = await tx.portfolioHolding.findFirst({
        where: { userId, symbolYahoo, source: "t212" },
      });
      if (brokerRow) {
        const updated = await tx.portfolioHolding.update({
          where: { id: brokerRow.id },
          data: {
            source: "manual",
            symbolT212: null,
            quantity,
            avgPrice,
            currency,
          },
        });
        return { row: updated, replacedBrokerRow: true };
      }
      const created = await tx.portfolioHolding.create({
        data: {
          userId,
          symbolYahoo,
          symbolT212: null,
          quantity,
          avgPrice,
          currency,
          source: "manual",
        },
      });
      return { row: created, replacedBrokerRow: false };
    });

    return Response.json({
      id: row.id,
      symbolYahoo: row.symbolYahoo,
      symbolT212: row.symbolT212,
      quantity: row.quantity.toString(),
      avgPrice: row.avgPrice.toString(),
      currency: row.currency,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
      replacedBrokerRow,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "You already have a manual row for this symbol" }, { status: 409 });
    }
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
