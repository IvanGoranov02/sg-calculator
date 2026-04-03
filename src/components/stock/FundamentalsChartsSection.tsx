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
  div: "#f472b6",
  buyback: "#94a3b8",
  ar: "#38bdf8",
  inv: "#f59e0b",
  gw: "#a78bfa",
  ltDebt: "#f97316",
  revGrowth: "#22c55e",
  niGrowth: "#eab308",
};

function buildAnnualRows(bundle: StockAnalysisBundle, formatYear: (fy: string) => string): Row[] {
  const inc = sortIncomeByYearAsc(bundle.income);
  const cfMap = new Map(bundle.cashFlow.map((c) => [c.fiscalYear, c]));
  const bsMap = new Map(bundle.balanceSheet.map((b) => [b.fiscalYear, b]));
  return inc.map((r) => {
    const cf = cfMap.get(r.fiscalYear);
    const bs = bsMap.get(r.fiscalYear);
    const rev = r.revenue;
    const ebitda = r.ebitda ?? null;
    return {
      label: formatYear(r.fiscalYear),
      revenue: r.revenue,
      netIncome: r.netIncome,
      operatingIncome: r.operatingIncome ?? null,
      grossProfit: r.grossProfit,
      operatingExpenses: r.operatingExpenses,
      ebitda,
      grossMargin: safePct(r.grossProfit, rev),
      operatingMargin: r.operatingIncome != null ? safePct(r.operatingIncome, rev) : null,
      netMargin: safePct(r.netIncome, rev),
      ebitdaMargin: ebitda != null && rev !== 0 ? safePct(ebitda, rev) : null,
      ocfMargin:
        cf?.operatingCashFlow != null && rev !== 0 ? safePct(cf.operatingCashFlow, rev) : null,
      ocf: cf?.operatingCashFlow ?? null,
      fcf: cf?.freeCashFlow ?? null,
      capex: cf?.capitalExpenditure ?? null,
      investCf: cf?.investingCashFlow ?? null,
      financeCf: cf?.financingCashFlow ?? null,
      dividendsPaid: cf?.dividendsPaid ?? null,
      stockRepurchase: cf?.stockRepurchase ?? null,
      totalAssets: bs?.totalAssets ?? null,
      totalDebt: bs?.totalDebt ?? null,
      equity: bs?.stockholdersEquity ?? null,
      cash: bs?.cashAndCashEquivalents ?? null,
      netDebt: bs?.netDebt ?? null,
      ar: bs?.accountsReceivable ?? null,
      inventory: bs?.inventory ?? null,
      goodwill: bs?.goodwill ?? null,
      longTermDebt: bs?.longTermDebt ?? null,
      currentRatio: safeRatio(bs?.totalCurrentAssets ?? null, bs?.totalCurrentLiabilities ?? null),
      quickRatio: safeRatio(
        bs?.totalCurrentAssets != null && bs?.inventory != null
          ? bs.totalCurrentAssets - bs.inventory
          : null,
        bs?.totalCurrentLiabilities ?? null,
      ),
      debtToEquity: safeRatio(bs?.totalDebt ?? null, bs?.stockholdersEquity ?? null),
      netDebtToEbitda:
        ebitda != null && bs?.netDebt != null && ebitda > 0
          ? safeRatio(bs.netDebt, ebitda)
          : null,
      capexIntensity:
        cf?.capitalExpenditure != null && rev !== 0
          ? safePct(Math.abs(cf.capitalExpenditure), rev)
          : null,
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
    const ebitda = r.ebitda ?? null;
    return {
      label: formatPeriod(r.date),
      revenue: r.revenue,
      netIncome: r.netIncome,
      operatingIncome: r.operatingIncome ?? null,
      grossProfit: r.grossProfit,
      operatingExpenses: r.operatingExpenses,
      ebitda,
      grossMargin: safePct(r.grossProfit, rev),
      operatingMargin: r.operatingIncome != null ? safePct(r.operatingIncome, rev) : null,
      netMargin: safePct(r.netIncome, rev),
      ebitdaMargin: ebitda != null && rev !== 0 ? safePct(ebitda, rev) : null,
      ocfMargin:
        cf?.operatingCashFlow != null && rev !== 0 ? safePct(cf.operatingCashFlow, rev) : null,
      ocf: cf?.operatingCashFlow ?? null,
      fcf: cf?.freeCashFlow ?? null,
      capex: cf?.capitalExpenditure ?? null,
      investCf: cf?.investingCashFlow ?? null,
      financeCf: cf?.financingCashFlow ?? null,
      dividendsPaid: cf?.dividendsPaid ?? null,
      stockRepurchase: cf?.stockRepurchase ?? null,
      totalAssets: bs?.totalAssets ?? null,
      totalDebt: bs?.totalDebt ?? null,
      equity: bs?.stockholdersEquity ?? null,
      cash: bs?.cashAndCashEquivalents ?? null,
      netDebt: bs?.netDebt ?? null,
      ar: bs?.accountsReceivable ?? null,
      inventory: bs?.inventory ?? null,
      goodwill: bs?.goodwill ?? null,
      longTermDebt: bs?.longTermDebt ?? null,
      currentRatio: safeRatio(bs?.totalCurrentAssets ?? null, bs?.totalCurrentLiabilities ?? null),
      quickRatio: safeRatio(
        bs?.totalCurrentAssets != null && bs?.inventory != null
          ? bs.totalCurrentAssets - bs.inventory
          : null,
        bs?.totalCurrentLiabilities ?? null,
      ),
      debtToEquity: safeRatio(bs?.totalDebt ?? null, bs?.stockholdersEquity ?? null),
      netDebtToEbitda:
        ebitda != null && bs?.netDebt != null && ebitda > 0
          ? safeRatio(bs.netDebt, ebitda)
          : null,
      capexIntensity:
        cf?.capitalExpenditure != null && rev !== 0
          ? safePct(Math.abs(cf.capitalExpenditure), rev)
          : null,
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

function enrichPopGrowth(rows: Row[]): Row[] {
  return rows.map((row, i) => {
    const base = { ...row };
    if (i === 0) {
      base.revPopGrowth = null;
      base.niPopGrowth = null;
      return base;
    }
    const prev = rows[i - 1];
    const rev = Number(base.revenue);
    const prevRev = Number(prev.revenue);
    const ni = Number(base.netIncome);
    const prevNi = Number(prev.netIncome);
    base.revPopGrowth =
      Number.isFinite(rev) && Number.isFinite(prevRev) && prevRev !== 0
        ? ((rev - prevRev) / prevRev) * 100
        : null;
    base.niPopGrowth =
      Number.isFinite(ni) && Number.isFinite(prevNi) && prevNi !== 0
        ? ((ni - prevNi) / prevNi) * 100
        : null;
    return base;
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
    const base =
      freq === "annual" ? buildAnnualRows(data, formatYear) : buildQuarterlyRows(data, formatPeriod);
    return enrichPopGrowth(base);
  }, [data, freq, formatYear, formatPeriod]);

  const hasQuarterly = data.incomeQuarterly.length > 0;
  const hasEbitda = useMemo(
    () => rows.some((r) => r.ebitda != null && Number.isFinite(r.ebitda as number)),
    [rows],
  );
  const hasEbitdaOcfMargins = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.ebitdaMargin != null && Number.isFinite(r.ebitdaMargin as number)) ||
          (r.ocfMargin != null && Number.isFinite(r.ocfMargin as number)),
      ),
    [rows],
  );
  const hasNetDebtEbitda = useMemo(
    () => rows.some((r) => r.netDebtToEbitda != null && Number.isFinite(r.netDebtToEbitda as number)),
    [rows],
  );
  const hasShareholderFlows = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.dividendsPaid != null && Number.isFinite(r.dividendsPaid as number)) ||
          (r.stockRepurchase != null && Number.isFinite(r.stockRepurchase as number)),
      ),
    [rows],
  );
  const hasArInv = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.ar != null && Number.isFinite(r.ar as number)) ||
          (r.inventory != null && Number.isFinite(r.inventory as number)),
      ),
    [rows],
  );
  const hasGwLt = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.goodwill != null && Number.isFinite(r.goodwill as number)) ||
          (r.longTermDebt != null && Number.isFinite(r.longTermDebt as number)),
      ),
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
      popGrowth: [
        { dataKey: "revPopGrowth", color: C.revGrowth, label: t("chartsFund.seriesRevPop") },
        { dataKey: "niPopGrowth", color: C.niGrowth, label: t("chartsFund.seriesNiPop") },
      ] satisfies FundamentalSeries[],
      shareholder: [
        { dataKey: "dividendsPaid", color: C.div, label: t("annual.dividends") },
        { dataKey: "stockRepurchase", color: C.buyback, label: t("annual.buyback") },
      ] satisfies FundamentalSeries[],
      arInv: [
        { dataKey: "ar", color: C.ar, label: t("annual.accountsReceivable") },
        { dataKey: "inventory", color: C.inv, label: t("annual.inventory") },
      ] satisfies FundamentalSeries[],
      gwLt: [
        { dataKey: "goodwill", color: C.gw, label: t("annual.goodwill") },
        { dataKey: "longTermDebt", color: C.ltDebt, label: t("annual.longTermDebt") },
      ] satisfies FundamentalSeries[],
      ebitdaOcfMargin: [
        { dataKey: "ebitdaMargin", color: C.ebitda, label: t("chartsFund.seriesEbitdaMargin") },
        { dataKey: "ocfMargin", color: C.ocf, label: t("chartsFund.seriesOcfMargin") },
      ] satisfies FundamentalSeries[],
      debtEquity: [{ dataKey: "debtToEquity", color: C.debt, label: t("annual.debtToEquity") }] satisfies FundamentalSeries[],
      netDebtEbitda: [{ dataKey: "netDebtToEbitda", color: C.netDebt, label: t("chartsFund.seriesNetDebtEbitda") }] satisfies FundamentalSeries[],
      quickRatio: [{ dataKey: "quickRatio", color: C.ocf, label: t("chartsFund.chartQuickRatio") }] satisfies FundamentalSeries[],
      capexIntensity: [{ dataKey: "capexIntensity", color: C.capex, label: t("chartsFund.seriesCapexIntensity") }] satisfies FundamentalSeries[],
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
          <FundamentalChartCard
            title={t("chartsFund.chartPopGrowth")}
            description={freq === "annual" ? t("chartsFund.chartPopGrowthDescAnnual") : t("chartsFund.chartPopGrowthDescQ")}
            data={rows}
            series={series.popGrowth}
            chartType="line"
            valueFormat="percent"
          />
          {hasShareholderFlows ? (
            <FundamentalChartCard
              title={t("chartsFund.chartShareholder")}
              description={t("chartsFund.chartShareholderDesc")}
              data={rows}
              series={series.shareholder}
              chartType="bar"
              valueFormat="currency"
            />
          ) : null}
          {hasArInv ? (
            <FundamentalChartCard
              title={t("chartsFund.chartArInv")}
              description={t("chartsFund.chartArInvDesc")}
              data={rows}
              series={series.arInv}
              chartType="line"
              valueFormat="currency"
            />
          ) : null}
          {hasGwLt ? (
            <FundamentalChartCard
              title={t("chartsFund.chartGwLt")}
              description={t("chartsFund.chartGwLtDesc")}
              data={rows}
              series={series.gwLt}
              chartType="line"
              valueFormat="currency"
            />
          ) : null}
          {hasEbitdaOcfMargins ? (
            <FundamentalChartCard
              title={t("chartsFund.chartEbitdaOcfMargin")}
              description={t("chartsFund.chartEbitdaOcfMarginDesc")}
              data={rows}
              series={series.ebitdaOcfMargin}
              chartType="line"
              valueFormat="percent"
            />
          ) : null}
          <FundamentalChartCard
            title={t("chartsFund.chartDebtEquity")}
            description={t("chartsFund.chartDebtEquityDesc")}
            data={rows}
            series={series.debtEquity}
            chartType="line"
            valueFormat="ratio"
          />
          {hasNetDebtEbitda ? (
            <FundamentalChartCard
              title={t("chartsFund.chartNetDebtEbitda")}
              description={t("chartsFund.chartNetDebtEbitdaDesc")}
              data={rows}
              series={series.netDebtEbitda}
              chartType="line"
              valueFormat="ratio"
            />
          ) : null}
          <FundamentalChartCard
            title={t("chartsFund.chartQuickRatio")}
            description={t("chartsFund.chartQuickRatioDesc")}
            data={rows}
            series={series.quickRatio}
            chartType="line"
            valueFormat="ratio"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartCapexIntensity")}
            description={t("chartsFund.chartCapexIntensityDesc")}
            data={rows}
            series={series.capexIntensity}
            chartType="line"
            valueFormat="percent"
          />
        </div>
      )}
    </div>
  );
}
