import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  categoryAxisWidth,
  categoryBandCenter,
  categoryLabelSpan,
  categoryTickAnchor,
  categoryTicksOverlap,
  categoryTicksUseShortYear,
  categoryYearKey,
  estimateCategoryLabelPx,
  planCategoryTicks,
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

function assertBoxesClear(
  indexes: number[],
  total: number,
  axisWidth: number,
  labelWidths: readonly number[],
) {
  const spans = indexes
    .map((i) => categoryLabelSpan(i, total, axisWidth, labelWidths[i]!))
    .sort((a, b) => a.left - b.left);
  for (let k = 1; k < spans.length; k++) {
    const gap = spans[k]!.left - spans[k - 1]!.right;
    assert.ok(gap >= 1.5, `label boxes overlap by ${(-gap).toFixed(1)}px at indexes ${indexes.join(",")}`);
  }
}

describe("estimateCategoryLabelPx", () => {
  it("matches measured 10px glyphs", () => {
    assert.ok(estimateCategoryLabelPx("2024") >= 25);
    assert.equal(estimateCategoryLabelPx("Sep 24"), 33);
    assert.equal(estimateCategoryLabelPx("Mar 26"), 33);
  });
});

describe("category axis geometry", () => {
  it("steps category centers by width / n", () => {
    const total = 20;
    const axis = 180;
    assert.equal(categoryBandCenter(0, total, axis), 4.5);
    assert.equal(categoryBandCenter(1, total, axis) - categoryBandCenter(0, total, axis), axis / total);
    assert.notEqual(axis / total, axis / (total - 1));
  });

  it("derives the category axis from the chart box", () => {
    // lg 3-column chart box is ~260px; Y axis 68 + right margin 12 leaves ~180.
    assert.equal(categoryAxisWidth(260), 180);
    assert.equal(categoryAxisWidth(0), 0);
  });
});

describe("selectCategoryTickIndexes", () => {
  /** lg 3-column Stock Analysis card: chart box ~260px, category axis ~180px. */
  const cardAxis = categoryAxisWidth(260);
  const fiveYear = quarterlyIsoDates("2021-09-25", 20);

  it("labels every quarter when the series is short", () => {
    const dates = quarterlyIsoDates("2025-09-27", 4);
    const plan = planCategoryTicks(dates, cardAxis);
    assert.deepEqual(plan.indexes, [0, 1, 2, 3]);
    assert.equal(plan.yearOnly, false);
    assertBoxesClear(plan.indexes, dates.length, cardAxis, plan.labelWidths);
  });

  it("keeps a newly listed name's only quarters", () => {
    const dates = ["2026-03-28", "2026-06-27"];
    const plan = planCategoryTicks(dates, cardAxis);
    assert.deepEqual(plan.indexes, [0, 1]);
    assertBoxesClear(plan.indexes, dates.length, cardAxis, plan.labelWidths);
  });

  it("prints every year on a narrow 5y card without overlapping glyphs", () => {
    assert.equal(cardAxis, 180);
    const plan = planCategoryTicks(fiveYear, cardAxis);
    assert.equal(plan.yearOnly, true);
    assert.deepEqual(yearsOf(fiveYear, plan.indexes), ["2021", "2022", "2023", "2024", "2025", "2026"]);
    assertBoxesClear(plan.indexes, fiveYear.length, cardAxis, plan.labelWidths);
    assert.equal(categoryTicksUseShortYear(fiveYear.length, plan.indexes, cardAxis), true);
    // Start anchor extends a full "2024" toward the next tick.
    assert.equal(categoryTickAnchor(0, fiveYear.length, cardAxis, plan.labelWidths[0]!), "start");
    assert.equal(
      categoryTickAnchor(fiveYear.length - 1, fiveYear.length, cardAxis, plan.labelWidths.at(-1)!),
      "end",
    );
  });

  it("keeps 2023 and 2024 on a still narrower axis", () => {
    const axis = categoryAxisWidth(200);
    const plan = planCategoryTicks(fiveYear, axis);
    const years = yearsOf(fiveYear, plan.indexes);
    assert.ok(years.includes("2023"));
    assert.ok(years.includes("2024"));
    assertBoxesClear(plan.indexes, fiveYear.length, axis, plan.labelWidths);
  });

  it("does not collide the last two quarters when the expanded axis is only moderately wide", () => {
    const axis = 340;
    const month = estimateCategoryLabelPx("Mar 26");
    const widths = Array.from({ length: fiveYear.length }, () => month);
    assert.equal(categoryTickAnchor(fiveYear.length - 1, fiveYear.length, axis, month), "end");
    assert.equal(categoryTicksOverlap([18, 19], fiveYear.length, axis, widths), true);
    const plan = planCategoryTicks(fiveYear, axis);
    assert.ok(!(plan.indexes.includes(18) && plan.indexes.includes(19)));
    assertBoxesClear(plan.indexes, fiveYear.length, axis, plan.labelWidths);
    assert.ok(yearsOf(fiveYear, plan.indexes).includes("2026"));
  });

  it("labels every quarter on a wide axis once centered labels clear the band", () => {
    // Desktop dialog content ~856px → category axis ~776px.
    const axis = categoryAxisWidth(856);
    const plan = planCategoryTicks(fiveYear, axis);
    assert.equal(plan.indexes.length, 20);
    assert.equal(plan.yearOnly, false);
    assert.equal(categoryTickAnchor(0, 20, axis, plan.labelWidths[0]!), "middle");
    assert.equal(categoryTickAnchor(19, 20, axis, plan.labelWidths[19]!), "middle");
    assertBoxesClear(plan.indexes, fiveYear.length, axis, plan.labelWidths);
  });

  it("does not show all 20 labels on a phone dialog", () => {
    // min(56rem, 94vw) at 390px, minus dialog padding, minus the Y axis.
    const phonePlot = Math.min(56 * 16, 390 * 0.94) - 40;
    const axis = categoryAxisWidth(phonePlot);
    const plan = planCategoryTicks(fiveYear, axis);
    assert.ok(plan.indexes.length < 20);
    assert.deepEqual(yearsOf(fiveYear, plan.indexes), ["2021", "2022", "2023", "2024", "2025", "2026"]);
    assertBoxesClear(plan.indexes, fiveYear.length, axis, plan.labelWidths);
  });

  it("does not treat a point-scale step as enough room", () => {
    // width / (n - 1) is ~34px here, so the old gap math labeled every quarter.
    // The band step is ~32px, narrower than "Sep 24".
    const axis = 34 * 19;
    const shown = selectCategoryTickIndexes(fiveYear, axis);
    assert.ok(shown.length < 20);
    const plan = planCategoryTicks(fiveYear, axis);
    assertBoxesClear(plan.indexes, fiveYear.length, axis, plan.labelWidths);
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
    const plan = planCategoryTicks(labels, cardAxis);
    assert.deepEqual(plan.indexes, [0, 1, 2, 3, 4]);
    assertBoxesClear(plan.indexes, labels.length, cardAxis, plan.labelWidths);
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
