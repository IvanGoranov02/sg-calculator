/** Derived annual metrics for fiscal tables (pure helpers). */

export function yoyPercentSeries(values: number[]): (number | null)[] {
  return values.map((v, i) => {
    if (i === 0) return null;
    const prev = values[i - 1];
    if (!Number.isFinite(v) || !Number.isFinite(prev) || prev === 0) return null;
    return ((v - prev) / prev) * 100;
  });
}

/** YoY where some periods may be missing (null). */
export function yoyPercentNullableSeries(values: (number | null)[]): (number | null)[] {
  return values.map((v, i) => {
    if (i === 0) return null;
    const prev = values[i - 1];
    if (v == null || prev == null) return null;
    if (!Number.isFinite(v) || !Number.isFinite(prev) || prev === 0) return null;
    return ((v - prev) / prev) * 100;
  });
}

export function safePct(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return (num / den) * 100;
}

export function safeRatio(num: number | null, den: number | null): number | null {
  if (num == null || den == null) return null;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}
