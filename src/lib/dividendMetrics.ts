import { computeGrowthPills, type GrowthPills } from "@/lib/growthPills";

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
    // First quarters in the window: no full 4Q TTM yet — show partial sum (1–3Q) so bars render; still partial.
    if (i < 3) {
      let s = 0;
      let any = false;
      let anyNull = false;
      for (let j = 0; j <= i; j++) {
        const v = values[j];
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
        partial.push(true);
      }
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

export type TtmDpsGrowthPills = GrowthPills;

/**
 * Uses strict TTM DPS at quarter ends (all four quarters filled). 1Y = vs 4 quarters earlier; 2/5/10Y = CAGR vs 8/20/40 quarters earlier.
 */
export function computeTtmDpsGrowthPills(ttm: (number | null)[]): TtmDpsGrowthPills {
  return computeGrowthPills(ttm, 4);
}
