import { listedCompanyResults, secListedCompanies } from "@/lib/companySearch";
import { suggestCompanies, type SearchCompany } from "@/lib/stockSearch";

const CATALOG_TTL = 5 * 60_000;
let catalog: { companies: SearchCompany[]; expiresAt: number } | null = null;
let catalogRequest: Promise<SearchCompany[] | null> | null = null;
type Fetcher = typeof fetch;

async function secCatalog(fetcher: Fetcher): Promise<SearchCompany[] | null> {
  if (catalog && catalog.expiresAt > Date.now()) return catalog.companies;
  if (!catalogRequest) {
    catalogRequest = (async () => {
      try {
        const response = await fetcher(
          "https://www.sec.gov/files/company_tickers.json",
          {
            headers: {
              Accept: "application/json",
              "User-Agent":
                process.env.SEC_EDGAR_USER_AGENT?.trim() ||
                "StockGauge/0.1 (contact@stockgauge.app)",
            },
            signal: AbortSignal.timeout(8_000),
            next: { revalidate: 300 },
          },
        );
        if (!response.ok) return null;
        const companies = secListedCompanies(await response.json());
        if (!companies.length) return null;
        catalog = { companies, expiresAt: Date.now() + CATALOG_TTL };
        return companies;
      } catch {
        return null;
      }
    })().finally(() => {
      catalogRequest = null;
    });
  }
  return catalogRequest;
}

/** Yahoo search is public and needs no quote crumb/cookie negotiation. */
export async function searchCurrentCompanies(
  query: string,
  fetcher: Fetcher = fetch,
): Promise<{ companies: SearchCompany[]; source: "yahoo" | "sec" }> {
  let validEmptyYahoo = false;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = new URL(`https://${host}/v1/finance/search`);
      url.search = new URLSearchParams({
        q: query,
        quotesCount: "12",
        newsCount: "0",
        enableFuzzyQuery: "true",
      }).toString();
      const response = await fetcher(url, {
        headers: { Accept: "application/json", "User-Agent": "StockGauge/0.1" },
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray((data as { quotes?: unknown }).quotes)
      )
        continue;
      const companies = listedCompanyResults(
        (data as { quotes: unknown[] }).quotes,
      );
      if (companies.length) return { companies, source: "yahoo" };
      validEmptyYahoo = true;
    } catch {
      /* Try the alternate host and then the current SEC directory. */
    }
  }
  const current = await secCatalog(fetcher);
  if (current)
    return { companies: suggestCompanies(current, query, 12), source: "sec" };
  if (validEmptyYahoo) return { companies: [], source: "yahoo" };
  throw new Error("Company search is temporarily unavailable.");
}
