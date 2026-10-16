import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computePayoutRatioPercent,
  computeTrailingPayoutRatios,
  sumQuarterlyDpsForFiscalYear,
} from "@/lib/payoutRatio";

describe("computePayoutRatioPercent", () => {
  it("uses DPS / EPS when both are usable", () => {
    assert.equal(computePayoutRatioPercent({ dps: 0.5, eps: 2 }), 25);
  });

  it("falls back to |dividends paid| / net income", () => {
    assert.equal(
      computePayoutRatioPercent({
        dps: null,
        eps: null,
        dividendsPaid: -40,
        netIncome: 200,
      }),
      20,
    );
  });

  it("returns null for non-payers, zero/negative earnings, and non-finite inputs", () => {
    assert.equal(computePayoutRatioPercent({ dps: 0, eps: 2 }), 0);
    assert.equal(computePayoutRatioPercent({ dps: null, eps: 2 }), null);
    assert.equal(
      computePayoutRatioPercent({ dps: 0.5, eps: -1, dividendsPaid: -10, netIncome: -50 }),
      null,
    );
    assert.equal(computePayoutRatioPercent({ dps: 0.5, eps: 0 }), null);
    assert.equal(computePayoutRatioPercent({ dividendsPaid: -10, netIncome: 0 }), null);
    assert.equal(computePayoutRatioPercent({ dps: Number.NaN, eps: 2 }), null);
    assert.equal(computePayoutRatioPercent({ dps: 1, eps: Number.POSITIVE_INFINITY }), null);
    assert.equal(computePayoutRatioPercent({ dividendsPaid: Number.NaN, netIncome: 10 }), null);
  });
});

describe("computeTrailingPayoutRatios", () => {
  it("needs a full 4Q window and uses TTM DPS/EPS", () => {
    const points = [
      { dps: 0.25, eps: 1 },
      { dps: 0.25, eps: 1 },
      { dps: 0.25, eps: 1 },
      { dps: 0.25, eps: 1 },
      { dps: 0.5, eps: 1 },
    ];
    const out = computeTrailingPayoutRatios(points, 4);
    assert.equal(out[0], null);
    assert.equal(out[1], null);
    assert.equal(out[2], null);
    assert.equal(out[3], 25); // 1/4
    assert.equal(out[4], 31.25); // 1.25/4
  });

  it("returns null when trailing EPS sums to ≤ 0", () => {
    const points = [
      { dps: 0.2, eps: 1 },
      { dps: 0.2, eps: 1 },
      { dps: 0.2, eps: -3 },
      { dps: 0.2, eps: 0.5 },
    ];
    const out = computeTrailingPayoutRatios(points, 4);
    assert.equal(out[3], null);
  });

  it("falls back to trailing cash dividends / NI", () => {
    const points = [
      { dividendsPaid: -10, netIncome: 40 },
      { dividendsPaid: -10, netIncome: 40 },
      { dividendsPaid: -10, netIncome: 40 },
      { dividendsPaid: -10, netIncome: 40 },
    ];
    const out = computeTrailingPayoutRatios(points, 4);
    assert.equal(out[3], 25);
  });
});

describe("sumQuarterlyDpsForFiscalYear", () => {
  it("sums DPS in the matching calendar year", () => {
    const points = [
      { date: "2024-03-31", dividendPerShare: 0.2 },
      { date: "2024-06-30", dividendPerShare: 0.2 },
      { date: "2024-09-30", dividendPerShare: 0.25 },
      { date: "2024-12-31", dividendPerShare: 0.25 },
      { date: "2025-03-31", dividendPerShare: 0.3 },
    ];
    assert.equal(sumQuarterlyDpsForFiscalYear("2024", points), 0.9);
    assert.equal(sumQuarterlyDpsForFiscalYear("2025", points), 0.3);
    assert.equal(sumQuarterlyDpsForFiscalYear("2023", points), null);
  });
});
