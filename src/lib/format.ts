const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
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

/** Yahoo often reports margins and growth as decimals (e.g. 0.25 = 25%). */
export function formatDecimalAsPercent(n: number | null | undefined, fractionDigits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(fractionDigits)}%`;
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
