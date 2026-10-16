import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyInvestorMetrics } from "@/lib/edgar/normalize";
import { prisma } from "@/lib/prisma";
import { loadStockAnalysis, persistStockCache } from "@/lib/stockAnalysisLoader";
import { buildCachePayload, type CachePayload } from "@/lib/stockCache";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { yahooFinance } from "@/lib/yahooFinanceClient";

describe("warm stock analysis load", () => {
  it("serves recently checked cached fundamentals and history while fetching live prices", async (t) => {
    const now = new Date().toISOString();
    const bundle: StockAnalysisBundle = {
      quote: { symbol: "TEST", currency: "USD", price: 40, name: "Test", change: 0, changesPercentage: 0 },
      investor: emptyInvestorMetrics("USD"),
      income: [], cashFlow: [], balanceSheet: [], incomeQuarterly: [], cashFlowQuarterly: [], balanceSheetQuarterly: [], dividendQuarterly: [],
      historical: [{ date: "2026-10-13", close: 40 }, { date: "2026-10-14", close: 41 }],
    };
    const payload = Object.assign(buildCachePayload(bundle, { lastFullFetchAt: now }) as CachePayload, {
      __yahooFundamentalsRefreshedAt: now,
      __dailyHistoryRefreshedAt: now,
      __gapFillAt: now,
    });
    const database = prisma as unknown as { stockAnalysisCache: {
      findUnique: (args: unknown) => Promise<unknown>;
      updateMany: (args: unknown) => Promise<{ count: number }>;
    } };
    const original = database.stockAnalysisCache;
    t.after(() => { database.stockAnalysisCache = original; });
    database.stockAnalysisCache = {
      findUnique: async () => ({ payload: structuredClone(payload), updatedAt: new Date() }),
      updateMany: async () => ({ count: 1 }),
    };
    const fundamentals = t.mock.method(yahooFinance, "fundamentalsTimeSeries", async () => { throw new Error("Unnecessary report request"); });
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.25 }
      : { symbol, currency: "USD", financialCurrency: "USD", regularMarketPrice: 42 });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    const chart = t.mock.method(yahooFinance, "chart", async (_symbol: string, options: { interval?: string }) => {
      assert.equal(options.interval, "5m", "cached full daily history should be reused");
      return { quotes: [{ date: new Date(), close: 42 }] };
    });

    const result = await loadStockAnalysis("TEST");

    assert.equal(result.error, null);
    assert.equal(result.bundle?.quote.price, 42);
    assert.equal(result.bundle?.historical[1].close, 41);
    assert.equal(fundamentals.mock.calls.length, 0);
    assert.equal(chart.mock.calls.length, 1);
  });

  it("does not let a slow cached load overwrite a newer forced-refresh/admin result", async (t) => {
    const now = new Date();
    const bundle: StockAnalysisBundle = {
      quote: { symbol: "TEST", currency: "USD", price: 40, name: "Test", change: 0, changesPercentage: 0 },
      investor: emptyInvestorMetrics("USD"),
      income: [{ date: "2025-12-31", symbol: "TEST", fiscalYear: "2025", revenue: 100, grossProfit: 50, operatingExpenses: 20, netIncome: 30 }],
      cashFlow: [], balanceSheet: [], incomeQuarterly: [], cashFlowQuarterly: [], balanceSheetQuarterly: [], dividendQuarterly: [],
      historical: [{ date: "2026-10-13", close: 40 }, { date: "2026-10-14", close: 41 }],
    };
    const payload = Object.assign(buildCachePayload(bundle, { lastFullFetchAt: now.toISOString() }) as CachePayload, {
      __yahooFundamentalsRefreshedAt: now.toISOString(), __dailyHistoryRefreshedAt: now.toISOString(), __gapFillAt: now.toISOString(),
    });
    let stored: { payload: CachePayload; updatedAt: Date } = { payload, updatedAt: now };
    const database = prisma as unknown as { stockAnalysisCache: {
      findUnique: (args: unknown) => Promise<unknown>;
      updateMany: (args: { where: { updatedAt: Date }; data: { payload: unknown } }) => Promise<{ count: number }>;
    } };
    const original = database.stockAnalysisCache;
    t.after(() => { database.stockAnalysisCache = original; });
    let skipped = false;
    database.stockAnalysisCache = {
      findUnique: async () => structuredClone(stored),
      updateMany: async (args) => {
        if (args.where.updatedAt.getTime() !== stored.updatedAt.getTime()) {
          skipped = true;
          return { count: 0 };
        }
        stored = { payload: args.data.payload as CachePayload, updatedAt: new Date() };
        return { count: 1 };
      },
    };
    let releaseQuote!: () => void;
    const quotePause = new Promise<void>((resolve) => { releaseQuote = resolve; });
    let quoteStarted!: () => void;
    const quoteEntered = new Promise<void>((resolve) => { quoteStarted = resolve; });
    t.mock.method(yahooFinance, "quote", async (symbol: string) => {
      if (symbol.endsWith("=X")) return { symbol, regularMarketPrice: 1.25 };
      quoteStarted();
      await quotePause;
      return { symbol, currency: "USD", financialCurrency: "USD", regularMarketPrice: 42 };
    });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    t.mock.method(yahooFinance, "chart", async () => ({ quotes: [] }));

    const oldLoad = loadStockAnalysis("TEST");
    await quoteEntered;
    const newer = structuredClone(payload);
    newer.income[0].revenue = 999;
    stored = { payload: newer, updatedAt: new Date(now.getTime() + 1000) };
    releaseQuote();
    const result = await oldLoad;

    assert.equal(result.error, null);
    assert.equal(result.bundle?.quote.price, 42);
    assert.equal(skipped, true);
    assert.equal(stored.payload.income[0].revenue, 999);
  });

  it("lets fresh reports replace a concurrent price-only write, while retaining newer report/admin changes", async (t) => {
    const initialAt = new Date("2026-10-15T12:00:00Z");
    const reportAt = "2026-10-01T00:00:00Z";
    const version = { updatedAt: initialAt, lastFullFetchAt: reportAt, adminEditedAt: null };
    const bundle: StockAnalysisBundle = {
      quote: { symbol: "TEST", currency: "USD", price: 42, name: "Test", change: 0, changesPercentage: 0 },
      investor: emptyInvestorMetrics("USD"),
      income: [{ date: "2025-12-31", symbol: "TEST", fiscalYear: "2025", revenue: 999, grossProfit: 50, operatingExpenses: 20, netIncome: 30 }],
      cashFlow: [], balanceSheet: [], incomeQuarterly: [], cashFlowQuarterly: [], balanceSheetQuarterly: [], dividendQuarterly: [], historical: [],
    };
    const database = prisma as unknown as { stockAnalysisCache: {
      findUnique: (args: unknown) => Promise<unknown>;
      updateMany: (args: { where: { updatedAt: Date }; data: { payload: unknown } }) => Promise<{ count: number }>;
    } };
    const original = database.stockAnalysisCache;
    t.after(() => { database.stockAnalysisCache = original; });
    for (const conflict of ["price", "reports", "admin"] as const) {
      const existing = buildCachePayload({ ...bundle, income: [{ ...bundle.income[0], revenue: 100 }] }, {
        lastFullFetchAt: conflict === "reports" ? "2026-10-15T12:00:01Z" : reportAt,
        adminEditedAt: conflict === "admin" ? "2026-10-15T12:00:01Z" : null,
      }) as CachePayload;
      let stored = { payload: existing, updatedAt: new Date(initialAt.getTime() + 1000) };
      database.stockAnalysisCache = {
        findUnique: async () => structuredClone(stored),
        updateMany: async (args) => {
          if (args.where.updatedAt.getTime() !== stored.updatedAt.getTime()) return { count: 0 };
          stored = { payload: args.data.payload as CachePayload, updatedAt: new Date() };
          return { count: 1 };
        },
      };
      await persistStockCache("TEST", bundle, { lastFullFetchAt: "2026-10-15T12:00:02Z" }, version, true);
      assert.equal(stored.payload.income[0].revenue, conflict === "price" ? 999 : 100, conflict);
    }
  });
});
