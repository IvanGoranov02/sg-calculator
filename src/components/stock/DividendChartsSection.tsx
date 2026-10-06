"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { FundamentalChartCard, type FundamentalSeries } from "@/components/stock/FundamentalChartCard";
import { Button } from "@/components/ui/button";
import { buildAnnualChartRows, buildQuarterlyChartRows } from "@/lib/fundamentalsChartRows";
import { growthPillsForKey } from "@/lib/growthPills";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { computePayoutRatioPercent, sumQuarterlyDpsForFiscalYear } from "@/lib/payoutRatio";
import {
  filterAnnualRowsByPeriod,
  filterDividendQuarterlyByPeriod,
  filterQuarterlyChartRowsByPeriod,
  quarterlyFilterYearBounds,
  useStockAnalysisPeriod,
} from "@/lib/stockAnalysisPeriod";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type DividendChartsSectionProps = {
  data: StockAnalysisBundle;
};

export function DividendChartsSection({ data }: DividendChartsSectionProps) {
  const { t, locale } = useI18n();
  const dividendCurrency = data.investor.currency || "USD";
  const { timeRange, freq, customFromYear, customToYear } = useStockAnalysisPeriod();
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
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
  const formatYear = useCallback((fy: string) => t("chart.fyYear", { y: fy }), [t]);

  const quarterBounds = useMemo(
    () =>
      quarterlyFilterYearBounds({
        incomeQuarterly: data.incomeQuarterly,
        dividendQuarterly: data.dividendQuarterly,
      }),
    [data.incomeQuarterly, data.dividendQuarterly],
  );

  const pack = useMemo(() => {
    const allSorted = sortQuarterlyByDateAsc(data.dividendQuarterly);
    const allRows = allSorted.map((p) => ({ qDps: p.dividendPerShare }));
    const qDpsPills = growthPillsForKey(allRows, "qDps", "quarterly");

    const filtered = filterDividendQuarterlyByPeriod(
      data.dividendQuarterly,
      timeRange,
      customFromYear,
      customToYear,
      quarterBounds,
    );
    const sorted = sortQuarterlyByDateAsc(filtered);
    const hasDps = sorted.some((p) => p.dividendPerShare != null && p.dividendPerShare > 0);
    const rows = sorted.map((p) => ({
      periodEnd: p.date.slice(0, 10),
      label: formatPeriod(p.date),
      qDps: p.dividendPerShare,
    }));
    return { rows, hasDps, qDpsPills };
  }, [data.dividendQuarterly, formatPeriod, timeRange, customFromYear, customToYear, quarterBounds]);

  const payoutPack = useMemo(() => {
    const dpsByDate = new Map(
      data.dividendQuarterly.map((p) => [p.date.slice(0, 10), p.dividendPerShare] as const),
    );

    if (freq === "annual") {
      const baseRows = buildAnnualChartRows(data, formatYear);
      const incFiltered = filterAnnualRowsByPeriod(
        sortIncomeByYearAsc(data.income),
        timeRange,
        customFromYear,
        customToYear,
      );
      const allowed = new Set(incFiltered.map((r) => r.fiscalYear));
      const filtered = baseRows.filter(
        (r) => typeof r.fiscalYear === "string" && allowed.has(r.fiscalYear),
      );
      const allPayout = baseRows.map((r) => {
        const fy = typeof r.fiscalYear === "string" ? r.fiscalYear : "";
        const dps = fy ? sumQuarterlyDpsForFiscalYear(fy, data.dividendQuarterly) : null;
        return {
          payoutRatio: computePayoutRatioPercent({
            dps,
            eps: typeof r.dilutedEps === "number" ? r.dilutedEps : null,
            dividendsPaid: typeof r.dividendsPaid === "number" ? r.dividendsPaid : null,
            netIncome: typeof r.netIncome === "number" ? r.netIncome : null,
          }),
        };
      });
      const rows = filtered.map((r) => {
        const fy = typeof r.fiscalYear === "string" ? r.fiscalYear : "";
        const dps = fy ? sumQuarterlyDpsForFiscalYear(fy, data.dividendQuarterly) : null;
        return {
          label: String(r.label ?? fy),
          fiscalYear: fy,
          periodEnd: typeof r.periodEnd === "string" ? r.periodEnd : undefined,
          payoutRatio: computePayoutRatioPercent({
            dps,
            eps: typeof r.dilutedEps === "number" ? r.dilutedEps : null,
            dividendsPaid: typeof r.dividendsPaid === "number" ? r.dividendsPaid : null,
            netIncome: typeof r.netIncome === "number" ? r.netIncome : null,
          }),
        };
      });
      return {
        rows,
        pills: growthPillsForKey(allPayout, "payoutRatio", "annual"),
        hasPoints: rows.some((r) => r.payoutRatio != null),
      };
    }

    const baseRows = buildQuarterlyChartRows(data, formatPeriod, locale);
    if (!quarterBounds) {
      return { rows: [] as Record<string, unknown>[], pills: growthPillsForKey([], "payoutRatio", "quarterly"), hasPoints: false };
    }
    const filtered = filterQuarterlyChartRowsByPeriod(
      baseRows,
      timeRange,
      customFromYear,
      customToYear,
      quarterBounds,
    );
    const allPayout = baseRows.map((r) => {
      const pe = typeof r.periodEnd === "string" ? r.periodEnd.slice(0, 10) : "";
      return {
        payoutRatio: computePayoutRatioPercent({
          dps: pe ? (dpsByDate.get(pe) ?? null) : null,
          eps: typeof r.dilutedEps === "number" ? r.dilutedEps : null,
          dividendsPaid: typeof r.dividendsPaid === "number" ? r.dividendsPaid : null,
          netIncome: typeof r.netIncome === "number" ? r.netIncome : null,
        }),
      };
    });
    const rows = filtered.map((r) => {
      const pe = typeof r.periodEnd === "string" ? r.periodEnd.slice(0, 10) : "";
      return {
        periodEnd: pe,
        label: String(r.label ?? ""),
        payoutRatio: computePayoutRatioPercent({
          dps: pe ? (dpsByDate.get(pe) ?? null) : null,
          eps: typeof r.dilutedEps === "number" ? r.dilutedEps : null,
          dividendsPaid: typeof r.dividendsPaid === "number" ? r.dividendsPaid : null,
          netIncome: typeof r.netIncome === "number" ? r.netIncome : null,
        }),
      };
    });
    return {
      rows,
      pills: growthPillsForKey(allPayout, "payoutRatio", "quarterly"),
      hasPoints: rows.some((r) => r.payoutRatio != null),
    };
  }, [
    data,
    freq,
    formatYear,
    formatPeriod,
    locale,
    timeRange,
    customFromYear,
    customToYear,
    quarterBounds,
  ]);

  const showsDividend = useMemo(() => {
    const inv = data.investor;
    if (inv.dividendRate != null && inv.dividendRate > 0) return true;
    const y = inv.dividendYield;
    if (y != null) {
      const frac = y > 1 ? y / 100 : y;
      if (frac > 1e-6) return true;
    }
    if (data.dividendQuarterly.some((p) => p.dividendPerShare != null && p.dividendPerShare > 0))
      return true;
    return false;
  }, [data.investor, data.dividendQuarterly]);

  const qDpsSeries: FundamentalSeries[] = useMemo(
    () => [{ dataKey: "qDps", color: "#fb923c", label: t("chartsFund.dividendQtrPerShare") }],
    [t],
  );

  const payoutSeries: FundamentalSeries[] = useMemo(
    () => [{ dataKey: "payoutRatio", color: "#34d399", label: t("chartsFund.payoutRatioSeries") }],
    [t],
  );

  const payoutAxisProps = useMemo(
    () =>
      freq === "quarterly"
        ? { xKey: "periodEnd" as const, xLabelFormatter: formatPeriod }
        : {},
    [freq, formatPeriod],
  );

  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiManualNonce, setAiManualNonce] = useState(0);

  useEffect(() => {
    if (data.dividendQuarterly.length === 0 || pack.hasDps) {
      setAiNote(null);
      setAiLoading(false);
      return;
    }
    const ac = new AbortController();
    setAiLoading(true);
    setAiNote(null);
    (async () => {
      try {
        const u = new URL("/api/dividend-insight", window.location.origin);
        u.searchParams.set("ticker", data.quote.symbol);
        u.searchParams.set("locale", locale);
        u.searchParams.set("name", data.quote.name);
        u.searchParams.set("_", String(Date.now()));
        if (data.investor.dividendYield != null) {
          u.searchParams.set("yield", String(data.investor.dividendYield));
        }
        if (data.investor.dividendRate != null) {
          u.searchParams.set("rate", String(data.investor.dividendRate));
        }
        const res = await fetch(u.toString(), { signal: ac.signal, cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean; text?: string };
        if (body.ok && typeof body.text === "string" && body.text.trim()) {
          setAiNote(body.text.trim());
        }
      } catch {
        /* aborted or network */
      } finally {
        if (!ac.signal.aborted) setAiLoading(false);
      }
    })();
    return () => ac.abort();
  }, [
    pack.hasDps,
    data.dividendQuarterly.length,
    data.quote.symbol,
    data.quote.name,
    data.investor.dividendYield,
    data.investor.dividendRate,
    locale,
    aiManualNonce,
  ]);

  const onReloadYahoo = () => {
    startRefresh(() => {
      router.refresh();
    });
  };

  const onReloadAi = () => {
    setAiManualNonce((n) => n + 1);
  };

  if (data.dividendQuarterly.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{t("chartsFund.dividendSectionTitle")}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={onReloadYahoo}
            className="border-border bg-card"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            {t("chartsFund.dividendRefreshData")}
          </Button>
          {!pack.hasDps ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={aiLoading}
              onClick={onReloadAi}
              className="border-border bg-card"
            >
              <Sparkles className="size-3.5" />
              {t("chartsFund.dividendRefreshAi")}
            </Button>
          ) : null}
        </div>
      </div>

      {!pack.hasDps ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {showsDividend ? t("chartsFund.dividendDataIncomplete") : t("chartsFund.dividendNonPayer")}
          </p>
          {aiLoading ? (
            <p className="text-xs text-muted-foreground">{t("chartsFund.dividendAiLoading")}</p>
          ) : null}
          {aiNote ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">{t("chartsFund.dividendAiContextTitle")}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{aiNote}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <FundamentalChartCard
            title={t("chartsFund.dividendQtrChartTitle")}
            xKey="periodEnd"
            xLabelFormatter={formatPeriod}
            data={pack.rows}
            series={qDpsSeries}
            chartType="bar"
            valueFormat="perShare"
            currency={dividendCurrency}
            growthPills={[{ pills: pack.qDpsPills }]}
            hideCoverageNote
          />
          {payoutPack.hasPoints ? (
            <FundamentalChartCard
              {...payoutAxisProps}
              title={t("chartsFund.payoutRatioChartTitle")}
              data={payoutPack.rows}
              series={payoutSeries}
              chartType="bar"
              valueFormat="percent"
              growthPills={[{ pills: payoutPack.pills }]}
              hideCoverageNote
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                {t("chartsFund.payoutRatioEmpty")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
