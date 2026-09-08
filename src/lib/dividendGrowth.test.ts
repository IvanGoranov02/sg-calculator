import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeDividendGrowth,
  dividendYieldFromDps,
  MAX_HOLDING_YEARS,
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

describe("computeDividendGrowth", () => {
  it("compounds the dividend per share each year (no reinvest)", () => {
    const r = computeDividendGrowth(base)!;
    assert.equal(r.rows.length, 3);
    assert.ok(Math.abs(r.rows[0].dividendPerShare - 1.1) < 1e-9);
    assert.ok(Math.abs(r.rows[1].dividendPerShare - 1.21) < 1e-9);
    assert.ok(Math.abs(r.rows[2].dividendPerShare - 1.331) < 1e-9);
    assert.equal(r.finalShares, 100);
    assert.ok(Math.abs(r.rows[0].annualIncome - 110) < 1e-9);
  });

  it("computes yield on cost against the original principal", () => {
    const r = computeDividendGrowth(base)!;
    assert.equal(r.principal, 5000);
    assert.ok(Math.abs(r.rows[0].yieldOnCostPct - 2.2) < 1e-9);
  });

  it("accumulates total income across the horizon", () => {
    const r = computeDividendGrowth(base)!;
    const expected = 110 + 121 + 133.1;
    assert.ok(Math.abs(r.totalIncome - expected) < 1e-6);
    assert.ok(Math.abs(r.estimatedDividendReturn - expected) < 1e-6);
  });

  it("grows the share count when reinvesting (DRIP)", () => {
    const r = computeDividendGrowth({ ...base, reinvest: true })!;
    assert.ok(r.finalShares > 100, "shares should grow with DRIP");
    assert.ok(Math.abs(r.rows[0].shares - 102.2) < 1e-9);
  });

  it("adds shares from annual contributions", () => {
    const r = computeDividendGrowth({ ...base, annualContribution: 500 })!;
    assert.ok(r.finalShares > 100);
    assert.equal(r.breakdown.contributions, 1500);
  });

  it("builds a portfolio breakdown that sums to final value", () => {
    const r = computeDividendGrowth({
      ...base,
      annualContribution: 1000,
      reinvest: true,
      priceGrowthRate: 0.07,
      years: 5,
    })!;
    const { breakdown } = r;
    const sum = breakdown.principal + breakdown.contributions + breakdown.dividends + breakdown.growth;
    assert.ok(Math.abs(sum - breakdown.totalPortfolioValue) < 1e-6);
    assert.ok(Math.abs(breakdown.totalPortfolioValue - r.finalPortfolioValue) < 1e-6);
  });

  it("tracks monthly income as annual / 12", () => {
    const r = computeDividendGrowth(base)!;
    assert.ok(Math.abs(r.rows[0].monthlyIncome - r.rows[0].annualIncome / 12) < 1e-9);
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
