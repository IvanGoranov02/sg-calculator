import type { InvestorMetrics } from "@/lib/stockAnalysisTypes";

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(
  ...sources: Array<Record<string, unknown> | null | undefined>
): (key: string) => number | null {
  return (key: string) => {
    for (const s of sources) {
      if (!s || !(key in s)) continue;
      const x = num(s[key]);
      if (x !== null) return x;
    }
    return null;
  };
}

/**
 * Merge Yahoo `quote` (single-symbol) with `quoteSummary` modules:
 * financialData, defaultKeyStatistics, summaryDetail.
 */
export function mapInvestorMetrics(
  rawQuote: Record<string, unknown>,
  quoteSummary: Record<string, unknown> | null,
): InvestorMetrics {
  const sd = (quoteSummary?.summaryDetail ?? null) as Record<string, unknown> | null;
  const fd = (quoteSummary?.financialData ?? null) as Record<string, unknown> | null;
  const dks = (quoteSummary?.defaultKeyStatistics ?? null) as Record<string, unknown> | null;

  const p = pick(rawQuote, sd, dks, fd);

  const dividendYield =
    p("trailingAnnualDividendYield") ??
    p("dividendYield") ??
    num(sd?.dividendYield) ??
    num(rawQuote.trailingAnnualDividendYield);

  const payout = p("payoutRatio") ?? num(sd?.payoutRatio);

  return {
    currency: String(sd?.currency ?? rawQuote.currency ?? "USD"),
    marketCap: p("marketCap"),
    enterpriseValue: p("enterpriseValue"),
    trailingPE: p("trailingPE"),
    forwardPE: p("forwardPE"),
    pegRatio: p("pegRatio"),
    priceToSales: p("priceToSalesTrailing12Months"),
    priceToBook: p("priceToBook"),
    enterpriseToRevenue: p("enterpriseToRevenue"),
    enterpriseToEbitda: p("enterpriseToEbitda"),
    beta: p("beta"),
    fiftyTwoWeekLow: p("fiftyTwoWeekLow"),
    fiftyTwoWeekHigh: p("fiftyTwoWeekHigh"),
    fiftyDayAverage: p("fiftyDayAverage"),
    twoHundredDayAverage: p("twoHundredDayAverage"),
    regularMarketVolume: p("regularMarketVolume") ?? p("volume"),
    averageDailyVolume3Month: p("averageDailyVolume3Month"),
    grossMargins: p("grossMargins") ?? num(fd?.grossMargins),
    operatingMargins: p("operatingMargins") ?? num(fd?.operatingMargins),
    profitMargins: p("profitMargins") ?? num(fd?.profitMargins),
    returnOnEquity: p("returnOnEquity") ?? num(fd?.returnOnEquity),
    returnOnAssets: p("returnOnAssets") ?? num(fd?.returnOnAssets),
    revenueGrowth: p("revenueGrowth") ?? num(fd?.revenueGrowth),
    earningsGrowth: p("earningsGrowth") ?? num(fd?.earningsGrowth),
    debtToEquity: p("debtToEquity") ?? num(fd?.debtToEquity),
    currentRatio: p("currentRatio") ?? num(fd?.currentRatio),
    quickRatio: p("quickRatio") ?? num(fd?.quickRatio),
    totalCash: p("totalCash") ?? num(fd?.totalCash),
    totalDebt: p("totalDebt") ?? num(fd?.totalDebt),
    dividendRate: p("dividendRate") ?? p("trailingAnnualDividendRate") ?? num(sd?.dividendRate),
    dividendYield,
    payoutRatio: payout,
    trailingEps:
      p("trailingEps") ??
      p("epsTrailingTwelveMonths") ??
      num(dks?.trailingEps) ??
      num(rawQuote.epsTrailingTwelveMonths),
    forwardEps: p("forwardEps") ?? num(dks?.forwardEps) ?? num(rawQuote.epsForward),
    bookValue: p("bookValue") ?? num(dks?.bookValue) ?? num(rawQuote.bookValue),
    revenuePerShare: p("revenuePerShare") ?? num(fd?.revenuePerShare),
    sharesOutstanding: p("sharesOutstanding") ?? num(dks?.sharesOutstanding),
    floatShares: p("floatShares") ?? num(dks?.floatShares),
    heldPercentInsiders: p("heldPercentInsiders") ?? num(dks?.heldPercentInsiders),
    heldPercentInstitutions: p("heldPercentInstitutions") ?? num(dks?.heldPercentInstitutions),
    shortPercentOfFloat: p("shortPercentOfFloat") ?? num(dks?.shortPercentOfFloat),
    targetMeanPrice: num(fd?.targetMeanPrice),
    targetMedianPrice: num(fd?.targetMedianPrice),
    recommendationKey:
      typeof fd?.recommendationKey === "string" ? fd.recommendationKey : null,
    numberOfAnalystOpinions: num(fd?.numberOfAnalystOpinions),
  };
}
