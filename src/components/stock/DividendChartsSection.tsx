"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FundamentalChartCard, type FundamentalSeries } from "@/components/stock/FundamentalChartCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeTtmDpsGrowthPills,
  rollingSum4Quarterly,
  rollingSum4QuarterlyLoose,
} from "@/lib/dividendMetrics";
import { formatCurrencyPerShare } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { filterDividendQuarterlyByPeriod, useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

function GrowthPill({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) {
    return (
      <span className="rounded-full bg-zinc-800/90 px-2.5 py-1 font-mono text-[11px] tabular-nums text-muted-foreground">
        {label}: —
      </span>
    );
  }
  const pos = pct >= 0;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 font-mono text-[11px] tabular-nums",
        pos ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300",
      )}
    >
      {label}: {pos ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

type DividendChartsSectionProps = {
  data: StockAnalysisBundle;
  symbol: string;
  onBundleReplace?: (bundle: StockAnalysisBundle) => void;
};

export function DividendChartsSection({ data, symbol, onBundleReplace }: DividendChartsSectionProps) {
  const { t, locale } = useI18n();
  const { timeRange, customFromYear, customToYear } = useStockAnalysisPeriod();
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [geminiBusy, setGeminiBusy] = useState(false);

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

  const pack = useMemo(() => {
    const filtered = filterDividendQuarterlyByPeriod(
      data.dividendQuarterly,
      timeRange,
      customFromYear,
      customToYear,
    );
    const sorted = sortQuarterlyByDateAsc(filtered);
    const dpsArr = sorted.map((p) => p.dividendPerShare);
    const ttmStrict = rollingSum4Quarterly(dpsArr);
    const loose = rollingSum4QuarterlyLoose(dpsArr);
    const pills = computeTtmDpsGrowthPills(ttmStrict);
    const hasDps =
      dpsArr.some((v) => v != null && (v as number) > 0) ||
      ttmStrict.some((v) => v != null && (v as number) > 0) ||
      loose.sums.some((v) => v != null && (v as number) > 0);
    const rows = sorted.map((p, i) => ({
      label: formatPeriod(p.date),
      ttmDps: loose.sums[i],
      ttmPartial: loose.partial[i],
      qDps: dpsArr[i],
    }));
    return { rows, pills, hasDps, anyTtmPartial: loose.partial.some(Boolean) };
  }, [data.dividendQuarterly, formatPeriod, timeRange, customFromYear, customToYear]);

  /** Some quarters have DPS, others null — holes in the series (TTM / charts). */
  const hasDividendSeriesGaps = useMemo(() => {
    const sorted = sortQuarterlyByDateAsc(data.dividendQuarterly);
    const dps = sorted.map((p) => p.dividendPerShare);
    const anyValue = dps.some((v) => v != null && Number.isFinite(v as number) && (v as number) > 0);
    const anyHole = dps.some((v) => v == null || !Number.isFinite(v as number));
    return anyValue && anyHole;
  }, [data.dividendQuarterly]);

  const showGeminiFill =
    Boolean(onBundleReplace) && (hasDividendSeriesGaps || pack.anyTtmPartial || !pack.hasDps);

  const runGeminiFill = useCallback(async () => {
    if (!onBundleReplace) return;
    setGeminiBusy(true);
    try {
      const res = await fetch("/api/stock/gemini-balance-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: symbol, bundle: data }),
      });
      const j = (await res.json()) as { ok?: boolean; bundle?: StockAnalysisBundle };
      if (j.bundle && j.ok) onBundleReplace(j.bundle);
    } finally {
      setGeminiBusy(false);
    }
  }, [onBundleReplace, symbol, data]);

  const yahooShowsDividend = useMemo(() => {
    const inv = data.investor;
    if (inv.dividendRate != null && inv.dividendRate > 0) return true;
    const y = inv.dividendYield;
    if (y == null) return false;
    const frac = y > 1 ? y / 100 : y;
    return frac > 1e-6;
  }, [data.investor]);

  const qDpsSeries: FundamentalSeries[] = useMemo(
    () => [{ dataKey: "qDps", color: "#fb923c", label: t("chartsFund.dividendQtrPerShare") }],
    [t],
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
          <p className="mt-1 text-sm text-muted-foreground">{t("chartsFund.dividendSectionSubtitle")}</p>
          <p className="mt-2 text-xs text-muted-foreground/90">{t("chartsFund.periodFilterTablesHint")}</p>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t("chartsFund.dividendRefreshHint")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={onReloadYahoo}
            className="border-white/15 bg-zinc-900/50"
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
              className="border-white/15 bg-zinc-900/50"
            >
              <Sparkles className="size-3.5" />
              {t("chartsFund.dividendRefreshAi")}
            </Button>
          ) : null}
          {showGeminiFill ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={geminiBusy}
              onClick={() => void runGeminiFill()}
              className="border-emerald-500/35 bg-emerald-950/45 hover:bg-emerald-900/45"
            >
              {geminiBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {geminiBusy ? t("chartsFund.loadAgainGeminiBusy") : t("chartsFund.loadAgainGemini")}
            </Button>
          ) : null}
        </div>
      </div>

      {!pack.hasDps ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {yahooShowsDividend ? t("chartsFund.dividendDataIncomplete") : t("chartsFund.dividendNonPayer")}
          </p>
          {aiLoading ? (
            <p className="text-xs text-muted-foreground">{t("chartsFund.dividendAiLoading")}</p>
          ) : null}
          {aiNote ? (
            <div className="rounded-lg border border-white/10 bg-zinc-900/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">{t("chartsFund.dividendAiContextTitle")}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{aiNote}</p>
              <p className="mt-3 text-[11px] text-muted-foreground">{t("chartsFund.dividendAiDisclaimer")}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-white/10 bg-zinc-900/40 sm:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("chartsFund.dividendTtmTitle")}</CardTitle>
              <CardDescription className="text-xs">
                {t("chartsFund.dividendTtmDesc")}
                {pack.anyTtmPartial ? (
                  <span className="mt-1 block text-[11px] text-amber-200/80">{t("chartsFund.dividendTtmPartialNote")}</span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pack.rows} margin={{ top: 8, right: 8, left: 0, bottom: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                      interval="preserveStartEnd"
                      angle={-32}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      width={76}
                      tickFormatter={(v: number) => formatCurrencyPerShare(v)}
                    />
                    <Tooltip
                      formatter={
                        ((value: unknown, name: string, item: { payload?: { ttmPartial?: boolean } }) => {
                          const v = Array.isArray(value) ? value[0] : value;
                          if (v === undefined || v === null) return "—";
                          const fmt = formatCurrencyPerShare(typeof v === "number" ? v : Number(v));
                          const partial = item?.payload?.ttmPartial === true;
                          if (partial) {
                            return [`${fmt} (${t("chartsFund.dividendTtmPartialShort")})`, name];
                          }
                          return [fmt, name];
                        }) as never
                      }
                      contentStyle={{
                        background: "rgba(9,9,11,0.95)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                    />
                    <Bar
                      dataKey="ttmDps"
                      name={t("chartsFund.dividendTtmLabel")}
                      fill="#fb923c"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={44}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <GrowthPill label={t("chartsFund.pill1Y")} pct={pack.pills.oneYear} />
                <GrowthPill label={t("chartsFund.pill2Y")} pct={pack.pills.twoYear} />
                <GrowthPill label={t("chartsFund.pill5Y")} pct={pack.pills.fiveYear} />
                <GrowthPill label={t("chartsFund.pill10Y")} pct={pack.pills.tenYear} />
              </div>
            </CardContent>
          </Card>

          <FundamentalChartCard
            className="sm:col-span-2"
            title={t("chartsFund.dividendQtrChartTitle")}
            description={t("chartsFund.dividendQtrChartDesc")}
            data={pack.rows}
            series={qDpsSeries}
            chartType="line"
            valueFormat="perShare"
            geminiRetry={Boolean(onBundleReplace)}
            onGeminiRetry={() => void runGeminiFill()}
            geminiRetryPending={geminiBusy}
          />
        </div>
      )}
    </div>
  );
}
