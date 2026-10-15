import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { isPrismaInfrastructureError, prismaErrorToHttp } from "@/lib/prismaHttpError";
import { logApiException } from "@/lib/serverDebugLog";
import { commitTrading212Sync, recordTrading212SyncError, Trading212StateError } from "@/lib/trading212ConnectionState";
import {
  fetchT212AccountSummary,
  fetchT212Positions,
  t212HoldingsMarketValue,
  type T212RequestError,
} from "@/lib/trading212Client";
import { refreshT212DividendsCache } from "@/lib/t212DividendsCache";
import { normalizeTrading212ErrorMessage } from "@/lib/trading212Errors";

export const maxDuration = 60;

export async function POST() {
  const startedAt = Date.now();
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

    const synced = await commitTrading212Sync({ userId, connection: conn, positions, summary });

    try {
      await refreshT212DividendsCache({
        userId,
        connectionId: conn.id,
        environment: conn.environment,
        apiKeyEnc: conn.apiKeyEnc,
        apiSecretEnc: conn.apiSecretEnc,
        // Holdings are already committed. Leave enough time to persist the partial
        // dividend cache and return success within the route's 60-second limit.
        maxPages: 2,
        timeBudgetMs: Math.min(15_000, Math.max(0, 45_000 - (Date.now() - startedAt))),
      });
    } catch (e) {
      logApiException("POST /api/trading212/sync dividends cache", e, { userId });
    }

    return Response.json({
      ok: true,
      ...synced,
      accountCurrency: summary?.currency ?? null,
      totalValue: summary ? t212HoldingsMarketValue(summary) : null,
    });
  } catch (e) {
    if (isPrismaInfrastructureError(e)) {
      const { status, error } = prismaErrorToHttp(e);
      return Response.json({ error }, { status });
    }
    const rawMsg = e instanceof Error ? e.message : "Sync failed";
    const msg = normalizeTrading212ErrorMessage(rawMsg) ?? rawMsg;
    const status = (e as T212RequestError).status;
    logApiException("POST /api/trading212/sync (broker API or other)", e, {
      userId,
      trading212HttpStatus: status ?? undefined,
    });
    try {
      await recordTrading212SyncError(userId, conn, msg);
    } catch {
      /* ignore if row missing */
    }
    return Response.json(
      { error: msg, trading212Status: status ?? null },
      { status: e instanceof Trading212StateError ? e.status : status && status >= 400 && status < 500 ? status : 502 },
    );
  }
}
