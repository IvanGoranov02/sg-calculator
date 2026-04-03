"use client";

import { useCallback, useEffect, useMemo } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeTtmDpsGrowthPills, rollingSum4Quarterly } from "@/lib/dividendMetrics";
import { formatCurrencyPerShare } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
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
};

export function DividendChartsSection({ data }: DividendChartsSectionProps) {
  const { t, locale } = useI18n();

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
    const sorted = sortQuarterlyByDateAsc(data.dividendQuarterly);
    const dpsArr = sorted.map((p) => p.dividendPerShare);
    const ttm = rollingSum4Quarterly(dpsArr);
    const pills = computeTtmDpsGrowthPills(ttm);
    const hasDps =
      dpsArr.some((v) => v != null && (v as number) > 0) ||
      ttm.some((v) => v != null && (v as number) > 0);
    const rows = sorted.map((p, i) => ({
      label: formatPeriod(p.date),
      ttmDps: ttm[i],
      qDps: dpsArr[i],
    }));
    return { rows, pills, hasDps };
  }, [data.dividendQuarterly, formatPeriod]);

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

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const sym = data.quote.symbol;
    const pts = data.dividendQuarterly;
    const withDps = pts.filter((p) => p.dividendPerShare != null && p.dividendPerShare > 0).length;
    console.log(
      `[sg-calculator:DividendChartsSection:${sym}] quarterlyPoints=${pts.length} quartersWithDps>0=${withDps}`,
      { lastQuarterly: pts.slice(-4), investorYield: data.investor.dividendYield },
    );
  }, [data.quote.symbol, data.dividendQuarterly, data.investor.dividendYield]);

  if (data.dividendQuarterly.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("chartsFund.dividendSectionTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("chartsFund.dividendSectionSubtitle")}</p>
      </div>

      {!pack.hasDps ? (
        <p className="text-sm text-muted-foreground">
          {yahooShowsDividend ? t("chartsFund.dividendDataIncomplete") : t("chartsFund.dividendNonPayer")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-white/10 bg-zinc-900/40 sm:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("chartsFund.dividendTtmTitle")}</CardTitle>
              <CardDescription className="text-xs">{t("chartsFund.dividendTtmDesc")}</CardDescription>
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
                        ((value: unknown) => {
                          const v = Array.isArray(value) ? value[0] : value;
                          if (v === undefined || v === null) return "—";
                          return formatCurrencyPerShare(typeof v === "number" ? v : Number(v));
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
          />
        </div>
      )}
    </div>
  );
}
