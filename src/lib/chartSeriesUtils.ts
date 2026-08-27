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

/**
 * Which category-axis indexes get a label. Always first + last; stride the rest
 * so about `maxLabels` fit. Labels stay centered on their bar — unlike Recharts
 * `preserveStartEnd` + angled ticks, which drift onto the wrong columns.
 */
/** Recharts tick `x`/`y` are `string | number`; SVG text needs a finite number. */
export function tickCoord(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function axisTickVisible(index: number, total: number, maxLabels: number): boolean {
  if (total <= 0 || index < 0 || index >= total) return false;
  if (total <= maxLabels) return true;
  if (index === 0 || index === total - 1) return true;
  const stride = Math.ceil((total - 1) / (maxLabels - 1));
  if (index % stride !== 0) return false;
  // Hide a stride tick that would sit on top of the last label.
  return total - 1 - index >= Math.ceil(stride / 2);
}

