import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DIP_RANGES,
  dipChartRowForQuote,
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

describe("dipChartRowForQuote", () => {
  it("omits symbols without window SMA instead of falling back to 200d", () => {
    const quote = {
      symbol: "TEST",
      price: 90,
      dipVsSma200Pct: -15,
      twoHundredDayAverage: 100,
    };
    const row = dipChartRowForQuote(quote, [], "1m");
    assert.equal(row, null);
  });

  it("uses window SMA dip when history is available", () => {
    const bars = [
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 102 },
      { date: "2024-01-03", close: 101 },
      { date: "2024-01-04", close: 99 },
      { date: "2024-01-05", close: 90 },
    ];
    const quote = {
      symbol: "TEST",
      price: 90,
      dipVsSma200Pct: -15,
      twoHundredDayAverage: 100,
    };
    const row = dipChartRowForQuote(quote, bars, "5d");
    assert.ok(row);
    assert.notEqual(row!.dipPct, quote.dipVsSma200Pct);
    assert.ok(row!.windowSma != null);
    assert.equal(row!.dipPct, ((90 - row!.windowSma!) / row!.windowSma!) * 100);
  });
});
