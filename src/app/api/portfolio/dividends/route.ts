import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { buildPortfolioDividendsPayload } from "@/lib/portfolioDividends";
import { fetchPortfolioFxRates } from "@/lib/portfolioFxServer";
import { fetchPortfolioQuotesForHoldings } from "@/lib/portfolioMarketData";
import { isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { prisma } from "@/lib/prisma";
import { isPrismaInfrastructureError, prismaErrorToHttp } from "@/lib/prismaHttpError";
import { normalizeTicker } from "@/lib/watchlistStorage";
import { normalizePortfolioCurrency } from "@/lib/portfolioFx";
import { loadT212DividendsForUser } from "@/lib/t212DividendsCache";

export const maxDuration = 60;

function parsePositiveDecimal(raw: unknown, label: string): Prisma.Decimal {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return new Prisma.Decimal(n);
}

function parsePaidOn(raw: unknown): Date {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("paidOn is required (yyyy-mm-dd)");
  }
  const d = new Date(`${raw.trim()}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("paidOn must be a valid date");
  }
  return d;
}

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refresh =
    new URL(request.url).searchParams.get("refresh") === "1" ||
    new URL(request.url).searchParams.get("refresh") === "true";

  try {
    const [holdings, manualRows, t212Conn] = await Promise.all([
      prisma.portfolioHolding.findMany({
        where: { userId },
        orderBy: [{ source: "asc" }, { symbolYahoo: "asc" }],
      }),
      prisma.manualPortfolioDividend.findMany({
        where: { userId },
        orderBy: { paidOn: "desc" },
      }),
      prisma.trading212Connection.findUnique({ where: { userId } }),
    ]);

    const [quotes, fx] = await Promise.all([
      holdings.length > 0
        ? fetchPortfolioQuotesForHoldings(
            holdings.map((h) => ({
              symbolYahoo: h.symbolYahoo,
              symbolT212: h.symbolT212,
              currency: h.currency,
              brokerPrice: h.brokerPrice != null ? Number(h.brokerPrice) : null,
              source: h.source,
            })),
          )
        : Promise.resolve({} as Record<string, import("@/lib/portfolioMarketData").PortfolioQuoteRow | null>),
      fetchPortfolioFxRates(),
    ]);

    const symbols = [
      ...new Set(
        holdings.flatMap((h) => {
          const q = quotes[h.symbolYahoo];
          return [h.symbolYahoo, q?.resolvedYahooSymbol].filter(Boolean) as string[];
        }),
      ),
    ];

    const cacheRows =
      symbols.length > 0
        ? await prisma.stockAnalysisCache.findMany({
            where: { symbol: { in: symbols } },
            select: { symbol: true, payload: true },
          })
        : [];
    const cacheBySymbol: Record<string, unknown> = {};
    for (const row of cacheRows) cacheBySymbol[row.symbol] = row.payload;

    let t212Items: import("@/lib/trading212Client").T212HistoryDividendItem[] = [];
    let t212Meta: {
      connected: boolean;
      error?: string;
      cachedAt?: string | null;
      partial?: boolean;
    } = { connected: !!t212Conn };

    if (t212Conn && isPortfolioEncryptionConfigured()) {
      const loaded = await loadT212DividendsForUser(userId, t212Conn, { refresh });
      t212Items = loaded.items;
      t212Meta = {
        connected: true,
        cachedAt: loaded.cachedAt,
        partial: loaded.partial,
        error: loaded.fetchError ?? loaded.error ?? undefined,
      };
    }

    const payload = buildPortfolioDividendsPayload({
      holdings,
      quotes,
      fx,
      t212Items,
      manualRows,
      cacheBySymbol,
      trading212: t212Meta,
    });

    return Response.json(payload);
  } catch (e) {
    if (isPrismaInfrastructureError(e)) {
      const { status, error } = prismaErrorToHttp(e);
      return Response.json({ error }, { status });
    }
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
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
  const tickerRaw = typeof o.ticker === "string" ? o.ticker.trim() : "";
  const ticker = tickerRaw || (typeof o.symbolYahoo === "string" ? normalizeTicker(o.symbolYahoo) : "");
  if (!ticker) {
    return Response.json({ error: "ticker or symbolYahoo is required" }, { status: 400 });
  }

  const symbolYahoo =
    typeof o.symbolYahoo === "string" && o.symbolYahoo.trim()
      ? normalizeTicker(o.symbolYahoo)
      : null;

  let amount: Prisma.Decimal;
  let paidOn: Date;
  try {
    amount = parsePositiveDecimal(o.amount, "amount");
    paidOn = parsePaidOn(o.paidOn);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid input" }, { status: 400 });
  }

  const currency =
    typeof o.currency === "string" && o.currency.trim().length >= 3
      ? normalizePortfolioCurrency(o.currency)
      : "USD";
  const note = typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 500) : null;

  try {
    const row = await prisma.manualPortfolioDividend.create({
      data: {
        userId,
        ticker,
        symbolYahoo,
        amount,
        currency,
        paidOn,
        note,
      },
    });

    return Response.json({
      id: row.id,
      source: "manual",
      ticker: row.ticker,
      symbolYahoo: row.symbolYahoo,
      amount: row.amount.toString(),
      currency: row.currency,
      paidOn: row.paidOn.toISOString().slice(0, 10),
      note: row.note,
    });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
