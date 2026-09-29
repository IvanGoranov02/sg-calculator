import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocationPercentOfTotal,
  donutAnnulusPath,
  donutSliceAngles,
  formatAllocationPercent,
} from "@/lib/portfolioAllocation";

describe("portfolioAllocation", () => {
  it("computes share of total portfolio value", () => {
    assert.equal(allocationPercentOfTotal(1000, 250), 25);
    assert.equal(allocationPercentOfTotal(1000, 1000), 100);
    assert.equal(allocationPercentOfTotal(0, 100), 0);
  });

  it("formats allocation percentages without decimals", () => {
    assert.equal(formatAllocationPercent(25.4), "25%");
    assert.equal(formatAllocationPercent(0.6), "1%");
  });

  it("lays donut wedges clockwise from the top", () => {
    const slices = donutSliceAngles([1, 1], { gapDegrees: 0 });
    assert.equal(slices.length, 2);
    assert.ok(Math.abs(slices[0].startAngle) < 0.001);
    assert.ok(Math.abs(slices[0].endAngle - 180) < 0.001);
    assert.ok(Math.abs(slices[1].startAngle - 180) < 0.001);
    assert.ok(Math.abs(slices[1].endAngle - 360) < 0.001);
  });

  it("keeps a gap between donut wedges without exceeding the circle", () => {
    const gap = 4;
    const slices = donutSliceAngles([1, 1, 2], { gapDegrees: gap });
    assert.equal(slices.length, 3);
    const sweeps = slices.map((slice) => slice.endAngle - slice.startAngle);
    const used = sweeps.reduce((sum, sweep) => sum + sweep, 0) + gap * slices.length;
    assert.ok(Math.abs(used - 360) < 0.05);
    assert.ok(sweeps[2] > sweeps[0] * 1.9);
    assert.ok(slices[0].startAngle > 0);
  });

  it("draws one full ring for a single sector", () => {
    const [slice] = donutSliceAngles([12]);
    assert.deepEqual(slice, { startAngle: 0, endAngle: 360 });
    const path = donutAnnulusPath(100, 100, 40, 80, slice.startAngle, slice.endAngle);
    assert.match(path, /^M 100 -?20 /);
    assert.equal(path.split("M ").length - 1, 2);
  });

  it("drops empty weights and gives tiny wedges a minimum sweep", () => {
    assert.deepEqual(donutSliceAngles([]), []);
    assert.deepEqual(donutSliceAngles([0, -2]), []);
    const slices = donutSliceAngles([1, 100], { gapDegrees: 0, minSweepDegrees: 10 });
    assert.ok(Math.abs(slices[0].endAngle - slices[0].startAngle - 10) < 0.05);
    assert.ok(Math.abs(slices[1].endAngle - 360) < 0.05);
  });

  it("builds a quarter annulus from 12 o'clock", () => {
    assert.equal(
      donutAnnulusPath(100, 100, 40, 80, 0, 90),
      "M 100 20 A 80 80 0 0 1 180 100 L 140 100 A 40 40 0 0 0 100 60 Z",
    );
    const grown = donutAnnulusPath(100, 100, 40, 88, 0, 90);
    assert.notEqual(grown, donutAnnulusPath(100, 100, 40, 80, 0, 90));
    assert.match(grown, /^M 100 12 /);
  });
});
