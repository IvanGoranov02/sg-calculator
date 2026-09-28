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
  pickPortfolioHistorySymbols,
  prepareHistoryBarsForValue,
  classifyPortfolioHistory,
  quantitiesByMonthFromEvents,
  quantityTimelineMatchesHoldings,
} from "@/lib/portfolioValueHistory";
import {
  clearedT212OrdersCacheData,
  isT212OrdersCacheStale,
  isT212OrdersScopeDenied,
  mapT212OrderItemsToQtyEvents,
  ordersCacheGenerationWhere,
  readT212OrdersCache,
  refreshT212OrdersCache,
  shouldRebuildOrdersCacheOnRefresh,
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
    const [holdings, snapshots, manualRows, fx, t212Row] = await Promise.all([
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

    let t212 = t212Row;
    let ordersRead = t212 ? readT212OrdersCache(t212) : null;
    let orderItems = ordersRead?.items ?? [];
    let ordersPartial = ordersRead?.partial ?? false;
    let ordersError = ordersRead?.error ?? null;
    let ordersNextPath = ordersRead?.nextPagePath ?? null;
    const thisMonth = currentMonthKey();
    const userRefresh = url.searchParams.get("refresh") === "1";

    if (t212 && isPortfolioEncryptionConfigured() && userRefresh) {
      const scopeDeniedNow = isT212OrdersScopeDenied(ordersError);
      const previewEvents = mapT212OrderItemsToQtyEvents(orderItems);
      const previewMonths = calendarMonthsForEvents(previewEvents);
      let previewTimeline =
        !ordersPartial && !scopeDeniedNow && previewMonths.length > 0
          ? quantitiesByMonthFromEvents(previewEvents, previewMonths)
          : undefined;
      if (previewTimeline && !quantityTimelineMatchesHoldings(previewTimeline, thisMonth, holdings)) {
        previewTimeline = undefined;
      }
      // Same cache clear as a credential reconnect, only when this walk cannot draw the chart.
      if (
        shouldRebuildOrdersCacheOnRefresh({
          userRefresh: true,
          scopeDenied: scopeDeniedNow,
          ordersPartial,
          nextPagePath: ordersNextPath,
          usedQuantityTimeline: previewTimeline != null,
        })
      ) {
        await prisma.trading212Connection.updateMany({
          where: ordersCacheGenerationWhere(userId, {
            apiKeyEnc: t212.apiKeyEnc,
            environment: t212.environment,
            ordersCachedAt: t212.ordersCachedAt,
            ordersCacheNextPath: t212.ordersCacheNextPath ?? null,
            ordersCachePartial: t212.ordersCachePartial,
            ordersCacheError: t212.ordersCacheError,
          }),
          data: clearedT212OrdersCacheData(),
        });
        t212 = await prisma.trading212Connection.findUnique({ where: { userId } });
        ordersRead = t212 ? readT212OrdersCache(t212) : null;
        orderItems = ordersRead?.items ?? [];
        ordersPartial = ordersRead?.partial ?? false;
        ordersError = ordersRead?.error ?? null;
        ordersNextPath = ordersRead?.nextPagePath ?? null;
      }
    }

    if (
      t212 &&
      isPortfolioEncryptionConfigured() &&
      (isT212OrdersCacheStale(t212.ordersCachedAt, t212.ordersCachePartial) ||
        isT212OrdersScopeDenied(ordersError))
    ) {
      const refreshed = await withTimeoutFallback(
        refreshT212OrdersCache({
          userId,
          environment: t212.environment,
          apiKeyEnc: t212.apiKeyEnc,
          apiSecretEnc: t212.apiSecretEnc,
          // Two pages per request stays inside 6/min when the client polls on the rate-limit window.
          maxPages: 2,
        }),
        50_000,
        "t212-orders-cache",
        null,
      );
      if (refreshed) {
        orderItems = refreshed.items;
        ordersPartial = refreshed.partial;
        ordersError = refreshed.error ?? null;
        ordersNextPath = refreshed.nextPagePath ?? null;
      } else {
        const fresh = await prisma.trading212Connection.findUnique({ where: { userId } });
        ordersRead = fresh ? readT212OrdersCache(fresh) : ordersRead;
        orderItems = ordersRead?.items ?? [];
        ordersPartial = ordersRead?.partial ?? false;
        ordersError = ordersRead?.error ?? null;
        ordersNextPath = ordersRead?.nextPagePath ?? null;
      }
    }

    const scopeDenied = isT212OrdersScopeDenied(ordersError);
    const qtyEvents = mapT212OrderItemsToQtyEvents(orderItems);
    const eventMonths = calendarMonthsForEvents(qtyEvents);
    let qtyByMonth =
      !ordersPartial && !scopeDenied && eventMonths.length > 0
        ? quantitiesByMonthFromEvents(qtyEvents, eventMonths)
        : undefined;
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

    const { symbols: historySymbols, complete: historyComplete } = pickPortfolioHistorySymbols(
      holdings,
      qtyByMonth,
    );
    if (qtyByMonth && !historyComplete) {
      qtyByMonth = undefined;
    }

    let historyBySymbol: Record<string, import("@/lib/dipFinder").QuoteHistoryBar[]> = {};
    if (qtyByMonth && historySymbols.length > 0) {
      const firstEvent = qtyEvents
        .map((e) => e.date)
        .filter(Boolean)
        .sort()[0];
      const period1 = firstEvent ? new Date(`${firstEvent}T00:00:00Z`) : undefined;
      const raw = await fetchPortfolioQuoteHistory(historySymbols, period1);
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

    const history = classifyPortfolioHistory({
      connected: Boolean(t212),
      scopeDenied,
      ordersPartial,
      usedQuantityTimeline: qtyByMonth != null,
      hasHoldings: holdings.length > 0,
    });

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
      historyStatus: history.status,
      historyReason: history.reason,
      historyHasMore: Boolean(t212) && ordersPartial && !scopeDenied && Boolean(ordersNextPath?.trim()),
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
