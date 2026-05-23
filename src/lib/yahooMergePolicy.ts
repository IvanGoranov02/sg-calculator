/** Yahoo-prefer merge helpers (exported for unit tests). */

export function pickNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mergeScalarPreferYahoo(cur: number | null | undefined, yahoo: unknown): number {
  const y = pickNum(yahoo);
  if (y != null) return y;
  const c = cur == null || (typeof cur === "number" && !Number.isFinite(cur)) ? null : cur;
  return c ?? 0;
}

export function mergeNullablePreferYahoo(cur: number | null | undefined, yahoo: unknown): number | null {
  const y = pickNum(yahoo);
  if (y != null) return y;
  return cur ?? null;
}
