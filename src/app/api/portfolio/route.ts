import { withTimeoutFallback } from "@/lib/asyncTimeout";
import { shouldAttemptAutoSync, recordAutoSyncFailure, clearAutoSyncFailure } from "@/lib/t212AutoSyncBackoff";
import { syncTrading212Positions } from "@/lib/syncTrading212Positions";
import { auth } from "@/auth";
import { isPortfolioPositionSyncDue } from "@/lib/apiCacheHeaders";
import { prisma } from "@/lib/prisma";
import { fetchPortfolioFxRates } from "@/lib/portfolioFxServer";
import { fetchPortfolioQuotesForHoldings } from "@/lib/portfolioMarketData";
import { isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { prismaErrorToHttp } from "@/lib/prismaHttpError";
import { logApiException } from "@/lib/serverDebugLog";
import { normalizeTrading212ErrorMessage } from "@/lib/trading212Errors";

export const maxDuration = 60;

function serializeHolding(h: {
  id: string;
  symbolYahoo: string;
  symbolT212: string | null;
  quantity: { toString(): string };
  avgPrice: { toString(): string };
  currency: string;
  brokerPrice: { toString(): string } | null;
  source: string;
  updatedAt: Date;
}) {
  return {
    id: h.id,
    symbolYahoo: h.symbolYahoo,
    symbolT212: h.symbolT212,
    quantity: h.quantity.toString(),
    avgPrice: h.avgPrice.toString(),
    currency: h.currency,
    brokerPrice: h.brokerPrice?.toString() ?? null,
    source: h.source,
    updatedAt: h.updatedAt.toISOString(),
  };
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connection = await prisma.trading212Connection.findUnique({ where: { userId } });
    if (connection && isPortfolioPositionSyncDue(connection.lastSyncAt) && shouldAttemptAutoSync(userId)) {
      // Best effort: a T212 rate limit/outage must not break the holdings view;
      // fall back to the last stored snapshot.
      try {
        const result = await withTimeoutFallback(
          syncTrading212Positions(userId, false),
          10_000,
          "t212-auto-sync",
          null,
        );
        if (result?.ok) clearAutoSyncFailure(userId);
        else recordAutoSyncFailure(userId);
      } catch {
        recordAutoSyncFailure(userId);
      }
    }
    const [holdings, t212] = await Promise.all([
      prisma.portfolioHolding.findMany({
        where: { userId },
        orderBy: [{ source: "asc" }, { symbolYahoo: "asc" }],
      }),
      prisma.trading212Connection.findUnique({ where: { userId } }),
    ]);

    const [fx, quotes] = await Promise.all([
      fetchPortfolioFxRates().catch(() => ({
        eurPerUsd: null as number | null,
        gbpPerUsd: null as number | null,
      })),
      (holdings.length > 0
        ? fetchPortfolioQuotesForHoldings(
            holdings.map((h) => ({
              symbolYahoo: h.symbolYahoo,
              symbolT212: h.symbolT212,
              currency: h.currency,
              brokerPrice: h.brokerPrice != null ? Number(h.brokerPrice) : null,
              source: h.source,
            })),
          )
        : Promise.resolve({})
      ).catch((e) => {
        logApiException("GET /api/portfolio quotes", e, { userId, holdingCount: holdings.length });
        return {};
      }),
    ]);

    return Response.json(
      {
        holdings: holdings.map(serializeHolding),
        quotes,
        fx,
        trading212: {
          encryptionConfigured: isPortfolioEncryptionConfigured(),
          connected: !!t212,
          environment: t212?.environment ?? null,
          lastSyncAt: t212?.lastSyncAt?.toISOString() ?? null,
          lastError: normalizeTrading212ErrorMessage(t212?.lastError ?? null),
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          // Authed payload — keep browser HTTP cache from mixing users on the same URL.
          Vary: "Cookie",
        },
      },
    );
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
