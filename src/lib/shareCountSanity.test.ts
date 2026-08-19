import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPlausibleShareCount,
  medianPositive,
  pickPlausibleShareCount,
  sanitizeBundleDilutedShares,
} from "@/lib/shareCountSanity";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

describe("isPlausibleShareCount", () => {
  it("rejects the EDGAR YTD-difference leftover (~3M vs ~330M)", () => {
    assert.equal(isPlausibleShareCount(3_000_000, 330_000_000), false);
    assert.equal(isPlausibleShareCount(330_000_000, 333_000_000), true);
  });

  it("rejects Gemini unit mix (330 vs 330 million)", () => {
    assert.equal(isPlausibleShareCount(330, 330_000_000), false);
  });
});

describe("pickPlausibleShareCount", () => {
  it("replaces the leftover with the annual WASO", () => {
    assert.equal(pickPlausibleShareCount(3_000_000, 333_000_000), 333_000_000);
  });
});

describe("medianPositive", () => {
  it("ignores the Q4 leftover in a four-quarter year", () => {
    assert.equal(medianPositive([330e6, 331e6, 332e6, 3e6]), 330.5e6);
  });
});

describe("sanitizeBundleDilutedShares", () => {
  it("replaces a differenced Q4 with the matching annual WASO", () => {
    const bundle: StockAnalysisBundle = {
      quote: { symbol: "SPGI", name: "S&P Global", price: 1, change: 0, changesPercentage: 0 },
      investor: { currency: "USD" } as StockAnalysisBundle["investor"],
      historical: [],
      income: [
        {
          fiscalYear: "2024",
          date: "2024-12-31",
          symbol: "SPGI",
          revenue: 1,
          grossProfit: 1,
          operatingExpenses: 1,
          netIncome: 1,
          dilutedAverageShares: 313_000_000,
        },
      ],
      cashFlow: [],
      balanceSheet: [],
      incomeQuarterly: [
        {
          date: "2024-03-31",
          symbol: "SPGI",
          revenue: 1,
          grossProfit: 1,
          operatingExpenses: 1,
          netIncome: 1,
          dilutedAverageShares: 314_000_000,
        },
        {
          date: "2024-06-30",
          symbol: "SPGI",
          revenue: 1,
          grossProfit: 1,
          operatingExpenses: 1,
          netIncome: 1,
          dilutedAverageShares: 313_500_000,
        },
        {
          date: "2024-09-30",
          symbol: "SPGI",
          revenue: 1,
          grossProfit: 1,
          operatingExpenses: 1,
          netIncome: 1,
          dilutedAverageShares: 313_000_000,
        },
        {
          date: "2024-12-31",
          symbol: "SPGI",
          revenue: 1,
          grossProfit: 1,
          operatingExpenses: 1,
          netIncome: 1,
          dilutedAverageShares: 3_000_000,
        },
      ],
      cashFlowQuarterly: [],
      balanceSheetQuarterly: [],
      dividendQuarterly: [],
    };

    sanitizeBundleDilutedShares(bundle);
    assert.equal(bundle.incomeQuarterly[3]?.dilutedAverageShares, 313_000_000);
    assert.equal(bundle.incomeQuarterly[0]?.dilutedAverageShares, 314_000_000);
  });
});
