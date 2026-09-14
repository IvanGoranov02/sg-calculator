"use client";

import { Check } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COMPARE_GROUPS,
  COMPARE_PERCENT_CHART_KEYS,
  COMPARE_RATIO_CHART_KEYS,
  COMPARE_SLOT_HEX,
  buildGroupBarPoints,
  buildOverviewBarRows,
  type CompareGroup,
  type OverviewBarRow,
} from "@/lib/compareMetrics";
import { formatRatio } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { CompareRow } from "@/lib/yahooCompare";
import { cn } from "@/lib/utils";

const GROUP_LABEL: Record<CompareGroup, string> = {
  valuation: "compare.groupValuation",
  profitability: "compare.groupProfit",
  growth: "compare.groupGrowth",
  balance: "compare.groupBalance",
  income: "compare.groupIncome",
  market: "compare.groupMarket",
};

type ChartTooltipPayload = { dataKey?: string | number; value?: number; color?: string; name?: string };

function SlotLegend({ rows }: { rows: CompareRow[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {rows.map((r, i) => (
        <span key={r.symbol} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-sm" style={{ background: COMPARE_SLOT_HEX[i] ?? COMPARE_SLOT_HEX[0] }} />
          {r.symbol}
        </span>
      ))}
    </div>
  );
}

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
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) =>
        p.value != null ? (
          <p key={String(p.dataKey)} style={{ color: p.color }}>
            {p.name}: {valueFormatter(p.value)}
          </p>
        ) : null,
      )}
    </div>
  );
}

function OverviewBarCard({
  title,
  hint,
  rows,
  data,
  valueFormatter,
}: {
  title: string;
  hint: string;
  rows: CompareRow[];
  data: OverviewBarRow[];
  valueFormatter: (v: number) => string;
}) {
  const { t } = useI18n();
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        label: t(d.labelKey),
        a: d.a,
        b: d.b,
      })),
    [data, t],
  );

  if (chartData.length === 0) return null;
  const aSym = rows[0]?.symbol ?? "A";
  const bSym = rows[1]?.symbol;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={52}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => valueFormatter(v)}
              />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as readonly ChartTooltipPayload[] | undefined}
                    label={label}
                    valueFormatter={valueFormatter}
                  />
                )}
              />
              {rows.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
              <Bar
                dataKey="a"
                name={aSym}
                fill={COMPARE_SLOT_HEX[0]}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              {bSym ? (
                <Bar
                  dataKey="b"
                  name={bSym}
                  fill={COMPARE_SLOT_HEX[1]}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
              ) : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricBarCard({
  label,
  rows,
  values,
  labels,
  pcts,
  best,
}: {
  label: string;
  rows: CompareRow[];
  values: (number | null)[];
  labels: string[];
  pcts: (number | null)[];
  best: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <p className="mb-3 text-sm font-medium tracking-tight">{label}</p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => {
          const v = values[i];
          const pct = pcts[i];
          const isBest = i === best;
          const negative = v != null && v < 0;
          const width = pct == null ? 0 : Math.max(8, Math.min(100, pct));
          return (
            <div key={r.symbol}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-muted-foreground">{r.symbol}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-mono tabular-nums",
                    isBest
                      ? "font-semibold text-emerald-700 dark:text-emerald-400"
                      : "text-foreground",
                  )}
                >
                  {labels[i]}
                  {isBest ? <Check className="size-3" aria-hidden /> : null}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${width}%`,
                    background: negative ? "#f87171" : COMPARE_SLOT_HEX[i] ?? COMPARE_SLOT_HEX[0],
                    opacity: pct == null ? 0 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CompareMetricCharts({ rows }: { rows: CompareRow[] }) {
  const { t } = useI18n();
  const percentRows = useMemo(
    () => buildOverviewBarRows(rows, COMPARE_PERCENT_CHART_KEYS, "percent"),
    [rows],
  );
  const ratioRows = useMemo(
    () => buildOverviewBarRows(rows, COMPARE_RATIO_CHART_KEYS, "raw"),
    [rows],
  );
  const groups = useMemo(
    () =>
      COMPARE_GROUPS.map((group) => ({
        group,
        points: buildGroupBarPoints(rows, group),
      })).filter((g) => g.points.length > 0),
    [rows],
  );

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{t("compare.chartsTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("compare.chartsHint")}</p>
        <div className="mt-2">
          <SlotLegend rows={rows} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewBarCard
          title={t("compare.chartMargins")}
          hint={t("compare.chartMarginsHint")}
          rows={rows}
          data={percentRows}
          valueFormatter={(v) => `${v.toFixed(0)}%`}
        />
        <OverviewBarCard
          title={t("compare.chartMultiples")}
          hint={t("compare.chartMultiplesHint")}
          rows={rows}
          data={ratioRows}
          valueFormatter={(v) => formatRatio(v)}
        />
      </div>

      {groups.map(({ group, points }) => (
        <section key={group} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold tracking-tight">{t(GROUP_LABEL[group])}</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {points.map((p) => (
              <MetricBarCard
                key={p.key}
                label={t(p.labelKey)}
                rows={rows}
                values={p.values}
                labels={p.labels}
                pcts={p.pcts}
                best={p.best}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
