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

/**
 * 10px axis font, matched to measured glyphs: "2024" ≈ 25px, "Sep 24" ≈ 33px.
 * Digits are wider than letters in the UI font.
 */
const DIGIT_PX = 6.25;
const LETTER_PX = 5.5;
const SPACE_PX = 3.5;
/** Breathing room between neighboring glyph boxes. */
const LABEL_GAP_PX = 2;
/** Y axis plus the chart's right margin. The category axis is the plot box minus this. */
export const CHART_Y_AXIS_PX = 68;
export const CHART_PLOT_RIGHT_MARGIN_PX = 12;
/** Used until the chart container has been measured, so the first paint stays sparse. */
const UNMEASURED_AXIS_PX = 160;

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Pixel width of a 10px axis label. "2024" → 25, "Sep 24" → 33. */
export function estimateCategoryLabelPx(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") width += DIGIT_PX;
    else if (ch === " " || ch === "\u00a0") width += SPACE_PX;
    else width += LETTER_PX;
  }
  return Math.max(1, Math.round(width));
}

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

/**
 * Category-axis width inside a chart box that also draws the Y axis.
 * Returns 0 when the box has not been measured yet.
 */
export function categoryAxisWidth(plotWidth: number): number {
  if (!Number.isFinite(plotWidth) || plotWidth <= 0) return 0;
  return Math.max(0, plotWidth - CHART_Y_AXIS_PX - CHART_PLOT_RIGHT_MARGIN_PX);
}

function resolveAxisWidth(axisWidth: number): number {
  if (!Number.isFinite(axisWidth) || axisWidth <= 0) return UNMEASURED_AXIS_PX;
  return axisWidth;
}

/** Band-scale center. Bar and category axes step by `width / n`, not `width / (n - 1)`. */
export function categoryBandCenter(index: number, total: number, axisWidth: number): number {
  if (total <= 0) return 0;
  return (axisWidth / total) * (index + 0.5);
}

export type CategoryTickAnchor = "start" | "middle" | "end";

/**
 * Edge labels use an inward anchor only when a centered label would leave the axis.
 * A centered label fits when it is no wider than one band (`width / n`).
 */
export function categoryTickAnchor(
  index: number,
  total: number,
  axisWidth: number,
  labelWidth: number,
): CategoryTickAnchor {
  if (total <= 1 || !(axisWidth > 0)) return "middle";
  const band = axisWidth / total;
  if (!(labelWidth > band)) return "middle";
  if (index <= 0) return "start";
  if (index >= total - 1) return "end";
  return "middle";
}

/** Glyph box for one category label, in the same coordinate space as the axis. */
export function categoryLabelSpan(
  index: number,
  total: number,
  axisWidth: number,
  labelWidth: number,
): { left: number; right: number } {
  const center = categoryBandCenter(index, total, axisWidth);
  const anchor = categoryTickAnchor(index, total, axisWidth, labelWidth);
  if (anchor === "start") return { left: center, right: center + labelWidth };
  if (anchor === "end") return { left: center - labelWidth, right: center };
  const half = labelWidth / 2;
  return { left: center - half, right: center + half };
}

/** True when any two shown labels' glyph boxes are closer than {@link LABEL_GAP_PX}. */
export function categoryTicksOverlap(
  indexes: number[],
  total: number,
  axisWidth: number,
  labelWidths: readonly number[],
): boolean {
  if (indexes.length <= 1 || total <= 0 || !(axisWidth > 0)) return false;
  const spans = indexes
    .map((i) => categoryLabelSpan(i, total, axisWidth, labelWidths[i] ?? 0))
    .sort((a, b) => a.left - b.left || a.right - b.right);
  for (let k = 1; k < spans.length; k++) {
    if (spans[k]!.left < spans[k - 1]!.right + LABEL_GAP_PX - 0.05) return true;
  }
  return false;
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

function defaultDisplayLabel(category: string): string {
  const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(category);
  if (!iso) return category;
  const month = MONTHS_EN[Number(iso[2]) - 1];
  if (!month) return category;
  return `${month} ${iso[1]!.slice(2)}`;
}

function labelText(
  category: string,
  index: number,
  displayLabels: readonly string[] | undefined,
  yearOnly: boolean,
): string {
  if (yearOnly) return categoryYearKey(category) ?? defaultDisplayLabel(category);
  const given = displayLabels?.[index];
  if (given && given.trim()) return given;
  return defaultDisplayLabel(category);
}

function labelWidthsFor(
  categories: string[],
  displayLabels: readonly string[] | undefined,
  yearOnly: boolean,
): number[] {
  return categories.map((category, index) =>
    estimateCategoryLabelPx(labelText(category, index, displayLabels, yearOnly)),
  );
}

function spansClear(
  i: number,
  j: number,
  total: number,
  axisWidth: number,
  widths: readonly number[],
): boolean {
  if (j <= i) return false;
  const a = categoryLabelSpan(i, total, axisWidth, widths[i] ?? 0);
  const b = categoryLabelSpan(j, total, axisWidth, widths[j] ?? 0);
  return b.left >= a.right + LABEL_GAP_PX - 0.05;
}

/**
 * One real index per year group. Edge groups stay on category 0 / n-1 when those
 * labels use an inward anchor, so the penultimate tick is not forced against the last.
 * Returns null when the groups cannot be placed without overlapping.
 */
function packYearGroups(
  groups: YearGroup[],
  total: number,
  axisWidth: number,
  widths: readonly number[],
  lockEdges: boolean,
): number[] | null {
  const m = groups.length;
  if (m === 0) return [];
  const picks = new Array<number>(m);
  const firstEdge = groups[0]!.indexes[0]!;
  const lastEdge = groups[m - 1]!.indexes[groups[m - 1]!.indexes.length - 1]!;

  function candidates(g: number): number[] {
    const indexes = groups[g]!.indexes;
    if (lockEdges && g === 0) return [firstEdge];
    if (lockEdges && g === m - 1) return [lastEdge];
    return indexes;
  }

  function earliest(g: number, prev: number): number | null {
    for (const i of candidates(g)) {
      if (prev < 0 || spansClear(prev, i, total, axisWidth, widths)) return i;
    }
    return null;
  }

  function canFinish(g: number, prev: number): boolean {
    let cursor = prev;
    for (let k = g; k < m; k++) {
      const next = earliest(k, cursor);
      if (next == null) return false;
      cursor = next;
    }
    return true;
  }

  function dfs(g: number, prev: number): boolean {
    const ideal =
      m === 1 ? firstEdge : firstEdge + (g * (lastEdge - firstEdge)) / (m - 1);
    const options = candidates(g)
      .filter((i) => prev < 0 || spansClear(prev, i, total, axisWidth, widths))
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal) || a - b);
    for (const i of options) {
      if (g < m - 1 && !canFinish(g + 1, i)) continue;
      picks[g] = i;
      if (g === m - 1 || dfs(g + 1, i)) return true;
    }
    return false;
  }

  if (!dfs(0, -1)) return null;
  return picks;
}

