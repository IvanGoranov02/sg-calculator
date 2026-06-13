/** Shared helpers for Recharts data gaps (fundamentals cards). */

export function seriesHasAnyPoint(rows: Record<string, unknown>[], keys: string[]): boolean {
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k];
      if (v === undefined || v === null) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) return true;
    }
  }
  return false;
}

/** At least one point exists but another period is missing a value in any plotted series. */
export function seriesHasPartialGaps(rows: Record<string, unknown>[], keys: string[]): boolean {
  if (rows.length === 0 || keys.length === 0) return false;
  if (!seriesHasAnyPoint(rows, keys)) return false;
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k];
      if (v === undefined || v === null) return true;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return true;
    }
  }
  return false;
}

export type SeriesCoverage = {
  /** Periods in view (x-axis slots). */
  total: number;
  /** Periods that actually have a plotted value in any series. */
  pointCount: number;
  /** x-axis label of the first / last period that has a value. */
  firstLabel: string | null;
  lastLabel: string | null;
};

/**
 * How much of the visible range a metric actually covers — used to explain
 * sparse charts ("data only from Jun '24") instead of looking broken/empty.
 */
export function seriesCoverage(
  rows: Record<string, unknown>[],
  keys: string[],
  xKey: string,
): SeriesCoverage {
  let pointCount = 0;
  let firstLabel: string | null = null;
  let lastLabel: string | null = null;
  for (const row of rows) {
    let has = false;
    for (const k of keys) {
      const v = row[k];
      if (v === undefined || v === null) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) {
        has = true;
        break;
      }
    }
    if (!has) continue;
    pointCount++;
    const lbl = row[xKey];
    const s = lbl == null ? null : String(lbl);
    if (firstLabel === null) firstLabel = s;
    lastLabel = s;
  }
  return { total: rows.length, pointCount, firstLabel, lastLabel };
}

