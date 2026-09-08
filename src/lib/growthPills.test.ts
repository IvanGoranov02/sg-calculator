import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeTtmDpsGrowthPills } from "@/lib/dividendMetrics";
import {
  computeGrowthPills,
  growthPillsForKey,
  growthPillsEntries,
  growthPillColorPositive,
  isShareCountGrowthKey,
} from "@/lib/growthPills";

describe("computeGrowthPills", () => {
  it("returns null pills for empty series", () => {
    const pills = computeGrowthPills([], 1);
    assert.equal(pills.oneYear, null);
    assert.equal(pills.fourYear, null);
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

  it("computes 1Y with abs denominator when base is negative", () => {
    const pills = computeGrowthPills([-10, -5], 1);
    assert.ok(pills.oneYear != null && Math.abs(pills.oneYear - 50) < 1e-9);
  });

  it("3Y pill needs full history beyond a 3-year visible window", () => {
    const full = Array.from({ length: 6 }, (_, i) => 100 * Math.pow(1.1, i));
    const visible = full.slice(-3);
    const fullPills = computeGrowthPills(full, 1);
    const visiblePills = computeGrowthPills(visible, 1);
    assert.equal(visiblePills.threeYear, null);
    assert.ok(fullPills.threeYear != null);
  });

  it("4Y pill is null when only three years of history exist", () => {
    const pills = computeGrowthPills([100, 110, 121], 1);
    assert.equal(pills.fourYear, null);
  });

  it("preserves calendar gaps when EPS years are missing", () => {
    const withGaps = [1, null, 2, null, 3];
    const compact = [1, 2, 3];
    const gapPills = computeGrowthPills(withGaps, 1);
    const compactPills = computeGrowthPills(compact, 1);
    assert.notEqual(gapPills.oneYear, compactPills.oneYear);
    assert.equal(gapPills.oneYear, null);
  });

  it("matches TTM DPS helper for quarterly horizons", () => {
    const ttm = Array.from({ length: 41 }, (_, i) => (i < 3 ? null : 1 + i * 0.1));
    assert.deepEqual(computeGrowthPills(ttm, 4), computeTtmDpsGrowthPills(ttm));
  });
});

describe("isShareCountGrowthKey", () => {
  it("matches diluted shares and other share-count keys", () => {
    assert.equal(isShareCountGrowthKey("dilutedShares"), true);
    assert.equal(isShareCountGrowthKey("sharesOutstanding"), true);
    assert.equal(isShareCountGrowthKey("revenue"), false);
    assert.equal(isShareCountGrowthKey("shareholdersEquity"), false);
  });
});

describe("growthPillColorPositive", () => {
  it("treats flat 0% as positive when share-count colors are inverted", () => {
    assert.equal(growthPillColorPositive(0, true), true);
    assert.equal(growthPillColorPositive(0, false), true);
    assert.equal(growthPillColorPositive(5, true), false);
    assert.equal(growthPillColorPositive(-5, true), true);
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
    ];
    const pills = growthPillsForKey(rows, "revenue", "annual");
    assert.ok(pills.oneYear != null && pills.oneYear > 0);
    assert.ok(pills.threeYear != null && pills.threeYear > 0);
    assert.ok(pills.fourYear != null && pills.fourYear > 0);
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

  it("sets invertColors for share-count series", () => {
    const rows = [{ dilutedShares: 100 }, { dilutedShares: 95 }];
    const entries = growthPillsEntries(rows, [{ key: "dilutedShares", label: "Shares" }], "annual");
    assert.equal(entries[0]!.invertColors, true);
  });

  it("3Y multi-series pills need full history, not a 3-year visible slice", () => {
    const full = Array.from({ length: 6 }, (_, i) => ({
      ar: 100 * Math.pow(1.1, i),
      inventory: 50 * Math.pow(1.05, i),
    }));
    const visible = full.slice(-3);
    const fullEntries = growthPillsEntries(
      full,
      [{ key: "ar", label: "AR" }, { key: "inventory", label: "Inv" }],
      "annual",
    );
    const visibleEntries = growthPillsEntries(
      visible,
      [{ key: "ar", label: "AR" }, { key: "inventory", label: "Inv" }],
      "annual",
    );
    assert.equal(visibleEntries[0]!.pills.threeYear, null);
    assert.equal(visibleEntries[1]!.pills.threeYear, null);
    assert.ok(fullEntries[0]!.pills.threeYear != null);
    assert.ok(fullEntries[1]!.pills.threeYear != null);
  });
});
