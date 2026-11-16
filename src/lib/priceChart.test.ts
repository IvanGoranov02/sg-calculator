import assert from "node:assert/strict";
import { test } from "node:test";

import { barsForRange, downsample, niceTicks, tickIndexes, tickLabel } from "./priceChart";

function days(from: string, n: number) {
  const out = [];
  const d = new Date(`${from}T12:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push({ date: d.toISOString().slice(0, 10), close: 100 + i, volume: 10 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

test("ranges: YTD starts at the last close of the previous year; 1D takes the last intraday session", () => {
  const bars = days("2025-12-20", 40);
  const ytd = barsForRange(bars, undefined, "ytd");
  assert.equal(ytd[0]!.date, "2025-12-31");
  assert.equal(barsForRange(bars, undefined, "1w").length, 8);
  const intra = [
    { date: "2026-11-12T15:59", close: 1 },
    { date: "2026-11-13T09:30", close: 2 },
    { date: "2026-11-13T10:00", close: 3 },
  ];
  assert.deepEqual(barsForRange(bars, intra, "1d").map((p) => p.close), [2, 3]);
});

test("downsample keeps the newest close exact and sums volume", () => {
  const pts = barsForRange(days("2020-01-01", 1001), undefined, "max");
  const out = downsample(pts, 500);
  assert.ok(out.length <= 501);
  assert.equal(out[out.length - 1]!.close, pts[pts.length - 1]!.close);
  assert.equal(out[out.length - 1]!.volume, 30);
});

test("axis ticks sit on month starts and January shows the year", () => {
  const pts = barsForRange(days("2025-11-15", 120), undefined, "max");
  const idx = tickIndexes(pts, "month");
  assert.deepEqual(idx.map((i) => pts[i]!.date), ["2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"]);
  assert.equal(tickLabel("2026-01-01", "month", "en"), "2026");
  assert.equal(tickLabel("2026-03-01", "month", "en"), "Mar");
  assert.equal(tickIndexes(barsForRange(days("2000-01-01", 9500), undefined, "max"), "year", 7).length <= 7, true);
});

test("price ticks are round numbers", () => {
  assert.deepEqual(niceTicks(262, 412, 4), [300, 350, 400]);
  assert.deepEqual(niceTicks(9.3, 10.6, 4), [9.5, 10, 10.5]);
});
