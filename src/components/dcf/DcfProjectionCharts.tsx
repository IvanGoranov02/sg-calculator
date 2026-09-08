"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GuruFocusDcfYearPoint } from "@/lib/dcf";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type DcfProjectionChartsProps = {
  yearlyProjections: GuruFocusDcfYearPoint[];
  fairValuePerShare: number;
  currentPrice: number | null;
  baseMetricLabel: string;
};

type ChartTooltipPayload = { dataKey?: string | number; value?: number; color?: string };

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: readonly ChartTooltipPayload[];
  label?: string | number;
  valueFormatter: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) =>
        p.value != null ? (
          <p key={String(p.dataKey)} className="text-muted-foreground" style={{ color: p.color }}>
            {String(p.dataKey)}: {valueFormatter(p.value)}
          </p>
        ) : null,
      )}
    </div>
  );
}

export function DcfProjectionCharts({
  yearlyProjections,
  fairValuePerShare,
  currentPrice,
  baseMetricLabel,
}: DcfProjectionChartsProps) {
  const { t } = useI18n();

  const projectionRows = useMemo(
    () =>
      yearlyProjections.map((p) => ({
        year: `Y${p.year}`,
        projected: p.projected,
        presentValue: p.presentValue,
        cumulativePv: p.cumulativePv,
        stage: p.stage,
      })),
    [yearlyProjections],
  );

  const valuationRows = useMemo(() => {
    const rows = [{ name: t("dcf.chartFairValue"), value: fairValuePerShare, fill: "#34d399" }];
    if (currentPrice != null && currentPrice > 0) {
      rows.push({ name: t("dcf.chartPrice"), value: currentPrice, fill: "#60a5fa" });
    }
    return rows;
  }, [currentPrice, fairValuePerShare, t]);

  if (yearlyProjections.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-white/10 bg-zinc-900/40 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dcf.chartProjectedTitle")}</CardTitle>
          <CardDescription>
            {t("dcf.chartProjectedDesc", { metric: baseMetricLabel })}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={projectionRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#71717a" />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                stroke="#71717a"
                tickFormatter={(v) => formatCurrencyCompact(Number(v))}
              />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as readonly ChartTooltipPayload[] | undefined}
                    label={label}
                    valueFormatter={(v) => formatCurrency(v)}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="left"
                dataKey="projected"
                name={t("dcf.chartProjected")}
                fill="#a78bfa"
                radius={[2, 2, 0, 0]}
                opacity={0.85}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dcf.chartCumulativeTitle")}</CardTitle>
          <CardDescription>{t("dcf.chartCumulativeDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={projectionRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#71717a" />
              <YAxis tick={{ fontSize: 11 }} stroke="#71717a" tickFormatter={(v) => formatCurrencyCompact(Number(v))} />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as readonly ChartTooltipPayload[] | undefined}
                    label={label}
                    valueFormatter={(v) => formatCurrency(v)}
                  />
                )}
              />
              <Line
                type="monotone"
                dataKey="cumulativePv"
                name={t("dcf.chartCumulative")}
                stroke="#fbbf24"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dcf.chartValuationTitle")}</CardTitle>
          <CardDescription>{t("dcf.chartValuationDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={valuationRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#71717a" />
              <YAxis tick={{ fontSize: 11 }} stroke="#71717a" tickFormatter={(v) => formatCurrencyCompact(Number(v))} />
              <Tooltip
                formatter={(v) => formatCurrency(Number(v))}
                contentStyle={{
                  background: "rgba(9,9,11,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {currentPrice != null && currentPrice > 0 && fairValuePerShare > 0 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t("dcf.chartUpside", {
                pct: formatPercent(
                  ((fairValuePerShare - currentPrice) / currentPrice) * 100,
                  1,
                ),
              })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
