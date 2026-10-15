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
    income: [{ ...q("2023-12-31", 360, 40, 1, 1000), fiscalYear: "2023" }],
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
    // All four quarters still report shares.
    assert.ok((fy?.dilutedAverageShares ?? 0) > 0);
  });

  it("does not average shares over an incomplete subset of the fiscal year", () => {
    const bundle = makeBundle();
    bundle.incomeQuarterly[1].dilutedAverageShares = undefined;
    appendCalendarAnnualFromQuarterly(bundle);
    assert.equal(bundle.income.find((r) => r.fiscalYear === "2024")?.dilutedAverageShares, undefined);
  });

  it("uses a June fiscal-year end instead of mixing calendar-year quarters", () => {
    const bundle = makeBundle();
    bundle.income = [{ ...q("2024-06-30", 300, 30, 1, 1000), fiscalYear: "2024" }];
    bundle.incomeQuarterly = [
      q("2024-03-31", 999, 99, 9, 1000),
      q("2024-06-30", 999, 99, 9, 1000),
      q("2024-09-30", 100, 10, 1, 1000),
      q("2024-12-31", 110, 11, 1, 1000),
      q("2025-03-31", 120, 12, 1, 1000),
      q("2025-06-30", 130, 13, 1, 1000),
    ];
    appendCalendarAnnualFromQuarterly(bundle);
    const fy = bundle.income.find((r) => r.fiscalYear === "2025");
    assert.equal(fy?.date, "2025-06-30");
    assert.equal(fy?.revenue, 460);
    assert.equal(fy?.dilutedEps, 4);
    assert.equal(bundle.income[0]?.revenue, 300);
  });

  it("preserves the fiscal year label for January year ends", () => {
    const bundle = makeBundle();
    bundle.income = [{ ...q("2024-01-28", 300, 30, 1, 1000), fiscalYear: "2023" }];
    bundle.incomeQuarterly = [
      q("2024-04-28", 100, 10, 1, 1000),
      q("2024-07-28", 100, 10, 1, 1000),
      q("2024-10-27", 100, 10, 1, 1000),
      q("2025-01-26", 100, 10, 1, 1000),
    ];
    appendCalendarAnnualFromQuarterly(bundle);
    assert.equal(bundle.income.at(-1)?.fiscalYear, "2024");
    assert.equal(bundle.income.at(-1)?.date, "2025-01-26");
  });

  it("does not invent fiscal years when there is no annual anchor", () => {
    const bundle = makeBundle();
    bundle.income = [];
    appendCalendarAnnualFromQuarterly(bundle);
    assert.equal(bundle.income.length, 0);
  });

  it("does not sum duplicate quarters twice", () => {
    const bundle = makeBundle();
    bundle.incomeQuarterly.push({ ...bundle.incomeQuarterly[2] });
    appendCalendarAnnualFromQuarterly(bundle);
    assert.equal(bundle.income.find((r) => r.fiscalYear === "2024")?.revenue, 460);
  });

  it("skips an incomplete fiscal year", () => {
    const bundle = makeBundle();
    bundle.incomeQuarterly.splice(1, 1);
    appendCalendarAnnualFromQuarterly(bundle);
    assert.equal(bundle.income.length, 1);
  });

  it("keeps annual free cash flow unknown when quarterly statements are missing", () => {
    const bundle = makeBundle();
    appendCalendarAnnualFromQuarterly(bundle);
    assert.equal(bundle.cashFlow.find((r) => r.fiscalYear === "2024")?.freeCashFlow, null);
    assert.equal(bundle.cashFlow.find((r) => r.fiscalYear === "2023")?.freeCashFlow, null);
  });

  it("sums only complete free cash flow data and preserves reported zero", () => {
    const bundle = makeBundle();
    bundle.cashFlowQuarterly = bundle.incomeQuarterly.map((row) => ({
      date: row.date, symbol: "TEST", freeCashFlow: 0,
      operatingCashFlow: null, capitalExpenditure: null,
      investingCashFlow: null, financingCashFlow: null, dividendsPaid: null, stockRepurchase: null,
    }));
    appendCalendarAnnualFromQuarterly(bundle);
    assert.equal(bundle.cashFlow.find((r) => r.fiscalYear === "2024")?.freeCashFlow, 0);
    const incomplete = makeBundle();
    incomplete.cashFlowQuarterly = bundle.cashFlowQuarterly.slice(0, 3);
    appendCalendarAnnualFromQuarterly(incomplete);
    assert.equal(incomplete.cashFlow.find((r) => r.fiscalYear === "2024")?.freeCashFlow, null);
  });
});
