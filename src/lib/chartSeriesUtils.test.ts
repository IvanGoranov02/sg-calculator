import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { axisTickVisible, seriesCoverage, seriesHasAnyPoint, seriesHasPartialGaps, tickCoord } from "@/lib/chartSeriesUtils";

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

describe("axisTickVisible", () => {
  it("shows every tick when the range is short", () => {
    for (let i = 0; i < 8; i++) {
      assert.equal(axisTickVisible(i, 8, 8), true);
    }
  });

  it("keeps first/last and still labels 2024 on a 5y quarterly axis", () => {
    // 20 quarters ending Jun 2026, same window as AAPL 5Y.
    const labels: string[] = [];
    const start = new Date("2021-09-25T12:00:00Z");
    for (let i = 0; i < 20; i++) {
      const d = new Date(start);
      d.setUTCMonth(d.getUTCMonth() + i * 3);
      labels.push(
        d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      );
    }
    const shown = labels.filter((_, i) => axisTickVisible(i, labels.length, 8));
    assert.equal(axisTickVisible(0, 20, 8), true);
    assert.equal(axisTickVisible(19, 20, 8), true);
    assert.ok(
      shown.some((l) => l.endsWith("24")),
      `2024 missing from ${shown.join(", ")}`,
    );
    // Stride ticks must not sit on the neighboring bar of the last label.
    const lastShown = [...Array(20).keys()].filter((i) => axisTickVisible(i, 20, 8));
    for (let k = 1; k < lastShown.length; k++) {
      assert.ok(lastShown[k]! - lastShown[k - 1]! >= 2);
    }
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
