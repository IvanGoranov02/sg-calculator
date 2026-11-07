import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import type { SearchCompany } from "@/lib/stockSearch";

/** Only listed instruments with an actual provider symbol can be selected. */
export function listedCompanyResults(quotes: unknown[]): SearchCompany[] {
  const seen = new Set<string>();
  return quotes
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const q = raw as Record<string, unknown>;
      const s =
        typeof q.symbol === "string" ? q.symbol.trim().toUpperCase() : "";
      const name = q.longname ?? q.shortname ?? q.longName ?? q.shortName;
      if (
        !isValidStockSymbolInput(s) ||
        !s ||
        seen.has(s) ||
        typeof name !== "string" ||
        !name.trim()
      )
        return [];
      if (
        !["EQUITY", "ETF", "MUTUALFUND"].includes(
          String(q.quoteType).toUpperCase(),
        )
      )
        return [];
      seen.add(s);
      return [{ s, n: name.trim() }];
    })
    .slice(0, 12);
}

export function mergeCompanyResults(
  live: SearchCompany[],
  local: SearchCompany[],
  max = 8,
): SearchCompany[] {
  const seen = new Set<string>();
  return [...live, ...local]
    .filter((c) => {
      const key = c.s.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}
