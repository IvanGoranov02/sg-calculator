import type { HistoricalEodBar, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

/** YYYY-MM-DD only — avoids bad comparisons between "2024-06-30" and "2024-06-30T00:00:00.000Z". */
function normBarDate(d: string): string {
  return d.slice(0, 10);
}

/** Last daily close on or before `periodEnd` (YYYY-MM-DD). Bars should be sorted by {@link normBarDate} ascending. */
export function closeOnOrBefore(bars: HistoricalEodBar[], periodEnd: string): number | null {
  if (bars.length === 0) return null;
  const pe = normBarDate(periodEnd);
  let lo = 0;
  let hi = bars.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const bd = normBarDate(bars[mid].date);
    if (bd <= pe) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  const c = bars[best].close;
  return Number.isFinite(c) ? c : null;
}

export type PeriodValuation = { peTtm: number | null; psTtm: number | null };

/**
 * Trailing P/E and P/S from daily close at period end × fundamentals.
 * Quarterly: TTM EPS and TTM revenue (last 4 quarters); P/S = (price × diluted shares) / TTM revenue.
 * Annual: FY diluted EPS and FY revenue.
 */
export function computeValuationByPeriodEnd(bundle: StockAnalysisBundle, freq: "annual" | "quarterly"): Map<string, PeriodValuation> {
  const hist = [...bundle.historical].sort((a, b) => normBarDate(a.date).localeCompare(normBarDate(b.date)));
  if (freq === "annual") return computeAnnualMap(bundle, hist);
  return computeQuarterlyMap(bundle, hist);
}

function computeAnnualMap(bundle: StockAnalysisBundle, hist: HistoricalEodBar[]): Map<string, PeriodValuation> {
  const out = new Map<string, PeriodValuation>();
  const inc = sortIncomeByYearAsc(bundle.income);
  for (const r of inc) {
    const peDate = r.date.slice(0, 10);
    const price = closeOnOrBefore(hist, peDate);
    const eps = r.dilutedEps;
    const rev = r.revenue;
    const sh = r.dilutedAverageShares;
    let peTtm: number | null = null;
    let psTtm: number | null = null;
    if (price != null && eps != null && Number.isFinite(eps) && eps > 0) peTtm = price / eps;
    if (price != null && sh != null && Number.isFinite(sh) && sh > 0 && Number.isFinite(rev) && rev > 0) {
      psTtm = (price * sh) / rev;
    }
    out.set(peDate, { peTtm, psTtm });
  }
  return out;
}

function computeQuarterlyMap(bundle: StockAnalysisBundle, hist: HistoricalEodBar[]): Map<string, PeriodValuation> {
  const out = new Map<string, PeriodValuation>();
  const inc = sortQuarterlyByDateAsc(bundle.incomeQuarterly);
  for (let i = 3; i < inc.length; i++) {
    const row = inc[i];
    const peDate = row.date.slice(0, 10);
    let ttmEps = 0;
    let epsOk = true;
    for (let j = i - 3; j <= i; j++) {
      const e = inc[j].dilutedEps;
      if (e == null || !Number.isFinite(e)) {
        epsOk = false;
        break;
      }
      ttmEps += e;
    }
    let ttmRev = 0;
    let revOk = true;
    for (let j = i - 3; j <= i; j++) {
      const v = inc[j].revenue;
      if (v == null || !Number.isFinite(v)) {
        revOk = false;
        break;
      }
      ttmRev += v;
    }
    const sh =
      row.dilutedAverageShares ??
      inc[i - 1].dilutedAverageShares ??
      inc[i - 2].dilutedAverageShares ??
      inc[i - 3].dilutedAverageShares ??
      null;
    const price = closeOnOrBefore(hist, peDate);
    let peTtm: number | null = null;
    let psTtm: number | null = null;
    if (price != null && epsOk && ttmEps > 0) peTtm = price / ttmEps;
    if (price != null && revOk && ttmRev > 0 && sh != null && Number.isFinite(sh) && sh > 0) {
      psTtm = (price * sh) / ttmRev;
    }
    out.set(peDate, { peTtm, psTtm });
  }
  return out;
}
