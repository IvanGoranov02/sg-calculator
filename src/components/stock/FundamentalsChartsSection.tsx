"use client";

import { useCallback, useMemo, useState } from "react";

import { FundamentalChartCard, type FundamentalSeries } from "@/components/stock/FundamentalChartCard";
import { Button } from "@/components/ui/button";
import { safePct, safeRatio } from "@/lib/annualTables";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type Freq = "annual" | "quarterly";

type Row = Record<string, unknown>;

const C = {
  revenue: "#60a5fa",
  netIncome: "#a78bfa",
  opIncome: "#818cf8",
  gross: "#22d3ee",
  opex: "#f87171",
  fcf: "#fbbf24",
  ocf: "#34d399",
  capex: "#fb923c",
  invest: "#c084fc",
  finance: "#f472b6",
  assets: "#60a5fa",
  debt: "#f87171",
  equity: "#4ade80",
  cash: "#2dd4bf",
  netDebt: "#fb7185",
  ebitda: "#e879f9",
};

function buildAnnualRows(bundle: StockAnalysisBundle, formatYear: (fy: string) => string): Row[] {
  const inc = sortIncomeByYearAsc(bundle.income);
  const cfMap = new Map(bundle.cashFlow.map((c) => [c.fiscalYear, c]));
  const bsMap = new Map(bundle.balanceSheet.map((b) => [b.fiscalYear, b]));
  return inc.map((r) => {
    const cf = cfMap.get(r.fiscalYear);
    const bs = bsMap.get(r.fiscalYear);
    const rev = r.revenue;
    return {
      label: formatYear(r.fiscalYear),
      revenue: r.revenue,
      netIncome: r.netIncome,
      operatingIncome: r.operatingIncome ?? null,
      grossProfit: r.grossProfit,
      operatingExpenses: r.operatingExpenses,
      ebitda: r.ebitda ?? null,
      grossMargin: safePct(r.grossProfit, rev),
      operatingMargin: r.operatingIncome != null ? safePct(r.operatingIncome, rev) : null,
      netMargin: safePct(r.netIncome, rev),
      ocf: cf?.operatingCashFlow ?? null,
      fcf: cf?.freeCashFlow ?? null,
      capex: cf?.capitalExpenditure ?? null,
      investCf: cf?.investingCashFlow ?? null,
      financeCf: cf?.financingCashFlow ?? null,
      totalAssets: bs?.totalAssets ?? null,
      totalDebt: bs?.totalDebt ?? null,
      equity: bs?.stockholdersEquity ?? null,
      cash: bs?.cashAndCashEquivalents ?? null,
      netDebt: bs?.netDebt ?? null,
      currentRatio: safeRatio(bs?.totalCurrentAssets ?? null, bs?.totalCurrentLiabilities ?? null),
      roe:
        bs?.stockholdersEquity != null && bs.stockholdersEquity !== 0
          ? safePct(r.netIncome, bs.stockholdersEquity)
          : null,
      roa: bs?.totalAssets != null && bs.totalAssets !== 0 ? safePct(r.netIncome, bs.totalAssets) : null,
      fcfMargin:
        cf != null && rev !== 0 ? safePct(cf.freeCashFlow, rev) : null,
    };
  });
}

