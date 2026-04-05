import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { isPrismaInfrastructureError, prismaErrorToHttp } from "@/lib/prismaHttpError";
import { logApiException } from "@/lib/serverDebugLog";
import { t212TickerToYahoo } from "@/lib/t212Ticker";
import { fetchT212AccountSummary, fetchT212Positions, type T212RequestError } from "@/lib/trading212Client";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPortfolioEncryptionConfigured()) {
    return Response.json(
      {
        error:
          "Server cannot decrypt credentials: set AUTH_SECRET or PORTFOLIO_ENCRYPTION_KEY on the server.",
      },
      { status: 503 },
    );
  }

  let conn;
  try {
    conn = await prisma.trading212Connection.findUnique({ where: { userId } });
  } catch (e) {
    if (isPrismaInfrastructureError(e)) {
      const { status, error } = prismaErrorToHttp(e);
      return Response.json({ error }, { status });
    }
    throw e;
  }
  if (!conn) {
    return Response.json({ error: "Trading 212 is not connected" }, { status: 400 });
  }

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decryptSecret(conn.apiKeyEnc);
    apiSecret = decryptSecret(conn.apiSecretEnc);
  } catch {
    return Response.json({ error: "Failed to decrypt credentials" }, { status: 500 });
  }

  try {
    const [positions, summary] = await Promise.all([
      fetchT212Positions(conn.environment, apiKey, apiSecret),
      fetchT212AccountSummary(conn.environment, apiKey, apiSecret),
    ]);

    const rows: Prisma.PortfolioHoldingCreateManyInput[] = [];
    for (const p of positions) {
      const qty = Number(p.quantity ?? 0);
      if (!Number.isFinite(qty) || qty === 0) continue;
      const ticker = p.instrument?.ticker;
      if (!ticker) continue;
      const yahoo = t212TickerToYahoo(ticker);
      const avg = Number(p.averagePricePaid ?? 0);
      const cur = p.instrument?.currency ?? summary?.currency ?? "USD";
      rows.push({
        userId,
        symbolYahoo: yahoo,
        symbolT212: ticker,
        quantity: new Prisma.Decimal(qty),
        avgPrice: new Prisma.Decimal(Number.isFinite(avg) ? avg : 0),
        currency: cur,
        source: "t212",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.portfolioHolding.deleteMany({ where: { userId, source: "t212" } });
      if (rows.length > 0) {
        await tx.portfolioHolding.createMany({ data: rows });
      }
      await tx.trading212Connection.update({
        where: { userId },
        data: {
          lastSyncAt: new Date(),
          lastError: null,
        },
      });
    });

    return Response.json({
      ok: true,
      positionsSynced: rows.length,
      accountCurrency: summary?.currency ?? null,
      totalValue: summary?.totalValue ?? null,
    });
  } catch (e) {
    if (isPrismaInfrastructureError(e)) {
      const { status, error } = prismaErrorToHttp(e);
      return Response.json({ error }, { status });
    }
    const msg = e instanceof Error ? e.message : "Sync failed";
    const status = (e as T212RequestError).status;
    logApiException("POST /api/trading212/sync (broker API or other)", e, {
      userId,
      trading212HttpStatus: status ?? undefined,
    });
    try {
      await prisma.trading212Connection.update({
        where: { userId },
        data: { lastError: msg.slice(0, 2000) },
      });
    } catch {
      /* ignore if row missing */
    }
    return Response.json(
      { error: msg, trading212Status: status ?? null },
      { status: status && status >= 400 && status < 500 ? status : 502 },
    );
  }
}
