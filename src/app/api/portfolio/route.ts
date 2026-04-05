import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchPortfolioQuotesForSymbols } from "@/lib/portfolioMarketData";
import { isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";

function serializeHolding(h: {
  id: string;
  symbolYahoo: string;
  symbolT212: string | null;
  quantity: { toString(): string };
  avgPrice: { toString(): string };
  currency: string;
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

  const [holdings, t212] = await Promise.all([
    prisma.portfolioHolding.findMany({
      where: { userId },
      orderBy: [{ source: "asc" }, { symbolYahoo: "asc" }],
    }),
    prisma.trading212Connection.findUnique({ where: { userId } }),
  ]);

  const symbols = [...new Set(holdings.map((h) => h.symbolYahoo))];
  const quotes = symbols.length > 0 ? await fetchPortfolioQuotesForSymbols(symbols) : {};

  return Response.json({
    holdings: holdings.map(serializeHolding),
    quotes,
    trading212: {
      encryptionConfigured: isPortfolioEncryptionConfigured(),
      connected: !!t212,
      environment: t212?.environment ?? null,
      lastSyncAt: t212?.lastSyncAt?.toISOString() ?? null,
      lastError: t212?.lastError ?? null,
    },
  });
}
