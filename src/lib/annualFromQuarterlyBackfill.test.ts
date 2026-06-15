import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appendCalendarAnnualFromQuarterly } from "@/lib/annualFromQuarterlyBackfill";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

function q(date: string, revenue: number, netIncome: number, eps: number, shares: number) {
  return {
    date,
    symbol: "TEST",
    revenue,
    grossProfit: revenue / 2,
    operatingExpenses: revenue / 4,
    netIncome,
    operatingIncome: netIncome,
    ebitda: netIncome + 5,
    dilutedEps: eps,
    dilutedAverageShares: shares,
  };
}

function makeBundle(): StockAnalysisBundle {
  return {
    quote: { symbol: "TEST", name: "Test Co", price: 10, change: 0, changesPercentage: 0 },
    income: [], // no annual rows → must be synthesized from quarters
    cashFlow: [],
    balanceSheet: [],
    historical: [],
    investor: { currency: "USD" } as StockAnalysisBundle["investor"],
    incomeQuarterly: [
      q("2024-03-31", 100, 10, 0.25, 1000),
      q("2024-06-30", 110, 12, 0.3, 1000),
      q("2024-09-30", 120, 14, 0.35, 1010),
      q("2024-12-31", 130, 16, 0.4, 1010),
    ],
    cashFlowQuarterly: [],
    balanceSheetQuarterly: [],
    dividendQuarterly: [],
  };
}

describe("appendCalendarAnnualFromQuarterly", () => {
  it("synthesizes the annual row with summed EPS and averaged diluted shares", () => {
    const bundle = makeBundle();
    appendCalendarAnnualFromQuarterly(bundle);
    const fy = bundle.income.find((r) => r.fiscalYear === "2024");
    assert.ok(fy, "FY2024 synthesized");
    assert.equal(fy?.revenue, 460);
    assert.equal(fy?.netIncome, 52);
    // EPS = sum of quarterly diluted EPS
    assert.ok(Math.abs((fy?.dilutedEps ?? 0) - 1.3) < 1e-9);
    // shares = mean of quarterly weighted-average shares
    assert.equal(fy?.dilutedAverageShares, 1005);
  });

  it("leaves EPS undefined when a quarter is missing it", () => {
    const bundle = makeBundle();
    bundle.incomeQuarterly[1] = { ...bundle.incomeQuarterly[1], dilutedEps: undefined };
    appendCalendarAnnualFromQuarterly(bundle);
    const fy = bundle.income.find((r) => r.fiscalYear === "2024");
    assert.equal(fy?.dilutedEps, undefined);
    // shares still averaged from the quarters that have them
    assert.ok((fy?.dilutedAverageShares ?? 0) > 0);
  });
});
