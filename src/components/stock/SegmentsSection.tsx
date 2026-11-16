"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCompact, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";
import type { SegmentPeriod, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

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
    desc: "From the segment note in the company's SEC filings. The lines add up to total revenue.",
    other: "Other",
    line: "Business line",
    latest: "Latest",
    share: "Share",
    yoy: "vs a year earlier",
    reorganised: "The company changed how it groups its businesses, so older periods use the earlier grouping.",
  },
  bg: {
    title: "Приходи по бизнес",
    desc: "От бележката за сегментите в отчетите на компанията в SEC. Сборът на линиите е равен на общите приходи.",
    other: "Други",
    line: "Бизнес",
    latest: "Последно",
    share: "Дял",
    yoy: "спрямо година по-рано",
    reorganised: "Компанията е променила групирането на бизнесите си, затова по-старите периоди са по предишното групиране.",
  },
} as const;

export function SegmentsSection({ data }: { data: StockAnalysisBundle }) {
  const { locale } = useI18n();
  const c = TEXT[locale === "bg" ? "bg" : "en"];
  const { freq } = useStockAnalysisPeriod();
  const seg = data.segments;

  const model = useMemo(() => {
    if (!seg) return null;
    const quarterly = freq === "quarterly" && seg.quarterly.length >= 2;
    const periods: SegmentPeriod[] = quarterly ? seg.quarterly : seg.annual.length ? seg.annual : seg.quarterly;
    if (periods.length === 0) return null;
    const latest = periods[periods.length - 1];
    // Rank by the newest period; lines that no longer exist come after the current ones.
    const peak = (name: string) => Math.max(0, ...periods.map((p) => p.values[name] ?? 0));
    const ranked = [...seg.names]
      .filter((n) => periods.some((p) => p.values[n] != null))
      .sort((a, b) => (latest.values[b] ?? -1) - (latest.values[a] ?? -1) || peak(b) - peak(a));
    const top = ranked.slice(0, MAX_LINES);
    const rest = ranked.slice(MAX_LINES);
    const label = (iso: string) => {
      const d = new Date(`${iso}T12:00:00Z`);
      return quarterly || !seg.annual.length
        ? d.toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", { month: "short", year: "2-digit" })
        : String(d.getUTCFullYear());
    };
    const rows = periods.map((p) => {
      const row: Record<string, number | string> = { label: label(p.date) };
      for (const n of top) if (p.values[n] != null) row[n] = p.values[n];
      const other = rest.reduce((a, n) => a + (p.values[n] ?? 0), 0);
      if (rest.length > 0 && other !== 0) row[c.other] = other;
      return row;
    });
    const total = Object.values(latest.values).reduce((a, v) => a + v, 0);
    const back = quarterly ? 4 : 1;
    const prior = periods.length > back ? periods[periods.length - 1 - back] : null;
    const table = top
      .filter((n) => latest.values[n] != null)
      .map((n) => {
        const now = latest.values[n];
        const then = prior?.values[n];
        return {
          name: n,
          value: now,
          share: total > 0 ? (now / total) * 100 : null,
          yoy: then != null && then > 0 ? ((now - then) / then) * 100 : null,
        };
      });
    const series = rest.length > 0 ? [...top, c.other] : top;
    const reorganised = ranked.some((n) => latest.values[n] == null);
    return { rows, series, table, reorganised };
  }, [seg, freq, locale, c.other]);

  if (!model) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl">{c.title}</CardTitle>
        <CardDescription>
          {c.desc}
          {model.reorganised ? ` ${c.reorganised}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6 lg:grid-cols-5">
        <div className="h-80 min-w-0 lg:col-span-3">
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
                cursor={{ fill: "var(--muted)", fillOpacity: 0.3 }}
                contentStyle={{
                  background: "rgba(9,9,11,0.95)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {model.series.map((name, i) => (
                <Bar key={name} dataKey={name} name={name} stackId="rev" fill={COLORS[i % COLORS.length]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
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
              {model.table.map((r, i) => (
                <tr key={r.name}>
                  <td className="py-2 pr-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />
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
