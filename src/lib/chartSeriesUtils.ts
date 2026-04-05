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
