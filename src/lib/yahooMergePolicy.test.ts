import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeNullableFillGaps,
  mergeNullablePreferYahoo,
  mergeScalarFillGaps,
  mergeScalarPreferYahoo,
} from "@/lib/yahooMergePolicy";
import { FUNDAMENTALS_MAX_QUARTERS, trimBundleToFundamentalsWindow } from "@/lib/fundamentalsHistoryLimits";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

describe("mergeScalarPreferYahoo", () => {
  it("prefers Yahoo over Gemini when Yahoo has a value", () => {
    assert.equal(mergeScalarPreferYahoo(100, 95), 95);
  });

  it("keeps Gemini when Yahoo is null", () => {
    assert.equal(mergeScalarPreferYahoo(100, null), 100);
  });
});

describe("mergeNullablePreferYahoo", () => {
  it("fills null from Yahoo", () => {
    assert.equal(mergeNullablePreferYahoo(null, 42), 42);
  });

  it("does not replace existing non-null", () => {
    assert.equal(mergeNullablePreferYahoo(10, 99), 99);
  });
});

describe("fill-gaps merge (EDGAR-sourced bundles)", () => {
  it("keeps the existing value over Yahoo", () => {
    assert.equal(mergeScalarFillGaps(100, 95), 100);
    assert.equal(mergeNullableFillGaps(10, 99), 10);
  });

  it("fills missing values from Yahoo (0 counts as missing for scalars)", () => {
    assert.equal(mergeScalarFillGaps(0, 95), 95);
    assert.equal(mergeNullableFillGaps(null, 42), 42);
  });

  it("falls back safely when Yahoo has nothing either", () => {
    assert.equal(mergeScalarFillGaps(0, null), 0);
    assert.equal(mergeNullableFillGaps(null, null), null);
  });
});

describe("trimBundleToFundamentalsWindow", () => {
  it("keeps last 20 quarters and 5 annual rows", () => {
    const sym = "TEST";
    const bundle: StockAnalysisBundle = {
      quote: { symbol: sym, name: sym, price: 1, change: 0, changesPercentage: 0, earningsDate: null },
      investor: { currency: "USD" } as StockAnalysisBundle["investor"],
      historical: [],
      income: Array.from({ length: 8 }, (_, i) => ({
        fiscalYear: String(2018 + i),
        date: `${2018 + i}-12-31`,
        symbol: sym,
        revenue: 1,
        grossProfit: 1,
        operatingExpenses: 1,
        netIncome: 1,
      })),
      cashFlow: [],
      balanceSheet: [],
      incomeQuarterly: Array.from({ length: 30 }, (_, i) => ({
        date: `20${20 + Math.floor(i / 4)}-${String((i % 4) * 3 + 3).padStart(2, "0")}-30`,
        symbol: sym,
        revenue: 1,
        grossProfit: 1,
        operatingExpenses: 1,
        netIncome: 1,
      })),
      cashFlowQuarterly: [],
      balanceSheetQuarterly: [],
      dividendQuarterly: [],
    };

    trimBundleToFundamentalsWindow(bundle);
    assert.equal(bundle.income.length, 5);
    assert.equal(bundle.incomeQuarterly.length, FUNDAMENTALS_MAX_QUARTERS);
  });
});
