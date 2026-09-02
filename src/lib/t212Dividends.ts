import type { T212HistoryDividendItem } from "@/lib/trading212Client";

export type T212DividendRow = {
  ticker: string;
  amount: number | null;
  currency: string;
  paidOn: string | null;
};

export const T212_RECENT_DIVIDENDS_LIMIT = 40;

export function mapT212DividendItem(item: T212HistoryDividendItem): T212DividendRow {
  const ticker = typeof item.ticker === "string" && item.ticker.trim() ? item.ticker.trim() : "—";
  const n = item.amount != null ? Number(item.amount) : NaN;
  const amount = Number.isFinite(n) ? n : null;
  const currency =
    typeof item.currency === "string" && item.currency.trim().length >= 3
      ? item.currency.trim().toUpperCase().slice(0, 8)
      : "—";
  const paidOn = typeof item.paidOn === "string" && item.paidOn.trim() ? item.paidOn : null;
  return { ticker, amount, currency, paidOn };
}

export function sortT212DividendsRecent(items: T212HistoryDividendItem[]): T212HistoryDividendItem[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.paidOn ?? "") || 0;
    const tb = Date.parse(b.paidOn ?? "") || 0;
    return tb - ta;
  });
}

export function recentT212DividendRows(
  items: T212HistoryDividendItem[],
  limit = T212_RECENT_DIVIDENDS_LIMIT,
): T212DividendRow[] {
  return sortT212DividendsRecent(items).slice(0, limit).map(mapT212DividendItem);
}
