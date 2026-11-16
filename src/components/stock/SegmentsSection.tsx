"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { GrowthPillsGroup } from "@/components/stock/GrowthPillsRow";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCompact, formatPercent } from "@/lib/format";
import { computeGrowthPills, type GrowthPillsEntry } from "@/lib/growthPills";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { fiscalYearEndMonth, quarterLabel, quarterTitle } from "@/lib/quarterLabels";
import { useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";
import type { SegmentPeriod, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

const COLORS = [
  "var(--series-blue)",
  "var(--series-amber)",
  "var(--series-emerald)",
  "var(--series-violet)",
  "var(--series-rose)",
  "var(--series-cyan)",
  "var(--series-orange)",
  "var(--series-slate)",
];
/** More lines than this are folded into "Other" so the chart stays readable. */
const MAX_LINES = 7;

const TEXT = {
  en: {
    title: "Revenue by business line",
    pick: "Click a business line to hide or show it.",
    all: "Show all",
    total: "Total",
    other: "Other",
    line: "Business line",
    latest: "Latest",
    share: "Share",
    yoy: "vs a year earlier",
    reorganised: "The company changed how it groups its businesses, so older periods use the earlier grouping.",
  },
  bg: {
    title: "Приходи по бизнес",
    pick: "Натисни бизнес, за да го скриеш или покажеш.",
    all: "Покажи всички",
    total: "Общо",
    other: "Други",
    line: "Бизнес",
    latest: "Последно",
    share: "Дял",
    yoy: "спрямо година по-рано",
    reorganised: "Компанията е променила групирането на бизнесите си, затова по-старите периоди са по предишното групиране.",
  },
} as const;

export function SegmentsSection({ data }: { data: StockAnalysisBundle }) {
  const { locale, t } = useI18n();
  const c = TEXT[locale === "bg" ? "bg" : "en"];
  const { freq } = useStockAnalysisPeriod();
  const seg = data.segments;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const fyEndMonth = useMemo(() => fiscalYearEndMonth(data.income.map((r) => r.date)), [data.income]);

  const model = useMemo(() => {
    if (!seg) return null;
    const quarterly = freq === "quarterly" && seg.quarterly.length >= 2;
    const periods: SegmentPeriod[] = quarterly ? seg.quarterly : seg.annual.length ? seg.annual : seg.quarterly;
    if (periods.length === 0) return null;
    const byQuarter = quarterly || !seg.annual.length;
    const latest = periods[periods.length - 1];
    // Rank by the newest period; lines that no longer exist come after the current ones.
    const peak = (name: string) => Math.max(0, ...periods.map((p) => p.values[name] ?? 0));
    const ranked = [...seg.names]
      .filter((n) => periods.some((p) => p.values[n] != null))
      .sort((a, b) => (latest.values[b] ?? -1) - (latest.values[a] ?? -1) || peak(b) - peak(a));
    const top = ranked.slice(0, MAX_LINES);
    const rest = ranked.slice(MAX_LINES);
    const rows = periods.map((p) => {
      const row: Record<string, number | string> = byQuarter
        ? { label: quarterLabel(p.date, fyEndMonth, locale), title: quarterTitle(p.date, fyEndMonth, locale) }
        : { label: t("chart.fyYear", { y: p.date.slice(0, 4) }), title: t("chart.fyYear", { y: p.date.slice(0, 4) }) };
      for (const n of top) if (p.values[n] != null) row[n] = p.values[n];
      const other = rest.reduce((a, n) => a + (p.values[n] ?? 0), 0);
      if (rest.length > 0 && other !== 0) row[c.other] = other;
      return row;
    });
    const total = Object.values(latest.values).reduce((a, v) => a + v, 0);
    const back = byQuarter ? 4 : 1;
    const prior = periods.length > back ? periods[periods.length - 1 - back] : null;
    const series = (rest.length > 0 ? [...top, c.other] : top).map((name, i) => ({ name, color: COLORS[i % COLORS.length]! }));
    const table = series
      .map(({ name, color }) => {
        const pick = (p: SegmentPeriod | null) =>
          p == null ? undefined : name === c.other ? rest.reduce((a, n) => a + (p.values[n] ?? 0), 0) || undefined : p.values[name];
        const now = pick(latest);
        if (now == null) return null;
        const then = pick(prior);
        return {
          name,
          color,
          value: now,
          share: total > 0 ? (now / total) * 100 : null,
          yoy: then != null && then > 0 ? ((now - then) / then) * 100 : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    const reorganised = ranked.some((n) => latest.values[n] == null);
    return { rows, series, table, reorganised, perYear: byQuarter ? 4 : 1 };
  }, [seg, freq, locale, c.other, fyEndMonth, t]);

  const pillLabels = useMemo(
    () => ({ oneYear: t("chartsFund.pill1Y"), twoYear: t("chartsFund.pill2Y"), threeYear: t("chartsFund.pill3Y") }),
    [t],
  );

  if (!model) return null;

  const shown = model.series.filter((s) => !hidden.has(s.name));
  const allShown = shown.length === model.series.length;
  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      // Hiding the last visible line would leave an empty chart; keep at least one.
      else if (model.series.length - next.size > 1) next.add(name);
      return next;
    });

  // Growth under the chart: for the whole company while every line is on, otherwise for each line picked.
  const sumOf = (row: Record<string, number | string>, names: string[]) => {
    let sum = 0;
    let any = false;
    for (const n of names) {
      const v = row[n];
      if (typeof v === "number") {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  };
  const growth: GrowthPillsEntry[] = allShown
    ? [{ label: c.total, pills: computeGrowthPills(model.rows.map((r) => sumOf(r, model.series.map((s) => s.name))), model.perYear) }]
    : shown.map((s) => ({ label: s.name, pills: computeGrowthPills(model.rows.map((r) => sumOf(r, [s.name])), model.perYear) }));

  const titleByLabel = new Map(model.rows.map((r) => [String(r.label), String(r.title)]));

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl">{c.title}</CardTitle>
        {model.reorganised ? <CardDescription>{c.reorganised}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={c.pick}>
            {model.series.map((s) => {
              const on = !hidden.has(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.name)}
                  className={cn(
                    "flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    on ? "border-border bg-muted/60 text-foreground" : "border-border/50 text-muted-foreground opacity-60 hover:opacity-100",
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ background: on ? s.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${s.color}` }}
                    aria-hidden
                  />
                  {s.name}
                </button>
              );
            })}
            {!allShown ? (
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                className="min-h-8 rounded-full px-2.5 py-1 text-xs text-primary underline-offset-2 hover:underline"
              >
                {c.all}
              </button>
            ) : null}
          </div>
          <div className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  minTickGap={12}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v: number) => formatCurrencyCompact(v)}
                />
                <Tooltip
                  formatter={((v: number) => formatCurrencyCompact(Number(v))) as never}
                  labelFormatter={(label) => titleByLabel.get(String(label)) ?? String(label)}
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.3 }}
                  contentStyle={{
                    background: "rgba(9,9,11,0.95)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                />
                {shown.map((s) => (
                  <Bar key={s.name} dataKey={s.name} name={s.name} stackId="rev" fill={s.color} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <GrowthPillsGroup entries={growth} labels={pillLabels} className="mt-3" />
        </div>
        <div className="min-w-0 overflow-x-auto lg:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">{c.line}</th>
                <th className="px-2 py-2 text-right font-semibold">{c.latest}</th>
                <th className="px-2 py-2 text-right font-semibold">{c.share}</th>
                <th className="py-2 pl-2 text-right font-semibold">{c.yoy}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {model.table.map((r) => (
                <tr
                  key={r.name}
                  className={cn("cursor-pointer hover:bg-muted/30", hidden.has(r.name) && "opacity-45")}
                  onClick={() => toggle(r.name)}
                >
                  <td className="py-2 pr-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
                      <span className="break-words">{r.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrencyCompact(r.value)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.share != null ? `${r.share.toFixed(1)}%` : "—"}</td>
                  <td
                    className={
                      r.yoy == null
                        ? "py-2 pl-2 text-right tabular-nums text-muted-foreground"
                        : r.yoy >= 0
                          ? "py-2 pl-2 text-right tabular-nums text-emerald-400"
                          : "py-2 pl-2 text-right tabular-nums text-red-400"
                    }
                  >
                    {r.yoy != null ? formatPercent(r.yoy, 1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
