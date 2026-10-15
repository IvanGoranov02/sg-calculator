import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyInvestorMetrics } from "@/lib/edgar/normalize";
import { enrichBundleWithYahooPrices, reconcileFundamentalsCurrency } from "@/lib/yahooStockPriceHistory";
import { yahooFinance } from "@/lib/yahooFinanceClient";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

function bundle(): StockAnalysisBundle {
  return {
    quote: { symbol: "TEST.L", name: "Test", price: 1, change: 0, changesPercentage: 0 },
    investor: emptyInvestorMetrics("GBP"), historical: [], income: [], incomeQuarterly: [], cashFlow: [],
    cashFlowQuarterly: [], balanceSheet: [], balanceSheetQuarterly: [], dividendQuarterly: [],
  };
}

describe("stock price refresh currency consistency", () => {
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
});
