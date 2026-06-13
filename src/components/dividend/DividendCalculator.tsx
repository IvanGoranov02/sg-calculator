"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { computeDividendGrowth, type DividendGrowthInputs } from "@/lib/dividendGrowth";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { DividendSeed } from "@/lib/yahooDividendSeed";

type Props = {
  ticker: string;
  seed: DividendSeed | null;
};

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  step = "any",
  min = 0,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
  min?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <Input
        id={id}
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="font-mono tabular-nums"
      />
    </div>
  );
}

export function DividendCalculator({ ticker, seed }: Props) {
  const { t } = useI18n();
  const [dps, setDps] = useState(seed?.annualDividendPerShare ?? 0);
  const [growthPct, setGrowthPct] = useState(seed?.suggestedGrowthPct ?? 6);
  const [shares, setShares] = useState(100);
  const [price, setPrice] = useState(seed?.currentPrice ?? 0);
  const [years, setYears] = useState(20);
  const [reinvest, setReinvest] = useState(true);
  const [priceGrowthPct, setPriceGrowthPct] = useState(7);

  const result = useMemo(() => {
    const input: DividendGrowthInputs = {
      annualDividendPerShare: dps,
      dividendGrowthRate: growthPct / 100,
      shares,
      years,
      sharePrice: price,
      priceGrowthRate: priceGrowthPct / 100,
      reinvest,
    };
    return computeDividendGrowth(input);
  }, [dps, growthPct, shares, years, price, priceGrowthPct, reinvest]);

  const chartData = useMemo(
    () =>
      result?.rows.map((r) => ({
        year: r.year,
        income: Math.round(r.annualIncome),
        yoc: Number(r.yieldOnCostPct.toFixed(2)),
      })) ?? [],
    [result],
  );

  const currentYieldPct =
    seed?.dividendYield != null ? (seed.dividendYield * 100).toFixed(2) + "%" : "—";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 sm:gap-8">
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

      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader>
          <CardTitle>{t("dividendCalc.snapshotTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <SnapshotMetric
            label={t("dividendCalc.snapDps")}
            value={seed && seed.annualDividendPerShare > 0 ? formatCurrency(seed.annualDividendPerShare) : "—"}
          />
          <SnapshotMetric label={t("dividendCalc.snapYield")} value={currentYieldPct} />
          <SnapshotMetric
            label={t("dividendCalc.snapGrowth")}
            value={`${(seed?.suggestedGrowthPct ?? 6).toFixed(1)}%`}
          />
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader>
          <CardTitle>{t("dividendCalc.assumptionsTitle")}</CardTitle>
          <CardDescription>{t("dividendCalc.assumptionsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <NumberField
            id="dps"
            label={t("dividendCalc.dps")}
            hint={t("dividendCalc.dpsHint")}
            value={dps}
            onChange={setDps}
          />
          <NumberField
            id="dg"
            label={t("dividendCalc.growth")}
            hint={t("dividendCalc.growthHint")}
            value={growthPct}
            onChange={setGrowthPct}
            step="0.1"
            min={-50}
          />
          <NumberField id="sh" label={t("dividendCalc.shares")} value={shares} onChange={setShares} />
          <NumberField
            id="pr"
            label={t("dividendCalc.price")}
            hint={t("dividendCalc.priceHint")}
            value={price}
            onChange={setPrice}
          />
          <NumberField
            id="yr"
            label={t("dividendCalc.years")}
            value={years}
            onChange={setYears}
            step="1"
            min={1}
          />
          <div className="space-y-2">
            <Label htmlFor="reinvest">{t("dividendCalc.reinvest")}</Label>
            <p className="text-xs text-muted-foreground">{t("dividendCalc.reinvestHint")}</p>
            <button
              id="reinvest"
              type="button"
              role="switch"
              aria-checked={reinvest}
              onClick={() => setReinvest((v) => !v)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                reinvest ? "bg-emerald-500/80" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block size-5 transform rounded-full bg-white transition-transform ${
                  reinvest ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          {reinvest ? (
            <>
              <Separator className="bg-white/10 sm:col-span-2" />
              <NumberField
                id="pg"
                label={t("dividendCalc.priceGrowth")}
                hint={t("dividendCalc.priceGrowthHint")}
                value={priceGrowthPct}
                onChange={setPriceGrowthPct}
                step="0.1"
                min={-50}
              />
            </>
          ) : null}
        </CardContent>
      </Card>

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
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("dividendCalc.finalIncome")}</p>
                  <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-400">
                    {formatCurrency(result.finalAnnualIncome)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("dividendCalc.totalIncome")}</p>
                  <p className="font-mono text-lg tabular-nums">{formatCurrencyCompact(result.totalIncome)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("dividendCalc.finalYoc")}</p>
                  <p className="font-mono text-lg tabular-nums">{result.finalYieldOnCostPct.toFixed(1)}%</p>
                </div>
              </div>

              <div className="relative h-[min(320px,46vh)] w-full">
                <div className="absolute inset-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                      <defs>
                        <linearGradient id="divIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="year"
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        tickFormatter={(v: number) => `Y${v}`}
                      />
                      <YAxis
                        yAxisId="income"
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        tickFormatter={(v: number) => formatCurrencyCompact(v)}
                        width={52}
                      />
                      <YAxis
                        yAxisId="yoc"
                        orientation="right"
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        tickFormatter={(v: number) => `${v}%`}
                        width={40}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as (typeof chartData)[0];
                          return (
                            <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                              <p className="font-medium text-foreground">
                                {t("dividendCalc.yearLabel", { year: p.year })}
                              </p>
                              <p className="text-emerald-400">
                                {t("dividendCalc.annualIncome")}: {formatCurrency(p.income)}
                              </p>
                              <p className="text-sky-300">
                                {t("dividendCalc.yieldOnCost")}: {p.yoc}%
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        yAxisId="income"
                        type="monotone"
                        dataKey="income"
                        stroke="#34d399"
                        strokeWidth={2}
                        fill="url(#divIncome)"
                      />
                      <Line
                        yAxisId="yoc"
                        type="monotone"
                        dataKey="yoc"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {reinvest ? (
                <p className="text-xs text-muted-foreground">
                  {t("dividendCalc.finalShares", { shares: result.finalShares.toFixed(1) })}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
