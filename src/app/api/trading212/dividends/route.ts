import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { isPrismaInfrastructureError, prismaErrorToHttp } from "@/lib/prismaHttpError";
import { logApiException } from "@/lib/serverDebugLog";
import { recentT212DividendRows } from "@/lib/t212Dividends";
import { fetchT212HistoryDividends, type T212RequestError } from "@/lib/trading212Client";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPortfolioEncryptionConfigured()) {
    return Response.json({ connected: false, dividends: [] });
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
    return Response.json({ connected: false, dividends: [] });
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
    const items = await fetchT212HistoryDividends(conn.environment, apiKey, apiSecret);
    return Response.json({
      connected: true,
      dividends: recentT212DividendRows(items),
    });
  } catch (e) {
    const status = (e as T212RequestError).status;
    logApiException("GET /api/trading212/dividends", e, {
      userId,
      trading212HttpStatus: status ?? undefined,
    });
    const msg = e instanceof Error ? e.message : "Could not load dividends";
    return Response.json({
      connected: true,
      dividends: [],
      error: msg.slice(0, 500),
    });
  }
}
