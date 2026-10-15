import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStockQuoteUnits, stockDisplayMoney } from "@/lib/stockMoney";
import { computeValuationByPeriodEnd } from "@/lib/valuationFromHistory";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

describe("listing quote units", () => {
  it("normalizes UK quote, daily/intraday prices and price metrics together without scaling EPS", () => {
    const bundle = {
      quote: { symbol: "TEST.L", name: "Test", price: 126.7, change: 1.2, changesPercentage: 1, postMarketPrice: 130 },
      investor: { currency: "GBp", trailingEps: 0.1, fiftyDayAverage: 120 },
      historical: [{ date: "2025-12-31", close: 126.7, high: 130, low: 120, volume: 1000 }],
      intraday: [{ date: "2025-12-31T12:00:00Z", close: 126.7 }],
      income: [{ date: "2025-12-31", fiscalYear: "2025", dilutedEps: 0.1, revenue: 1000, dilutedAverageShares: 100 }],
      incomeQuarterly: [], cashFlow: [], cashFlowQuarterly: [], balanceSheet: [], balanceSheetQuarterly: [], dividendQuarterly: [],
    } as unknown as StockAnalysisBundle;
    normalizeStockQuoteUnits(bundle, "GBp");
    assert.equal(bundle.quote.currency, "GBP");
    assert.ok(Math.abs(bundle.quote.price - 1.267) < 1e-9);
    assert.ok(Math.abs(bundle.historical[0].close - 1.267) < 1e-9);
    assert.equal(bundle.historical[0].volume, 1000);
    assert.ok(bundle.intraday);
    assert.ok(Math.abs(bundle.intraday[0].close - 1.267) < 1e-9);
    assert.equal(bundle.investor.trailingEps, 0.1);
    assert.ok(Math.abs(computeValuationByPeriodEnd(bundle, "annual").get("2025-12-31")!.peTtm! - 12.67) < 1e-9);
  });
  it("converts EUR and GBP prices to the requested currency only with real FX", () => {
    assert.deepEqual(stockDisplayMoney({ amount: 85, sourceCurrency: "EUR", targetCurrency: "USD", eurPerUsd: 0.85 }), { amount: 100, currency: "USD" });
    assert.deepEqual(stockDisplayMoney({ amount: 100, sourceCurrency: "GBp", targetCurrency: "EUR", usdPerUnit: 1.25, eurPerUsd: 0.8 }), { amount: 1, currency: "EUR" });
    assert.deepEqual(stockDisplayMoney({ amount: 2, sourceCurrency: "GBP", targetCurrency: "USD" }), { amount: 2, currency: "GBP" });
  });
  it("does not calculate price multiples when report FX is unavailable", () => {
    const bundle = { quote: { currency: "USD" }, investor: { currency: "USD" }, __displayFundamentalsCurrency: "EUR" } as unknown as StockAnalysisBundle;
    assert.equal(computeValuationByPeriodEnd(bundle, "annual").size, 0);
  });
  it("preserves already-normalized cached daily prices when history refresh fails", () => {
    const bundle = { quote: { price: 130, change: 2 }, investor: { currency: "GBp" }, historical: [{ date: "2025-12-31", close: 1.267 }] } as unknown as StockAnalysisBundle;
    normalizeStockQuoteUnits(bundle, "GBp", { historyIsRaw: false });
    assert.equal(bundle.quote.price, 1.3);
    assert.ok(Math.abs(bundle.historical[0].close - 1.267) < 1e-9);
  });
});
