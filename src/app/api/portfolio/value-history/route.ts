import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { withTimeoutFallback } from "@/lib/asyncTimeout";
import { prisma } from "@/lib/prisma";
import { fetchPortfolioFxRates } from "@/lib/portfolioFxServer";
import { fetchPortfolioQuoteHistory } from "@/lib/portfolioQuoteHistoryServer";
import { fetchPortfolioQuotesForHoldings } from "@/lib/portfolioMarketData";
import { isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { normalizePortfolioCurrency } from "@/lib/portfolioFx";
import {
  buildPortfolioValueChartSeries,
  calendarMonthsForEvents,
  computeLiveHoldingsValue,
  currentMonthKey,
  isValidMonthKey,
  listingPriceCurrency,
  parseChartBaseCurrency,
  pickBaseCurrencyFromHoldings,
  prepareHistoryBarsForValue,
  quantitiesByMonthFromEvents,
  quantityTimelineMatchesHoldings,
} from "@/lib/portfolioValueHistory";
import {
  isT212OrdersCacheStale,
  mapT212OrderItemsToQtyEvents,
  readT212OrdersCache,
  refreshT212OrdersCache,
} from "@/lib/t212OrderHistory";
import { isPrismaInfrastructureError, prismaErrorToHttp } from "@/lib/prismaHttpError";

export const maxDuration = 60;

function parsePositiveDecimal(raw: unknown, label: string): Prisma.Decimal {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return new Prisma.Decimal(n);
}

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedBase = url.searchParams.get("base");

  try {
    const [holdings, snapshots, manualRows, fx, t212] = await Promise.all([
      prisma.portfolioHolding.findMany({
        where: { userId },
        select: { symbolYahoo: true, symbolT212: true, quantity: true, currency: true, brokerPrice: true, source: true },
      }),
      prisma.portfolioAccountSnapshot.findMany({
        where: { userId },
        orderBy: { capturedAt: "asc" },
      }),
      prisma.manualPortfolioMonthlyValue.findMany({
        where: { userId },
        orderBy: { month: "asc" },
      }),
      fetchPortfolioFxRates(),
      prisma.trading212Connection.findUnique({ where: { userId } }),
    ]);

    const fallbackBase =
      snapshots[snapshots.length - 1]?.currency ??
      (holdings.length > 0 ? pickBaseCurrencyFromHoldings(holdings) : "USD");
    const baseCurrency = parseChartBaseCurrency(requestedBase, fallbackBase);

    let orderItems = t212 ? readT212OrdersCache(t212).items : [];
    if (
      t212 &&
      isPortfolioEncryptionConfigured() &&
      isT212OrdersCacheStale(t212.ordersCachedAt)
    ) {
      const refreshed = await withTimeoutFallback(
        refreshT212OrdersCache({
          userId,
          environment: t212.environment,
          apiKeyEnc: t212.apiKeyEnc,
          apiSecretEnc: t212.apiSecretEnc,
          maxPages: 5,
        }),
        35_000,
        "t212-orders-cache",
        null,
      );
      if (refreshed) orderItems = refreshed.items;
      else orderItems = readT212OrdersCache(t212).items;
    }

    const qtyEvents = mapT212OrderItemsToQtyEvents(orderItems);
    const eventMonths = calendarMonthsForEvents(qtyEvents);
    const thisMonth = currentMonthKey();
    let qtyByMonth = eventMonths.length > 0 ? quantitiesByMonthFromEvents(qtyEvents, eventMonths) : undefined;
    if (qtyByMonth && !quantityTimelineMatchesHoldings(qtyByMonth, thisMonth, holdings)) {
      qtyByMonth = undefined;
    }

    const quotes =
      holdings.length > 0
        ? await fetchPortfolioQuotesForHoldings(
            holdings.map((h) => ({
              symbolYahoo: h.symbolYahoo,
              symbolT212: h.symbolT212,
              currency: h.currency,
              brokerPrice: h.brokerPrice != null ? Number(h.brokerPrice) : null,
              source: h.source,
            })),
          )
        : {};

    const liveValue = computeLiveHoldingsValue(holdings, quotes, fx, baseCurrency);

    const historySymbols = new Set<string>(holdings.map((h) => h.symbolYahoo));
    if (qtyByMonth) {
      for (const bySym of qtyByMonth.values()) {
        for (const sym of bySym.keys()) historySymbols.add(sym);
      }
    }

    let historyBySymbol: Record<string, import("@/lib/dipFinder").QuoteHistoryBar[]> = {};
    if (qtyByMonth && historySymbols.size > 0) {
      const firstEvent = qtyEvents
        .map((e) => e.date)
        .filter(Boolean)
        .sort()[0];
      const period1 = firstEvent ? new Date(`${firstEvent}T00:00:00Z`) : undefined;
      const raw = await fetchPortfolioQuoteHistory([...historySymbols], period1);
      historyBySymbol = {};
      for (const sym of historySymbols) {
        const h = holdings.find((x) => x.symbolYahoo.trim().toUpperCase() === sym.trim().toUpperCase());
        const liveQuote = quotes[sym] ?? quotes[h?.symbolYahoo ?? ""];
        const livePx = liveQuote?.price ?? null;
        const listingCcy = listingPriceCurrency(h?.symbolYahoo ?? sym, h?.symbolT212);
        const liveCcy = liveQuote?.currency ? normalizePortfolioCurrency(liveQuote.currency) : null;
        historyBySymbol[sym] = prepareHistoryBarsForValue(
          raw[sym] ?? raw[h?.symbolYahoo ?? ""] ?? [],
          h?.symbolYahoo ?? sym,
          h?.symbolT212,
          liveCcy === listingCcy ? livePx : null,
        );
      }
    }

    const chartSeries = buildPortfolioValueChartSeries({
      snapshots: snapshots.map((s) => ({
        capturedAt: s.capturedAt,
        totalValue: Number(s.totalValue),
        currency: s.currency,
      })),
      manualRows: manualRows.map((r) => ({
        month: r.month,
        amount: Number(r.amount),
        currency: r.currency,
      })),
      holdings,
      historyBySymbol,
      fx,
      baseCurrency,
      qtyByMonth,
      liveValue,
    });

    return Response.json({
      chartSeries,
      baseCurrency,
      manualEntries: manualRows.map((r) => ({
        month: r.month,
        amount: r.amount.toString(),
        currency: r.currency,
      })),
      computedHint: holdings.length > 0 || snapshots.length > 0,
    });
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
  const month = typeof o.month === "string" ? o.month.trim() : "";
  if (!isValidMonthKey(month)) {
    return Response.json({ error: "month must be yyyy-mm" }, { status: 400 });
  }

  let amount: Prisma.Decimal;
  try {
    amount = parsePositiveDecimal(o.amount, "amount");
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid input" }, { status: 400 });
  }

  const currency =
    typeof o.currency === "string" && o.currency.trim().length >= 3
      ? normalizePortfolioCurrency(o.currency)
      : "USD";

  try {
    const row = await prisma.manualPortfolioMonthlyValue.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, amount, currency },
      update: { amount, currency },
    });

    return Response.json({
      month: row.month,
      amount: row.amount.toString(),
      currency: row.currency,
    });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
