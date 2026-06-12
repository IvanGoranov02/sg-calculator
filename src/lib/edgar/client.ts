/**
 * SEC EDGAR fetch layer. Free, no API key; SEC fair-access policy requires a
 * descriptive User-Agent (set SEC_EDGAR_USER_AGENT to your contact in prod)
 * and stays under 10 req/s — our volume is far below that.
 */

import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

import { bundleFromCompanyFacts, type EdgarCompanyFacts } from "@/lib/edgar/normalize";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/";

const CIK_MAP_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25_000;

function edgarUserAgent(): string {
  // SEC fair-access policy rejects User-Agents without contact info (403);
  // set SEC_EDGAR_USER_AGENT to your real contact in production.
  return process.env.SEC_EDGAR_USER_AGENT?.trim() || "StockGauge/0.1 (contact@stockgauge.app)";
}

async function edgarFetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": edgarUserAgent(), Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

type CikEntry = { cik: string; name: string };

let cikMapCache: { bySymbol: Map<string, CikEntry>; fetchedAt: number } | null = null;

/** Ticker → zero-padded CIK for all SEC filers (US listings incl. ADRs). */
export async function lookupCik(symbol: string): Promise<CikEntry | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym || sym.includes(".")) return null; // exchange-suffixed symbols are not SEC tickers

  const now = Date.now();
  if (!cikMapCache || now - cikMapCache.fetchedAt > CIK_MAP_TTL_MS) {
    const raw = await edgarFetchJson(TICKERS_URL);
    if (raw && typeof raw === "object") {
      const bySymbol = new Map<string, CikEntry>();
      for (const row of Object.values(raw as Record<string, unknown>)) {
        const r = row as { cik_str?: number; ticker?: string; title?: string };
        if (!r?.ticker || r.cik_str == null) continue;
        bySymbol.set(String(r.ticker).toUpperCase(), {
          cik: String(r.cik_str).padStart(10, "0"),
          name: String(r.title ?? "").trim(),
        });
      }
      if (bySymbol.size > 0) {
        cikMapCache = { bySymbol, fetchedAt: now };
      }
    }
    if (!cikMapCache) return null;
  }

  return cikMapCache.bySymbol.get(sym) ?? null;
}

export async function fetchCompanyFacts(cik: string): Promise<EdgarCompanyFacts | null> {
  const raw = await edgarFetchJson(`${COMPANY_FACTS_URL}CIK${cik}.json`);
  if (!raw || typeof raw !== "object") return null;
  const f = raw as EdgarCompanyFacts;
  if (!f.facts || typeof f.facts !== "object") return null;
  return f;
}

/**
 * Fundamentals from SEC filings, or null when the symbol is not an SEC filer
 * (or the data is too thin) — the caller then falls back to Gemini.
 */
export async function fetchStockBundleFromEdgar(
  symbol: string,
): Promise<StockAnalysisBundle | null> {
  try {
    const entry = await lookupCik(symbol);
    if (!entry) return null;
    const facts = await fetchCompanyFacts(entry.cik);
    if (!facts) return null;
    return bundleFromCompanyFacts(symbol, facts);
  } catch {
    return null;
  }
}
