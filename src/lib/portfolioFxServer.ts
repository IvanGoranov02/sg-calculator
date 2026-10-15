import "server-only";

import { yahooFinance } from "@/lib/yahooFinanceClient";
import { createPortfolioFxRatesLoader, PORTFOLIO_USD_FX_PAIRS, type PortfolioFxRates } from "@/lib/portfolioFx";

let quotesPending: Promise<Map<string, number>> | null = null;
async function usdPerUnit(pairSymbol: string): Promise<number | null> {
  if (!quotesPending) {
    const request = yahooFinance.quote(PORTFOLIO_USD_FX_PAIRS.map(([, symbol]) => symbol))
      .then((raw) => new Map((Array.isArray(raw) ? raw : [raw]).flatMap((quote) => {
        const rate = Number(quote.regularMarketPrice);
        return Number.isFinite(rate) && rate > 0 ? [[quote.symbol, rate] as const] : [];
      })))
      .catch(() => new Map<string, number>());
    quotesPending = request;
    void request.finally(() => { if (quotesPending === request) quotesPending = null; });
  }
  return (await quotesPending).get(pairSymbol) ?? null;
}
const loadSpotRates = createPortfolioFxRatesLoader(usdPerUnit);

/** One bounded Yahoo batch, cached and shared between portfolio endpoints. */
export async function fetchPortfolioFxRates(): Promise<PortfolioFxRates> { return loadSpotRates(); }
