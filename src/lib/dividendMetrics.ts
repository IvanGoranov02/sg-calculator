/** Rolling TTM (4 quarters) and growth stats for dividend-per-share series. */

export function rollingSum4Quarterly(values: (number | null)[]): (number | null)[] {
  return values.map((_, i) => {
    if (i < 3) return null;
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      const v = values[i - j];
      if (v == null || !Number.isFinite(v)) return null;
      sum += v;
    }
    return sum;
  });
}

/**
 * Sums the last four quarter slots; ignores nulls (sums known payments only).
 * `partial[i]` is true when any of the four slots was null — not a full TTM, but avoids empty charts when Yahoo omits some quarters.
 */
export function rollingSum4QuarterlyLoose(values: (number | null)[]): {
  sums: (number | null)[];
  partial: boolean[];
} {
  const sums: (number | null)[] = [];
  const partial: boolean[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < 3) {
      sums.push(null);
      partial.push(false);
      continue;
    }
    let s = 0;
    let any = false;
    let anyNull = false;
    for (let j = 0; j < 4; j++) {
      const v = values[i - j];
      if (v == null || !Number.isFinite(v)) {
        anyNull = true;
      } else {
        s += v;
        any = true;
      }
    }
    if (!any) {
      sums.push(null);
      partial.push(false);
    } else {
      sums.push(s);
      partial.push(anyNull);
    }
  }
  return { sums, partial };
}

export type TtmDpsGrowthPills = {
  oneYear: number | null;
  twoYear: number | null;
  fiveYear: number | null;
  tenYear: number | null;
};

/**
 * Uses strict TTM DPS at quarter ends (all four quarters filled). 1Y = vs 4 quarters earlier; 2/5/10Y = CAGR vs 8/20/40 quarters earlier.
 */
export function computeTtmDpsGrowthPills(ttm: (number | null)[]): TtmDpsGrowthPills {
  let last = -1;
  for (let i = ttm.length - 1; i >= 0; i--) {
    const v = ttm[i];
    if (v != null && Number.isFinite(v)) {
      last = i;
      break;
    }
  }
  if (last < 0) return { oneYear: null, twoYear: null, fiveYear: null, tenYear: null };

  const end = ttm[last] as number;

  function startVal(quartersBack: number): number | null {
    const idx = last - quartersBack;
    if (idx < 0) return null;
    const v = ttm[idx];
    if (v == null || !Number.isFinite(v)) return null;
    return v;
  }

  function cagr(start: number, endVal: number, years: number): number | null {
    if (start <= 0 || endVal < 0 || !Number.isFinite(start) || !Number.isFinite(endVal) || years <= 0) {
      return null;
    }
    return (Math.pow(endVal / start, 1 / years) - 1) * 100;
  }

  const oneYear = (() => {
    const s = startVal(4);
    if (s == null || s === 0) return null;
    return ((end - s) / s) * 100;
  })();

  const twoYear = (() => {
    const s = startVal(8);
    return s != null && s > 0 && end >= 0 ? cagr(s, end, 2) : null;
  })();

  const fiveYear = (() => {
    const s = startVal(20);
    return s != null && s > 0 && end >= 0 ? cagr(s, end, 5) : null;
  })();

  const tenYear = (() => {
    const s = startVal(40);
    return s != null && s > 0 && end >= 0 ? cagr(s, end, 10) : null;
  })();

  return { oneYear, twoYear, fiveYear, tenYear };
}
