import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { isPrismaInfrastructureError, prismaErrorToHttp } from "@/lib/prismaHttpError";
import { logApiException } from "@/lib/serverDebugLog";
import { mapT212PositionToHolding, mergeT212HoldingRows } from "@/lib/t212PositionSync";
import { fetchT212AccountSummary, fetchT212Positions, type T212RequestError } from "@/lib/trading212Client";
import { refreshT212DividendsCache } from "@/lib/t212DividendsCache";

export const maxDuration = 60;

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
    const [positions, summary, manualSymbolsRows] = await Promise.all([
      fetchT212Positions(conn.environment, apiKey, apiSecret),
      fetchT212AccountSummary(conn.environment, apiKey, apiSecret),
      prisma.portfolioHolding.findMany({
        where: { userId, source: "manual" },
        select: { symbolYahoo: true },
      }),
    ]);

    const manualSymbols = new Set(manualSymbolsRows.map((r) => r.symbolYahoo));
    const skippedDueToManual: string[] = [];

    if (positions.length === 0) {
      const existingT212 = await prisma.portfolioHolding.count({
        where: { userId, source: "t212" },
      });
      if (existingT212 > 0) {
        return Response.json(
          {
            error:
              "Trading 212 returned no open positions; your synced holdings were not changed. Try again in a moment.",
          },
          { status: 502 },
        );
      }
    }

    const accountCurrency = summary?.currency ?? null;
    const rows: Prisma.PortfolioHoldingCreateManyInput[] = [];
    for (const p of positions) {
      const row = mapT212PositionToHolding(p, userId, accountCurrency);
      if (!row) continue;
      if (manualSymbols.has(row.symbolYahoo)) {
        if (!skippedDueToManual.includes(row.symbolYahoo)) skippedDueToManual.push(row.symbolYahoo);
        continue;
      }
      rows.push(row);
    }

    const mergedRows = mergeT212HoldingRows(rows);

    await prisma.$transaction(async (tx) => {
      await tx.portfolioHolding.deleteMany({ where: { userId, source: "t212" } });
      if (mergedRows.length > 0) {
        await tx.portfolioHolding.createMany({ data: mergedRows });
      }
      await tx.trading212Connection.update({
        where: { userId },
        data: {
          lastSyncAt: new Date(),
          lastError: null,
        },
      });
    });

    try {
      await refreshT212DividendsCache({
        userId,
        environment: conn.environment,
        apiKeyEnc: conn.apiKeyEnc,
        apiSecretEnc: conn.apiSecretEnc,
      });
    } catch (e) {
      logApiException("POST /api/trading212/sync dividends cache", e, { userId });
    }

    return Response.json({
      ok: true,
      positionsSynced: mergedRows.length,
      skippedDueToManual,
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
