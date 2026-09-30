import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  categoryAxisWidth,
  categoryTicksUseShortYear,
  categoryYearKey,
  selectCategoryTickIndexes,
  seriesCoverage,
  seriesHasAnyPoint,
  seriesHasPartialGaps,
  tickCoord,
} from "@/lib/chartSeriesUtils";

const rows = [
  { label: "Q1", a: null, b: null },
  { label: "Q2", a: null, b: 5 },
  { label: "Q3", a: 3, b: null },
  { label: "Q4", a: null, b: null },
];

describe("seriesHasAnyPoint", () => {
  it("is true when any series has a finite value", () => {
    assert.equal(seriesHasAnyPoint(rows, ["a", "b"]), true);
    assert.equal(seriesHasAnyPoint(rows, ["a"]), true);
  });
  it("is false when all values are null/non-finite", () => {
    assert.equal(seriesHasAnyPoint([{ label: "x", a: null }], ["a"]), false);
  });
});

describe("seriesHasPartialGaps", () => {
  it("detects a metric with some points but also gaps", () => {
    assert.equal(seriesHasPartialGaps(rows, ["a", "b"]), true);
  });
});

describe("seriesCoverage", () => {
  it("counts periods that have a value and reports the covered span", () => {
    const c = seriesCoverage(rows, ["a", "b"], "label");
    assert.equal(c.total, 4);
    assert.equal(c.pointCount, 2); // Q2 and Q3
    assert.equal(c.firstLabel, "Q2");
    assert.equal(c.lastLabel, "Q3");
  });

  it("reports zero coverage when nothing is plotted", () => {
    const c = seriesCoverage(rows, ["a", "b"], "label");
    const none = seriesCoverage([{ label: "x", a: null }], ["a"], "label");
    assert.ok(c.pointCount > 0);
    assert.equal(none.pointCount, 0);
    assert.equal(none.firstLabel, null);
  });

  it("handles a single trailing point (the sparse Amazon case)", () => {
    const sparse = [
      { label: "Mar 22", v: null },
      { label: "Mar 23", v: null },
      { label: "Mar 26", v: 0.88 },
    ];
    const c = seriesCoverage(sparse, ["v"], "label");
    assert.equal(c.pointCount, 1);
    assert.equal(c.firstLabel, "Mar 26");
    assert.equal(c.lastLabel, "Mar 26");
  });
});

/** Quarter-end ISO dates, one every 3 months, matching a 5y AAPL/META window. */
function quarterlyIsoDates(startIso: string, count: number): string[] {
  const start = new Date(`${startIso}T12:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i * 3);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function yearsOf(categories: string[], indexes: number[]): string[] {
  return [...new Set(indexes.map((i) => categoryYearKey(categories[i]!)!))].sort();
}

describe("categoryYearKey", () => {
  it("reads ISO period ends, fiscal-year labels, and month labels", () => {
    assert.equal(categoryYearKey("2024-09-28"), "2024");
    assert.equal(categoryYearKey("FY 2024"), "2024");
    assert.equal(categoryYearKey("Sep 24"), "2024");
    assert.equal(categoryYearKey("Apr 26, 26"), "2026");
    assert.equal(categoryYearKey("ФГ 2023"), "2023");
  });
});

describe("selectCategoryTickIndexes", () => {
  const cardAxis = categoryAxisWidth(300);

  it("labels every quarter when the series is short", () => {
    const dates = quarterlyIsoDates("2025-09-27", 4);
    assert.deepEqual(selectCategoryTickIndexes(dates, cardAxis), [0, 1, 2, 3]);
  });

  it("keeps a newly listed name's only quarters", () => {
    const dates = ["2026-03-28", "2026-06-27"];
    assert.deepEqual(selectCategoryTickIndexes(dates, cardAxis), [0, 1]);
  });

  it("labels every year on a 5y quarterly axis without adjacent ticks", () => {
    // 20 quarters, Sep 2021–Jun 2026 — the AAPL / META 5Y window.
    const dates = quarterlyIsoDates("2021-09-25", 20);
    const shown = selectCategoryTickIndexes(dates, cardAxis);
    assert.deepEqual(yearsOf(dates, shown), ["2021", "2022", "2023", "2024", "2025", "2026"]);
    for (let k = 1; k < shown.length; k++) {
      assert.ok(shown[k]! - shown[k - 1]! >= 2, `adjacent ticks ${shown.join(",")}`);
    }
    assert.equal(categoryTicksUseShortYear(dates.length, shown, cardAxis), false);
  });

  it("shows every quarter in the expanded chart", () => {
    const dates = quarterlyIsoDates("2021-09-25", 20);
    const shown = selectCategoryTickIndexes(dates, categoryAxisWidth(900));
    assert.equal(shown.length, 20);
  });

  it("does not invent labels for years with no points", () => {
    const dates = ["2022-03-31", "2024-06-30", "2026-06-30"];
    const shown = selectCategoryTickIndexes(dates, cardAxis);
    assert.deepEqual(yearsOf(dates, shown), ["2022", "2024", "2026"]);
    assert.ok(!yearsOf(dates, shown).includes("2023"));
    assert.ok(!yearsOf(dates, shown).includes("2025"));
  });

  it("shows every annual fiscal year", () => {
    const labels = ["FY 2021", "FY 2022", "FY 2023", "FY 2024", "FY 2025"];
    assert.deepEqual(selectCategoryTickIndexes(labels, cardAxis), [0, 1, 2, 3, 4]);
  });
});

describe("tickCoord", () => {
  it("keeps finite numbers and parses numeric strings", () => {
    assert.equal(tickCoord(12.5), 12.5);
    assert.equal(tickCoord("40"), 40);
    assert.equal(tickCoord(undefined), 0);
    assert.equal(tickCoord("nope"), 0);
    assert.equal(tickCoord(Number.NaN), 0);
  });
});
