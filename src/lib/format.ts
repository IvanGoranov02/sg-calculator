const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const currencyEurFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const compactFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCurrency(n: number): string {
  return currencyFmt.format(n);
}

export function formatCurrencyEur(n: number): string {
  return currencyEurFmt.format(n);
}

export function formatCurrencyCompact(n: number): string {
  return compactFmt.format(n);
}

export function formatPercent(n: number, fractionDigits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(fractionDigits)}%`;
}

export function formatVolume(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

/**
 * Yahoo mixes dividend yield formats: decimal (0.0065 = 0.65%) or percent points (0.65 = 0.65% when &lt;1 is ambiguous).
 * Align with Investor metrics fmtYield: values above 1 are treated as whole percent (2.5 → 2.5%).
 */
export function normalizeYahooDividendYieldToDecimal(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  return n > 1 ? n / 100 : n;
}

/** Yahoo often reports margins and growth as decimals (e.g. 0.25 = 25%). */
export function formatDecimalAsPercent(n: number | null | undefined, fractionDigits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(fractionDigits)}%`;
}

/** Format dividend yield for UI after {@link normalizeYahooDividendYieldToDecimal}. */
export function formatDividendYieldPercent(n: number | null | undefined, fractionDigits = 2): string {
  const d = normalizeYahooDividendYieldToDecimal(n);
  if (d == null) return "—";
  return formatDecimalAsPercent(d, fractionDigits);
}

export function formatRatio(n: number | null | undefined, fractionDigits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(fractionDigits);
}

const perShareFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatCurrencyPerShare(n: number): string {
  return perShareFmt.format(n);
}

/** Extract yyyy-mm-dd from ISO date or datetime; null if missing or unparseable. */
export function normalizeIsoDateString(raw: string | null | undefined): string | null {
  if (raw == null || !raw.trim()) return null;
  const s = raw.trim();
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) {
    const d = new Date(`${dateOnly[1]}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : dateOnly[1];
  }
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Locale date for portfolio dividend fields; never returns "Invalid Date". */
export function formatLocaleDate(iso: string | null | undefined, locale: string): string {
  const normalized = normalizeIsoDateString(iso);
  if (!normalized) return "—";
  const d = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US");
}

/** Short month label from yyyy-mm; dash when unparseable. */
export function formatMonthKeyLabel(month: string, locale: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return "—";
  const d = new Date(`${month}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", {
    month: "short",
    year: "2-digit",
  });
}
