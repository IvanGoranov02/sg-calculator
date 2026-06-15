"use client";

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, PieChart, TrendingUp, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { convertPortfolioMoney, type PortfolioFxRates } from "@/lib/portfolioFx";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export type AnalyticsRow = {
  symbol: string;
  sector: string | null;
  holdingCcy: string;
  mv: number | null;
  cost: number;
  pl: number | null;
  estAnnual: number | null;
};

type Props = { rows: AnalyticsRow[]; fx: PortfolioFxRates };

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      maximumFractionDigits: n >= 1000 ? 0 : 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

/** Most frequent holding currency wins; ties prefer EUR then USD. */
function pickBaseCurrency(rows: AnalyticsRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.holdingCcy, (counts.get(r.holdingCcy) ?? 0) + 1);
  let best = "USD";
  let bestN = -1;
  for (const [c, n] of counts) {
    if (n > bestN || (n === bestN && (c === "EUR" || (c === "USD" && best !== "EUR")))) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

const SECTOR_COLORS = [
  "#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#fb7185",
  "#22d3ee", "#f472b6", "#818cf8", "#fb923c", "#4ade80", "#94a3b8",
];

export function PortfolioAnalytics({ rows, fx }: Props) {
  const { t } = useI18n();

  const a = useMemo(() => {
    const base = pickBaseCurrency(rows);
    const conv = (v: number | null, from: string) =>
      v == null ? null : convertPortfolioMoney(v, from, base, fx);

    let totalValue = 0;
    let totalCost = 0;
    let totalIncome = 0;
    let unconverted = 0;
    const holdings: { symbol: string; value: number }[] = [];
    const sectorMap = new Map<string, number>();
    const movers: { symbol: string; plPct: number }[] = [];

    for (const r of rows) {
      const mvBase = conv(r.mv, r.holdingCcy);
      const costBase = conv(r.cost, r.holdingCcy);
      const incomeBase = conv(r.estAnnual, r.holdingCcy);
      if (r.mv != null && mvBase == null) unconverted++;
      if (mvBase != null) {
        totalValue += mvBase;
        holdings.push({ symbol: r.symbol, value: mvBase });
        const sector = r.sector ?? t("portfolioAnalytics.unknownSector");
        sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + mvBase);
      }
      if (costBase != null) totalCost += costBase;
      if (incomeBase != null && incomeBase > 0) totalIncome += incomeBase;
      if (r.cost > 0 && r.pl != null && r.mv != null) {
        movers.push({ symbol: r.symbol, plPct: (r.pl / r.cost) * 100 });
      }
    }

    const totalPl = totalValue - totalCost;
    const totalPlPct = totalCost > 0 ? (totalPl / totalCost) * 100 : null;
    const portfolioYield = totalValue > 0 ? (totalIncome / totalValue) * 100 : null;

    holdings.sort((x, y) => y.value - x.value);
    const unknownLabel = t("portfolioAnalytics.unknownSector");
    const sectors = [...sectorMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((x, y) => y.value - x.value);
    const hasRealSectors = sectors.some((s) => s.name !== unknownLabel);
    movers.sort((x, y) => y.plPct - x.plPct);

    return {
      base,
      totalValue,
      totalCost,
      totalPl,
      totalPlPct,
      totalIncome,
      portfolioYield,
      unconverted,
      holdings,
      sectors,
      hasRealSectors,
      best: movers.slice(0, 3),
      worst: movers.slice(-3).reverse(),
    };
  }, [rows, fx, t]);

  if (a.totalValue <= 0) return null;

  const pctOf = (v: number) => (a.totalValue > 0 ? (v / a.totalValue) * 100 : 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Wallet className="size-4" />}
          label={t("portfolioAnalytics.totalValue")}
          value={money(a.totalValue, a.base)}
        />
        <SummaryCard
          icon={a.totalPl >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
          label={t("portfolioAnalytics.totalPl")}
          value={money(a.totalPl, a.base)}
          sub={a.totalPlPct != null ? `${a.totalPlPct >= 0 ? "+" : ""}${a.totalPlPct.toFixed(1)}%` : undefined}
          tone={a.totalPl >= 0 ? "pos" : "neg"}
        />
        <SummaryCard
          icon={<TrendingUp className="size-4" />}
          label={t("portfolioAnalytics.annualIncome")}
          value={money(a.totalIncome, a.base)}
          sub={a.portfolioYield != null ? t("portfolioAnalytics.yieldOnValue", { pct: a.portfolioYield.toFixed(2) }) : undefined}
        />
        <SummaryCard
          icon={<PieChart className="size-4" />}
          label={t("portfolioAnalytics.holdings")}
          value={String(a.holdings.length)}
          sub={a.unconverted > 0 ? t("portfolioAnalytics.unconverted", { n: a.unconverted }) : undefined}
        />
      </div>

      <div className={cn("grid gap-4", a.hasRealSectors && "lg:grid-cols-2")}>
        <Card className="border-white/10 bg-zinc-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("portfolioAnalytics.allocationTitle")}</CardTitle>
            <CardDescription>{t("portfolioAnalytics.allocationDesc", { base: a.base })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {a.holdings.slice(0, 8).map((h) => (
              <BarRow key={h.symbol} label={h.symbol} pct={pctOf(h.value)} value={money(h.value, a.base)} color="#34d399" />
            ))}
          </CardContent>
        </Card>

        {a.hasRealSectors ? (
          <Card className="border-white/10 bg-zinc-900/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("portfolioAnalytics.sectorTitle")}</CardTitle>
              <CardDescription>{t("portfolioAnalytics.sectorDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {a.sectors.map((s, i) => (
                <BarRow
                  key={s.name}
                  label={s.name}
                  pct={pctOf(s.value)}
                  value={`${pctOf(s.value).toFixed(0)}%`}
                  color={SECTOR_COLORS[i % SECTOR_COLORS.length]}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {a.best.length > 0 ? (
        <Card className="border-white/10 bg-zinc-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("portfolioAnalytics.moversTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <MoverList title={t("portfolioAnalytics.topGainers")} items={a.best} tone="pos" />
            <MoverList title={t("portfolioAnalytics.topLosers")} items={a.worst} tone="neg" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </div>
      <p
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : "text-foreground",
        )}
      >
        {value}
      </p>
      {sub ? <p className={cn("text-xs tabular-nums", tone === "neg" ? "text-red-400/80" : "text-muted-foreground")}>{sub}</p> : null}
    </div>
  );
}

function BarRow({ label, pct, value, color }: { label: string; pct: number; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate font-mono text-xs text-foreground/90">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

function MoverList({ title, items, tone }: { title: string; items: { symbol: string; plPct: number }[]; tone: "pos" | "neg" }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {items.map((m) => (
          <li key={m.symbol} className="flex items-center justify-between gap-2 text-sm">
            <span className="font-mono">{m.symbol}</span>
            <span className={cn("font-mono tabular-nums", m.plPct >= 0 ? "text-emerald-400" : "text-red-400")}>
              {m.plPct >= 0 ? "+" : ""}
              {m.plPct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
