import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignCompareSlot,
  bestIndex,
  buildGroupBarPoints,
  buildOverviewBarRows,
  categoryLeaderIndex,
  compareFetchSymbols,
  compareSlotStatus,
  initialCompareSlots,
  initialCompareSymbols,
  MAX_COMPARE,
  parseCompareSlots,
  parseCompareSymbols,
  relativeBarPct,
  serializeCompareSlots,
  slotAlignedRows,
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

describe("parseCompareSymbols / slots", () => {
  it("caps at two unique tickers after skipping duplicates", () => {
    assert.equal(MAX_COMPARE, 2);
    assert.deepEqual(parseCompareSymbols("aapl, msft, googl, aapl"), ["AAPL", "MSFT"]);
    assert.deepEqual(parseCompareSymbols("AAPL,AAPL,MSFT"), ["AAPL", "MSFT"]);
    assert.deepEqual(parseCompareSymbols("  "), []);
  });

  it("keeps an empty first slot so B does not jump to A", () => {
    assert.deepEqual(parseCompareSlots(",MSFT"), [null, "MSFT"]);
    assert.deepEqual(serializeCompareSlots([null, "MSFT"]), ",MSFT");
    assert.deepEqual(parseCompareSlots(serializeCompareSlots([null, "MSFT"])), [null, "MSFT"]);
  });

  it("falls back to AAPL vs MSFT only when the query is missing", () => {
    assert.deepEqual(initialCompareSlots(undefined), ["AAPL", "MSFT"]);
    assert.deepEqual(initialCompareSymbols(undefined), ["AAPL", "MSFT"]);
    assert.deepEqual(initialCompareSymbols("nvda"), ["NVDA"]);
    assert.deepEqual(initialCompareSlots(",MSFT"), [null, "MSFT"]);
  });

  it("uses the same dedupe-then-cap path the API and Yahoo fetch share", () => {
    assert.deepEqual(compareFetchSymbols(["AAPL", "AAPL", "MSFT"]), ["AAPL", "MSFT"]);
    assert.deepEqual(compareFetchSymbols(["AAPL", "MSFT", "GOOGL"]), ["AAPL", "MSFT"]);
  });
});

describe("assignCompareSlot", () => {
  it("swaps when the other slot already has the ticker", () => {
    assert.deepEqual(assignCompareSlot(["AAPL", "MSFT"], 0, "MSFT"), ["MSFT", "AAPL"]);
    assert.deepEqual(assignCompareSlot(["AAPL", "MSFT"], 1, "AAPL"), ["MSFT", "AAPL"]);
  });

  it("fills an empty slot without collapsing the other", () => {
    assert.deepEqual(assignCompareSlot([null, "MSFT"], 0, "AAPL"), ["AAPL", "MSFT"]);
  });
});

describe("slotAlignedRows / colors", () => {
  it("keeps company B in slot 1 when A is empty", () => {
    const msft = row({ symbol: "MSFT", investor: { grossMargins: 0.6 } });
    const aligned = slotAlignedRows([null, "MSFT"], [msft]);
    assert.equal(aligned[0], null);
    assert.equal(aligned[1]?.symbol, "MSFT");
    const overview = buildOverviewBarRows(aligned, ["grossMargins"], "percent");
    assert.equal(overview[0].a, null);
    assert.equal(overview[0].b, 60);
  });
});

describe("compareSlotStatus", () => {
  it("does not treat a failed ticker as still loading", () => {
    assert.equal(compareSlotStatus(true, true, false), "loading");
    assert.equal(compareSlotStatus(true, false, false), "unresolved");
    assert.equal(compareSlotStatus(true, false, true), "ready");
    assert.equal(compareSlotStatus(false, true, false), "empty");
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
