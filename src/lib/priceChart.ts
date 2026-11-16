import type { HistoricalEodBar, PerformanceRange } from "@/lib/stockAnalysisTypes";

export type PricePoint = {
  /** ISO date (daily) or datetime (intraday). */
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number | null;
};

/** Most points drawn at once; longer series are bucketed (last close, highest high, lowest low, summed volume). */
export const MAX_POINTS = 500;

const day = (iso: string) => iso.slice(0, 10);
const utcNoon = (iso: string) => Date.parse(`${day(iso)}T12:00:00Z`);

function toPoint(b: HistoricalEodBar): PricePoint {
  return { date: b.date, close: b.close, high: b.high ?? b.close, low: b.low ?? b.close, volume: b.volume ?? null };
}

/** Bars of the chosen range, oldest first. 1D uses the last intraday session when there is one. */
export function barsForRange(
  historical: readonly HistoricalEodBar[],
  intraday: readonly HistoricalEodBar[] | undefined,
  range: PerformanceRange,
): PricePoint[] {
  const valid = (b: HistoricalEodBar) => Number.isFinite(b.close) && b.close > 0;
  if (range === "1d" && intraday?.length) {
    const sorted = intraday.filter(valid).sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    return last ? sorted.filter((b) => day(b.date) === day(last.date)).map(toPoint) : [];
  }
  const daily = historical.filter(valid).sort((a, b) => a.date.localeCompare(b.date));
  if (daily.length === 0) return [];
  const lastIso = daily[daily.length - 1]!.date;
  if (range === "max") return daily.map(toPoint);
  if (range === "1d") return daily.filter((b) => day(b.date) === day(lastIso)).map(toPoint);
  const start = new Date(utcNoon(lastIso));
  if (range === "1w") start.setUTCDate(start.getUTCDate() - 7);
  else if (range === "1m") start.setUTCMonth(start.getUTCMonth() - 1);
  else if (range === "3m") start.setUTCMonth(start.getUTCMonth() - 3);
  else if (range === "6m") start.setUTCMonth(start.getUTCMonth() - 6);
  else if (range === "ytd") start.setUTCMonth(0, 1);
  else if (range === "1y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else if (range === "5y") start.setUTCFullYear(start.getUTCFullYear() - 5);
  const t0 = start.getTime();
  // YTD starts from the last close of the previous year, so the change matches what brokers show.
  const from = daily.findIndex((b) => utcNoon(b.date) >= t0);
  if (from < 0) return [];
  const first = range === "ytd" && from > 0 ? from - 1 : from;
  return daily.slice(first).map(toPoint);
}

/** At most `max` points; each bucket keeps its last close and date so the newest price stays exact. */
export function downsample(points: readonly PricePoint[], max = MAX_POINTS): PricePoint[] {
  if (points.length <= max) return [...points];
  const size = Math.ceil(points.length / max);
  const out: PricePoint[] = [];
  // Buckets are aligned to the end so the last point is always a full, exact bucket.
  for (let end = points.length; end > 0; end -= size) {
    const chunk = points.slice(Math.max(0, end - size), end);
    const last = chunk[chunk.length - 1]!;
    const vols = chunk.map((p) => p.volume).filter((v): v is number => v != null);
    out.push({
      date: last.date,
      close: last.close,
      high: Math.max(...chunk.map((p) => p.high)),
      low: Math.min(...chunk.map((p) => p.low)),
      volume: vols.length ? vols.reduce((a, v) => a + v, 0) : null,
    });
  }
  return out.reverse();
}

type TickUnit = "hour" | "day" | "week" | "month" | "year";

export function tickUnitFor(range: PerformanceRange, intraday: boolean): TickUnit {
  if (range === "1d") return intraday ? "hour" : "day";
  if (range === "1w") return "day";
  if (range === "1m") return "week";
  if (range === "3m" || range === "6m" || range === "ytd" || range === "1y") return "month";
  return "year";
}

function bucketKey(iso: string, unit: TickUnit): string {
  if (unit === "hour") return iso.slice(0, 13);
  if (unit === "day") return day(iso);
  if (unit === "month") return iso.slice(0, 7);
  if (unit === "year") return iso.slice(0, 4);
  // ISO week: Monday-based.
  const d = new Date(utcNoon(iso));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Axis ticks on natural boundaries (first point of each hour / day / week / month / year),
 * thinned evenly to at most `maxTicks`. The very first point is skipped when it is not a boundary.
 */
export function tickIndexes(points: readonly PricePoint[], unit: TickUnit, maxTicks = 7): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if (bucketKey(points[i]!.date, unit) !== bucketKey(points[i - 1]!.date, unit)) out.push(i);
  }
  if (out.length <= maxTicks) return out;
  const step = Math.ceil(out.length / maxTicks);
  // Keep the newest boundary and step back from it, so the latest month/year is always labelled.
  const kept: number[] = [];
  for (let k = out.length - 1; k >= 0; k -= step) kept.push(out[k]!);
  return kept.reverse();
}

/** Axis label for a boundary tick. */
export function tickLabel(iso: string, unit: TickUnit, locale: string): string {
  const loc = locale === "bg" ? "bg-BG" : "en-US";
  const d = new Date(utcNoon(iso));
  if (unit === "hour") return iso.slice(11, 16);
  if (unit === "year") return iso.slice(0, 4);
  if (unit === "month") {
    // January carries the year, like Google Finance ("Nov  Dec  2026  Feb").
    return d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : d.toLocaleDateString(loc, { month: "short", timeZone: "UTC" });
  }
  return d.toLocaleDateString(loc, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Evenly spaced round price levels covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return Number.isFinite(lo) ? [lo] : [];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}
