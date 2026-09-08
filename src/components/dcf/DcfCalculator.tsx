"use client";

import { useEffect, useMemo, useState } from "react";

import { DcfProjectionCharts } from "@/components/dcf/DcfProjectionCharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  computeGuruFocusDcf,
  marginOfSafetyPct,
  validateGuruFocusDcfInputs,
  type DcfBaseMetric,
} from "@/lib/dcf";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { DcfSeed } from "@/lib/yahooDcfSeed";
import { cn } from "@/lib/utils";

type DcfCalculatorProps = {
  ticker: string;
  seed: DcfSeed | null;
};

function pctToDecimal(pct: number): number {
  return pct / 100;
}

function decimalToPct(dec: number): number {
  return Math.round(dec * 1000) / 10;
}

function SnapshotMetric({ label, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub ? <p className="text-[10px] text-muted-foreground/80">{sub}</p> : null}
      <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function baseFromSeed(seed: DcfSeed | null, metric: DcfBaseMetric): number {
  if (!seed) return 0;
  switch (metric) {
    case "eps":
      return seed.epsPerShare;
    case "fcf":
      return seed.fcfPerShare;
    case "dividend":
      return seed.dividendPerShare;
    default:
      return 0;
  }
}

function growthFromSeed(seed: DcfSeed | null, metric: DcfBaseMetric): number {
  if (!seed) return 0.15;
  switch (metric) {
    case "eps":
      return seed.suggestedEpsGrowthRate;
    case "fcf":
      return seed.suggestedFcfGrowthRate;
    case "dividend":
      return seed.suggestedEpsGrowthRate;
    default:
      return 0.15;
  }
}

export function DcfCalculator({ ticker, seed }: DcfCalculatorProps) {
  const { t } = useI18n();
  const [baseMetric, setBaseMetric] = useState<DcfBaseMetric>("eps");
  const [basePerShare, setBasePerShare] = useState(baseFromSeed(seed, "eps"));
  const [discountPct, setDiscountPct] = useState(11);
  const [growthYears, setGrowthYears] = useState(10);
  const [growthPct, setGrowthPct] = useState(decimalToPct(growthFromSeed(seed, "eps")));
  const [terminalYears, setTerminalYears] = useState(10);
  const [terminalGrowthPct, setTerminalGrowthPct] = useState(4);
  const [addTangibleBook, setAddTangibleBook] = useState(false);
  const [tangibleBookPerShare, setTangibleBookPerShare] = useState(seed?.tangibleBookPerShare ?? 0);

  useEffect(() => {
    setBasePerShare(baseFromSeed(seed, baseMetric));
    setGrowthPct(decimalToPct(growthFromSeed(seed, baseMetric)));
    if (seed) {
      setTangibleBookPerShare(seed.tangibleBookPerShare);
    }
  }, [seed, baseMetric]);

  const baseMetricLabel = useMemo(() => {
    switch (baseMetric) {
      case "eps":
        return t("dcf.baseEps");
      case "fcf":
        return t("dcf.baseFcf");
      case "dividend":
        return t("dcf.baseDividend");
      default:
        return "";
    }
  }, [baseMetric, t]);

  const validationError = useMemo(
    () =>
      validateGuruFocusDcfInputs({
        basePerShare,
        discountPct,
        growthYears,
        terminalYears,
        terminalGrowthPct,
      }),
    [basePerShare, discountPct, growthYears, terminalYears, terminalGrowthPct],
  );

  const result = useMemo(() => {
    if (validationError) return null;
    try {
      return computeGuruFocusDcf({
        basePerShare,
        discountRate: pctToDecimal(discountPct),
        growthYears,
        growthRate: pctToDecimal(growthPct),
        terminalYears,
        terminalGrowthRate: pctToDecimal(terminalGrowthPct),
        tangibleBookPerShare: addTangibleBook ? Math.max(0, tangibleBookPerShare) : 0,
      });
    } catch {
      return null;
    }
  }, [
    addTangibleBook,
    basePerShare,
    discountPct,
    growthPct,
    growthYears,
    tangibleBookPerShare,
    terminalGrowthPct,
    terminalYears,
    validationError,
  ]);

  const mosPct =
    result && seed && seed.currentPrice > 0
      ? marginOfSafetyPct(result.fairValuePerShare, seed.currentPrice)
      : null;

  const handleMetricChange = (value: DcfBaseMetric) => {
    setBaseMetric(value);
    setBasePerShare(baseFromSeed(seed, value));
    setGrowthPct(decimalToPct(growthFromSeed(seed, value)));
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{t("dcf.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("dcf.intro")}</p>
        {seed ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("dcf.seedLine", {
              symbol: seed.symbol,
              name: seed.name,
              price: formatCurrency(seed.currentPrice),
            })}
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-200/80">{t("dcf.noSeed", { ticker })}</p>
        )}
      </div>

      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader>
          <CardTitle>{t("dcf.snapshotTitle")}</CardTitle>
          <CardDescription>{t("dcf.snapshotDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SnapshotMetric
            label={t("dcf.snapEps")}
            sub={t("dcf.snapEpsSub")}
            value={
              seed && Number.isFinite(seed.epsPerShare) ? formatCurrency(seed.epsPerShare) : "—"
            }
          />
          <SnapshotMetric
            label={t("dcf.snapFcf")}
            sub={t("dcf.snapFcfSub")}
            value={
              seed && Number.isFinite(seed.fcfPerShare) ? formatCurrency(seed.fcfPerShare) : "—"
            }
          />
          <SnapshotMetric
            label={t("dcf.snapDividend")}
            value={seed && seed.dividendPerShare > 0 ? formatCurrency(seed.dividendPerShare) : "—"}
          />
          <SnapshotMetric
            label={t("dcf.snapTangibleBook")}
            value={
              seed && seed.tangibleBookPerShare > 0
                ? formatCurrency(seed.tangibleBookPerShare)
                : "—"
            }
          />
          <SnapshotMetric
            label={t("dcf.snapSuggestedGrowth")}
            value={
              seed
                ? `${decimalToPct(growthFromSeed(seed, baseMetric)).toFixed(1)}%`
                : "—"
            }
          />
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader>
          <CardTitle>{t("dcf.assumptionsTitle")}</CardTitle>
          <CardDescription>{t("dcf.assumptionsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("dcf.basedOn")}</Label>
            <Tabs
              value={baseMetric}
              onValueChange={(v) => handleMetricChange(v as DcfBaseMetric)}
            >
              <TabsList>
                <TabsTrigger value="eps">{t("dcf.baseEps")}</TabsTrigger>
                <TabsTrigger value="fcf">{t("dcf.baseFcf")}</TabsTrigger>
                <TabsTrigger value="dividend">{t("dcf.baseDividend")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="base">{baseMetricLabel}</Label>
            <p className="text-xs text-muted-foreground">{t("dcf.baseHint")}</p>
            <Input
              id="base"
              type="number"
              step="any"
              value={Number.isFinite(basePerShare) ? basePerShare : ""}
              onChange={(e) => setBasePerShare(Number(e.target.value))}
              className="font-mono tabular-nums"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dr">{t("dcf.discount")}</Label>
            <p className="text-xs text-muted-foreground">{t("dcf.discountHint")}</p>
            <Input
              id="dr"
              type="number"
              step="0.1"
              value={discountPct}
              onChange={(e) => setDiscountPct(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gy">{t("dcf.growthYears")}</Label>
            <Input
              id="gy"
              type="number"
              min={0}
              step={1}
              value={growthYears}
              onChange={(e) => setGrowthYears(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gr">{t("dcf.growthRate")}</Label>
            <Input
              id="gr"
              type="number"
              step="0.1"
              value={growthPct}
              onChange={(e) => setGrowthPct(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ty">{t("dcf.terminalYears")}</Label>
            <Input
              id="ty"
              type="number"
              min={0}
              step={1}
              value={terminalYears}
              onChange={(e) => setTerminalYears(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tg">{t("dcf.terminalGrowth")}</Label>
            <Input
              id="tg"
              type="number"
              step="0.1"
              value={terminalGrowthPct}
              onChange={(e) => setTerminalGrowthPct(Number(e.target.value))}
            />
          </div>

          <Separator className="bg-white/10 sm:col-span-2" />

          <div className="space-y-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={addTangibleBook}
                onChange={(e) => setAddTangibleBook(e.target.checked)}
                className="size-4 rounded border-white/20 bg-zinc-900"
              />
              {t("dcf.addTangibleBook")}
            </label>
            {addTangibleBook && (
              <div className="space-y-2">
                <Label htmlFor="tbv">{t("dcf.tangibleBook")}</Label>
                <Input
                  id="tbv"
                  type="number"
                  min={0}
                  step="any"
                  value={Number.isFinite(tangibleBookPerShare) ? tangibleBookPerShare : ""}
                  onChange={(e) => setTangibleBookPerShare(Number(e.target.value))}
                  className="font-mono tabular-nums"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-500/20 bg-zinc-900/50">
        <CardHeader>
          <CardTitle>{t("dcf.resultTitle")}</CardTitle>
          <CardDescription>{t("dcf.resultDisclaimer")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {validationError ? (
            <p className="text-sm text-amber-200/90">{t(`dcf.err.${validationError}`)}</p>
          ) : !result ? (
            <p className="text-sm text-muted-foreground">{t("dcf.needInputs")}</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("dcf.growthValue")}</p>
                  <p className="font-mono text-lg tabular-nums">{formatCurrency(result.growthValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("dcf.terminalValue")}</p>
                  <p className="font-mono text-lg tabular-nums">{formatCurrency(result.terminalValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("dcf.intrinsicValue")}</p>
                  <p className="font-mono text-lg tabular-nums">{formatCurrency(result.intrinsicValue)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <p className="text-xs text-muted-foreground">{t("dcf.fairValue")}</p>
                <p className="font-mono text-3xl font-semibold tabular-nums text-emerald-400">
                  {formatCurrency(result.fairValuePerShare)}
                </p>
                {addTangibleBook && result.tangibleBookPerShare > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("dcf.includesTbv", { v: formatCurrency(result.tangibleBookPerShare) })}
                  </p>
                )}
              </div>

              {seed && seed.currentPrice > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{t("dcf.stockPrice")}</p>
                    <p className="font-mono text-lg tabular-nums">{formatCurrency(seed.currentPrice)}</p>
                  </div>
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      mosPct != null && mosPct >= 0
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-red-500/30 bg-red-500/10",
                    )}
                  >
                    <p className="text-xs text-muted-foreground">{t("dcf.marginOfSafety")}</p>
                    <p className="font-mono text-lg font-medium tabular-nums">
                      {mosPct != null ? `${mosPct >= 0 ? "+" : ""}${mosPct.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                </div>
              )}

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t("dcf.detailPv")}</summary>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>{t("dcf.pvGrowth", { v: formatCurrency(result.growthValue) })}</li>
                  <li>{t("dcf.pvTerminal", { v: formatCurrency(result.terminalValue) })}</li>
                </ul>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {result && (
        <DcfProjectionCharts
          yearlyProjections={result.yearlyProjections}
          fairValuePerShare={result.fairValuePerShare}
          currentPrice={seed?.currentPrice ?? null}
          baseMetricLabel={baseMetricLabel}
        />
      )}
    </div>
  );
}
