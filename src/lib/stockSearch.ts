import { isValidStockSymbolInput } from "@/lib/stockSymbol";

export type SearchCompany = { s: string; n: string };

const MAX_SUGGESTIONS = 8;

/** Yahoo lists share classes with a hyphen (BRK-B); people often type a dot (BRK.B). */
export function classShareYahooTicker(sym: string): string {
  return sym.trim().toUpperCase().replace(/\.([A-Z])$/, "-$1");
}

export function decodeTickerSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function tickerMatchesQuery(ticker: string, q: string, qDash: string): boolean {
  const s = ticker.toUpperCase();
  if (s.startsWith(q) || s.startsWith(qDash)) return true;
  return s.replace(/-/g, ".").startsWith(q);
}

/** Ticker prefix matches first (exact-prefix), then company-name substring matches. */
export function suggestCompanies(
  companies: SearchCompany[],
  query: string,
  max = MAX_SUGGESTIONS,
): SearchCompany[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const qDash = classShareYahooTicker(q);
  const byTicker: SearchCompany[] = [];
  const byName: SearchCompany[] = [];
  for (const c of companies) {
    if (tickerMatchesQuery(c.s, q, qDash)) byTicker.push(c);
    else if (c.n.toUpperCase().includes(q)) byName.push(c);
    if (byTicker.length >= max && byName.length >= max) break;
  }
  return [...byTicker, ...byName].slice(0, max);
}

/**
 * Turn the search box into a ticker to navigate to.
 * Company names (spaces / invalid ticker chars) use the top suggestion.
 * BRK.B maps to BRK-B when that symbol is in the index.
 */
export function resolveStockSearchQuery(
  raw: string,
  suggestions: SearchCompany[],
  companies: SearchCompany[],
): string | null {
  const q = raw.trim().toUpperCase();
  if (!q) return null;

  const byTicker = new Map(companies.map((c) => [c.s.toUpperCase(), c.s]));
  const exact = byTicker.get(q);
  if (exact) return exact;

  const dashed = classShareYahooTicker(q);
  if (dashed !== q) {
    const mapped = byTicker.get(dashed);
    if (mapped) return mapped;
  }

  if (!isValidStockSymbolInput(q)) {
    return suggestions[0]?.s ?? null;
  }

  return q;
}
