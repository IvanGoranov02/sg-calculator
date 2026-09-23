"use client";

import { LineChart } from "lucide-react";
import { useMemo, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { DcfEpsProjectionChart } from "@/components/dcf/DcfEpsProjectionChart";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeEpsModel,
  EPS_MODEL_HORIZON_YEARS,
  suggestedPeMultiple,
  validateEpsModelInputs,
} from "@/lib/epsModel";
import { formatCurrency, formatPercent } from "@/lib/format";
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

function AssumptionCell({
  id,
  label,
  value,
  onChange,
  suffix,
  step = "any",
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/80 bg-muted/40 px-3 py-2.5">
      <Label htmlFor={id} className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? Number.NaN : Number(raw));
          }}
          className={cn(
            "h-9 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0",
            "font-mono tabular-nums",
            suffix ? "pr-7" : undefined,
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DcfCalculator({ ticker, seed }: DcfCalculatorProps) {
  const { t } = useI18n();

  const [ttmEps, setTtmEps] = useState(seed?.epsPerShare ?? 0);
  const [growthPct, setGrowthPct] = useState(
    seed ? decimalToPct(seed.suggestedEpsGrowthRate) : 15,
  );
  const [peMultiple, setPeMultiple] = useState(
    seed ? suggestedPeMultiple(seed.currentPrice, seed.epsPerShare) : 20,
  );
  const [desiredReturnPct, setDesiredReturnPct] = useState(15);

  const seedSyncKey = seed
    ? `${seed.symbol}:${seed.epsPerShare}:${seed.currentPrice}:${seed.suggestedEpsGrowthRate}`
    : `empty:${ticker}`;
  const [syncedSeedKey, setSyncedSeedKey] = useState(seedSyncKey);
  if (seedSyncKey !== syncedSeedKey) {
    setSyncedSeedKey(seedSyncKey);
    setTtmEps(seed?.epsPerShare ?? 0);
    setGrowthPct(seed ? decimalToPct(seed.suggestedEpsGrowthRate) : 15);
    setPeMultiple(
      seed ? suggestedPeMultiple(seed.currentPrice, seed.epsPerShare) : 20,
    );
  }

  const validationError = useMemo(
    () =>
      validateEpsModelInputs({
        ttmEps,
        peMultiple,
        desiredReturnPct,
        horizonYears: EPS_MODEL_HORIZON_YEARS,
      }),
    [desiredReturnPct, peMultiple, ttmEps],
  );

  const result = useMemo(() => {
    if (validationError) return null;
    return computeEpsModel({
      ttmEps,
      growthRate: pctToDecimal(growthPct),
      peMultiple,
      currentPrice: seed?.currentPrice ?? 0,
      desiredReturn: pctToDecimal(desiredReturnPct),
      horizonYears: EPS_MODEL_HORIZON_YEARS,
    });
  }, [desiredReturnPct, growthPct, peMultiple, seed?.currentPrice, ttmEps, validationError]);

  const displaySymbol = seed?.symbol ?? ticker;
  const displayName = seed?.name ?? ticker;
  const currentPrice = seed?.currentPrice ?? 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-6">
      <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{t("dcf.title")}</h1>
      {!ticker ? (
        <p className="text-sm text-muted-foreground">{t("dcf.pickTicker")}</p>
      ) : !seed ? (
        <p className="text-sm text-amber-200/90">{t("dcf.noSeed", { ticker })}</p>
      ) : null}

      <Card className="overflow-hidden border-border bg-card shadow-sm">
        <CardContent className="space-y-6 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <CompanyIdentity
                symbol={displaySymbol || "—"}
                name={displayName}
                size="lg"
                primaryLabel="name"
              />
              {currentPrice > 0 && displaySymbol ? (
                <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground sm:ml-[4.75rem]">
                  {displaySymbol} | {formatCurrency(currentPrice)}
                </p>
              ) : null}
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-200"
            >
              <LineChart className="size-3.5" aria-hidden />
              {t("dcf.epsModelBadge")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <AssumptionCell
              id="ttm-eps"
              label={t("dcf.ttmEps")}
              value={ttmEps}
              onChange={setTtmEps}
            />
            <AssumptionCell
              id="growth-rate"
              label={t("dcf.growthRateShort")}
              value={growthPct}
              onChange={setGrowthPct}
              suffix="%"
              step="0.1"
            />
            <AssumptionCell
              id="pe-multiple"
              label={t("dcf.peMultiple")}
              value={peMultiple}
              onChange={setPeMultiple}
              suffix="x"
              step="0.1"
            />
            <AssumptionCell
              id="desired-return"
              label={t("dcf.desiredReturn")}
              value={desiredReturnPct}
              onChange={setDesiredReturnPct}
              suffix="%"
              step="0.1"
            />
          </div>

          {validationError ? (
            <p className="text-sm text-amber-200/90">{t(`dcf.epsErr.${validationError}`)}</p>
          ) : !result ? (
            <p className="text-sm text-muted-foreground">{t("dcf.needInputs")}</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-4">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("dcf.returnFromToday")}
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-3xl font-semibold tabular-nums sm:text-4xl",
                      result.annualizedReturnFromPrice != null && result.annualizedReturnFromPrice >= 0
                        ? "text-emerald-400"
                        : "text-red-400",
                    )}
                  >
                    {result.annualizedReturnFromPrice != null
                      ? formatPercent(result.annualizedReturnFromPrice * 100, 2)
                      : "—"}
                  </p>
                  {result.annualizedReturnFromPrice == null ? (
                    <p className="mt-1 text-xs text-muted-foreground">{t("dcf.returnNeedsPrice")}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dcf.returnHorizonHint", { years: result.horizonYears })}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-4">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("dcf.entryForReturn", { pct: desiredReturnPct })}
                  </p>
                  <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
                    {result.entryPriceForDesiredReturn != null
                      ? formatCurrency(result.entryPriceForDesiredReturn)
                      : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("dcf.entryHint", {
                      target: formatCurrency(result.targetPrice),
                      years: result.horizonYears,
                    })}
                  </p>
                </div>
              </div>

              <DcfEpsProjectionChart points={result.chartPoints} horizonYears={result.horizonYears} />
            </>
          )}

          <p className="text-center text-[10px] text-muted-foreground">{t("dcf.resultDisclaimer")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
