import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyInvestorMetrics } from "@/lib/edgar/normalize";
import { DAILY_HISTORY_REFRESH_MS, enrichBundleWithYahooPrices, reconcileFundamentalsCurrency } from "@/lib/yahooStockPriceHistory";
import { yahooFinance } from "@/lib/yahooFinanceClient";
import { applyYahooFundamentalsToBundle } from "@/lib/yahooFundamentalsMerge";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

function bundle(): StockAnalysisBundle {
  return {
    quote: { symbol: "TEST.L", name: "Test", price: 1, change: 0, changesPercentage: 0 },
    investor: emptyInvestorMetrics("GBP"), historical: [], income: [], incomeQuarterly: [], cashFlow: [],
    cashFlowQuarterly: [], balanceSheet: [], balanceSheetQuarterly: [], dividendQuarterly: [],
  };
}

describe("stock price refresh currency consistency", () => {
  it("reuses the validated quote and daily-chart dividends without a duplicate request or raw-pence mutation", async (t) => {
    let equityQuotes = 0;
    const quote = t.mock.method(yahooFinance, "quote", async (symbol: string) => {
      if (symbol.endsWith("=X")) return { symbol, regularMarketPrice: 1.25 };
      if (++equityQuotes > 1) throw new Error("Redundant quote failed");
      return { symbol, quoteType: "EQUITY", currency: "GBp", financialCurrency: "EUR", regularMarketPrice: 1000 };
    });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    const historical = t.mock.method(yahooFinance, "historical", async () => { throw new Error("Duplicate chart endpoint"); });
    const chart = t.mock.method(yahooFinance, "chart", async (_symbol: string, options: { interval?: string }) => options.interval === "1d"
      ? { quotes: [{ date: new Date("2025-03-31"), close: 1000 }], events: { dividends: [{ date: new Date("2025-03-15"), amount: 25 }] } }
      : { quotes: [] });
    const data = bundle();
    data.dividendQuarterly = [{ date: "2025-03-31", dividendPerShare: null }];
    await enrichBundleWithYahooPrices(data);
    assert.equal(equityQuotes, 1);
    assert.equal(quote.mock.calls.filter((call) => call.arguments[0] === "TEST.L").length, 1);
    assert.equal(chart.mock.calls.filter((call) => call.arguments[1]?.interval === "1d").length, 1);
    assert.equal(historical.mock.calls.length, 0);
    assert.equal(data.quote.price, 10);
    assert.equal(data.dividendQuarterly[0].dividendPerShare, 0.25);
  });

  it("includes today's ex-dividends in the combined daily query before marking history fresh", async (t) => {
    const startedAt = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.25 }
      : { symbol, currency: "USD", financialCurrency: "USD", regularMarketPrice: 42 });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    const chart = t.mock.method(yahooFinance, "chart", async (_symbol: string, options: { interval?: string; period2?: unknown }) => options.interval === "1d"
      ? { quotes: [{ date: new Date(today), close: 42 }], events: { dividends: [{ date: new Date(today), amount: 0.25 }] } }
      : { quotes: [] });
    const data = bundle();
    data.dividendQuarterly = [{ date: today, dividendPerShare: null }];
    await enrichBundleWithYahooPrices(data);
    const dailyCalls = chart.mock.calls.filter((call) => call.arguments[1]?.interval === "1d");
    assert.equal(dailyCalls.length, 1);
    const end = dailyCalls[0].arguments[1]?.period2;
    assert.ok(end instanceof Date);
    assert.ok(end.getTime() >= startedAt);
    assert.equal(data.dividendQuarterly[0].dividendPerShare, 0.25);
  });

  it("reuses recent complete history while refreshing live quotes and intraday in major units", async (t) => {
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.25 }
      : { symbol, currency: "GBp", financialCurrency: "GBP", regularMarketPrice: 130 });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    const chart = t.mock.method(yahooFinance, "chart", async (_symbol: string, options: { interval?: string }) => {
      assert.equal(options.interval, "5m", "a warm history cache needs no full-history chart request");
      return { quotes: [{ date: new Date("2026-10-15T12:00:00Z"), close: 130 }] };
    });
    const data = Object.assign(bundle(), { __dailyHistoryRefreshedAt: new Date().toISOString() });
    data.quote.currency = "GBP";
    data.historical = [{ date: "2026-10-13", close: 1.25 }, { date: "2026-10-14", close: 1.27 }];
    await enrichBundleWithYahooPrices(data);
    assert.equal(data.quote.price, 1.3);
    assert.equal(data.historical[0].close, 1.25);
    assert.equal(data.historical[1].close, 1.27);
    assert.equal(data.intraday?.[0]?.close, 1.3);
    assert.equal(chart.mock.calls.length, 1);
  });

  it("retries failed daily history without marking it fresh or discarding a good quote", async (t) => {
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.25 }
      : { symbol, currency: "USD", financialCurrency: "USD", regularMarketPrice: 42 });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    const chart = t.mock.method(yahooFinance, "chart", async (_symbol: string, options: { interval?: string }) => {
      if (options.interval === "1d") throw new Error("History unavailable");
      return { quotes: [] };
    });
    const expired = new Date(Date.now() - DAILY_HISTORY_REFRESH_MS - 1000).toISOString();
    const data = Object.assign(bundle(), { __dailyHistoryRefreshedAt: expired });
    data.quote.currency = "USD";
    data.historical = [{ date: "2026-10-13", close: 40 }, { date: "2026-10-14", close: 41 }];
    await enrichBundleWithYahooPrices(data);
    await enrichBundleWithYahooPrices(data);
    assert.equal(data.quote.price, 42);
    assert.equal(data.historical[1].close, 41);
    assert.equal(data.__dailyHistoryRefreshedAt, expired);
    assert.equal(chart.mock.calls.filter((call) => call.arguments[1]?.interval === "1d").length, 2);
  });

  it("aborts a stalled optional daily request and retains the successful live quote", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.25 }
      : { symbol, currency: "USD", financialCurrency: "USD", regularMarketPrice: 42 });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    let dailySignal: AbortSignal | undefined;
    t.mock.method(yahooFinance, "chart", async (_symbol: string, options: { interval?: string }, moduleOptions: { fetchOptions?: { signal?: AbortSignal } }) => {
      if (options.interval !== "1d") return { quotes: [] };
      dailySignal = moduleOptions.fetchOptions?.signal;
      return await new Promise<never>((_, reject) => dailySignal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }));
    });
    const data = bundle();
    const pending = enrichBundleWithYahooPrices(data);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.ok(dailySignal);
    t.mock.timers.tick(6_001);
    await pending;
    assert.equal(dailySignal.aborted, true);
    assert.equal(data.quote.price, 42);
    assert.equal((data as typeof data & { __dailyHistoryRefreshedAt?: string }).__dailyHistoryRefreshedAt, undefined);
  });

  it("cancels the current Yahoo request and avoids starting fallback work after the overall load aborts", async (t) => {
    let quoteSignal: AbortSignal | undefined;
    t.mock.method(yahooFinance, "quote", async (_symbol: string, _options: unknown, moduleOptions: { fetchOptions?: { signal?: AbortSignal } }) => {
      quoteSignal = moduleOptions.fetchOptions?.signal;
      return await new Promise<never>((_, reject) => quoteSignal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }));
    });
    const search = t.mock.method(yahooFinance, "search", async () => { throw new Error("No fallback after abort"); });
    const chart = t.mock.method(yahooFinance, "chart", async () => { throw new Error("No history after abort"); });
    const controller = new AbortController();
    const data = bundle();
    const pending = enrichBundleWithYahooPrices(data, controller.signal);
    assert.ok(quoteSignal);
    controller.abort();
    await pending;
    assert.equal(quoteSignal.aborted, true);
    assert.equal(search.mock.calls.length, 0);
    assert.equal(chart.mock.calls.length, 0);
    assert.equal(data.quote.price, 1);
  });
  it("normalizes London prices and history but retains pound EPS and dividends", async (t) => {
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.25 }
      : { symbol, quoteType: "EQUITY", currency: "GBp", financialCurrency: "GBP", regularMarketPrice: 126.7, regularMarketChange: 1.2,
        epsTrailingTwelveMonths: 0.1, dividendRate: 0.04, fiftyDayAverage: 120 });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    t.mock.method(yahooFinance, "historical", async () => [{ date: new Date("2025-12-31"), close: 126.7, high: 130 }]);
    t.mock.method(yahooFinance, "chart", async () => ({ quotes: [{ date: new Date("2025-12-31T12:00:00Z"), close: 126.7 }] }));
    const data = bundle();
    await enrichBundleWithYahooPrices(data);
    assert.equal(data.quote.currency, "GBP");
    assert.ok(Math.abs(data.quote.price - 1.267) < 1e-9);
    assert.ok(Math.abs(data.historical[0].close - 1.267) < 1e-9);
    assert.ok(data.intraday);
    assert.ok(Math.abs(data.intraday[0].close - 1.267) < 1e-9);
    assert.equal(data.investor.trailingEps, 0.1);
    assert.equal(data.investor.dividendRate, 0.04);
    assert.equal(data.quote.usdPerUnit, 1.25);
  });
  it("does not divide cached pound history a second time when Yahoo history fails", async (t) => {
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.25 }
      : { symbol, quoteType: "EQUITY", currency: "GBp", financialCurrency: "GBP", regularMarketPrice: 130 });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    t.mock.method(yahooFinance, "historical", async () => []);
    t.mock.method(yahooFinance, "chart", async () => null);
    const data = bundle();
    data.quote.currency = "GBP";
    data.historical = [{ date: "2025-12-30", close: 1.25 }, { date: "2025-12-31", close: 1.267 }];
    await enrichBundleWithYahooPrices(data);
    assert.equal(data.quote.price, 1.3);
    assert.ok(Math.abs(data.historical[1].close - 1.267) < 1e-9);
  });
  it("retains the reporting currency from financialData when the quote omits it", async (t) => {
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.2 }
      : { symbol, quoteType: "EQUITY", currency: "USD", regularMarketPrice: 130 });
    t.mock.method(yahooFinance, "quoteSummary", async () => ({ financialData: { financialCurrency: "EUR" } }));
    t.mock.method(yahooFinance, "historical", async () => []);
    t.mock.method(yahooFinance, "chart", async () => null);
    const data = bundle();
    await enrichBundleWithYahooPrices(data);
    assert.equal(data.quote.currency, "USD");
    assert.equal(data.investor.financialCurrency, "EUR");
  });
  it("reconciles reporting currency for statements and EPS without converting listing dividends twice", async (t) => {
    t.mock.method(yahooFinance, "quote", async () => ({ regularMarketPrice: 1.2 }));
    const data = Object.assign(bundle(), { __financialCurrency: "EUR" });
    data.quote.currency = "USD";
    data.investor.trailingEps = 2;
    data.investor.dividendRate = 1;
    data.investor.enterpriseValue = 500;
    data.investor.totalCash = 100;
    data.income = [{ date: "2025-12-31", fiscalYear: "2025", symbol: "TEST", revenue: 100, grossProfit: 50, operatingExpenses: 20, netIncome: 30, dilutedEps: 2 }];
    await reconcileFundamentalsCurrency(data);
    assert.equal(data.income[0].revenue, 120);
    assert.equal(data.income[0].dilutedEps, 2.4);
    assert.equal(data.investor.trailingEps, 2.4);
    assert.equal(data.investor.dividendRate, 1);
    assert.equal(data.investor.enterpriseValue, 500);
    assert.equal(data.investor.totalCash, 120);
    assert.equal(data.investor.currency, "USD");
  });

  it("reuses known EUR/USD FX and does not convert the same display bundle twice", async (t) => {
    const quote = t.mock.method(yahooFinance, "quote", async () => { throw new Error("FX already available"); });
    const data = Object.assign(bundle(), { __financialCurrency: "EUR" });
    data.eurPerUsd = 0.8;
    data.quote.currency = "USD";
    data.income = [{ date: "2025-12-31", fiscalYear: "2025", symbol: "TEST", revenue: 100, grossProfit: 50, operatingExpenses: 20, netIncome: 30, dilutedEps: 2 }];
    await reconcileFundamentalsCurrency(data);
    await reconcileFundamentalsCurrency(data);
    assert.equal(quote.mock.calls.length, 0);
    assert.equal(data.income[0].revenue, 125);
    assert.equal(data.income[0].dilutedEps, 2.5);
  });

  it("clears stale listing-currency stamps when refreshed fundamentals replace a DPS row", async () => {
    const data = Object.assign(bundle(), {
      __financialCurrency: "USD", __dividendQuarterlyCurrency: "EUR",
      __dividendListingDates: ["2025-03-31", "2025-06-30"], __dividendHistoryRefreshedAt: new Date().toISOString(),
    });
    data.quote.currency = "EUR";
    data.eurPerUsd = 0.8;
    data.dividendQuarterly = [
      { date: "2025-03-31", dividendPerShare: 0.4 },
      { date: "2025-06-30", dividendPerShare: 0.8 },
    ];
    applyYahooFundamentalsToBundle(data, {
      finA: [], finQ: [{ date: new Date("2025-03-31"), dividendPerShare: 0.5 }],
      cfA: [], cfQ: [], bsA: [], bsQ: [],
    });
    assert.deepEqual(data.__dividendListingDates, ["2025-06-30"]);
    assert.equal(data.__dividendQuarterlyCurrency, undefined);
    assert.equal(data.__dividendHistoryRefreshedAt, undefined);
    await reconcileFundamentalsCurrency(data);
    assert.equal(data.dividendQuarterly[0].dividendPerShare, 0.4);
    assert.equal(data.dividendQuarterly[1].dividendPerShare, 0.8);
  });
});
