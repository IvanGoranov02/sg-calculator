"use client";

import { ArrowDownRight, ArrowUpRight, CalendarDays, Coins, Newspaper } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import type { PortfolioValueHistoryPayload } from "@/components/portfolio/PortfolioValueHistory";
import {
  lastMonthsIncome,
  quoteFor,
  topMovers,
  upcomingEvents,
  type DashHolding,
  type DashQuotes,
} from "@/lib/dashboardData";
import { formatCurrency, formatMonthKeyLabel, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { PortfolioAnalyticsData } from "@/lib/portfolioAnalytics";
import type { PortfolioDividendsPayload } from "@/lib/portfolioDividends";
import { convertPortfolioMoney, type PortfolioFxRates } from "@/lib/portfolioFx";
import type { MarketNewsItem, QuickQuote } from "@/lib/yahooQuickQuote";
import type { WatchlistQuoteRow } from "@/lib/watchlistTypes";
import { cn } from "@/lib/utils";

export const DASH_TEXT = {
  en: {
    market: "Markets",
    kpiValue: "Portfolio value",
    kpiPositions: "positions",
    kpiToday: "Today",
    kpiReturn: "Total return",
    kpiIncome: "Est. annual dividends",
    kpiYield: "yield",
    kpiReceived: "Dividends, last 12 months",
    kpiNext: "Next payout",
    kpiNone: "None scheduled",
    valueTitle: "Portfolio value",
    allocation: "Allocation",
    bySector: "By sector",
    byHolding: "By holding",
    other: "Other",
    income: "Dividend income",
    incomeTotal: "last 12 months",
    perMonth: "avg / month",
    upcoming: "Coming up",
    earnings: "Earnings",
    exDiv: "Ex-dividend",
    payDate: "Payout",
    movers: "Top movers",
    gainers: "Gainers",
    losers: "Losers",
    noMovers: "No moves to show yet.",
    holdings: "Holdings",
    company: "Company",
    value: "Value",
    weight: "Weight",
    day: "Day",
    pl: "P/L",
    watchlist: "Watchlist",
    news: "Market news",
    viewAll: "View all",
    open: "Open",
    manage: "Manage",
    loading: "Loading…",
    emptyWatch: "Your watchlist is empty.",
    addSymbols: "Add companies",
    signInTitle: "See your whole portfolio here",
    signInBody: "Sign in to see value, performance, dividends and what is coming up, all on one screen.",
    signIn: "Sign in",
    connectTitle: "Add your holdings to fill this page",
    connectBody: "Connect Trading 212 or add positions manually and the dashboard fills with your numbers.",
    connect: "Go to Portfolio",
    historyMore: "Earlier months are still loading in Portfolio.",
    ranges: { "6M": "6M", "1Y": "1Y", ALL: "All" },
    noData: "Not enough data yet.",
  },
  bg: {
    market: "Пазари",
    kpiValue: "Стойност на портфолиото",
    kpiPositions: "позиции",
    kpiToday: "Днес",
    kpiReturn: "Обща доходност",
    kpiIncome: "Очаквани дивиденти за година",
    kpiYield: "доходност",
    kpiReceived: "Дивиденти, последните 12 месеца",
    kpiNext: "Следващо плащане",
    kpiNone: "Няма насрочени",
    valueTitle: "Стойност на портфолиото",
    allocation: "Разпределение",
    bySector: "По сектори",
    byHolding: "По позиции",
    other: "Други",
    income: "Дивидентен доход",
    incomeTotal: "последните 12 месеца",
    perMonth: "средно / месец",
    upcoming: "Предстоящи",
    earnings: "Отчет",
    exDiv: "Екс-дивидент",
    payDate: "Плащане",
    movers: "Най-големи движения",
    gainers: "Растат",
    losers: "Падат",
    noMovers: "Все още няма движения.",
    holdings: "Позиции",
    company: "Компания",
    value: "Стойност",
    weight: "Дял",
    day: "Ден",
    pl: "П/З",
    watchlist: "Списък",
    news: "Новини от пазарите",
    viewAll: "Всички",
    open: "Отвори",
    manage: "Управление",
    loading: "Зареждане…",
    emptyWatch: "Списъкът ти е празен.",
    addSymbols: "Добави компании",
    signInTitle: "Виж цялото си портфолио тук",
    signInBody: "Влез, за да видиш стойност, доходност, дивиденти и предстоящи събития на един екран.",
    signIn: "Вход",
    connectTitle: "Добави позиции, за да се напълни страницата",
    connectBody: "Свържи Trading 212 или добави позиции ръчно и таблото се пълни с твоите числа.",
    connect: "Към Портфолио",
    historyMore: "По-ранните месеци още се зареждат в Портфолио.",
    ranges: { "6M": "6М", "1Y": "1Г", ALL: "Всичко" },
    noData: "Още няма достатъчно данни.",
  },
} as const;
export type DashText = { [K in keyof (typeof DASH_TEXT)["en"]]: (typeof DASH_TEXT)["en"][K] extends string ? string : Record<string, string> };

export function useDashText(): { c: DashText; locale: "en" | "bg"; dateLocale: string } {
  const { locale } = useI18n();
  const l = locale === "bg" ? "bg" : "en";
  return { c: DASH_TEXT[l] as unknown as DashText, locale: l, dateLocale: l === "bg" ? "bg-BG" : "en-GB" };
}

const upDown = (n: number) => (n >= 0 ? "text-emerald-400" : "text-red-400");

export function Panel({
  title,
  href,
  hrefLabel,
  right,
  className,
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-card", className)}>
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {right ??
          (href ? (
            <Link href={href} className="text-xs font-medium text-primary hover:underline">
              {hrefLabel} →
            </Link>
          ) : null)}
      </header>
      <div className="min-w-0 flex-1 px-4 pb-4">{children}</div>
    </section>
  );
}

function Pill({ value, className }: { value: number; className?: string }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", upDown(value), className)}>
      <Icon className="size-3.5" aria-hidden />
      {formatPercent(Math.abs(value)).replace("+", "")}
    </span>
  );
}

