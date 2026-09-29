"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, PieChart, TrendingUp, Wallet } from "lucide-react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { SectorAllocationDonut, type SectorDonutSlice } from "@/components/portfolio/SectorAllocationDonut";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import {
  allocationPercentOfTotal,
  formatAllocationPercent,
  groupSectorCompanies,
  type SectorCompany,
  type SectorCompanySource,
} from "@/lib/portfolioAllocation";
import { convertPortfolioMoney, type PortfolioFxRates } from "@/lib/portfolioFx";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import { displayCurrencyToPortfolioCode } from "@/lib/preferences/preferences";
import { cn } from "@/lib/utils";

export type AnalyticsRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  holdingCcy: string;
  mv: number | null;
  cost: number;
  pl: number | null;
  estAnnual: number | null;
  /** Session move from the live quote. Null for broker-only prices. */
  dayChangePct: number | null;
};

export type PortfolioAnalyticsData = {
  base: string;
  totalValue: number;
  totalCost: number;
  totalPl: number;
  totalPlPct: number | null;
  totalIncome: number;
  portfolioYield: number | null;
  unconverted: number;
  holdings: { symbol: string; name: string | null; value: number }[];
  sectors: { name: string; value: number; companies: SectorCompany[] }[];
  hasRealSectors: boolean;
  best: { symbol: string; name: string | null; plPct: number }[];
  worst: { symbol: string; name: string | null; plPct: number }[];
};

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

function pickBaseCurrency(preferred: "EUR" | "USD"): string {
  return preferred;
}

const SECTOR_COLORS = [
  "#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#fb7185",
  "#22d3ee", "#f472b6", "#818cf8", "#fb923c", "#4ade80", "#94a3b8",
];

export function usePortfolioAnalytics(rows: AnalyticsRow[], fx: PortfolioFxRates): PortfolioAnalyticsData | null {
  const { t } = useI18n();
  const { displayCurrency } = usePreferences();

  const a = useMemo(() => {
    const base = pickBaseCurrency(displayCurrencyToPortfolioCode(displayCurrency));
    const conv = (v: number | null, from: string) =>
      v == null ? null : convertPortfolioMoney(v, from, base, fx);

    let totalValue = 0;
    let totalCost = 0;
    let totalIncome = 0;
    let unconverted = 0;
    const holdings: { symbol: string; name: string | null; value: number }[] = [];
    const sectorMap = new Map<string, number>();
    const sectorSources = new Map<string, SectorCompanySource[]>();
    const movers: { symbol: string; name: string | null; plPct: number }[] = [];

    for (const r of rows) {
      const mvBase = conv(r.mv, r.holdingCcy);
      const costBase = conv(r.cost, r.holdingCcy);
      const incomeBase = conv(r.estAnnual, r.holdingCcy);
      if (r.mv != null && mvBase == null) unconverted++;
      if (mvBase != null) {
        totalValue += mvBase;
        holdings.push({ symbol: r.symbol, name: r.name, value: mvBase });
        const sector = r.sector ?? t("portfolioAnalytics.unknownSector");
        sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + mvBase);
        const source: SectorCompanySource = {
          symbol: r.symbol,
          name: r.name,
          value: mvBase,
          cost: costBase,
          pl: conv(r.pl, r.holdingCcy),
          dayChangePct: r.dayChangePct,
        };
        const sources = sectorSources.get(sector);
        if (sources) sources.push(source);
        else sectorSources.set(sector, [source]);
      }
      if (costBase != null) totalCost += costBase;
      if (incomeBase != null && incomeBase > 0) totalIncome += incomeBase;
      if (r.cost > 0 && r.pl != null && r.mv != null) {
        movers.push({ symbol: r.symbol, name: r.name, plPct: (r.pl / r.cost) * 100 });
      }
    }

    const totalPl = totalValue - totalCost;
    const totalPlPct = totalCost > 0 ? (totalPl / totalCost) * 100 : null;
    const portfolioYield = totalValue > 0 ? (totalIncome / totalValue) * 100 : null;

    holdings.sort((x, y) => y.value - x.value);
    const unknownLabel = t("portfolioAnalytics.unknownSector");
    const sectors = [...sectorMap.entries()]
      .map(([name, value]) => ({
        name,
        value,
        companies: groupSectorCompanies(sectorSources.get(name) ?? []),
      }))
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
  }, [rows, fx, t, displayCurrency]);

  if (a.totalValue <= 0) return null;
  return a;
}

