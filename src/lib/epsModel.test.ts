import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  annualizedReturnBetweenPrices,
  computeEpsModel,
  entryPriceForTargetReturn,
  epsModelChartLabel,
  EPS_MODEL_HORIZON_YEARS,
  seedPeMultiple,
  targetPriceFromEpsModel,
  trailingPeFromPriceAndEps,
  validateEpsModelInputs,
} from "@/lib/epsModel";

const validBase = {
  ttmEps: 10,
  growthRatePct: 15,
  peMultiple: 20,
  desiredReturnPct: 15,
  horizonYears: EPS_MODEL_HORIZON_YEARS,
};

describe("validateEpsModelInputs", () => {
  it("flags empty or NaN growth rate", () => {
    assert.equal(
      validateEpsModelInputs({ ...validBase, growthRatePct: Number.NaN }),
      "growth_rate_invalid",
    );
  });

  it("flags growth at or below -100%", () => {
    assert.equal(
      validateEpsModelInputs({ ...validBase, growthRatePct: -100 }),
      "growth_rate_invalid",
    );
  });

  it("accepts negative growth above -100%", () => {
    assert.equal(validateEpsModelInputs({ ...validBase, growthRatePct: -5 }), null);
  });
});

describe("trailingPeFromPriceAndEps", () => {
  it("returns unclamped trailing P/E", () => {
    assert.equal(trailingPeFromPriceAndEps(40, 10), 4);
    assert.equal(trailingPeFromPriceAndEps(720, 10), 72);
  });

  it("returns null when price or EPS is missing", () => {
    assert.equal(trailingPeFromPriceAndEps(0, 10), null);
    assert.equal(trailingPeFromPriceAndEps(100, 0), null);
  });
});

describe("seedPeMultiple", () => {
  it("uses real trailing P/E when available", () => {
    assert.equal(seedPeMultiple(17, 1), 17);
    assert.equal(seedPeMultiple(4, 1), 4);
  });

  it("falls back to default when trailing P/E is unknown", () => {
    assert.equal(seedPeMultiple(0, 10), 20);
  });
});

describe("computeEpsModel", () => {
  it("matches Qualtrim-style GOOGL spot check", () => {
    const ttmEps = 19.91;
    const growth = 0.18;
    const pe = 20;
    const price = 338.36;
    const desired = 0.15;

    const target = targetPriceFromEpsModel(ttmEps, growth, pe, EPS_MODEL_HORIZON_YEARS);
    assert.ok(Math.abs(target - 911.4) < 0.5);

    const annualized = annualizedReturnBetweenPrices(price, target, EPS_MODEL_HORIZON_YEARS);
    assert.ok(annualized != null);
    assert.ok(Math.abs(annualized * 100 - 21.91) < 0.15);

    const entry = entryPriceForTargetReturn(target, desired, EPS_MODEL_HORIZON_YEARS);
    assert.ok(entry != null);
    assert.ok(Math.abs(entry - 452.92) < 0.5);

    const r = computeEpsModel({
      ttmEps,
      growthRate: growth,
      peMultiple: pe,
      currentPrice: price,
      desiredReturn: desired,
    });
    assert.equal(r.chartPoints.length, EPS_MODEL_HORIZON_YEARS + 1);
    assert.ok(Math.abs(r.chartPoints[0].projectedPrice - price) < 0.01);
    assert.ok(Math.abs(r.chartPoints[5].projectedPrice - target) < 0.5);
  });

  it("handles missing market price with EPS×P/E chart path", () => {
    const r = computeEpsModel({
      ttmEps: 10,
      growthRate: 0.1,
      peMultiple: 15,
      currentPrice: 0,
      desiredReturn: 0.15,
    });
    assert.equal(r.annualizedReturnFromPrice, null);
    assert.ok(r.entryPriceForDesiredReturn != null && r.entryPriceForDesiredReturn > 0);
    assert.ok(Math.abs(r.chartPoints[0].projectedPrice - 150) < 0.01);
    assert.ok(
      Math.abs(r.chartPoints[5].projectedPrice - targetPriceFromEpsModel(10, 0.1, 15, 5)) < 0.01,
    );
  });
});

describe("epsModelChartLabel", () => {
  it("labels year zero as today, not a future quarter", () => {
    const now = new Date("2026-09-23T12:00:00Z");
    assert.equal(epsModelChartLabel(0, { now, todayLabel: "Today" }), "Today");
    assert.equal(epsModelChartLabel(1, { now }), "Q1 2027");
    assert.equal(epsModelChartLabel(5, { now }), "Q1 2031");
  });
});
