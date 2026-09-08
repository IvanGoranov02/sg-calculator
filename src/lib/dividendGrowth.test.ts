import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeDividendGrowth,
  dividendYieldFromDps,
  MAX_HOLDING_YEARS,
  SHARESIGHT_BENCHMARK_EXPECTED,
  SHARESIGHT_BENCHMARK_INPUTS,
  type DividendGrowthInputs,
} from "@/lib/dividendGrowth";

const base: DividendGrowthInputs = {
  sharePrice: 50,
  shares: 100,
  years: 3,
  dividendYield: 0.02,
  annualContribution: 0,
  dividendGrowthRate: 0.1,
  priceGrowthRate: 0,
  reinvest: false,
};

function near(actual: number, expected: number, tol = 1e-6): void {
  assert.ok(Math.abs(actual - expected) < tol, `expected ${expected}, got ${actual}`);
}

describe("computeDividendGrowth", () => {
  it("matches Sharesight public calculator benchmark", () => {
    const r = computeDividendGrowth(SHARESIGHT_BENCHMARK_INPUTS)!;
    near(r.estimatedDividendReturn, SHARESIGHT_BENCHMARK_EXPECTED.dividends, 0.02);
    near(r.breakdown.growth, SHARESIGHT_BENCHMARK_EXPECTED.growth, 0.02);
    near(r.rows[0].monthlyIncome, SHARESIGHT_BENCHMARK_EXPECTED.year1Monthly, 0.02);
  });

  it("has zero growth when DRIP is off and appreciation is 0%", () => {
    const r = computeDividendGrowth({
      ...SHARESIGHT_BENCHMARK_INPUTS,
      priceGrowthRate: 0,
    })!;
    assert.equal(r.breakdown.growth, 0);
  });

  it("pays year-1 income on starting price × shares × yield", () => {
    const r = computeDividendGrowth(base)!;
    near(r.rows[0].annualIncome, 50 * 100 * 0.02);
    near(r.rows[0].dividendPerShare, 1);
    assert.equal(r.finalShares, 100);
  });

  it("grows yield after each year (year-2 DPS reflects prior growth)", () => {
    const r = computeDividendGrowth(base)!;
    near(r.rows[1].dividendPerShare, 1.1);
    near(r.rows[2].dividendPerShare, 1.21);
  });

  it("computes yield on cost against the original principal", () => {
    const r = computeDividendGrowth(base)!;
    assert.equal(r.principal, 5000);
    near(r.rows[0].yieldOnCostPct, 2);
  });

  it("accumulates total income across the horizon", () => {
    const r = computeDividendGrowth(base)!;
    const expected = 100 + 110 + 121;
    near(r.totalIncome, expected);
    near(r.estimatedDividendReturn, expected);
  });

  it("grows the share count when reinvesting (DRIP)", () => {
    const r = computeDividendGrowth({ ...base, reinvest: true })!;
    assert.ok(r.finalShares > 100, "shares should grow with DRIP");
    near(r.rows[0].shares, 102);
  });

  it("adds shares from annual contributions at pre-appreciation price", () => {
    const r = computeDividendGrowth({ ...base, annualContribution: 500 })!;
    assert.ok(r.finalShares > 100);
    assert.equal(r.breakdown.contributions, 1500);
  });

  it("tracks monthly income as annual / 12", () => {
    const r = computeDividendGrowth(base)!;
    near(r.rows[0].monthlyIncome, r.rows[0].annualIncome / 12);
  });

  it("returns null on invalid input", () => {
    assert.equal(computeDividendGrowth({ ...base, shares: 0 }), null);
    assert.equal(computeDividendGrowth({ ...base, sharePrice: 0 }), null);
    assert.equal(computeDividendGrowth({ ...base, years: 0 }), null);
    assert.equal(computeDividendGrowth({ ...base, dividendYield: NaN }), null);
  });

  it(`clamps the horizon to ${MAX_HOLDING_YEARS} years`, () => {
    const r = computeDividendGrowth({ ...base, years: 999 })!;
    assert.equal(r.rows.length, MAX_HOLDING_YEARS);
  });

  it("handles a zero starting yield without crashing", () => {
    const r = computeDividendGrowth({ ...base, dividendYield: 0 })!;
    assert.equal(r.finalAnnualIncome, 0);
    assert.equal(r.totalIncome, 0);
  });
});

describe("dividendYieldFromDps", () => {
  it("derives yield from price and DPS", () => {
    assert.equal(dividendYieldFromDps(50, 2), 0.04);
    assert.equal(dividendYieldFromDps(0, 2), 0);
  });
});
