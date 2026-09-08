/**
 * Dividend portfolio projection: yield-based income, optional annual contributions,
 * DRIP, dividend growth, and share-price appreciation. Pure + deterministic for tests.
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
  finalPortfolioValue: number,
): ReturnBreakdown {
  const growth = finalPortfolioValue - principal - contributions - dividends;
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
    dividendGrowthRate: g,
    priceGrowthRate: pg,
    reinvest,
  } = input;
  const years = clampYears(input.years);

  const valid =
    [p0, s0, y0, annualContribution, g, pg].every((n) => Number.isFinite(n)) &&
    p0 > 0 &&
    s0 > 0 &&
    y0 >= 0 &&
    annualContribution >= 0 &&
    years >= 1;
  if (!valid) return null;

  const principal = s0 * p0;
  const rows: DividendGrowthYear[] = [];
  let shares = s0;
  let totalDividends = 0;
  let totalContributions = 0;

  for (let t = 1; t <= years; t++) {
    const dps = p0 * y0 * (1 + g) ** t;
    const currentPrice = p0 * (1 + pg) ** t;
    const annualIncome = shares * dps;
    totalDividends += annualIncome;

    if (reinvest && annualIncome > 0 && currentPrice > 0) {
      shares += annualIncome / currentPrice;
    }

    if (annualContribution > 0 && currentPrice > 0) {
      shares += annualContribution / currentPrice;
      totalContributions += annualContribution;
    }

    const portfolioValue = shares * currentPrice;

    rows.push({
      year: t,
      dividendPerShare: dps,
      shares,
      annualIncome,
      monthlyIncome: annualIncome / 12,
      cumulativeIncome: totalDividends,
      portfolioValue,
      cumulativeContributions: totalContributions,
      yieldOnCostPct: principal > 0 ? (annualIncome / principal) * 100 : 0,
    });
  }

  const last = rows[rows.length - 1];
  const finalPrice = p0 * (1 + pg) ** years;
  const finalPortfolioValue = shares * finalPrice;

  return {
    rows,
    principal,
    breakdown: buildBreakdown(principal, totalContributions, totalDividends, finalPortfolioValue),
    estimatedDividendReturn: totalDividends,
    startingAnnualIncome: s0 * p0 * y0,
    finalAnnualIncome: last.annualIncome,
    totalIncome: totalDividends,
    finalShares: last.shares,
    finalPortfolioValue,
    finalYieldOnCostPct: last.yieldOnCostPct,
  };
}

/** Derive a decimal yield from price and annual dividend per share. */
export function dividendYieldFromDps(sharePrice: number, annualDividendPerShare: number): number {
  if (!Number.isFinite(sharePrice) || sharePrice <= 0) return 0;
  if (!Number.isFinite(annualDividendPerShare) || annualDividendPerShare < 0) return 0;
  return annualDividendPerShare / sharePrice;
}
