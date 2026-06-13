import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeDividendGrowth, type DividendGrowthInputs } from "@/lib/dividendGrowth";

const base: DividendGrowthInputs = {
  annualDividendPerShare: 1,
  dividendGrowthRate: 0.1,
  shares: 100,
  years: 3,
  sharePrice: 50,
  priceGrowthRate: 0,
  reinvest: false,
};

describe("computeDividendGrowth", () => {
  it("compounds the dividend per share each year (no reinvest)", () => {
    const r = computeDividendGrowth(base)!;
    assert.equal(r.rows.length, 3);
    assert.ok(Math.abs(r.rows[0].dividendPerShare - 1.1) < 1e-9);
    assert.ok(Math.abs(r.rows[1].dividendPerShare - 1.21) < 1e-9);
    assert.ok(Math.abs(r.rows[2].dividendPerShare - 1.331) < 1e-9);
    // shares unchanged without DRIP
    assert.equal(r.finalShares, 100);
    // year 1 income = 100 * 1.1
    assert.ok(Math.abs(r.rows[0].annualIncome - 110) < 1e-9);
  });

  it("computes yield on cost against the original basis", () => {
    const r = computeDividendGrowth(base)!;
    // initial cost = 100 * 50 = 5000; year1 income 110 → 2.2%
    assert.equal(r.initialCost, 5000);
    assert.ok(Math.abs(r.rows[0].yieldOnCostPct - 2.2) < 1e-9);
  });

  it("accumulates total income across the horizon", () => {
    const r = computeDividendGrowth(base)!;
    const expected = 110 + 121 + 133.1;
    assert.ok(Math.abs(r.totalIncome - expected) < 1e-6);
  });

  it("grows the share count when reinvesting (DRIP)", () => {
    const r = computeDividendGrowth({ ...base, reinvest: true })!;
    assert.ok(r.finalShares > 100, "shares should grow with DRIP");
    // year 1: income 110 reinvested at price 50 → +2.2 shares
    assert.ok(Math.abs(r.rows[0].shares - 102.2) < 1e-9);
  });

  it("returns null on invalid input", () => {
    assert.equal(computeDividendGrowth({ ...base, shares: 0 }), null);
    assert.equal(computeDividendGrowth({ ...base, sharePrice: 0 }), null);
    assert.equal(computeDividendGrowth({ ...base, years: 0 }), null);
    assert.equal(computeDividendGrowth({ ...base, annualDividendPerShare: NaN }), null);
  });

  it("clamps the horizon to a sane maximum", () => {
    const r = computeDividendGrowth({ ...base, years: 999 })!;
    assert.equal(r.rows.length, 60);
  });

  it("handles a zero starting dividend without crashing", () => {
    const r = computeDividendGrowth({ ...base, annualDividendPerShare: 0 })!;
    assert.equal(r.finalAnnualIncome, 0);
    assert.equal(r.totalIncome, 0);
  });
});
