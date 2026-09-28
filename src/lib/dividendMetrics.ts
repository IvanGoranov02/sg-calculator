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

export type TtmDpsGrowthPills = GrowthPills;

/**
 * Uses strict TTM DPS at quarter ends (all four quarters filled). 1Y = vs 4 quarters earlier; 2/3Y = CAGR vs 8/12 quarters earlier.
 */
export function computeTtmDpsGrowthPills(ttm: (number | null)[]): TtmDpsGrowthPills {
  return computeGrowthPills(ttm, 4);
}
