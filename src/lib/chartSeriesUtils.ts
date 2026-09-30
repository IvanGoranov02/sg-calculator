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

/** Recharts tick `x`/`y` are `string | number`; SVG text needs a finite number. */
export function tickCoord(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** "Sep 24" / "FY 2024" at 10px. Wider than this and neighboring ticks collide. */
const FULL_LABEL_PX = 34;
/** "2024" at 10px — used when month labels would overlap. */
const YEAR_LABEL_PX = 22;
/** Y-axis width plus chart margins, subtracted from the card's plot box. */
const AXIS_CHROME_PX = 76;

/**
 * Calendar year for an axis category: ISO period end, "FY 2024", "Sep 24", or "Apr 26, 26".
 * Returns null when the label has no year (the caller then treats that point as its own group).
 */
export function categoryYearKey(category: string): string | null {
  const iso = /^(\d{4})-\d{2}-\d{2}/.exec(category);
  if (iso) return iso[1]!;
  const y4 = /\b((?:19|20)\d{2})\b/.exec(category);
  if (y4) return y4[1]!;
  const twos = category.match(/\d{2}/g);
  if (!twos || twos.length === 0) return null;
  const n = Number(twos[twos.length - 1]);
  if (!Number.isFinite(n)) return null;
  return String(2000 + n);
}

/** Category-axis width inside a chart box that also draws the Y axis. */
export function categoryAxisWidth(plotWidth: number): number {
  if (!Number.isFinite(plotWidth) || plotWidth <= 0) return 220;
  return Math.max(FULL_LABEL_PX * 2, plotWidth - AXIS_CHROME_PX);
}

type YearGroup = { indexes: number[] };

function yearGroups(categories: string[]): YearGroup[] {
  const groups: YearGroup[] = [];
  const pos = new Map<string, number>();
  for (let i = 0; i < categories.length; i++) {
    const y = categoryYearKey(categories[i] ?? "") ?? `\0${i}`;
    let at = pos.get(y);
    if (at == null) {
      at = groups.length;
      pos.set(y, at);
      groups.push({ indexes: [] });
    }
    groups[at]!.indexes.push(i);
  }
  return groups;
}

/**
 * One index per year, spread across the axis. Each pick stays inside that year's
 * real categories — nothing is invented for a year the series does not contain.
 */
function spaceYearAnchors(groups: YearGroup[]): number[] {
  const m = groups.length;
  if (m === 0) return [];
  const first = groups[0]!.indexes[0]!;
  const last = groups[m - 1]!.indexes[groups[m - 1]!.indexes.length - 1]!;
  const chosen: number[] = [];
  for (let g = 0; g < m; g++) {
    const ideal = first + (g * (last - first)) / Math.max(1, m - 1);
    let best: number | null = null;
    let bestDist = Infinity;
    for (const i of groups[g]!.indexes) {
      if (chosen.length > 0 && i <= chosen[chosen.length - 1]!) continue;
      let laterOk = true;
      for (let k = 0; k < m - g - 1; k++) {
        const later = groups[g + 1 + k]!.indexes;
        if (!later.some((x) => x >= i + (k + 1))) {
          laterOk = false;
          break;
        }
      }
      if (!laterOk) continue;
      const dist = Math.abs(i - ideal);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best == null) continue;
    chosen.push(best);
  }
  return chosen;
}

function thinToMinGap(indexes: number[], minGap: number): number[] {
  if (minGap <= 1 || indexes.length <= 2) return indexes;
  const last = indexes[indexes.length - 1]!;
  const kept: number[] = [indexes[0]!];
  for (let i = 1; i < indexes.length - 1; i++) {
    const idx = indexes[i]!;
    if (idx - kept[kept.length - 1]! >= minGap && last - idx >= minGap) kept.push(idx);
  }
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

/**
 * Category indexes that get a label.
 * Quarterly history keeps every calendar year that actually has a point, spaced so
 * "Sep 24" labels do not stack. A wide chart (the expand dialog) labels every quarter.
 * Sparse, annual-only, and newly listed series are labeled as-is — no placeholder quarters.
 */
export function selectCategoryTickIndexes(categories: string[], axisWidth: number): number[] {
  const n = categories.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const width = Number.isFinite(axisWidth) && axisWidth > 0 ? axisWidth : 220;
  const slotPx = width / (n - 1);
  const fullGap = Math.max(1, Math.ceil(FULL_LABEL_PX / slotPx));
  if (fullGap <= 1) return Array.from({ length: n }, (_, i) => i);

  const yearGap = Math.max(1, Math.ceil(YEAR_LABEL_PX / slotPx));
  const anchors = thinToMinGap(spaceYearAnchors(yearGroups(categories)), yearGap);
  const chosen = new Set(anchors);
  for (let i = 0; i < n; i++) {
    if ([...chosen].every((c) => Math.abs(c - i) >= fullGap)) chosen.add(i);
  }
  return [...chosen].sort((a, b) => a - b);
}

/** True when month+year text would collide and the axis should print the year alone. */
export function categoryTicksUseShortYear(
  total: number,
  indexes: number[],
  axisWidth: number,
): boolean {
  if (indexes.length <= 1 || total <= 1) return false;
  const sorted = [...indexes].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    minGap = Math.min(minGap, sorted[i]! - sorted[i - 1]!);
  }
  const width = Number.isFinite(axisWidth) && axisWidth > 0 ? axisWidth : 220;
  return (minGap / (total - 1)) * width < FULL_LABEL_PX;
}

