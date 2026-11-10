"use client";
import { useEffect, useMemo, useState } from "react";
import { mergeCompanyResults } from "@/lib/companySearch";
import { suggestCompanies, type SearchCompany } from "@/lib/stockSearch";

/** Local suggestions stay usable while live listings load; obsolete responses never win. */
export function useCompanySearch(companies: SearchCompany[], query: string) {
  const key = query.trim();
  const [live, setLive] = useState<{ key: string; companies: SearchCompany[] }>(
    { key: "", companies: [] },
  );
  useEffect(() => {
    if (key.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/companies/search?q=${encodeURIComponent(key)}`, {
        signal: controller.signal,
      })
        .then(async (r) =>
          r.ok ? (r.json() as Promise<{ companies?: SearchCompany[] }>) : null,
        )
        .then((data) => {
          if (!controller.signal.aborted && Array.isArray(data?.companies))
            setLive({ key, companies: data.companies });
        })
        .catch(() => {
          /* Keep local suggestions. */
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);
  return useMemo(
    () =>
      mergeCompanyResults(
        live.key === key ? live.companies : [],
        suggestCompanies(companies, key),
      ),
    [companies, key, live],
  );
}
