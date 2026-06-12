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

/**
 * Fill-gaps variants: the current value is authoritative (e.g. SEC EDGAR as-reported
 * data); Yahoo only fills what is missing. Scalar fields use 0 as "missing".
 */
export function mergeScalarFillGaps(cur: number | null | undefined, yahoo: unknown): number {
  if (cur != null && Number.isFinite(cur) && cur !== 0) return cur;
  return pickNum(yahoo) ?? (Number.isFinite(cur ?? NaN) ? (cur as number) : 0);
}

export function mergeNullableFillGaps(cur: number | null | undefined, yahoo: unknown): number | null {
  if (cur != null && Number.isFinite(cur)) return cur;
  return pickNum(yahoo) ?? null;
}
