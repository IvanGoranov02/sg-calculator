import { fiscalAnniversary, isCompleteQuarterlyPeriod, periodEndDate } from "@/lib/fiscalPeriods";

/** Keep a failed FX conversion from turning a mixed dividend series into mislabeled amounts. */
export function dividendSeriesInOneCurrency(
  points: ReadonlyArray<{ date: string; dividendPerShare: number | null }>,
  input: {
    fundamentalsCurrency: string;
    quoteCurrency: string;
    listingDates?: ReadonlyArray<string>;
    listingSeriesCurrency?: string;
  },
): { currency: string; points: Array<{ date: string; dividendPerShare: number | null }> } {
  if (input.fundamentalsCurrency === input.quoteCurrency) {
    return { currency: input.quoteCurrency, points: [...points] };
  }
  if (input.listingSeriesCurrency === input.quoteCurrency) {
    return { currency: input.quoteCurrency, points: [...points] };
  }
  const listingDates = new Set(input.listingDates?.map((date) => date.slice(0, 10)));
  const hasListingCash = points.some((point) => point.dividendPerShare != null && point.dividendPerShare > 0
    && listingDates.has(point.date.slice(0, 10)));
  if (!hasListingCash) return { currency: input.fundamentalsCurrency, points: [...points] };
  return {
    currency: input.quoteCurrency,
    points: points.map((point) => listingDates.has(point.date.slice(0, 10)) || point.dividendPerShare === 0
      ? { ...point } : { ...point, dividendPerShare: null }),
  };
}

/**
 * Payout ratio as percent of earnings for one fiscal period.
 * Prefers DPS / EPS; falls back to |dividends paid| / net income.
 * Missing inputs and non-positive earnings yield null (skip the bar).
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
  date?: string;
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
  if (!Number.isInteger(window) || window <= 0) {
    return points.map(() => null);
  }
  return points.map((_, i) => {
    if (i + 1 < window) return null;
    const slice = points.slice(i - window + 1, i + 1);
    if (slice.some((p) => p.date != null)) {
      const dates = slice.map((p) => p.date != null ? periodEndDate(p.date)?.getTime() : undefined);
      if (dates.some((d) => d == null)) return null;
      if (dates.slice(1).some((date, index) => {
        const days = (date! - dates[index]!) / 86_400_000;
        return days < 60 || days > 120;
      })) return null;
      if (window === 4 && !isCompleteQuarterlyPeriod(slice.map((p) => ({ date: p.date! })))) return null;
    }

    let dpsSum = 0;
    let epsSum = 0;
    let completePerShare = true;
    for (const p of slice) {
      if (p.dps != null && Number.isFinite(p.dps) && p.dps >= 0) {
        dpsSum += p.dps;
      } else completePerShare = false;
      if (p.eps != null && Number.isFinite(p.eps)) {
        epsSum += p.eps;
      } else completePerShare = false;
    }
    if (completePerShare && epsSum > 0) {
      const pct = (dpsSum / epsSum) * 100;
      return Number.isFinite(pct) ? pct : null;
    }

    let paidSum = 0;
    let niSum = 0;
    let completeCash = true;
    for (const p of slice) {
      if (p.dividendsPaid != null && Number.isFinite(p.dividendsPaid)) {
        paidSum += Math.abs(p.dividendsPaid);
      } else completeCash = false;
      if (p.netIncome != null && Number.isFinite(p.netIncome)) {
        niSum += p.netIncome;
      } else completeCash = false;
    }
    if (completeCash && niSum > 0) {
      const pct = (paidSum / niSum) * 100;
      return Number.isFinite(pct) ? pct : null;
    }
    return null;
  });
}
/** Sum a complete four-quarter DPS series within the annual statement's fiscal period. */
export function sumQuarterlyDpsForFiscalYear(
  fiscalYear: string,
  points: ReadonlyArray<{ date: string; dividendPerShare: number | null }>,
  annualPeriodEnd: string,
  previousAnnualPeriodEnd?: string,
): number | null {
  if (!/^\d{4}$/.test(fiscalYear)) return null;
  const end = periodEndDate(annualPeriodEnd);
  if (!end) return null;
  const previous = previousAnnualPeriodEnd ? periodEndDate(previousAnnualPeriodEnd) : null;
  const spanDays = previous ? (end.getTime() - previous.getTime()) / 86_400_000 : 0;
  const start = previous && spanDays >= 340 && spanDays <= 390
    ? previous
    : fiscalAnniversary(end, end.getUTCFullYear() - 1);
  const quarters = points.filter((point) => {
    const date = periodEndDate(point.date);
    return date != null && date > start && date <= end;
  });
  if (!isCompleteQuarterlyPeriod(quarters)) return null;
  const lastQuarter = Math.max(...quarters.map((point) => periodEndDate(point.date)!.getTime()));
  if (end.getTime() - lastQuarter > 45 * 86_400_000) return null;
  let sum = 0;
  for (const p of quarters) {
    const v = p.dividendPerShare;
    if (v == null || !Number.isFinite(v) || v < 0) return null;
    sum += v;
  }
  return sum;
}
