/**
 * Dividend portfolio projection: yield-based income, optional annual contributions,
 * DRIP, dividend growth, and share-price appreciation. Pure + deterministic for tests.
 *
 * Income each year: currentPrice × shares × currentYield (year 1 uses starting values).
 * Capital growth each year: currentPrice × shares × priceGrowthRate (before contributions).
 * Contributions and DRIP buy at the pre-appreciation price; then price and yield step up.
 */

export const MAX_HOLDING_YEARS = 40;

export type DividendGrowthInputs = {
  /** Current share price in the holding's currency. */
  sharePrice: number;
  /** Shares owned today. */
  shares: number;
  /** Projection horizon in whole years (1–40). */
  years: number;
  /** Annual dividend yield as a decimal (0.04 = 4%). */
  dividendYield: number;
  /** Cash added each year to buy more shares. */
  annualContribution: number;
  /** Annual dividend growth rate, decimal (0.05 = 5%/yr). */
  dividendGrowthRate: number;
  /** Annual share-price growth, decimal. */
  priceGrowthRate: number;
  /** Reinvest each year's dividends into more shares (DRIP). */
  reinvest: boolean;
};

export type DividendGrowthYear = {
  year: number;
  dividendPerShare: number;
  shares: number;
  annualIncome: number;
  monthlyIncome: number;
  cumulativeIncome: number;
  annualGrowth: number;
  cumulativeGrowth: number;
  portfolioValue: number;
  cumulativeContributions: number;
  /** Annual income as % of the original principal. */
  yieldOnCostPct: number;
};

export type ReturnBreakdown = {
  dividends: number;
  contributions: number;
  growth: number;
  principal: number;
  totalPortfolioValue: number;
  dividendsPct: number;
  contributionsPct: number;
  growthPct: number;
  principalPct: number;
};

export type DividendGrowthResult = {
  rows: DividendGrowthYear[];
  principal: number;
  breakdown: ReturnBreakdown;
  /** Total dividends earned over the horizon (headline estimate). */
  estimatedDividendReturn: number;
  startingAnnualIncome: number;
  finalAnnualIncome: number;
  totalIncome: number;
  finalShares: number;
  finalPortfolioValue: number;
  finalYieldOnCostPct: number;
};

function clampYears(years: number): number {
  if (!Number.isFinite(years)) return 0;
  return Math.max(0, Math.min(MAX_HOLDING_YEARS, Math.floor(years)));
}

function buildBreakdown(
  principal: number,
  contributions: number,
  dividends: number,
  growth: number,
): ReturnBreakdown {
  const total = principal + contributions + dividends + growth;
  const pct = (part: number) => (total > 0 ? (part / total) * 100 : 0);

  return {
    dividends,
    contributions,
    growth,
    principal,
    totalPortfolioValue: total,
    dividendsPct: pct(dividends),
    contributionsPct: pct(contributions),
    growthPct: pct(growth),
    principalPct: pct(principal),
  };
}

export function computeDividendGrowth(input: DividendGrowthInputs): DividendGrowthResult | null {
  const {
    sharePrice: p0,
    shares: s0,
    dividendYield: y0,
    annualContribution,
    dividendGrowthRate: dg,
    priceGrowthRate: pg,
    reinvest,
  } = input;
  const years = clampYears(input.years);

  const valid =
    [p0, s0, y0, annualContribution, dg, pg].every((n) => Number.isFinite(n)) &&
    p0 > 0 &&
    s0 > 0 &&
    y0 >= 0 &&
    annualContribution >= 0 &&
    years >= 1;
  if (!valid) return null;

  const principal = s0 * p0;
  const rows: DividendGrowthYear[] = [];
  let price = p0;
  let shares = s0;
  let yieldRate = y0;
  let totalDividends = 0;
  let totalContributions = 0;
  let totalGrowth = 0;

  for (let t = 1; t <= years; t++) {
    const dividendPerShare = price * yieldRate;
    const annualIncome = price * shares * yieldRate;
    const annualGrowth = price * shares * pg;

    totalDividends += annualIncome;
    totalGrowth += annualGrowth;

    if (reinvest && annualIncome > 0 && price > 0) {
      shares += annualIncome / price;
    }

    if (annualContribution > 0 && price > 0) {
      shares += annualContribution / price;
      totalContributions += annualContribution;
    }

    const endPrice = price * (1 + pg);
    const portfolioValue = shares * endPrice;

    rows.push({
      year: t,
      dividendPerShare,
      shares,
      annualIncome,
      monthlyIncome: annualIncome / 12,
      cumulativeIncome: totalDividends,
      annualGrowth,
      cumulativeGrowth: totalGrowth,
      portfolioValue,
      cumulativeContributions: totalContributions,
      yieldOnCostPct: principal > 0 ? (annualIncome / principal) * 100 : 0,
    });

    price = endPrice;
    yieldRate *= 1 + dg;
  }

  const last = rows[rows.length - 1];

  return {
    rows,
    principal,
    breakdown: buildBreakdown(principal, totalContributions, totalDividends, totalGrowth),
    estimatedDividendReturn: totalDividends,
    startingAnnualIncome: p0 * s0 * y0,
    finalAnnualIncome: last.annualIncome,
    totalIncome: totalDividends,
    finalShares: last.shares,
    finalPortfolioValue: last.portfolioValue,
    finalYieldOnCostPct: last.yieldOnCostPct,
  };
}

/** Derive a decimal yield from price and annual dividend per share. */
export function dividendYieldFromDps(sharePrice: number, annualDividendPerShare: number): number {
  if (!Number.isFinite(sharePrice) || sharePrice <= 0) return 0;
  if (!Number.isFinite(annualDividendPerShare) || annualDividendPerShare < 0) return 0;
  return annualDividendPerShare / sharePrice;
}

/** Sharesight public calculator benchmark defaults (EU page). */
export const SHARESIGHT_BENCHMARK_INPUTS: DividendGrowthInputs = {
  sharePrice: 100,
  shares: 100,
  years: 10,
  dividendYield: 0.05,
  annualContribution: 1000,
  dividendGrowthRate: 0.02,
  priceGrowthRate: 0.02,
  reinvest: false,
};

export const SHARESIGHT_BENCHMARK_EXPECTED = {
  dividends: 8764.83,
  growth: 3158.66,
  year1Monthly: 41.67,
};
