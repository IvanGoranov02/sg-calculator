/**
 * Payout ratio as percent of earnings for one fiscal period.
 * Prefers DPS / EPS; falls back to |dividends paid| / net income.
 * Non-payers and negative/zero earnings yield null (skip the bar).
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
    return (dps / eps) * 100;
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
    return (Math.abs(paid) / ni) * 100;
  }

  return null;
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
