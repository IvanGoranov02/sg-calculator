/**
 * Payout ratio as percent of earnings for one fiscal period.
 * Prefers DPS / EPS; falls back to |dividends paid| / net income.
 * Non-payers and non-positive earnings yield null (skip the bar).
 * Never returns Infinity/NaN.
 */
export function computePayoutRatioPercent(input: {
  dps?: number | null;
  eps?: number | null;
  dividendsPaid?: number | null;
  netIncome?: number | null;
}): number | null {
  const dps = input.dps;
  const eps = input.eps;
  if (
    dps != null &&
    Number.isFinite(dps) &&
    dps >= 0 &&
    eps != null &&
    Number.isFinite(eps) &&
    eps > 0
  ) {
    const pct = (dps / eps) * 100;
    return Number.isFinite(pct) ? pct : null;
  }

  const paid = input.dividendsPaid;
  const ni = input.netIncome;
  if (
    paid != null &&
    Number.isFinite(paid) &&
    ni != null &&
    Number.isFinite(ni) &&
    ni > 0
  ) {
    const pct = (Math.abs(paid) / ni) * 100;
    return Number.isFinite(pct) ? pct : null;
  }

  return null;
}

export type PayoutInputs = {
  dps?: number | null;
  eps?: number | null;
  dividendsPaid?: number | null;
  netIncome?: number | null;
};

/**
 * Trailing-window payout ratios for quarterly series (default 4Q = TTM).
 * At each index i, sums DPS/EPS (or cash dividends / NI) over [i-window+1, i].
 * Returns null until a full window is available, or when trailing earnings ≤ 0.
 */
export function computeTrailingPayoutRatios(
  points: ReadonlyArray<PayoutInputs>,
  window = 4,
): (number | null)[] {
  if (!Number.isFinite(window) || window <= 0) {
    return points.map(() => null);
  }
  return points.map((_, i) => {
    if (i + 1 < window) return null;
    const slice = points.slice(i - window + 1, i + 1);

    let dpsSum = 0;
    let epsSum = 0;
    let hasDps = false;
    let hasEps = false;
    for (const p of slice) {
      if (p.dps != null && Number.isFinite(p.dps) && p.dps >= 0) {
        dpsSum += p.dps;
        hasDps = true;
      }
      if (p.eps != null && Number.isFinite(p.eps)) {
        epsSum += p.eps;
        hasEps = true;
      }
    }
    if (hasDps && hasEps && epsSum > 0) {
      const pct = (dpsSum / epsSum) * 100;
      return Number.isFinite(pct) ? pct : null;
    }

    let paidSum = 0;
    let niSum = 0;
    let hasPaid = false;
    let hasNi = false;
    for (const p of slice) {
      if (p.dividendsPaid != null && Number.isFinite(p.dividendsPaid)) {
        paidSum += Math.abs(p.dividendsPaid);
        hasPaid = true;
      }
      if (p.netIncome != null && Number.isFinite(p.netIncome)) {
        niSum += p.netIncome;
        hasNi = true;
      }
    }
    if (hasPaid && hasNi && niSum > 0) {
      const pct = (paidSum / niSum) * 100;
      return Number.isFinite(pct) ? pct : null;
    }
    return null;
  });
}

/** Sum quarterly DPS whose calendar year matches a fiscal year label. */
export function sumQuarterlyDpsForFiscalYear(
  fiscalYear: string,
  points: ReadonlyArray<{ date: string; dividendPerShare: number | null }>,
): number | null {
  const fy = parseInt(fiscalYear, 10);
  if (!Number.isFinite(fy)) return null;
  let sum = 0;
  let any = false;
  for (const p of points) {
    const y = new Date(`${p.date.slice(0, 10)}T12:00:00Z`).getUTCFullYear();
    if (y !== fy) continue;
    const v = p.dividendPerShare;
    if (v == null || !Number.isFinite(v) || v < 0) continue;
    sum += v;
    any = true;
  }
  return any ? sum : null;
}
