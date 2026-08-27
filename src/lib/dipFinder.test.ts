import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DIP_RANGES,
  dipMetricsForRange,
  dipRangeTradingDays,
  dipVsAveragePct,
  isDipRange,
  lookbackChangePct,
  simpleMovingAverage,
} from "@/lib/dipFinder";

describe("dip ranges", () => {
  it("exposes 5d / 10d / 1m / 3m / 6m / 1y with trading-day windows", () => {
    assert.deepEqual([...DIP_RANGES], ["5d", "10d", "1m", "3m", "6m", "1y"]);
    assert.equal(dipRangeTradingDays("5d"), 5);
    assert.equal(dipRangeTradingDays("10d"), 10);
    assert.equal(dipRangeTradingDays("1m"), 21);
    assert.equal(dipRangeTradingDays("3m"), 63);
    assert.equal(dipRangeTradingDays("6m"), 126);
    assert.equal(dipRangeTradingDays("1y"), 252);
    assert.equal(isDipRange("5d"), true);
    assert.equal(isDipRange("200d"), false);
  });
});

describe("simpleMovingAverage", () => {
  it("averages the last N closes", () => {
    assert.equal(simpleMovingAverage([1, 2, 3, 4, 5], 3), 4);
    assert.equal(simpleMovingAverage([10, 20], 5), 15);
  });

  it("returns null on empty or invalid window", () => {
    assert.equal(simpleMovingAverage([], 5), null);
    assert.equal(simpleMovingAverage([1, 2], 0), null);
    assert.equal(simpleMovingAverage([1, 2], 1.5), null);
  });
});

describe("dipVsAveragePct", () => {
  it("is (price - sma) / sma * 100", () => {
    assert.equal(dipVsAveragePct(90, 100), -10);
    assert.equal(dipVsAveragePct(110, 100), 10);
  });

  it("is null when SMA is missing or zero", () => {
    assert.equal(dipVsAveragePct(10, null), null);
    assert.equal(dipVsAveragePct(10, 0), null);
    assert.equal(dipVsAveragePct(Number.NaN, 10), null);
  });
});

describe("lookbackChangePct", () => {
  it("measures first-to-last change in the window", () => {
    // window 3: 100 → 80 → 90  => (90-100)/100 = -10%
    assert.equal(lookbackChangePct([50, 100, 80, 90], 3), -10);
  });

  it("returns null without two points", () => {
    assert.equal(lookbackChangePct([10], 5), null);
    assert.equal(lookbackChangePct([], 5), null);
  });
});

describe("dipMetricsForRange", () => {
  it("pairs window SMA dip with lookback return", () => {
    const closes = [100, 102, 101, 99, 90];
    const m = dipMetricsForRange(closes, "5d", 90);
    assert.ok(m.windowSma != null);
    assert.ok(Math.abs(m.windowSma - (100 + 102 + 101 + 99 + 90) / 5) < 1e-9);
    assert.ok(m.dipVsWindowSmaPct != null);
    assert.ok(m.lookbackChangePct != null);
    assert.ok(Math.abs(m.lookbackChangePct - ((90 - 100) / 100) * 100) < 1e-9);
  });
});