/** 1. Summary metrics (Total value, Total P&L, Est. income, holdings count). */
export function PortfolioSummarySection({ analytics }: { analytics: PortfolioAnalyticsData }) {
  const { t } = useI18n();
  const a = analytics;

  return (
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
  );
}

/** Holdings and sector allocation side by side on large screens. */
export function PortfolioAllocationSection({ analytics }: { analytics: PortfolioAnalyticsData }) {
  const { t } = useI18n();
  const a = analytics;

  return (
    <div className={cn("grid gap-4", a.hasRealSectors && "lg:grid-cols-2")}>
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("portfolioAnalytics.allocationTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {a.holdings.slice(0, 8).map((h) => {
            const pct = allocationPercentOfTotal(a.totalValue, h.value);
            return (
              <BarRow
                key={h.symbol}
                symbol={h.symbol}
                name={h.name}
                pct={pct}
                value={formatAllocationPercent(pct)}
                color="#34d399"
              />
            );
          })}
        </CardContent>
      </Card>

      {a.hasRealSectors ? (
        <SectorAllocationCard sectors={a.sectors} totalValue={a.totalValue} currency={a.base} />
      ) : null}
    </div>
  );
}

/** 5. Movers */
export function PortfolioMoversSection({ analytics }: { analytics: PortfolioAnalyticsData }) {
  const { t } = useI18n();
  const a = analytics;

  if (a.best.length === 0) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("portfolioAnalytics.moversTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <MoverList title={t("portfolioAnalytics.topGainers")} items={a.best} tone="pos" />
        <MoverList title={t("portfolioAnalytics.topLosers")} items={a.worst} tone="neg" />
      </CardContent>
    </Card>
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
    <div className="rounded-xl border border-border bg-card px-4 py-3">
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

function SectorAllocationCard({
  sectors,
  totalValue,
  currency,
}: {
  sectors: { name: string; value: number; companies: SectorCompany[] }[];
  totalValue: number;
  currency: string;
}) {
  const { t } = useI18n();
  const [hoverName, setHoverName] = useState<string | null>(null);
  const [focusName, setFocusName] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // Expanded only while the pointer is over a sector, or while a wedge has keyboard focus.
  const activeName = hoverName ?? focusName;
  const selected = selectedName ? sectors.find((sector) => sector.name === selectedName) ?? null : null;
  if (selectedName != null && selected == null) {
    setSelectedName(null);
  }

  function openSector(name: string) {
    setHoverName(null);
    setFocusName(null);
    setSelectedName(name);
  }

  function closeSector() {
    setHoverName(null);
    setFocusName(null);
    setSelectedName(null);
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !selected) return;
    event.preventDefault();
    closeSector();
  }

  const slices: SectorDonutSlice[] = [];
  for (let i = 0; i < sectors.length; i++) {
    const sector = sectors[i];
    if (sector.value <= 0) continue;
    const pct = allocationPercentOfTotal(totalValue, sector.value);
    slices.push({
      name: sector.name,
      pctLabel: formatAllocationPercent(pct),
      ringLabel: `${pct.toFixed(1)}%`,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      value: sector.value,
    });
  }

  const selectedIndex = selected ? sectors.findIndex((sector) => sector.name === selected.name) : -1;
  const selectedColor = SECTOR_COLORS[(selectedIndex >= 0 ? selectedIndex : 0) % SECTOR_COLORS.length];

  return (
    <Card className="border-border bg-card" onKeyDown={onCardKeyDown}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("portfolioAnalytics.sectorTitle")}</CardTitle>
        {selected ? (
          <CardAction>
            <Button type="button" variant="outline" size="sm" autoFocus onClick={closeSector}>
              <ArrowLeft data-icon="inline-start" />
              {t("portfolioAnalytics.sectorBack")}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {selected ? (
        <CardContent data-sector-view="detail">
          <SectorCompanyList
            sector={selected}
            totalValue={totalValue}
            currency={currency}
            color={selectedColor}
          />
        </CardContent>
      ) : (
        <CardContent className="@container/sector" data-sector-view="overview">
          {/* Side by side only when this card's content box can hold a full 19.5rem donut plus a real bar track. */}
          <div className="flex flex-col items-center gap-4 @min-[740px]/sector:flex-row @min-[740px]/sector:items-center">
            <div className="w-full max-w-[19.5rem] shrink-0 @min-[740px]/sector:w-[19.5rem]">
              <SectorAllocationDonut
                slices={slices}
                activeName={activeName}
                focusName={focusName}
                chartLabel={t("portfolioAnalytics.sectorChartLabel")}
                onHover={setHoverName}
                onFocusName={setFocusName}
                onSelect={openSector}
              />
            </div>
            <div className="w-full min-w-0 flex-1 space-y-2" aria-hidden="true">
              {sectors.map((s, i) => {
                const pct = allocationPercentOfTotal(totalValue, s.value);
                const hot = activeName === s.name;
                return (
                  <BarRow
                    key={s.name}
                    label={s.name}
                    pct={pct}
                    value={formatAllocationPercent(pct)}
                    color={SECTOR_COLORS[i % SECTOR_COLORS.length]}
                    compact
                    hot={hot}
                    dimmed={activeName != null && !hot}
                    onHover={() => setHoverName(s.name)}
                    onHoverEnd={() => setHoverName((current) => (current === s.name ? null : current))}
                    onActivate={() => openSector(s.name)}
                  />
                );
              })}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function SectorCompanyList({
  sector,
  totalValue,
  currency,
  color,
}: {
  sector: { name: string; value: number; companies: SectorCompany[] };
  totalValue: number;
  currency: string;
  color: string;
}) {
  const { t } = useI18n();
  const sectorPct = allocationPercentOfTotal(totalValue, sector.value);
  const countLabel =
    sector.companies.length === 1
      ? t("portfolioAnalytics.sectorCompanyCountOne")
      : t("portfolioAnalytics.sectorCompanyCount", { n: sector.companies.length });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
            <span className="truncate">{sector.name}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{countLabel}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {money(sector.value, currency)}
          </p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">{sectorPct.toFixed(1)}%</p>
        </div>
      </div>
      <ul className="space-y-2" aria-label={t("portfolioAnalytics.sectorCompaniesLabel", { sector: sector.name })}>
        {sector.companies.map((company) => {
          const share = allocationPercentOfTotal(totalValue, company.value);
          return (
            <li key={company.symbol} className="flex items-center gap-3 rounded-md px-1 py-1">
              <CompanyIdentity
                symbol={company.symbol}
                name={company.name}
                size="sm"
                primaryLabel="name"
                className="min-w-0 flex-1"
              />
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs font-medium tabular-nums text-foreground">
                  {money(company.value, currency)}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {t("portfolioAnalytics.sectorPortfolioShare", { pct: `${share.toFixed(1)}%` })}
                </p>
                {company.plPct != null ? (
                  <p
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      company.plPct >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {t("portfolioAnalytics.sectorPl")} {formatPercent(company.plPct, 1)}
                  </p>
                ) : null}
                {company.dayChangePct != null ? (
                  <p
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      company.dayChangePct >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {t("portfolioAnalytics.sectorDay")} {formatPercent(company.dayChangePct, 1)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BarRow({
  symbol,
  name,
  label,
  pct,
  value,
  color,
  compact,
  hot,
  dimmed,
  onHover,
  onHoverEnd,
  onActivate,
}: {
  symbol?: string;
  name?: string | null;
  label?: string;
  pct: number;
  value: string;
  color: string;
  /** Keep the sector label and percent at their base widths so the bar track fits in the half-width card. */
  compact?: boolean;
  hot?: boolean;
  dimmed?: boolean;
  onHover?: () => void;
  onHoverEnd?: () => void;
  onActivate?: () => void;
}) {
  const rowLabel = name?.trim() || symbol || label || "";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-1 py-0.5 transition-opacity sm:gap-3",
        hot && "bg-foreground/[0.06]",
        dimmed && "opacity-45",
        onActivate && "cursor-pointer",
      )}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" || event.pointerType === "pen") onHover?.();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" || event.pointerType === "pen") onHoverEnd?.();
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") onHover?.();
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") onHoverEnd?.();
      }}
      onPointerCancel={() => onHoverEnd?.()}
      onClick={onActivate}
    >
      <div className={cn("w-28 shrink-0", !compact && "sm:w-40")}>
        {symbol ? (
          <CompanyIdentity symbol={symbol} name={name} size="sm" primaryLabel="name" />
        ) : (
          <span className="block truncate text-xs text-foreground/90" title={rowLabel}>{rowLabel}</span>
        )}
      </div>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span className={cn("w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground", !compact && "sm:w-20")}>{value}</span>
    </div>
  );
}

function MoverList({
  title,
  items,
  tone,
}: {
  title: string;
  items: { symbol: string; name: string | null; plPct: number }[];
  tone: "pos" | "neg";
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {items.map((m) => (
          <li key={m.symbol} className="flex items-center justify-between gap-2 text-sm">
            <CompanyIdentity symbol={m.symbol} name={m.name} size="sm" primaryLabel="name" />
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
