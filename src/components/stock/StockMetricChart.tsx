"use client";

import { useCallback, useMemo, useState } from "react";
import { Area, Bar, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatCurrencyEur, formatVolume } from "@/lib/format";
import { computeGrowthPills, computePriceHorizonCagr } from "@/lib/growthPills";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import { barsForRange, downsample, niceTicks, tickIndexes, tickLabel, tickUnitFor } from "@/lib/priceChart";
import type { PerformanceRange, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

const RANGES: PerformanceRange[] = ["1d", "1w", "1m", "3m", "6m", "ytd", "1y", "5y", "max"];
const TRADING_DAYS_PER_YEAR = 252;
const UP = "var(--series-green)";
const DOWN = "var(--series-red)";

const TEXT = {
  en: {
    section: "Share price",
    tab: { "1d": "1D", "1w": "1W", "1m": "1M", "3m": "3M", "6m": "6M", ytd: "YTD", "1y": "1Y", "5y": "5Y", max: "Max" },
    span: {
      "1d": "Today",
      "1w": "Past week",
      "1m": "Past month",
      "3m": "Past 3 months",
      "6m": "Past 6 months",
      ytd: "Year to date",
      "1y": "Past year",
      "5y": "Past 5 years",
      max: "All time",
    },
    high: "High",
    low: "Low",
    avgVolume: "Avg. daily volume",
    start: "Start",
    prevClose: "Previous close",
    returns: "Average yearly return",
    volume: "Volume",
    noData: "No price history for this range.",
  },
  bg: {
    section: "Цена на акцията",
    tab: { "1d": "1D", "1w": "1W", "1m": "1M", "3m": "3M", "6m": "6M", ytd: "YTD", "1y": "1Y", "5y": "5Y", max: "Макс" },
    span: {
      "1d": "Днес",
      "1w": "Последната седмица",
      "1m": "Последния месец",
      "3m": "Последните 3 месеца",
      "6m": "Последните 6 месеца",
      ytd: "От началото на годината",
      "1y": "Последната година",
      "5y": "Последните 5 години",
      max: "Цялата история",
    },
    high: "Най-висока",
    low: "Най-ниска",
    avgVolume: "Среден дневен обем",
    start: "Начало",
    prevClose: "Предишно затваряне",
    returns: "Средна годишна доходност",
    volume: "Обем",
    noData: "Няма ценова история за този период.",
  },
} as const;

type ChartRow = { i: number; date: string; close: number; volume: number | null };

function signed(n: number, body: string): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${body}`;
}

export function StockMetricChart({ data }: { data: StockAnalysisBundle }) {
  const { locale } = useI18n();
  const c = TEXT[locale === "bg" ? "bg" : "en"];
  const { displayCurrency } = usePreferences();
  const [range, setRange] = useState<PerformanceRange>("1y");
  const [hover, setHover] = useState<number | null>(null);

  const rate = data.eurPerUsd;
  const eur = displayCurrency === "eur" && rate != null && Number.isFinite(rate) && rate > 0;
  const money = useCallback((usd: number) => (eur ? formatCurrencyEur(usd * rate!) : formatCurrency(usd)), [eur, rate]);
  const axisMoney = useCallback(
    (usd: number) => {
      const v = eur ? usd * rate! : usd;
      return new Intl.NumberFormat(locale === "bg" ? "bg-BG" : "en-US", {
        style: "currency",
        currency: eur ? "EUR" : "USD",
        maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2,
      }).format(v);
    },
    [eur, rate, locale],
  );

  const intraday = range === "1d" && Boolean(data.intraday?.length);
  const model = useMemo(() => {
    const raw = barsForRange(data.historical, data.intraday, range);
    if (raw.length === 0) return null;
    const pts = downsample(raw);
    const rows: ChartRow[] = pts.map((p, i) => ({ i, date: p.date, close: p.close, volume: p.volume }));
    const last = raw[raw.length - 1]!.close;
    // 1D compares with the previous close (what the header shows); other ranges with their first close.
    const prevClose = data.quote.price - data.quote.change;
    const base =
      range === "1d" && Number.isFinite(prevClose) && prevClose > 0 ? prevClose : raw[0]!.close;
    const high = Math.max(...raw.map((p) => p.high));
    const low = Math.min(...raw.map((p) => p.low));
    const vols = raw.map((p) => p.volume).filter((v): v is number => v != null && v > 0);
    const avgVolume = vols.length ? vols.reduce((a, v) => a + v, 0) / vols.length : null;
    const closes = rows.map((r) => r.close);
    const lo = Math.min(...closes, base);
    const hi = Math.max(...closes, base);
    const pad = (hi - lo) * 0.08 || hi * 0.02;
    const yTicks = niceTicks(lo - pad, hi + pad, 4);
    const domain: [number, number] = [Math.min(lo - pad, yTicks[0] ?? lo), Math.max(hi + pad, yTicks[yTicks.length - 1] ?? hi)];
    const maxVol = Math.max(0, ...rows.map((r) => r.volume ?? 0));
    const unit = tickUnitFor(range, range === "1d" && Boolean(data.intraday?.length));
    const xTicks = tickIndexes(pts, unit);
    return { rows, last, base, high, low, avgVolume, yTicks, domain, maxVol, unit, xTicks };
  }, [data.historical, data.intraday, data.quote.price, data.quote.change, range]);

  const returns = useMemo(() => {
    const closes = [...data.historical].sort((a, b) => a.date.localeCompare(b.date)).map((r) => r.close);
    const g = computeGrowthPills(closes, TRADING_DAYS_PER_YEAR);
    const h = computePriceHorizonCagr(data.historical);
    return [
      { label: "1Y", pct: g.oneYear },
      { label: "2Y", pct: g.twoYear },
      { label: "3Y", pct: g.threeYear },
      { label: "5Y", pct: h.fiveYear },
      { label: "10Y", pct: h.tenYear },
    ].filter((r) => r.pct != null && Number.isFinite(r.pct));
  }, [data.historical]);

  const fullDate = useCallback(
    (iso: string) => {
      const loc = locale === "bg" ? "bg-BG" : "en-US";
      const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00Z`);
      if (intraday) return `${d.toLocaleDateString(loc, { day: "numeric", month: "short", timeZone: "UTC" })}, ${iso.slice(11, 16)}`;
      return d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    },
    [locale, intraday],
  );

  const hovered = model && hover != null ? model.rows[hover] : undefined;
  const shownPrice = hovered?.close ?? model?.last ?? null;
  const delta = model && shownPrice != null ? shownPrice - model.base : 0;
  const deltaPct = model && model.base > 0 ? (delta / model.base) * 100 : 0;
  const up = delta >= 0;
  const stroke = up ? UP : DOWN;
  const gradientId = `price-fill-${up ? "up" : "down"}`;
  const xTickSet = new Set(model?.xTicks ?? []);

  return (
    <Card className="min-w-0 gap-0 border-border bg-card py-0" aria-label={c.section}>
      <CardContent className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {/* Change for the range; while the pointer is on the chart: that day's price and change from the start. */}
          <div className="min-w-0" aria-live="polite">
            {model && shownPrice != null ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{money(shownPrice)}</span>
                  <span className={cn("text-sm font-medium tabular-nums", up ? "text-emerald-400" : "text-red-400")}>
                    {signed(delta, money(Math.abs(delta)))} ({signed(deltaPct, `${Math.abs(deltaPct).toFixed(2)}%`)})
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{hovered ? fullDate(hovered.date) : c.span[range]}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{c.noData}</p>
            )}
          </div>
          <div
            role="tablist"
            aria-label={c.section}
            className="-mx-1 flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {RANGES.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={range === id}
                title={c.span[id]}
                onClick={() => {
                  setRange(id);
                  setHover(null);
                }}
                className={cn(
                  "relative min-h-9 shrink-0 px-2.5 text-xs font-semibold tabular-nums transition-colors sm:px-3",
                  range === id
                    ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c.tab[id]}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64 min-w-0 sm:h-72 lg:h-80" onMouseLeave={() => setHover(null)}>
          {model ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={model.rows}
                margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
                onMouseMove={(state) => {
                  const idx = state?.activeTooltipIndex;
                  const n = idx == null ? NaN : Number(idx);
                  setHover(Number.isFinite(n) ? n : null);
                }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="i"
                  interval={0}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  height={24}
                  tick={(props: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) => {
                    const i = Number(props.payload?.value);
                    if (!xTickSet.has(i) || !model.rows[i]) return <g />;
                    return (
                      <text x={Number(props.x)} y={Number(props.y ?? 0) + 12} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                        {tickLabel(model.rows[i]!.date, model.unit, locale)}
                      </text>
                    );
                  }}
                />
                <YAxis
                  yAxisId="price"
                  orientation="right"
                  domain={model.domain}
                  ticks={model.yTicks}
                  allowDataOverflow
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickFormatter={(v: number) => axisMoney(v)}
                />
                {/* Volume sits in the bottom fifth, behind the price. */}
                <YAxis yAxisId="volume" hide domain={[0, Math.max(1, model.maxVol * 5)]} />
                {model.yTicks.map((v) => (
                  <ReferenceLine key={v} yAxisId="price" y={v} stroke="var(--border)" strokeOpacity={0.5} />
                ))}
                <ReferenceLine
                  yAxisId="price"
                  y={model.base}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.6}
                  strokeDasharray="2 4"
                />
                {model.maxVol > 0 ? (
                  <Bar
                    yAxisId="volume"
                    dataKey="volume"
                    fill="var(--muted-foreground)"
                    fillOpacity={0.18}
                    isAnimationActive={false}
                  />
                ) : null}
                <Area
                  yAxisId="price"
                  type="linear"
                  dataKey="close"
                  stroke={stroke}
                  strokeWidth={1.75}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: stroke, stroke: "var(--card)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const row = active ? (payload?.[0]?.payload as ChartRow | undefined) : undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-md border border-border bg-popover/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur">
                        <p className="text-muted-foreground">{fullDate(row.date)}</p>
                        <p className="font-semibold tabular-nums text-foreground">{money(row.close)}</p>
                        {row.volume ? (
                          <p className="tabular-nums text-muted-foreground">
                            {c.volume} {formatVolume(row.volume)}
                          </p>
                        ) : null}
                      </div>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : null}
        </div>

        {model ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 pt-4 text-sm sm:grid-cols-4">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{range === "1d" ? c.prevClose : c.start}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{money(model.base)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{c.high}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{money(model.high)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{c.low}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{money(model.low)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{c.avgVolume}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{model.avgVolume != null ? formatVolume(model.avgVolume) : "—"}</dd>
            </div>
          </dl>
        ) : null}

        {returns.length > 0 ? (
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">{c.returns}</span>
            {returns.map((r) => (
              <span key={r.label} className="tabular-nums">
                <span className="mr-1.5 text-xs text-muted-foreground">{r.label}</span>
                <span className={cn("font-medium", r.pct! >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {signed(r.pct!, `${Math.abs(r.pct!).toFixed(1)}%`)}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
