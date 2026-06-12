import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeValidatedBackfill,
  quarterlyHistoryIsThin,
  QUARTERLY_BACKFILL_MIN,
} from "@/lib/geminiQuarterlyBackfill";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

/** Two filed fiscal years (calendar 2023, 2024), one existing recent quarter. */
function makeBundle(): StockAnalysisBundle {
  const annual = (fy: string, date: string, revenue: number, netIncome: number) => ({
    date,
    symbol: "TEST",
    fiscalYear: fy,
    revenue,
    grossProfit: revenue / 2,
    operatingExpenses: revenue / 4,
    netIncome,
  });
  return {
    quote: { symbol: "TEST", name: "Test Co", price: 10, change: 0, changesPercentage: 0 },
    income: [
      annual("2023", "2023-12-31", 4000, 800),
      annual("2024", "2024-12-31", 4800, 1000),
    ],
    cashFlow: [
      {
        date: "2024-12-31",
        symbol: "TEST",
        fiscalYear: "2024",
        freeCashFlow: 900,
        operatingCashFlow: 1200,
        capitalExpenditure: -300,
        investingCashFlow: null,
        financingCashFlow: null,
        dividendsPaid: null,
        stockRepurchase: null,
      },
    ],
    balanceSheet: [],
    historical: [],
    investor: { currency: "USD" } as StockAnalysisBundle["investor"],
    incomeQuarterly: [
      {
        date: "2024-12-31",
        symbol: "TEST",
        revenue: 1200,
        grossProfit: 600,
        operatingExpenses: 300,
        netIncome: 250,
      },
    ],
    cashFlowQuarterly: [],
    balanceSheetQuarterly: [],
    dividendQuarterly: [{ date: "2024-12-31", dividendPerShare: null }],
  };
}

const q = (date: string, revenue: number, netIncome: number) => ({
  date,
  revenue,
  grossProfit: revenue / 2,
  operatingExpenses: revenue / 4,
  netIncome,
  dilutedEps: 0.5,
});

describe("quarterlyHistoryIsThin", () => {
  it("flags bundles below the threshold", () => {
    const bundle = makeBundle();
    assert.equal(quarterlyHistoryIsThin(bundle), true);
    bundle.incomeQuarterly = Array.from({ length: QUARTERLY_BACKFILL_MIN }, (_, i) => ({
      ...bundle.incomeQuarterly[0],
      date: `20${10 + i}-12-31`,
    }));
    assert.equal(quarterlyHistoryIsThin(bundle), false);
  });
});

describe("mergeValidatedBackfill", () => {
  it("accepts a fiscal year whose quarters reconcile with the SEC annual totals", () => {
    const bundle = makeBundle();
    const added = mergeValidatedBackfill(bundle, {
      incomeQuarterly: [
        q("2023-03-31", 900, 180),
        q("2023-06-30", 1000, 200),
        q("2023-09-30", 1050, 210),
        q("2023-12-31", 1050, 210),
      ],
    });
    assert.equal(added, 4);
    assert.equal(bundle.incomeQuarterly.length, 5);
    // dividend/balance arrays stay aligned to income dates
    assert.equal(bundle.dividendQuarterly.length, 5);
  });

  it("rejects a fiscal year whose revenue does not sum to the filed annual", () => {
    const bundle = makeBundle();
    const added = mergeValidatedBackfill(bundle, {
      incomeQuarterly: [
        q("2023-03-31", 500, 180), // sum = 3600 vs filed 4000 → off by 10%
        q("2023-06-30", 1000, 200),
        q("2023-09-30", 1050, 210),
        q("2023-12-31", 1050, 210),
      ],
    });
    assert.equal(added, 0);
    assert.equal(bundle.incomeQuarterly.length, 1);
  });

  it("rejects a fiscal year when net income does not reconcile", () => {
    const bundle = makeBundle();
    const added = mergeValidatedBackfill(bundle, {
      incomeQuarterly: [
        q("2023-03-31", 900, 50), // NI sum = 670 vs filed 800 → off by 16%
        q("2023-06-30", 1000, 200),
        q("2023-09-30", 1050, 210),
        q("2023-12-31", 1050, 210),
      ],
    });
    assert.equal(added, 0);
  });

  it("drops quarters outside filed fiscal years (unverifiable)", () => {
    const bundle = makeBundle();
    const added = mergeValidatedBackfill(bundle, {
      incomeQuarterly: [
        q("2019-03-31", 900, 180),
        q("2019-06-30", 1000, 200),
        q("2019-09-30", 1050, 210),
        q("2019-12-31", 1050, 210),
      ],
    });
    assert.equal(added, 0);
  });

  it("requires a complete set of 4 quarters per fiscal year", () => {
    const bundle = makeBundle();
    const added = mergeValidatedBackfill(bundle, {
      incomeQuarterly: [
        q("2023-06-30", 1000, 200),
        q("2023-09-30", 1050, 210),
        q("2023-12-31", 1950, 390),
      ],
    });
    assert.equal(added, 0);
  });

  it("never overwrites an existing quarter", () => {
    const bundle = makeBundle();
    const before = { ...bundle.incomeQuarterly[0] };
    mergeValidatedBackfill(bundle, {
      incomeQuarterly: [
        q("2024-03-31", 1200, 250),
        q("2024-06-30", 1200, 250),
        q("2024-09-30", 1200, 250),
        q("2024-12-31", 1200, 250), // exists with different values
      ],
    });
    const existing = bundle.incomeQuarterly.find((r) => r.date === "2024-12-31");
    assert.deepEqual(existing, before);
  });

  it("adds cash-flow quarters only when OCF reconciles with the filed annual", () => {
    const bundle = makeBundle();
    const cf = (date: string, ocf: number) => ({ date, operatingCashFlow: ocf, capitalExpenditure: 75 });
    const added = mergeValidatedBackfill(bundle, {
      incomeQuarterly: [
        q("2024-03-31", 1200, 250),
        q("2024-06-30", 1200, 250),
        q("2024-09-30", 1200, 250),
        q("2024-12-31", 1200, 250),
      ],
      cashFlowQuarterly: [
        cf("2024-03-31", 300),
        cf("2024-06-30", 300),
        cf("2024-09-30", 300),
        cf("2024-12-31", 300), // sum 1200 = filed annual OCF ✓
      ],
    });
    assert.equal(added, 3); // 2024-12-31 income row already existed
    const cfRow = bundle.cashFlowQuarterly.find((r) => r.date === "2024-03-31");
    assert.equal(cfRow?.operatingCashFlow, 300);
    assert.equal(cfRow?.capitalExpenditure, -75);
    assert.equal(cfRow?.freeCashFlow, 225);
  });
});
