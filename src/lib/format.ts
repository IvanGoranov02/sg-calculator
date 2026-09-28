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

const moneyFmtCache = new Map<string, Intl.NumberFormat>();

/** ISO currency for Intl. Yahoo pence quotes (GBp/GBX) format as GBP. */
export function intlCurrencyCode(currency: string | null | undefined): string {
  const raw = (currency ?? "USD").trim();
  if (/^gb[px]$/i.test(raw)) return "GBP";
  const upper = raw.toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : "USD";
}

function cachedMoneyFormat(currency: string, maximumFractionDigits: number, minimumFractionDigits: number): Intl.NumberFormat {
  const code = intlCurrencyCode(currency);
  const key = `${code}:${minimumFractionDigits}:${maximumFractionDigits}`;
  const hit = moneyFmtCache.get(key);
  if (hit) return hit;
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits,
      maximumFractionDigits,
    });
  } catch {
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits,
      maximumFractionDigits,
    });
  }
  moneyFmtCache.set(key, fmt);
  return fmt;
}

export function formatCurrency(n: number, currency = "USD"): string {
  if (intlCurrencyCode(currency) === "USD") return currencyFmt.format(n);
  return cachedMoneyFormat(currency, 2, 2).format(n);
}

export function formatCurrencyPerShare(n: number, currency = "USD"): string {
  if (intlCurrencyCode(currency) === "USD") return perShareFmt.format(n);
  return cachedMoneyFormat(currency, 4, 2).format(n);
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

export type DateFormat = "dmy" | "mdy";

/** Resolve BCP-47 tag for date-only display from user preference. */
export function resolveDateLocaleTag(locale: string, dateFormat: DateFormat): string {
  if (locale === "bg" && dateFormat === "dmy") return "bg-BG";
  return dateFormat === "dmy" ? "en-GB" : "en-US";
}

/** Locale date for portfolio dividend fields; never returns "Invalid Date". */
export function formatLocaleDate(
  iso: string | null | undefined,
  locale: string,
  dateFormat: DateFormat = "mdy",
): string {
  const normalized = normalizeIsoDateString(iso);
  if (!normalized) return "—";
  const d = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(resolveDateLocaleTag(locale, dateFormat));
}

/** Short month + day (e.g. earnings dates); respects date format preference. */
export function formatLocaleDateShort(iso: string, locale: string, dateFormat: DateFormat = "mdy"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(resolveDateLocaleTag(locale, dateFormat), {
    month: "short",
    day: "numeric",
  });
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
