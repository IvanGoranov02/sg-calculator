import {
  buildAnnualChartRows,
  buildQuarterlyChartRows,
  enrichPopGrowth,
  type FundamentalsChartRow,
} from "@/lib/fundamentalsChartRows";
import {
  filterAnnualRowsByPeriod,
  filterQuarterlyChartRowsByPeriod,
  quarterlyFilterYearBounds,
  type ChartTimeRange,
  type FundamentalsFreq,
} from "@/lib/stockPeriodCore";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc } from "@/lib/stockAnalysisTypes";

function formatPeriodEn(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatFyEn(fy: string): string {
  return `FY ${fy}`;
}

function compactUsd(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const abs = Math.abs(x);
  if (abs >= 1e12) return `${(x / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return x.toFixed(0);
}

function pctStr(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${x.toFixed(1)}%`;
}

/** Same filtered rows as fundamentals charts (annual / quarterly + time presets). */
export function getFilteredFundamentalsRowsForAi(
  bundle: StockAnalysisBundle,
  freq: FundamentalsFreq,
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
): FundamentalsChartRow[] {
  const baseRows =
    freq === "annual"
      ? buildAnnualChartRows(bundle, formatFyEn)
      : buildQuarterlyChartRows(bundle, formatPeriodEn);
  if (baseRows.length === 0) return [];

  if (freq === "annual") {
    const incFiltered = filterAnnualRowsByPeriod(
      sortIncomeByYearAsc(bundle.income),
      timeRange,
      customFromYear,
      customToYear,
    );
    const allowed = new Set(incFiltered.map((r) => r.fiscalYear));
    return baseRows.filter((r) => typeof r.fiscalYear === "string" && allowed.has(r.fiscalYear));
  }

  const bounds = quarterlyFilterYearBounds({
    incomeQuarterly: bundle.incomeQuarterly,
    dividendQuarterly: bundle.dividendQuarterly,
  });
  if (!bounds) return [];
  return filterQuarterlyChartRowsByPeriod(
    baseRows,
    timeRange,
    customFromYear,
    customToYear,
    bounds,
  );
}

export function buildAiFundamentalsTableText(
  bundle: StockAnalysisBundle,
  params: {
    freq: FundamentalsFreq;
    timeRange: ChartTimeRange;
    customFromYear: number | null;
    customToYear: number | null;
  },
  maxChars = 14_000,
): string {
  const filtered = getFilteredFundamentalsRowsForAi(
    bundle,
    params.freq,
    params.timeRange,
    params.customFromYear,
    params.customToYear,
  );
  const rows = enrichPopGrowth(filtered);

  const header =
    "Period | Revenue | GrossProfit | OpEx | OpInc | EBITDA | NetInc | FCF | OCF | DilEPS | gross% | net% | rev QoQ/YoY% | ni QoQ/YoY%";

  const lines = rows.map((r) => {
    const tag = String(r.label ?? r.periodEnd ?? "");
    return [
      tag,
      compactUsd(r.revenue),
      compactUsd(r.grossProfit),
      compactUsd(r.operatingExpenses),
      compactUsd(r.operatingIncome),
      compactUsd(r.ebitda),
      compactUsd(r.netIncome),
      compactUsd(r.fcf),
      compactUsd(r.ocf),
      r.dilutedEps != null && Number.isFinite(Number(r.dilutedEps))
        ? Number(r.dilutedEps).toFixed(2)
        : "—",
      pctStr(r.grossMargin),
      pctStr(r.netMargin),
      r.revPopGrowth != null ? `${Number(r.revPopGrowth).toFixed(1)}%` : "—",
      r.niPopGrowth != null ? `${Number(r.niPopGrowth).toFixed(1)}%` : "—",
    ].join(" | ");
  });

  let out = [header, ...lines].join("\n");
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars)}\n… (truncated)`;
  }
  return out;
}

export function describePeriodForAi(
  timeRange: ChartTimeRange,
  freq: FundamentalsFreq,
  customFromYear: number | null,
  customToYear: number | null,
): string {
  const gran = freq === "annual" ? "annual (fiscal years)" : "quarterly (period-end dates)";
  if (timeRange === "custom") {
    const a = customFromYear ?? "?";
    const b = customToYear ?? "?";
    return `custom calendar years ${a}–${b} on period-end, ${gran}`;
  }
  return `preset "${timeRange}" (last ${timeRange === "1y" ? "1" : timeRange === "3y" ? "3" : timeRange === "5y" ? "5" : "10"} fiscal years for annual / matching quarter count for quarterly), ${gran}`;
}