function buildQuarterlyRows(
  bundle: StockAnalysisBundle,
  formatPeriod: (dateIso: string) => string,
): Row[] {
  const inc = sortQuarterlyByDateAsc(bundle.incomeQuarterly);
  const cfByDate = new Map(bundle.cashFlowQuarterly.map((c) => [c.date, c]));
  const bsByDate = new Map(bundle.balanceSheetQuarterly.map((b) => [b.date, b]));
  return inc.map((r) => {
    const cf = cfByDate.get(r.date);
    const bs = bsByDate.get(r.date);
    const rev = r.revenue;
    return {
      label: formatPeriod(r.date),
      revenue: r.revenue,
      netIncome: r.netIncome,
      operatingIncome: r.operatingIncome ?? null,
      grossProfit: r.grossProfit,
      operatingExpenses: r.operatingExpenses,
      ebitda: r.ebitda ?? null,
      grossMargin: safePct(r.grossProfit, rev),
      operatingMargin: r.operatingIncome != null ? safePct(r.operatingIncome, rev) : null,
      netMargin: safePct(r.netIncome, rev),
      ocf: cf?.operatingCashFlow ?? null,
      fcf: cf?.freeCashFlow ?? null,
      capex: cf?.capitalExpenditure ?? null,
      investCf: cf?.investingCashFlow ?? null,
      financeCf: cf?.financingCashFlow ?? null,
      totalAssets: bs?.totalAssets ?? null,
      totalDebt: bs?.totalDebt ?? null,
      equity: bs?.stockholdersEquity ?? null,
      cash: bs?.cashAndCashEquivalents ?? null,
      netDebt: bs?.netDebt ?? null,
      currentRatio: safeRatio(bs?.totalCurrentAssets ?? null, bs?.totalCurrentLiabilities ?? null),
      roe:
        bs?.stockholdersEquity != null && bs.stockholdersEquity !== 0
          ? safePct(r.netIncome, bs.stockholdersEquity)
          : null,
      roa: bs?.totalAssets != null && bs.totalAssets !== 0 ? safePct(r.netIncome, bs.totalAssets) : null,
      fcfMargin:
        cf != null && rev !== 0 ? safePct(cf.freeCashFlow, rev) : null,
    };
  });
}

type FundamentalsChartsSectionProps = {
  data: StockAnalysisBundle;
};