function addFittingIndexes(
  kept: number[],
  total: number,
  axisWidth: number,
  widths: readonly number[],
): number[] {
  const chosen = new Set(kept);
  for (let i = 0; i < total; i++) {
    if (chosen.has(i)) continue;
    if (!categoryTicksOverlap([...chosen, i], total, axisWidth, widths)) chosen.add(i);
  }
  return [...chosen].sort((a, b) => a - b);
}

/** Drop an interior year, alternating the start side and the end side, so the middle years stay. */
function dropOuterInterior(groups: YearGroup[], fromEnd: boolean): YearGroup[] {
  if (groups.length <= 2) return groups;
  const at = fromEnd ? groups.length - 2 : 1;
  return groups.filter((_, index) => index !== at);
}

function selectForWidths(
  groups: YearGroup[],
  total: number,
  axisWidth: number,
  widths: readonly number[],
  allowExtras: boolean,
): number[] {
  const band = axisWidth / total;
  const lockEdges = (widths[0] ?? 0) > band || (widths[total - 1] ?? 0) > band;
  let active = groups;
  let fromEnd = false;
  while (active.length >= 2) {
    const packed = packYearGroups(active, total, axisWidth, widths, lockEdges);
    if (packed && !categoryTicksOverlap(packed, total, axisWidth, widths)) {
      return allowExtras ? addFittingIndexes(packed, total, axisWidth, widths) : packed;
    }
    if (active.length === 2) break;
    active = dropOuterInterior(active, fromEnd);
    fromEnd = !fromEnd;
  }
  const ends = [0, total - 1];
  if (!categoryTicksOverlap(ends, total, axisWidth, widths)) return ends;
  return [total - 1];
}

function coversEveryGroup(groups: YearGroup[], indexes: number[]): boolean {
  const shown = new Set(indexes);
  return groups.every((group) => group.indexes.some((i) => shown.has(i)));
}

export type CategoryTickPlan = {
  indexes: number[];
  /** Month labels would collide, so ticks print the calendar year alone. */
  yearOnly: boolean;
  /** Reserved glyph width for every category, including hidden ones. */
  labelWidths: number[];
  axisWidth: number;
};

/**
 * Which category indexes get a label, and whether that label is the year alone.
 * Density follows the band scale (`width / n`) and the inward extent of start/end anchors.
 * Years with no real point are never added.
 */
export function planCategoryTicks(
  categories: string[],
  axisWidth: number,
  displayLabels?: readonly string[],
): CategoryTickPlan {
  const total = categories.length;
  const width = resolveAxisWidth(axisWidth);
  if (total === 0) {
    return { indexes: [], yearOnly: false, labelWidths: [], axisWidth: width };
  }
  const groups = yearGroups(categories);
  const monthWidths = labelWidthsFor(categories, displayLabels, false);
  if (total === 1) {
    return { indexes: [0], yearOnly: false, labelWidths: monthWidths, axisWidth: width };
  }
  const monthIndexes = selectForWidths(groups, total, width, monthWidths, true);
  if (
    coversEveryGroup(groups, monthIndexes) &&
    !categoryTicksOverlap(monthIndexes, total, width, monthWidths)
  ) {
    return { indexes: monthIndexes, yearOnly: false, labelWidths: monthWidths, axisWidth: width };
  }
  const yearWidths = labelWidthsFor(categories, displayLabels, true);
  const yearIndexes = selectForWidths(groups, total, width, yearWidths, false);
  return { indexes: yearIndexes, yearOnly: true, labelWidths: yearWidths, axisWidth: width };
}

/**
 * Category indexes that get a label.
 * Keeps every calendar year that fits, and never invents a quarter the series does not contain.
 */
export function selectCategoryTickIndexes(categories: string[], axisWidth: number): number[] {
  return planCategoryTicks(categories, axisWidth).indexes;
}

/** True when month+year text would collide and the axis should print the year alone. */
export function categoryTicksUseShortYear(
  total: number,
  indexes: number[],
  axisWidth: number,
): boolean {
  if (indexes.length <= 1 || total <= 1) return false;
  const width = resolveAxisWidth(axisWidth);
  const month = estimateCategoryLabelPx("Sep 24");
  const widths = Array.from({ length: total }, () => month);
  return categoryTicksOverlap(indexes, total, width, widths);
}

