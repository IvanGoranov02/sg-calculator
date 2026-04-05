/**
 * Server-only: batch Yahoo quotes + dividend metrics for portfolio rows.
 */

import YahooFinance from "yahoo-finance2";

import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";

const yahooFinance = new YahooFinance();

export type PortfolioQuoteRow = {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  dividendYield: number | null;
  dividendRate: number | null;
  changePercent: number;
};

export async function fetchPortfolioQuotesForSymbols(
  symbols: string[],
): Promise<Record<string, PortfolioQuoteRow | null>> {
  const uniq = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const out: Record<string, PortfolioQuoteRow | null> = Object.fromEntries(uniq.map((s) => [s, null]));

  await Promise.all(
    uniq.map(async (sym) => {
      try {
        const [q, qs] = await Promise.all([
          yahooFinance.quote(sym),
          yahooFinance
            .quoteSummary(sym, {
              modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "price"],
            })
            .catch(() => null),
        ]);
        const raw = Array.isArray(q) ? q[0] : q;
        if (!raw || typeof raw !== "object") return;
        const r = raw as Record<string, unknown>;
        const metrics = mapInvestorMetrics(r, qs as Record<string, unknown> | null);
        const price = Number(r.regularMarketPrice ?? 0);
        const pct = Number(r.regularMarketChangePercent ?? 0);
        out[sym] = {
          symbol: sym,
          name: String(r.longName ?? r.shortName ?? sym),
          price: Number.isFinite(price) ? price : 0,
          currency: metrics.currency,
          dividendYield: metrics.dividendYield,
          dividendRate: metrics.dividendRate,
          changePercent: Number.isFinite(pct) ? pct : 0,
        };
      } catch {
        out[sym] = null;
      }
    }),
  );

  return out;
}
