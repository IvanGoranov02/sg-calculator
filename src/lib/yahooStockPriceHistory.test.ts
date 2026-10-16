import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyInvestorMetrics } from "@/lib/edgar/normalize";
import { DAILY_HISTORY_REFRESH_MS, enrichBundleWithYahooPrices } from "@/lib/yahooStockPriceHistory";
import { yahooFinance } from "@/lib/yahooFinanceClient";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

function bundle(): StockAnalysisBundle {
  return {
    quote: { symbol: "TEST.L", name: "Test", price: 1, change: 0, changesPercentage: 0 },
    investor: emptyInvestorMetrics("GBP"), historical: [], income: [], incomeQuarterly: [], cashFlow: [],
    cashFlowQuarterly: [], balanceSheet: [], balanceSheetQuarterly: [], dividendQuarterly: [],
  };
}

describe("stock price refresh requests and history", () => {
  it("reuses the validated quote and daily-chart dividends without a duplicate request", async (t) => {
    let equityQuotes = 0;
    const quote = t.mock.method(yahooFinance, "quote", async (symbol: string) => {
      if (symbol.endsWith("=X")) return { symbol, regularMarketPrice: 1.25 };
      if (++equityQuotes > 1) throw new Error("Redundant quote failed");
      return { symbol, quoteType: "EQUITY", currency: "USD", financialCurrency: "USD", regularMarketPrice: 1000 };
    });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    const historical = t.mock.method(yahooFinance, "historical", async () => { throw new Error("Duplicate chart endpoint"); });
    const chart = t.mock.method(yahooFinance, "chart", async (_symbol: string, options: { interval?: string }) => options.interval === "1d"
      ? { quotes: [{ date: new Date("2025-03-31"), close: 1000 }], events: { dividends: [{ date: new Date("2025-03-15"), amount: 0.25 }] } }
      : { quotes: [] });
    const data = bundle();
    data.dividendQuarterly = [{ date: "2025-03-31", dividendPerShare: null }];
    await enrichBundleWithYahooPrices(data);
    assert.equal(equityQuotes, 1);
    assert.equal(quote.mock.calls.filter((call) => call.arguments[0] === "TEST.L").length, 1);
    assert.equal(chart.mock.calls.filter((call) => call.arguments[1]?.interval === "1d").length, 1);
    assert.equal(historical.mock.calls.length, 0);
    assert.equal(data.quote.price, 1000);
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

  it("reuses recent complete daily history while refreshing the quote and intraday", async (t) => {
    t.mock.method(yahooFinance, "quote", async (symbol: string) => symbol.endsWith("=X")
      ? { symbol, regularMarketPrice: 1.25 }
      : { symbol, currency: "USD", financialCurrency: "USD", regularMarketPrice: 43 });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    const chart = t.mock.method(yahooFinance, "chart", async (_symbol: string, options: { interval?: string }) => {
      assert.equal(options.interval, "5m", "warm daily history should not be downloaded again");
      return { quotes: [{ date: new Date(), close: 43 }] };
    });
    const data = Object.assign(bundle(), { __dailyHistoryRefreshedAt: new Date().toISOString() });
    data.historical = [{ date: "2026-10-13", close: 40 }, { date: "2026-10-14", close: 41 }];
    await enrichBundleWithYahooPrices(data);
    assert.equal(data.quote.price, 43);
    assert.deepEqual(data.historical, [{ date: "2026-10-13", close: 40 }, { date: "2026-10-14", close: 41 }]);
    assert.equal(data.intraday?.[0]?.close, 43);
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
});
