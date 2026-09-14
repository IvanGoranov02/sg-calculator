import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bestIndex,
  buildGroupBarPoints,
  buildOverviewBarRows,
  categoryLeaderIndex,
  initialCompareSymbols,
  MAX_COMPARE,
  parseCompareSymbols,
  relativeBarPct,
  twelveMonthLead,
  weekRangePosition,
  analystUpside,
} from "@/lib/compareMetrics";
import type { InvestorMetrics } from "@/lib/stockAnalysisTypes";
import type { CompareRow } from "@/lib/yahooCompare";

function row(partial: {
  symbol: string;
  price?: number;
  weekChangePercent?: number | null;
  investor?: Partial<InvestorMetrics>;
}): CompareRow {
  return {
    symbol: partial.symbol,
    name: partial.symbol,
    price: partial.price ?? 100,
    changesPercentage: 0,
    sector: null,
    industry: null,
    weekChangePercent: partial.weekChangePercent ?? null,
    investor: (partial.investor ?? {}) as InvestorMetrics,
  };
}

describe("bestIndex", () => {
  it("picks the lowest positive multiple", () => {
    assert.equal(bestIndex([18, 12, 40], "low"), 1);
  });

  it("skips a non-positive P/E when another positive exists", () => {
    assert.equal(bestIndex([-5, 20, 15], "low"), 2);
  });

  it("returns -1 on ties and when direction is none", () => {
    assert.equal(bestIndex([10, 10], "low"), -1);
    assert.equal(bestIndex([1, 2], "none"), -1);
    assert.equal(bestIndex([null, 4], "high"), -1);
  });

  it("picks the highest growth", () => {
    assert.equal(bestIndex([0.1, 0.4, 0.2], "high"), 1);
  });
});

describe("relativeBarPct", () => {
  it("scales against the row max absolute value", () => {
    assert.equal(relativeBarPct([10, 5, 0], 10), 100);
    assert.equal(relativeBarPct([10, 5, 0], 5), 50);
  });

  it("returns null when empty or non-finite", () => {
    assert.equal(relativeBarPct([null, null], 1), null);
    assert.equal(relativeBarPct([1, 2], null), null);
  });
});

describe("weekRangePosition / analystUpside", () => {
  it("places price in the 52-week band", () => {
    const r = row({
      symbol: "A",
      price: 75,
      investor: { fiftyTwoWeekLow: 50, fiftyTwoWeekHigh: 100 },
    });
    assert.equal(weekRangePosition(r), 0.5);
  });

  it("computes analyst upside vs last price", () => {
    const r = row({ symbol: "A", price: 80, investor: { targetMeanPrice: 100 } });
    assert.ok(Math.abs((analystUpside(r) as number) - 0.25) < 1e-9);
  });
});

describe("parseCompareSymbols / MAX_COMPARE", () => {
  it("caps at two unique tickers", () => {
    assert.equal(MAX_COMPARE, 2);
    assert.deepEqual(parseCompareSymbols("aapl, msft, googl, aapl"), ["AAPL", "MSFT"]);
    assert.deepEqual(parseCompareSymbols("  "), []);
  });

  it("falls back to AAPL vs MSFT when empty", () => {
    assert.deepEqual(initialCompareSymbols(undefined), ["AAPL", "MSFT"]);
    assert.deepEqual(initialCompareSymbols("nvda"), ["NVDA"]);
  });
});

describe("buildGroupBarPoints", () => {
  it("scales bars against the pair max and marks the better reading", () => {
    const cheap = row({ symbol: "CHEAP", investor: { trailingPE: 10, forwardPE: 9 } });
    const rich = row({ symbol: "RICH", investor: { trailingPE: 20, forwardPE: 18 } });
    const points = buildGroupBarPoints([cheap, rich], "valuation");
    const pe = points.find((p) => p.key === "trailingPE");
    assert.ok(pe);
    assert.equal(pe?.best, 0);
    assert.equal(pe?.pcts[0], 50);
    assert.equal(pe?.pcts[1], 100);
  });
});

describe("buildOverviewBarRows", () => {
  it("converts decimal margins to percent points", () => {
    const a = row({ symbol: "A", investor: { grossMargins: 0.4, operatingMargins: 0.2 } });
    const b = row({ symbol: "B", investor: { grossMargins: 0.6, operatingMargins: 0.3 } });
    const rows = buildOverviewBarRows([a, b], ["grossMargins", "operatingMargins"], "percent");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].a, 40);
    assert.equal(rows[0].b, 60);
  });

  it("omits metrics with no data", () => {
    const a = row({ symbol: "A", investor: { trailingPE: 18 } });
    const rows = buildOverviewBarRows([a], ["pegRatio"], "raw");
    assert.equal(rows.length, 0);
  });
});

describe("twelveMonthLead", () => {
  it("picks the stronger 52-week return", () => {
    const a = row({ symbol: "A", weekChangePercent: 12 });
    const b = row({ symbol: "B", weekChangePercent: -4 });
    assert.deepEqual(twelveMonthLead([a, b]), { winner: 0, loser: 1 });
  });

  it("returns null on a tie or missing data", () => {
    const a = row({ symbol: "A", weekChangePercent: 5 });
    const b = row({ symbol: "B", weekChangePercent: 5 });
    assert.equal(twelveMonthLead([a, b]), null);
    assert.equal(twelveMonthLead([a]), null);
  });
});

describe("categoryLeaderIndex", () => {
  it("picks the cheaper stock on valuation", () => {
    const cheap = row({ symbol: "CHEAP", investor: { trailingPE: 10, forwardPE: 9, priceToSales: 2 } });
    const rich = row({ symbol: "RICH", investor: { trailingPE: 30, forwardPE: 28, priceToSales: 8 } });
    assert.equal(categoryLeaderIndex([cheap, rich], "valuation"), 0);
  });

  it("picks the more profitable stock", () => {
    const a = row({ symbol: "A", investor: { profitMargins: 0.1, returnOnEquity: 0.08 } });
    const b = row({ symbol: "B", investor: { profitMargins: 0.3, returnOnEquity: 0.25 } });
    assert.equal(categoryLeaderIndex([a, b], "profitability"), 1);
  });

  it("returns -1 when the group is tied", () => {
    const a = row({ symbol: "A", investor: { revenueGrowth: 0.1 } });
    const b = row({ symbol: "B", investor: { revenueGrowth: 0.1 } });
    assert.equal(categoryLeaderIndex([a, b], "growth"), -1);
  });
});