export function FundamentalsChartsSection({ data }: FundamentalsChartsSectionProps) {
  const { t, locale } = useI18n();
  const [freq, setFreq] = useState<Freq>("annual");

  const formatYear = useCallback((fy: string) => t("chart.fyYear", { y: fy }), [t]);

  const formatPeriod = useCallback(
    (dateIso: string) => {
      const d = new Date(`${dateIso}T12:00:00Z`);
      return d.toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", {
        month: "short",
        year: "2-digit",
      });
    },
    [locale],
  );

  const rows = useMemo(() => {
    if (freq === "annual") return buildAnnualRows(data, formatYear);
    return buildQuarterlyRows(data, formatPeriod);
  }, [data, freq, formatYear, formatPeriod]);

  const hasQuarterly = data.incomeQuarterly.length > 0;
  const hasEbitda = useMemo(
    () => rows.some((r) => r.ebitda != null && Number.isFinite(r.ebitda as number)),
    [rows],
  );

  const series = useMemo(
    () => ({
      revenue: [{ dataKey: "revenue", color: C.revenue, label: t("income.revenue") }] satisfies FundamentalSeries[],
      incomeDual: [
        { dataKey: "netIncome", color: C.netIncome, label: t("income.netIncome") },
        { dataKey: "operatingIncome", color: C.opIncome, label: t("annual.operatingIncome") },
      ] satisfies FundamentalSeries[],
      gpOpex: [
        { dataKey: "grossProfit", color: C.gross, label: t("income.grossProfit") },
        { dataKey: "operatingExpenses", color: C.opex, label: t("income.operatingExpenses") },
      ] satisfies FundamentalSeries[],
      margins: [
        { dataKey: "grossMargin", color: C.gross, label: t("annual.grossMargin") },
        { dataKey: "operatingMargin", color: C.opIncome, label: t("annual.operatingMargin") },
        { dataKey: "netMargin", color: C.netIncome, label: t("annual.netMargin") },
      ] satisfies FundamentalSeries[],
      ebitdaNi: [
        { dataKey: "ebitda", color: C.ebitda, label: t("annual.ebitda") },
        { dataKey: "netIncome", color: C.netIncome, label: t("income.netIncome") },
      ] satisfies FundamentalSeries[],
      cashTrio: [
        { dataKey: "ocf", color: C.ocf, label: t("annual.ocf") },
        { dataKey: "fcf", color: C.fcf, label: t("annual.fcf") },
        { dataKey: "capex", color: C.capex, label: t("annual.capex") },
      ] satisfies FundamentalSeries[],
      investFinance: [
        { dataKey: "investCf", color: C.invest, label: t("annual.investingCf") },
        { dataKey: "financeCf", color: C.finance, label: t("annual.financingCf") },
      ] satisfies FundamentalSeries[],
      balance3: [
        { dataKey: "totalAssets", color: C.assets, label: t("annual.totalAssets") },
        { dataKey: "totalDebt", color: C.debt, label: t("annual.totalDebt") },
        { dataKey: "equity", color: C.equity, label: t("annual.equity") },
      ] satisfies FundamentalSeries[],
      cashDebt: [
        { dataKey: "cash", color: C.cash, label: t("annual.cash") },
        { dataKey: "netDebt", color: C.netDebt, label: t("annual.netDebt") },
      ] satisfies FundamentalSeries[],
      roeRoa: [
        { dataKey: "roe", color: C.netIncome, label: t("annual.roe") },
        { dataKey: "roa", color: C.ocf, label: t("annual.roa") },
      ] satisfies FundamentalSeries[],
      currentRatio: [{ dataKey: "currentRatio", color: C.cash, label: t("annual.currentRatio") }] satisfies FundamentalSeries[],
      fcfMargin: [{ dataKey: "fcfMargin", color: C.fcf, label: t("annual.fcfMargin") }] satisfies FundamentalSeries[],
    }),
    [t],
  );

  const empty = rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("chartsFund.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("chartsFund.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={freq === "annual" ? "default" : "outline"}
            className={cn(
              "rounded-lg",
              freq === "annual" && "bg-emerald-600 text-white hover:bg-emerald-600/90",
            )}
            onClick={() => setFreq("annual")}
          >
            {t("chartsFund.annual")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={freq === "quarterly" ? "default" : "outline"}
            className={cn(
              "rounded-lg",
              freq === "quarterly" && "bg-emerald-600 text-white hover:bg-emerald-600/90",
            )}
            onClick={() => setFreq("quarterly")}
            disabled={!hasQuarterly}
            title={!hasQuarterly ? t("chartsFund.quarterlyUnavailable") : undefined}
          >
            {t("chartsFund.quarterly")}
          </Button>
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">{t("chartsFund.noRows")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FundamentalChartCard
            title={t("chartsFund.chartRevenue")}
            description={t("chartsFund.chartRevenueDesc")}
            data={rows}
            series={series.revenue}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartNetOpIncome")}
            description={t("chartsFund.chartNetOpIncomeDesc")}
            data={rows}
            series={series.incomeDual}
            chartType="line"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartGpOpex")}
            description={t("chartsFund.chartGpOpexDesc")}
            data={rows}
            series={series.gpOpex}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartMargins")}
            description={t("chartsFund.chartMarginsDesc")}
            data={rows}
            series={series.margins}
            chartType="line"
            valueFormat="percent"
          />
          {hasEbitda ? (
            <FundamentalChartCard
              title={t("chartsFund.chartEbitdaNi")}
              description={t("chartsFund.chartEbitdaNiDesc")}
              data={rows}
              series={series.ebitdaNi}
              chartType="line"
              valueFormat="currency"
            />
          ) : null}
          <FundamentalChartCard
            title={t("chartsFund.chartCashTrio")}
            description={t("chartsFund.chartCashTrioDesc")}
            data={rows}
            series={series.cashTrio}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartInvestFinance")}
            description={t("chartsFund.chartInvestFinanceDesc")}
            data={rows}
            series={series.investFinance}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartBalance")}
            description={t("chartsFund.chartBalanceDesc")}
            data={rows}
            series={series.balance3}
            chartType="line"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartCashNetDebt")}
            description={t("chartsFund.chartCashNetDebtDesc")}
            data={rows}
            series={series.cashDebt}
            chartType="line"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartRoeRoa")}
            description={t("chartsFund.chartRoeRoaDesc")}
            data={rows}
            series={series.roeRoa}
            chartType="line"
            valueFormat="percent"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartCurrentRatio")}
            description={t("chartsFund.chartCurrentRatioDesc")}
            data={rows}
            series={series.currentRatio}
            chartType="line"
            valueFormat="ratio"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartFcfMargin")}
            description={t("chartsFund.chartFcfMarginDesc")}
            data={rows}
            series={series.fcfMargin}
            chartType="line"
            valueFormat="percent"
          />
        </div>
      )}
    </div>
  );
}
