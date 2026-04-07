"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDecimalAsPercent,
  formatDividendYieldPercent,
  formatRatio,
  formatVolume,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { InvestorMetrics } from "@/lib/stockAnalysisTypes";

type Row = { label: string; value: string };

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function MetricTable({ title, rows, t }: { title: string; rows: Row[]; t: TFn }) {
  const visible = rows.filter((r) => r.value !== "—");
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="h-11 px-4 py-3 text-left text-muted-foreground">
              {t("investor.colMetric")}
            </TableHead>
            <TableHead className="h-11 px-4 py-3 text-right text-muted-foreground">
              {t("investor.colValue")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.label} className="border-white/10">
              <TableCell className="max-w-[min(100%,260px)] px-4 py-3.5 text-sm leading-relaxed text-muted-foreground">
                {row.label}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-right font-mono text-sm tabular-nums leading-snug text-foreground">
                {row.value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return formatCurrencyCompact(n);
  return formatCurrency(n);
}

function fmtYield(n: number | null): string {
  return formatDividendYieldPercent(n);
}

function fmtPayout(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const x = n > 1 ? n / 100 : n;
  return formatDecimalAsPercent(x);
}

function fmtRec(key: string | null): string {
  if (!key) return "—";
  return key.replace(/_/g, " ");
}

type InvestorMetricsSectionProps = {
  data: InvestorMetrics;
};

export function InvestorMetricsSection({ data }: InvestorMetricsSectionProps) {
  const { t } = useI18n();
  const m = data;

  const weekRange =
    m.fiftyTwoWeekLow != null && m.fiftyTwoWeekHigh != null
      ? `${formatCurrency(m.fiftyTwoWeekLow)} – ${formatCurrency(m.fiftyTwoWeekHigh)}`
      : "—";

  const valuationRows: Row[] = [
    { label: t("investor.marketCap"), value: fmtMoney(m.marketCap) },
    { label: t("investor.enterpriseValue"), value: fmtMoney(m.enterpriseValue) },
    { label: t("investor.trailingPE"), value: formatRatio(m.trailingPE) },
    { label: t("investor.forwardPE"), value: formatRatio(m.forwardPE) },
    { label: t("investor.pegRatio"), value: formatRatio(m.pegRatio) },
    { label: t("investor.priceToSales"), value: formatRatio(m.priceToSales) },
    { label: t("investor.priceToBook"), value: formatRatio(m.priceToBook) },
    { label: t("investor.evToRevenue"), value: formatRatio(m.enterpriseToRevenue) },
    { label: t("investor.evToEbitda"), value: formatRatio(m.enterpriseToEbitda) },
    { label: t("investor.beta"), value: formatRatio(m.beta) },
    { label: t("investor.ma50"), value: m.fiftyDayAverage != null ? formatCurrency(m.fiftyDayAverage) : "—" },
    { label: t("investor.ma200"), value: m.twoHundredDayAverage != null ? formatCurrency(m.twoHundredDayAverage) : "—" },
    { label: t("investor.weekRange52"), value: weekRange },
    { label: t("investor.volume"), value: m.regularMarketVolume != null ? formatVolume(m.regularMarketVolume) : "—" },
    {
      label: t("investor.avgVolume"),
      value: m.averageDailyVolume3Month != null ? formatVolume(m.averageDailyVolume3Month) : "—",
    },
  ];

  const profitRows: Row[] = [
    { label: t("investor.grossMargin"), value: formatDecimalAsPercent(m.grossMargins) },
    { label: t("investor.operatingMargin"), value: formatDecimalAsPercent(m.operatingMargins) },
    { label: t("investor.profitMargin"), value: formatDecimalAsPercent(m.profitMargins) },
    { label: t("investor.roe"), value: formatDecimalAsPercent(m.returnOnEquity) },
    { label: t("investor.roa"), value: formatDecimalAsPercent(m.returnOnAssets) },
    { label: t("investor.revenueGrowth"), value: formatDecimalAsPercent(m.revenueGrowth) },
    { label: t("investor.earningsGrowth"), value: formatDecimalAsPercent(m.earningsGrowth) },
  ];

  const balanceRows: Row[] = [
    { label: t("investor.debtToEquity"), value: formatRatio(m.debtToEquity) },
    { label: t("investor.currentRatio"), value: formatRatio(m.currentRatio) },
    { label: t("investor.quickRatio"), value: formatRatio(m.quickRatio) },
    { label: t("investor.totalCash"), value: fmtMoney(m.totalCash) },
    { label: t("investor.totalDebt"), value: fmtMoney(m.totalDebt) },
  ];

  const divRows: Row[] = [
    { label: t("investor.dividendRate"), value: m.dividendRate != null ? formatCurrency(m.dividendRate) : "—" },
    { label: t("investor.dividendYield"), value: fmtYield(m.dividendYield) },
    { label: t("investor.payoutRatio"), value: fmtPayout(m.payoutRatio) },
  ];

  const perShareRows: Row[] = [
    { label: t("investor.epsTrailing"), value: m.trailingEps != null ? formatRatio(m.trailingEps, 2) : "—" },
    { label: t("investor.epsForward"), value: m.forwardEps != null ? formatRatio(m.forwardEps, 2) : "—" },
    { label: t("investor.bookValue"), value: m.bookValue != null ? formatRatio(m.bookValue, 2) : "—" },
    { label: t("investor.revenuePerShare"), value: m.revenuePerShare != null ? formatRatio(m.revenuePerShare, 2) : "—" },
  ];

  const ownRows: Row[] = [
    { label: t("investor.sharesOutstanding"), value: m.sharesOutstanding != null ? formatVolume(m.sharesOutstanding) : "—" },
    { label: t("investor.floatShares"), value: m.floatShares != null ? formatVolume(m.floatShares) : "—" },
    { label: t("investor.heldInsiders"), value: formatDecimalAsPercent(m.heldPercentInsiders) },
    { label: t("investor.heldInstitutions"), value: formatDecimalAsPercent(m.heldPercentInstitutions) },
    { label: t("investor.shortPctFloat"), value: formatDecimalAsPercent(m.shortPercentOfFloat) },
  ];

  const analystRows: Row[] = [
    { label: t("investor.targetMean"), value: m.targetMeanPrice != null ? formatCurrency(m.targetMeanPrice) : "—" },
    { label: t("investor.targetMedian"), value: m.targetMedianPrice != null ? formatCurrency(m.targetMedianPrice) : "—" },
    { label: t("investor.recommendation"), value: fmtRec(m.recommendationKey) },
    {
      label: t("investor.numAnalysts"),
      value: m.numberOfAnalystOpinions != null ? String(Math.round(m.numberOfAnalystOpinions)) : "—",
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 shadow-lg shadow-black/15">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{t("investor.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("investor.subtitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground/80">{t("investor.currencyNote", { currency: m.currency })}</p>
      </div>
      <div className="space-y-8 px-5 py-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <MetricTable title={t("investor.secValuation")} rows={valuationRows} t={t} />
          <MetricTable title={t("investor.secProfitability")} rows={profitRows} t={t} />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <MetricTable title={t("investor.secBalance")} rows={balanceRows} t={t} />
          <MetricTable title={t("investor.secDividends")} rows={divRows} t={t} />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <MetricTable title={t("investor.secPerShare")} rows={perShareRows} t={t} />
          <MetricTable title={t("investor.secOwnership")} rows={ownRows} t={t} />
        </div>
        <MetricTable title={t("investor.secAnalysts")} rows={analystRows} t={t} />
      </div>
    </div>
  );
}
