"use client";

import { useMemo, useState } from "react";
import {
  Area,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  computeDividendGrowth,
  dividendYieldFromDps,
  MAX_HOLDING_YEARS,
  type DividendGrowthInputs,
} from "@/lib/dividendGrowth";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import type { DividendSeed } from "@/lib/yahooDividendSeed";

type Props = {
  ticker: string;
  seed: DividendSeed | null;
};

const HOLDING_YEARS = Array.from({ length: MAX_HOLDING_YEARS }, (_, i) => i + 1);

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  step = "any",
  min = 0,
  suffix,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
  min?: number;
  suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn("font-mono tabular-nums", suffix ? "pr-8" : undefined)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  pct,
  accent,
}: {
  label: string;
  value: string;
  pct: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        {accent ? <span className="size-2.5 shrink-0 rounded-full" style={{ background: accent }} /> : null}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-3 text-right">
        <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
        <span className="w-10 font-mono text-xs tabular-nums text-muted-foreground">{pct}</span>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-white/10 bg-zinc-900/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[min(260px,40vh)] w-full">
          <div className="absolute inset-0">{children}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const CHART_COLORS = {
  dividends: "#34d399",
  contributions: "#38bdf8",
  growth: "#a78bfa",
  principal: "#fbbf24",
  portfolio: "#34d399",
  income: "#34d399",
  monthly: "#38bdf8",
};

export function DividendCalculator({ ticker, seed }: Props) {
  const { t } = useI18n();

  const defaultYieldPct =
    seed?.dividendYield != null
      ? seed.dividendYield * 100
      : seed && seed.annualDividendPerShare > 0 && seed.currentPrice > 0
        ? dividendYieldFromDps(seed.currentPrice, seed.annualDividendPerShare) * 100
        : 4;

  const [price, setPrice] = useState(seed?.currentPrice ?? 50);
  const [shares, setShares] = useState(100);
  const [years, setYears] = useState(10);
  const [yieldPct, setYieldPct] = useState(defaultYieldPct);
  const [annualContribution, setAnnualContribution] = useState(1000);
  const [reinvest, setReinvest] = useState(true);
  const [priceGrowthPct, setPriceGrowthPct] = useState(7);
  const [dividendGrowthPct, setDividendGrowthPct] = useState(seed?.suggestedGrowthPct ?? 5);

  const result = useMemo(() => {
    const input: DividendGrowthInputs = {
      sharePrice: price,
      shares,
      years,
      dividendYield: yieldPct / 100,
      annualContribution,
      dividendGrowthRate: dividendGrowthPct / 100,
      priceGrowthRate: priceGrowthPct / 100,
      reinvest,
    };
    return computeDividendGrowth(input);
  }, [price, shares, years, yieldPct, annualContribution, dividendGrowthPct, priceGrowthPct, reinvest]);

  const chartData = useMemo(() => {
    if (!result) return [];
    const { principal } = result;
    return result.rows.map((r) => {
      const growth = r.portfolioValue - principal - r.cumulativeContributions - r.cumulativeIncome;
      return {
        year: r.year,
        annualIncome: Math.round(r.annualIncome),
        monthlyIncome: Math.round(r.monthlyIncome),
        cumulativeIncome: Math.round(r.cumulativeIncome),
        portfolioValue: Math.round(r.portfolioValue),
        principal: Math.round(principal),
        contributions: Math.round(r.cumulativeContributions),
        dividends: Math.round(r.cumulativeIncome),
        growth: Math.round(Math.max(0, growth)),
      };
    });
  }, [result]);

  const yearTableRows = result?.rows ?? [];
  const mid = Math.ceil(yearTableRows.length / 2);
  const yearColA = yearTableRows.slice(0, mid);
  const yearColB = yearTableRows.slice(mid);

  const currentYieldPct =
    seed?.dividendYield != null ? (seed.dividendYield * 100).toFixed(2) + "%" : "—";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dividendCalc.title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("dividendCalc.intro")}</p>
        {seed ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("dividendCalc.seedLine", {
              symbol: seed.symbol,
              name: seed.name,
              price: formatCurrency(seed.currentPrice),
            })}
            {seed.growthFromHistory ? ` · ${t("dividendCalc.growthFromHistory")}` : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-200/80">{t("dividendCalc.noSeed", { ticker })}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Inputs */}
        <Card className="border-white/10 bg-zinc-900/40">
          <CardHeader>
            <CardTitle>{t("dividendCalc.inputsTitle")}</CardTitle>
            <CardDescription>{t("dividendCalc.inputsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <NumberField
              id="price"
              label={t("dividendCalc.price")}
              value={price}
              onChange={setPrice}
              step="0.01"
            />
            <NumberField
              id="shares"
              label={t("dividendCalc.shares")}
              value={shares}
              onChange={setShares}
              step="1"
            />

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="years">{t("dividendCalc.holdingPeriod")}</Label>
              <p className="text-xs text-muted-foreground">{t("dividendCalc.holdingPeriodHint")}</p>
              <select
                id="years"
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-sm font-mono tabular-nums text-foreground"
              >
                {HOLDING_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y === 1 ? t("dividendCalc.yearOne") : t("dividendCalc.yearMany", { count: y })}
                  </option>
                ))}
              </select>
            </div>

            <NumberField
              id="yield"
              label={t("dividendCalc.yield")}
              hint={seed ? t("dividendCalc.yieldSeedHint", { yield: currentYieldPct }) : t("dividendCalc.yieldHint")}
              value={yieldPct}
              onChange={setYieldPct}
              step="0.1"
              suffix="%"
            />
            <NumberField
              id="contribution"
              label={t("dividendCalc.contribution")}
              hint={t("dividendCalc.contributionHint")}
              value={annualContribution}
              onChange={setAnnualContribution}
              step="100"
            />

            <div className="space-y-2 sm:col-span-2">
              <Label>{t("dividendCalc.reinvest")}</Label>
              <p className="text-xs text-muted-foreground">{t("dividendCalc.reinvestHint")}</p>
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant={reinvest ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setReinvest(true)}
                >
                  {t("dividendCalc.reinvestYes")}
                </Button>
                <Button
                  type="button"
                  variant={!reinvest ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setReinvest(false)}
                >
                  {t("dividendCalc.reinvestNo")}
                </Button>
              </div>
            </div>

            <NumberField
              id="priceGrowth"
              label={t("dividendCalc.priceGrowth")}
              hint={t("dividendCalc.priceGrowthHint")}
              value={priceGrowthPct}
              onChange={setPriceGrowthPct}
              step="0.1"
              suffix="%"
            />
            <NumberField
              id="divGrowth"
              label={t("dividendCalc.growth")}
              hint={t("dividendCalc.growthHint")}
              value={dividendGrowthPct}
              onChange={setDividendGrowthPct}
              step="0.1"
              min={-50}
              suffix="%"
            />
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="border-emerald-500/20 bg-zinc-900/50">
          <CardHeader>
            <CardTitle>{t("dividendCalc.resultTitle")}</CardTitle>
            <CardDescription>{t("dividendCalc.resultDisclaimer")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!result ? (
              <p className="text-sm text-muted-foreground">{t("dividendCalc.needInputs")}</p>
            ) : (
              <>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("dividendCalc.estimatedReturn")}
                  </p>
                  <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-emerald-400">
                    {formatCurrency(result.estimatedDividendReturn)}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-4 py-1">
                  <BreakdownRow
                    label={t("dividendCalc.breakdownDividends")}
                    value={formatCurrency(result.breakdown.dividends)}
                    pct={`${Math.round(result.breakdown.dividendsPct)}%`}
                    accent={CHART_COLORS.dividends}
                  />
                  <BreakdownRow
                    label={t("dividendCalc.breakdownContributions")}
                    value={formatCurrency(result.breakdown.contributions)}
                    pct={`${Math.round(result.breakdown.contributionsPct)}%`}
                    accent={CHART_COLORS.contributions}
                  />
                  <BreakdownRow
                    label={t("dividendCalc.breakdownGrowth")}
                    value={formatCurrency(result.breakdown.growth)}
                    pct={`${Math.round(result.breakdown.growthPct)}%`}
                    accent={CHART_COLORS.growth}
                  />
                  <BreakdownRow
                    label={t("dividendCalc.breakdownPrincipal")}
                    value={formatCurrency(result.breakdown.principal)}
                    pct={`${Math.round(result.breakdown.principalPct)}%`}
                    accent={CHART_COLORS.principal}
                  />
                </div>

                <Separator className="bg-white/10" />

                <div>
                  <p className="mb-3 text-sm font-medium text-foreground">{t("dividendCalc.incomeTableTitle")}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[yearColA, yearColB].map((col, colIdx) => (
                      <Table key={colIdx}>
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-muted-foreground">{t("dividendCalc.tableYear")}</TableHead>
                            <TableHead className="text-right text-muted-foreground">
                              {t("dividendCalc.tableMonthly")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {col.map((row) => (
                            <TableRow key={row.year} className="border-white/5">
                              <TableCell className="font-medium">
                                {t("dividendCalc.yearLabel", { year: row.year })}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {formatCurrency(row.monthlyIncome)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ))}
                  </div>
                </div>

                {reinvest ? (
                  <p className="text-xs text-muted-foreground">
                    {t("dividendCalc.finalShares", { shares: result.finalShares.toFixed(1) })}
                    {" · "}
                    {t("dividendCalc.finalPortfolio", {
                      value: formatCurrencyCompact(result.finalPortfolioValue),
                    })}
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {result && chartData.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChartCard title={t("dividendCalc.chartCumulative")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="cumDiv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.dividends} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={CHART_COLORS.dividends} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="year" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => `Y${v}`} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => formatCurrencyCompact(v)} width={52} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof chartData)[0];
                    return (
                      <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                        <p className="font-medium">{t("dividendCalc.yearLabel", { year: p.year })}</p>
                        <p className="text-emerald-400">
                          {t("dividendCalc.cumulativeDividends")}: {formatCurrency(p.cumulativeIncome)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="cumulativeIncome" stroke={CHART_COLORS.dividends} strokeWidth={2} fill="url(#cumDiv)" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("dividendCalc.chartPortfolio")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="year" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => `Y${v}`} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => formatCurrencyCompact(v)} width={52} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof chartData)[0];
                    return (
                      <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                        <p className="font-medium">{t("dividendCalc.yearLabel", { year: p.year })}</p>
                        <p className="text-emerald-400">
                          {t("dividendCalc.portfolioValue")}: {formatCurrency(p.portfolioValue)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="portfolioValue" stroke={CHART_COLORS.portfolio} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("dividendCalc.chartAnnualIncome")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="year" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => `Y${v}`} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => formatCurrencyCompact(v)} width={52} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof chartData)[0];
                    return (
                      <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                        <p className="font-medium">{t("dividendCalc.yearLabel", { year: p.year })}</p>
                        <p className="text-emerald-400">
                          {t("dividendCalc.annualIncome")}: {formatCurrency(p.annualIncome)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="annualIncome" fill={CHART_COLORS.income} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("dividendCalc.chartComposition")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="year" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => `Y${v}`} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => formatCurrencyCompact(v)} width={52} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof chartData)[0];
                    return (
                      <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                        <p className="mb-1 font-medium">{t("dividendCalc.yearLabel", { year: p.year })}</p>
                        <p style={{ color: CHART_COLORS.principal }}>{t("dividendCalc.breakdownPrincipal")}: {formatCurrency(p.principal)}</p>
                        <p style={{ color: CHART_COLORS.contributions }}>{t("dividendCalc.breakdownContributions")}: {formatCurrency(p.contributions)}</p>
                        <p style={{ color: CHART_COLORS.dividends }}>{t("dividendCalc.breakdownDividends")}: {formatCurrency(p.dividends)}</p>
                        <p style={{ color: CHART_COLORS.growth }}>{t("dividendCalc.breakdownGrowth")}: {formatCurrency(p.growth)}</p>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="principal" stackId="stack" fill={CHART_COLORS.principal} stroke={CHART_COLORS.principal} />
                <Area type="monotone" dataKey="contributions" stackId="stack" fill={CHART_COLORS.contributions} stroke={CHART_COLORS.contributions} />
                <Area type="monotone" dataKey="dividends" stackId="stack" fill={CHART_COLORS.dividends} stroke={CHART_COLORS.dividends} />
                <Area type="monotone" dataKey="growth" stackId="stack" fill={CHART_COLORS.growth} stroke={CHART_COLORS.growth} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("dividendCalc.chartMonthly")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="year" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => `Y${v}`} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => formatCurrencyCompact(v)} width={52} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof chartData)[0];
                    return (
                      <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                        <p className="font-medium">{t("dividendCalc.yearLabel", { year: p.year })}</p>
                        <p className="text-sky-300">
                          {t("dividendCalc.tableMonthly")}: {formatCurrency(p.monthlyIncome)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="monthlyIncome" fill={CHART_COLORS.monthly} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : null}
    </div>
  );
}