/* ───────────── Markets strip ───────────── */

export type MarketTile = { key: string; label: string; quote: QuickQuote | null; kind: "usd" | "num" | "pct" };

function formatTilePrice(q: QuickQuote, kind: MarketTile["kind"]): string {
  if (kind === "usd") return formatCurrency(q.price);
  if (kind === "pct") return `${q.price.toFixed(2)}%`;
  return q.price.toLocaleString("en-US", { maximumFractionDigits: q.price < 10 ? 4 : 2 });
}

export function MarketStrip({ tiles }: { tiles: MarketTile[] }) {
  const shown = tiles.filter((t) => t.quote);
  if (shown.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {shown.map(({ key, label, quote, kind }) => {
        const q = quote!;
        const up = q.changesPercentage >= 0;
        return (
          <div
            key={key}
            className="relative overflow-hidden rounded-xl border border-border bg-card px-4 py-3.5 shadow-card"
            title={q.name}
          >
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.5", up ? "bg-emerald-500" : "bg-red-500")} />
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatTilePrice(q, kind)}</p>
            <Pill value={q.changesPercentage} className="text-xs" />
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── KPI row ───────────── */

export function KpiRow({
  analytics,
  dayChange,
  dividends,
  base,
  positions,
}: {
  analytics: PortfolioAnalyticsData;
  dayChange: { amount: number; pct: number | null } | null;
  dividends: PortfolioDividendsPayload | null;
  base: string;
  positions: number;
}) {
  const { c, dateLocale } = useDashText();
  const money = (n: number) => formatCurrency(n, base);
  const received = dividends ? lastMonthsIncome(dividends.chartSeries, 12).reduce((s, p) => s + p.income, 0) : null;
  const next = dividends?.upcomingDividends[0] ?? null;

  const tiles: { label: string; value: string; sub: ReactNode; tone?: string }[] = [
    {
      label: c.kpiValue,
      value: money(analytics.totalValue),
      sub: `${positions} ${c.kpiPositions}`,
    },
    {
      label: c.kpiToday,
      value: dayChange ? `${dayChange.amount >= 0 ? "+" : "−"}${money(Math.abs(dayChange.amount))}` : "—",
      sub: dayChange?.pct != null ? <Pill value={dayChange.pct} /> : "",
      tone: dayChange ? upDown(dayChange.amount) : undefined,
    },
    {
      label: c.kpiReturn,
      value: `${analytics.totalPl >= 0 ? "+" : "−"}${money(Math.abs(analytics.totalPl))}`,
      sub: analytics.totalPlPct != null ? <Pill value={analytics.totalPlPct} /> : "",
      tone: upDown(analytics.totalPl),
    },
    {
      label: c.kpiIncome,
      value: money(analytics.totalIncome),
      sub: analytics.portfolioYield != null ? `${analytics.portfolioYield.toFixed(2)}% ${c.kpiYield}` : "",
    },
    {
      label: c.kpiReceived,
      value: received != null ? money(received) : "—",
      sub: "",
    },
    {
      label: c.kpiNext,
      value: next ? formatCurrency(next.amount, next.currency) : c.kpiNone,
      sub: next
        ? `${next.symbol} · ${new Date(`${next.date}T00:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}`
        : "",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 rounded-xl border border-border bg-card px-4 py-3.5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.label}</p>
          <p className={cn("mt-1.5 break-words text-2xl font-semibold tracking-tight tabular-nums", t.tone)}>{t.value}</p>
          <div className="mt-1 min-h-4 text-xs text-muted-foreground">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Value over time ───────────── */

export function ValueWidget({
  history,
  loading,
  base,
}: {
  history: PortfolioValueHistoryPayload | null;
  loading: boolean;
  base: string;
}) {
  const { c, locale } = useDashText();
  const [range, setRange] = useState<"6M" | "1Y" | "ALL">("ALL");

  const all = useMemo(() => {
    const pts = (history?.chartSeries ?? []).map((p) => ({ ...p, label: formatMonthKeyLabel(p.month, locale) }));
    const first = pts.findIndex((p) => (p.value ?? 0) > 0);
    return first < 0 ? [] : pts.slice(first);
  }, [history, locale]);

  const data = useMemo(() => {
    const n = range === "6M" ? 6 : range === "1Y" ? 12 : 0;
    return n && all.length > n ? all.slice(-n) : all;
  }, [all, range]);

  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const delta = last - first;

  const pills = (
    <div className="flex rounded-lg bg-muted p-0.5">
      {(["6M", "1Y", "ALL"] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRange(r)}
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
            range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {c.ranges[r]}
        </button>
      ))}
    </div>
  );

  return (
    <Panel title={c.valueTitle} href="/portfolio" hrefLabel={c.open} right={data.length > 1 ? pills : undefined} className="h-full">
      {data.length < 2 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{loading ? c.loading : c.noData}</p>
      ) : (
        <>
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(last, base)}</span>
            <span className={cn("text-xs font-medium", upDown(delta))}>
              {delta >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(delta), base)}
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashValueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={30} tickMargin={6} />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)}
                />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3", strokeOpacity: 0.5 }}
                  content={({ active, payload }) => {
                    const row = active ? (payload?.[0]?.payload as { label: string; value: number | null } | undefined) : undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
                        <p className="font-medium">{row.label}</p>
                        <p className="text-primary">{formatCurrency(row.value ?? 0, base)}</p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} fill="url(#dashValueFill)" dot={false} activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {history?.historyHasMore ? <p className="mt-1 text-[11px] text-muted-foreground">{c.historyMore}</p> : null}
        </>
      )}
    </Panel>
  );
}

/* ───────────── Allocation ───────────── */

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#e66fb0",
  "#fb923c",
  "#94a3b8",
];

export function AllocationWidget({ analytics }: { analytics: PortfolioAnalyticsData }) {
  const { c } = useDashText();
  const [view, setView] = useState<"sector" | "holding">(analytics.hasRealSectors ? "sector" : "holding");

  const slices = useMemo(() => {
    const src =
      view === "sector" && analytics.hasRealSectors
        ? analytics.sectors.map((s) => ({ name: s.name, value: s.value }))
        : analytics.holdings.map((h) => ({ name: h.symbol, value: h.value }));
    const top = src.slice(0, 7);
    const rest = src.slice(7).reduce((s, x) => s + x.value, 0);
    return rest > 0 ? [...top, { name: c.other, value: rest }] : top;
  }, [analytics, view, c.other]);

  const total = slices.reduce((s, x) => s + x.value, 0) || 1;

  const toggle = analytics.hasRealSectors ? (
    <div className="flex rounded-lg bg-muted p-0.5">
      {(["sector", "holding"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
            view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "sector" ? c.bySector : c.byHolding}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <Panel title={c.allocation} right={toggle} className="h-full">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                {slices.map((s, i) => (
                  <Cell key={s.name} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{slices.length}</span>
          </div>
        </div>
        <ul className="w-full min-w-0 space-y-2 text-sm">
          {slices.map((s, i) => (
            <li key={s.name} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
              <span className="min-w-0 flex-1 break-words">{s.name.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>
              <span className="tabular-nums text-muted-foreground">{((s.value / total) * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/* ───────────── Dividend income ───────────── */

export function DividendIncomeWidget({
  dividends,
  loading,
  base,
}: {
  dividends: PortfolioDividendsPayload | null;
  loading: boolean;
  base: string;
}) {
  const { c, locale } = useDashText();
  const months = useMemo(
    () =>
      dividends
        ? lastMonthsIncome(dividends.chartSeries, 12).map((m) => ({ ...m, label: formatMonthKeyLabel(m.month, locale) }))
        : [],
    [dividends, locale],
  );
  const total = months.reduce((s, m) => s + m.income, 0);

  return (
    <Panel title={c.income} href="/portfolio" hrefLabel={c.open} className="h-full">
      {months.length === 0 || total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{loading ? c.loading : c.noData}</p>
      ) : (
        <>
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(total, base)}</span>
            <span className="text-xs text-muted-foreground">
              {c.incomeTotal} · {formatCurrency(total / 12, base)} {c.perMonth}
            </span>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={({ active, payload }) => {
                    const row = active ? (payload?.[0]?.payload as { label: string; income: number } | undefined) : undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
                        <p className="font-medium">{row.label}</p>
                        <p className="text-emerald-400">{formatCurrency(row.income, base)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="income" radius={[4, 4, 0, 0]} maxBarSize={20} fill="var(--color-emerald-500)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ───────────── Coming up ───────────── */

export function UpcomingWidget({
  holdings,
  quotes,
  dividends,
}: {
  holdings: DashHolding[];
  quotes: DashQuotes;
  dividends: PortfolioDividendsPayload | null;
}) {
  const { c, dateLocale } = useDashText();

  const items = useMemo(() => {
    const out: { date: string; symbol: string; kind: "earnings" | "exDividend" | "payDate"; amount?: string }[] = [];
    const paySymbols = new Set<string>();
    for (const u of dividends?.upcomingDividends ?? []) {
      paySymbols.add(u.symbol.toUpperCase());
      out.push({ date: u.date, symbol: u.symbol, kind: "payDate", amount: formatCurrency(u.amount, u.currency) });
    }
    for (const e of upcomingEvents(holdings, quotes, 45)) {
      if (e.kind === "payDate" && paySymbols.has(e.symbol.toUpperCase())) continue;
      out.push({ date: e.date, symbol: e.symbol, kind: e.kind });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 9);
  }, [holdings, quotes, dividends]);

  const badge: Record<string, string> = {
    earnings: "bg-primary/15 text-primary",
    exDividend: "bg-amber-500/15 text-amber-400",
    payDate: "bg-emerald-500/15 text-emerald-400",
  };
  const label: Record<string, string> = { earnings: c.earnings, exDividend: c.exDiv, payDate: c.payDate };

  return (
    <Panel title={c.upcoming} href="/events" hrefLabel={c.viewAll} className="h-full">
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{c.noData}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((it) => {
            const d = new Date(`${it.date}T00:00:00`);
            return (
              <li key={`${it.kind}-${it.symbol}-${it.date}`} className="flex items-center gap-3 py-2 text-sm">
                <div className="flex w-10 shrink-0 flex-col items-center rounded-md bg-muted py-1 leading-none">
                  <span className="text-[9px] uppercase text-muted-foreground">{d.toLocaleDateString(dateLocale, { month: "short" })}</span>
                  <span className="text-sm font-semibold">{d.getDate()}</span>
                </div>
                <Link href={`/stock/${encodeURIComponent(it.symbol)}`} className="min-w-0 flex-1 break-words font-medium hover:text-primary">
                  {it.symbol}
                </Link>
                {it.amount ? <span className="text-xs font-medium tabular-nums text-emerald-400">{it.amount}</span> : null}
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", badge[it.kind])}>{label[it.kind]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ───────────── Movers ───────────── */

export function MoversWidget({
  analytics,
  watch,
}: {
  analytics: PortfolioAnalyticsData | null;
  watch: WatchlistQuoteRow[];
}) {
  const { c } = useDashText();
  const { gainers, losers } = useMemo(() => {
    const list: { symbol: string; name: string | null; pct: number | null; price: number | null }[] = [];
    for (const w of watch) list.push({ symbol: w.symbol, name: w.name, pct: w.changesPercentage, price: w.price });
    return topMovers(list, 4);
  }, [watch]);
  void analytics;

  const col = (title: string, rows: typeof gainers, up: boolean) => (
    <div className="min-w-0">
      <p className={cn("mb-1 text-[11px] font-semibold uppercase tracking-wide", up ? "text-emerald-400" : "text-red-400")}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((m) => (
            <li key={m.symbol} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/stock/${encodeURIComponent(m.symbol)}`} className="min-w-0 break-words font-medium hover:text-primary" title={m.name ?? m.symbol}>
                {m.symbol}
              </Link>
              <Pill value={m.pct} className="text-xs" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Panel title={c.movers} className="h-full">
      {gainers.length + losers.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{c.noMovers}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {col(c.gainers, gainers, true)}
          {col(c.losers, losers, false)}
        </div>
      )}
    </Panel>
  );
}

/* ───────────── Holdings table ───────────── */

export function HoldingsWidget({
  rows,
  fx,
  base,
  total,
}: {
  rows: import("@/lib/portfolioAnalytics").AnalyticsRow[];
  fx: PortfolioFxRates;
  base: string;
  total: number;
}) {
  const { c } = useDashText();
  const shown = rows.filter((r) => r.mv != null).slice(0, 9);
  return (
    <Panel title={c.holdings} href="/portfolio" hrefLabel={c.viewAll} className="h-full">
      <div>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="w-[34%] pb-2 font-semibold">{c.company}</th>
              <th className="w-[20%] pb-2 text-right font-semibold">{c.value}</th>
              <th className="w-[18%] pb-2 pl-3 font-semibold">{c.weight}</th>
              <th className="w-[13%] pb-2 text-right font-semibold">{c.day}</th>
              <th className="w-[15%] pb-2 text-right font-semibold">{c.pl}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {shown.map((r) => {
              const mv = convertPortfolioMoney(r.mv ?? 0, r.holdingCcy, base, fx) ?? 0;
              const w = total > 0 ? (mv / total) * 100 : 0;
              const plPct = r.cost > 0 && r.pl != null ? (r.pl / r.cost) * 100 : null;
              return (
                <tr key={r.symbol}>
                  <td className="overflow-hidden py-1.5 pr-2">
                    <CompanyIdentity symbol={r.symbol} name={r.name} size="sm" href={`/stock/${encodeURIComponent(r.symbol)}`} />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(mv, base)}</td>
                  <td className="py-1.5 pl-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, w)}%` }} />
                      </div>
                      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{w.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-right">{r.dayChangePct != null ? <Pill value={r.dayChangePct} className="text-xs" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-1.5 text-right">{plPct != null ? <Pill value={plPct} className="text-xs" /> : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ───────────── Watchlist ───────────── */

export function WatchlistWidget({ rows, loading, count }: { rows: WatchlistQuoteRow[]; loading: boolean; count: number }) {
  const { c } = useDashText();
  return (
    <Panel title={c.watchlist} href="/watchlist" hrefLabel={c.manage} className="h-full">
      {count === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {c.emptyWatch}{" "}
          <Link href="/watchlist" className="text-primary hover:underline">
            {c.addSymbols}
          </Link>
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{loading ? c.loading : c.noData}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.slice(0, 9).map((q) => (
            <li key={q.symbol} className="flex items-center gap-2 py-1.5 text-sm">
              <div className="min-w-0 flex-1">
                <CompanyIdentity symbol={q.symbol} name={q.name} size="sm" href={`/stock/${encodeURIComponent(q.symbol)}`} />
              </div>
              <span className="tabular-nums">{formatCurrency(q.price)}</span>
              <Pill value={q.changesPercentage} className="w-16 justify-end text-xs" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ───────────── News ───────────── */

export function NewsWidget({ items }: { items: MarketNewsItem[] }) {
  const { c, dateLocale } = useDashText();
  if (items.length === 0) return null;
  return (
    <Panel title={c.news}>
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
        {items.map((n) => (
          <a
            key={`${n.link}-${n.title}`}
            href={n.link}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
          >
            <Newspaper className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
            <span className="min-w-0">
              <span className="line-clamp-3 text-sm font-medium leading-snug">{n.title}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {[n.publisher, n.publishedAt ? new Date(n.publishedAt).toLocaleDateString(dateLocale, { day: "numeric", month: "short" }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </a>
        ))}
      </div>
    </Panel>
  );
}

/* ───────────── Empty-state banner ───────────── */

export function PortfolioCta({ signedOut }: { signedOut: boolean }) {
  const { c } = useDashText();
  const Icon = signedOut ? CalendarDays : Coins;
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/12 via-card to-card p-5 shadow-card sm:flex-row sm:items-center">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">{signedOut ? c.signInTitle : c.connectTitle}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{signedOut ? c.signInBody : c.connectBody}</p>
      </div>
      <Link
        href={signedOut ? "/login" : "/portfolio"}
        className="inline-flex h-9 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-card transition hover:bg-primary/90"
      >
        {signedOut ? c.signIn : c.connect}
      </Link>
    </div>
  );
}

export { quoteFor };
