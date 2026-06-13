import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { seriesCoverage, seriesHasAnyPoint, seriesHasPartialGaps } from "@/lib/chartSeriesUtils";

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
