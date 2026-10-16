import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeDividendGrowth,
  buildDividendGrowthChartRows,
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
  it("matches independently calculated DPS growth and pre-appreciation contributions", () => {
    const r = computeDividendGrowth(SHARESIGHT_BENCHMARK_INPUTS)!;
    // Independent closed form: shares at the beginning of year t are initial
    // shares + sum(contribution / price_k) for earlier years. Annual DPS grows
    // independently of price; all contributions appreciate from their buy date.
    const { sharePrice, shares, annualContribution, dividendYield, dividendGrowthRate, priceGrowthRate, years } = SHARESIGHT_BENCHMARK_INPUTS;
    let expectedDividends = 0;
    let expectedEndValue = sharePrice * shares * (1 + priceGrowthRate) ** years;
    for (let year = 1; year <= years; year++) {
      const priorContributions = Array.from({ length: year - 1 }, (_, k) => annualContribution / (sharePrice * (1 + priceGrowthRate) ** k));
      expectedDividends += (shares + priorContributions.reduce((sum, qty) => sum + qty, 0)) * sharePrice * dividendYield * (1 + dividendGrowthRate) ** (year - 1);
      expectedEndValue += annualContribution * (1 + priceGrowthRate) ** (years - year + 1);
    }
    near(r.totalIncome, expectedDividends);
    near(r.finalPortfolioValue, expectedEndValue);
    near(r.breakdown.growth, expectedEndValue - r.principal - annualContribution * years);
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

  it("grows DPS after each year", () => {
    const r = computeDividendGrowth(base)!;
    near(r.rows[1].dividendPerShare, 1.1);
    near(r.rows[2].dividendPerShare, 1.21);
  });

  it("grows DPS independently of share-price appreciation", () => {
    const r = computeDividendGrowth({ ...base, sharePrice: 100, shares: 1, dividendYield: 0.05, dividendGrowthRate: 0.05, priceGrowthRate: 0.1 })!;
    near(r.rows[0].dividendPerShare, 5);
    near(r.rows[1].dividendPerShare, 5.25);
    near(r.rows[2].dividendPerShare, 5.5125);
    const unchanged = computeDividendGrowth({ ...base, dividendGrowthRate: 0, priceGrowthRate: 0.1 })!;
    near(unchanged.rows[2].dividendPerShare, unchanged.rows[0].dividendPerShare);
  });

  it("keeps the return breakdown consistent with stock value and dividends paid out", () => {
    for (const reinvest of [false, true]) {
      const r = computeDividendGrowth({ ...base, annualContribution: 500, priceGrowthRate: 0.1, reinvest })!;
      near(r.breakdown.totalPortfolioValue, r.finalPortfolioValue + (reinvest ? 0 : r.totalIncome));
    }
    const oneYear = computeDividendGrowth({ ...base, sharePrice: 100, shares: 1, years: 1, dividendYield: 0, annualContribution: 100, priceGrowthRate: 0.1 })!;
    near(oneYear.finalPortfolioValue, 220);
    near(oneYear.breakdown.growth, 20);
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
    assert.equal(computeDividendGrowth({ ...base, priceGrowthRate: -1 }), null);
    assert.equal(computeDividendGrowth({ ...base, priceGrowthRate: -2 }), null);
    assert.equal(computeDividendGrowth({ ...base, dividendGrowthRate: -2 }), null);
    assert.equal(computeDividendGrowth({ ...base, sharePrice: 1e308, shares: 100 }), null);
    assert.equal(computeDividendGrowth({ ...base, dividendGrowthRate: 1e100, years: 40 }), null);
  });

  it("allows declining prices and a complete dividend cut without negative cash flows", () => {
    const r = computeDividendGrowth({ ...base, dividendGrowthRate: -1, priceGrowthRate: -0.5 })!;
    near(r.rows[0].annualIncome, 100);
    near(r.rows[1].annualIncome, 0);
    assert.ok(r.finalPortfolioValue >= 0);
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

describe("buildDividendGrowthChartRows", () => {
  it("retains fractional monthly cash instead of turning a small portfolio's income into zero", () => {
    const result = computeDividendGrowth({ ...base, shares: 0.1, dividendYield: 0.084 })!;
    const rows = buildDividendGrowthChartRows(result);
    near(rows[0].annualIncome, 0.42);
    near(rows[0].monthlyIncome, 0.035);
    assert.equal(rows[0].portfolioValue, result.rows[0].portfolioValue);
    assert.deepEqual(buildDividendGrowthChartRows(null), []);
  });
});

describe("dividendYieldFromDps", () => {
  it("derives yield from price and DPS", () => {
    assert.equal(dividendYieldFromDps(50, 2), 0.04);
    assert.equal(dividendYieldFromDps(0, 2), 0);
  });
});
