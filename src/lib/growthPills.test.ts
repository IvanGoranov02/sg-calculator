import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeTtmDpsGrowthPills } from "@/lib/dividendMetrics";
import {
  computeGrowthPills,
  growthPillsForKey,
  growthPillsEntries,
} from "@/lib/growthPills";

describe("computeGrowthPills", () => {
  it("returns null pills for empty series", () => {
    const pills = computeGrowthPills([], 1);
    assert.equal(pills.oneYear, null);
    assert.equal(pills.tenYear, null);
  });

  it("computes 1Y simple change for annual data", () => {
    const pills = computeGrowthPills([100, 110, 121], 1);
    assert.ok(pills.oneYear != null && Math.abs(pills.oneYear - 10) < 1e-9);
    assert.ok(pills.twoYear != null && Math.abs(pills.twoYear - 10) < 1e-9);
  });

  it("computes quarterly 1Y as four periods back", () => {
    const values = [1, 1, 1, 1, 2, 2, 2, 2];
    const pills = computeGrowthPills(values, 4);
    assert.equal(pills.oneYear, 100);
  });

  it("computes 2Y CAGR for annual data", () => {
    const pills = computeGrowthPills([100, 110, 121], 1);
    assert.ok(pills.twoYear != null && Math.abs(pills.twoYear - 10) < 1e-9);
  });

  it("matches TTM DPS helper for quarterly horizons", () => {
    const ttm = Array.from({ length: 41 }, (_, i) => (i < 3 ? null : 1 + i * 0.1));
    assert.deepEqual(computeGrowthPills(ttm, 4), computeTtmDpsGrowthPills(ttm));
  });
});

describe("growthPillsForKey", () => {
  it("extracts values from chart rows", () => {
    const rows = [
      { revenue: 100 },
      { revenue: 120 },
      { revenue: 144 },
      { revenue: 172.8 },
      { revenue: 207.36 },
      { revenue: 248.832 },
      { revenue: 298.5984 },
      { revenue: 358.31808 },
      { revenue: 429.981696 },
      { revenue: 515.9780352 },
      { revenue: 619.17364224 },
    ];
    const pills = growthPillsForKey(rows, "revenue", "annual");
    assert.ok(pills.oneYear != null && pills.oneYear > 0);
    assert.ok(pills.fiveYear != null && pills.fiveYear > 0);
    assert.ok(pills.tenYear != null && pills.tenYear > 0);
  });
});

describe("growthPillsEntries", () => {
  it("returns labeled entries for multi-series charts", () => {
    const rows = [{ a: 10, b: 20 }, { a: 11, b: 18 }];
    const entries = growthPillsEntries(
      rows,
      [{ key: "a", label: "Series A" }, { key: "b", label: "Series B" }],
      "annual",
    );
    assert.equal(entries.length, 2);
    assert.equal(entries[0]!.label, "Series A");
    assert.equal(entries[1]!.label, "Series B");
  });
});
