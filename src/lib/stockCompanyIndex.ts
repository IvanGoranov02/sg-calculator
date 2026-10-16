import usCompanies from "@/data/usCompanies.json";
import type { SearchCompany } from "@/lib/stockSearch";

export const INSTANT_COMPANIES = usCompanies as SearchCompany[];

let fullCompaniesPromise: Promise<SearchCompany[]> | null = null;

/** Share one full-index download and parsed result across the search entry points. */
export function loadStockCompanyIndex(): Promise<SearchCompany[]> {
  if (!fullCompaniesPromise) {
    fullCompaniesPromise = fetch("/us-companies.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Company index unavailable");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every((entry) =>
          entry != null && typeof entry === "object" && typeof entry.s === "string" && typeof entry.n === "string")) {
          throw new Error("Invalid company index");
        }
        return data as SearchCompany[];
      })
      .catch(() => {
        fullCompaniesPromise = null;
        return INSTANT_COMPANIES;
      });
  }
  return fullCompaniesPromise;
}
