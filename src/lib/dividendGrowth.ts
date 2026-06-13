/**
 * Dividend growth projection: compound a starting dividend at a growth rate over
 * a horizon, optionally reinvesting (DRIP) into more shares at a growing price.
 * Pure + deterministic so it can be unit-tested and run client-side.
 */

export type DividendGrowthInputs = {
  /** Current annual dividend per share (in the holding's currency). */
  annualDividendPerShare: number;
  /** Annual dividend growth rate, decimal (0.06 = 6%/yr). */
  dividendGrowthRate: number;
  /** Shares owned today. */
  shares: number;
  /** Projection horizon in whole years (1–60). */
  years: number;
  /** Current share price — basis for yield-on-cost and DRIP reinvestment. */
  sharePrice: number;
  /** Annual share-price growth, decimal — only used when reinvesting. */
  priceGrowthRate: number;
  /** Reinvest each year's dividends into more shares (DRIP). */
  reinvest: boolean;
};

export type DividendGrowthYear = {
  year: number;
  dividendPerShare: number;
  shares: number;
  annualIncome: number;
  cumulativeIncome: number;
  /** Annual income as % of the original cost basis. */
  yieldOnCostPct: number;
};

export type DividendGrowthResult = {
  rows: DividendGrowthYear[];
  initialCost: number;
  /** Starting annual income (year 0, before any growth). */
  startingAnnualIncome: number;
  finalAnnualIncome: number;
  totalIncome: number;
  finalShares: number;
  finalYieldOnCostPct: number;
};

function clampYears(years: number): number {
  if (!Number.isFinite(years)) return 0;
  return Math.max(0, Math.min(60, Math.floor(years)));
}

export function computeDividendGrowth(input: DividendGrowthInputs): DividendGrowthResult | null {
  const { annualDividendPerShare: dps0, dividendGrowthRate: g, sharePrice, priceGrowthRate } = input;
  const shares0 = input.shares;
  const years = clampYears(input.years);

  const valid =
    [dps0, g, shares0, sharePrice, priceGrowthRate].every((n) => Number.isFinite(n)) &&
    dps0 >= 0 &&
    shares0 > 0 &&
    sharePrice > 0 &&
    years >= 1;
  if (!valid) return null;

  const initialCost = shares0 * sharePrice;
  const rows: DividendGrowthYear[] = [];
  let shares = shares0;
  let cumulative = 0;

  for (let t = 1; t <= years; t++) {
    const dps = dps0 * (1 + g) ** t;
    // Income earned on shares held at the start of the year.
    const annualIncome = shares * dps;
    cumulative += annualIncome;

    if (input.reinvest) {
      const reinvestPrice = sharePrice * (1 + priceGrowthRate) ** t;
      if (reinvestPrice > 0) shares += annualIncome / reinvestPrice;
    }

    rows.push({
      year: t,
      dividendPerShare: dps,
      shares,
      annualIncome,
      cumulativeIncome: cumulative,
      yieldOnCostPct: initialCost > 0 ? (annualIncome / initialCost) * 100 : 0,
    });
  }

  const last = rows[rows.length - 1];
  return {
    rows,
    initialCost,
    startingAnnualIncome: shares0 * dps0,
    finalAnnualIncome: last.annualIncome,
    totalIncome: cumulative,
    finalShares: last.shares,
    finalYieldOnCostPct: last.yieldOnCostPct,
  };
}
