import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  annualizedReturnBetweenPrices,
  computeEpsModel,
  entryPriceForTargetReturn,
  EPS_MODEL_HORIZON_YEARS,
  targetPriceFromEpsModel,
} from "@/lib/epsModel";

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
});
