"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { computeSimpleDcf, type SimpleDcfInputs } from "@/lib/dcf";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
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

function SnapshotMetric({ label, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub ? <p className="text-[10px] text-muted-foreground/80">{sub}</p> : null}
      <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function DcfCalculator({ ticker, seed }: DcfCalculatorProps) {
  const { t } = useI18n();
  const [baseFcf, setBaseFcf] = useState(seed?.baseFcf ?? 0);
  const [growthPct, setGrowthPct] = useState(8);
  const [discountPct, setDiscountPct] = useState(10);
  const [terminalMultiple, setTerminalMultiple] = useState(12);
  const [netDebt, setNetDebt] = useState(seed?.netDebt ?? 0);
  const [shares, setShares] = useState(seed?.sharesOutstanding ?? 0);

  const result = useMemo(() => {
    if (baseFcf <= 0 || shares <= 0 || terminalMultiple <= 0) return null;
    try {
      const input: SimpleDcfInputs = {
        baseFcf,
        growthYears1To5: pctToDecimal(growthPct),
        discountRate: pctToDecimal(discountPct),
        terminalMultiple,
        netDebt: Math.max(0, netDebt),
        sharesOutstanding: shares,
      };
      return computeSimpleDcf(input);
    } catch {
      return null;
    }
  }, [baseFcf, growthPct, discountPct, terminalMultiple, netDebt, shares]);

  const vsMarketPct =
    seed && result && seed.currentPrice > 0
      ? ((result.fairValuePerShare - seed.currentPrice) / seed.currentPrice) * 100
      : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 sm:gap-8">
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
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <SnapshotMetric
            label={t("dcf.snapRevenue")}
            value={seed && seed.revenue > 0 ? formatCurrencyCompact(seed.revenue) : "—"}
          />
          <SnapshotMetric
            label={t("dcf.snapOpMargin")}
            sub={t("dcf.snapOpMarginSub")}
            value={
              seed && seed.operatingMarginPct !== null
                ? `${seed.operatingMarginPct.toFixed(1)}%`
                : "—"
            }
          />
          <SnapshotMetric
            label={t("dcf.snapNetIncome")}
            value={seed ? formatCurrencyCompact(seed.netIncome) : "—"}
          />
          <SnapshotMetric
            label={t("dcf.snapEbitda")}
            value={
              seed && seed.ebitda !== null && seed.ebitda !== undefined
                ? formatCurrencyCompact(seed.ebitda)
                : "—"
            }
          />
          <SnapshotMetric
            label={t("dcf.snapFcf")}
            sub={t("dcf.snapFcfSub")}
            value={seed && seed.baseFcf > 0 ? formatCurrencyCompact(seed.baseFcf) : "—"}
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
            <Label htmlFor="fcf">{t("dcf.baseFcf")}</Label>
            <p className="text-xs text-muted-foreground">{t("dcf.baseFcfHint")}</p>
            <Input
              id="fcf"
              type="number"
              min={0}
              step="any"
              value={Number.isFinite(baseFcf) ? baseFcf : ""}
              onChange={(e) => setBaseFcf(Number(e.target.value))}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g">{t("dcf.growth")}</Label>
            <Input
              id="g"
              type="number"
              step="0.1"
              value={growthPct}
              onChange={(e) => setGrowthPct(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
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
            <Label htmlFor="tm">{t("dcf.terminal")}</Label>
            <p className="text-xs text-muted-foreground">{t("dcf.terminalHint")}</p>
            <Input
              id="tm"
              type="number"
              min={0}
              step="0.5"
              value={terminalMultiple}
              onChange={(e) => setTerminalMultiple(Number(e.target.value))}
            />
          </div>
          <Separator className="bg-white/10 sm:col-span-2" />
          <div className="space-y-2">
            <Label htmlFor="nd">{t("dcf.netDebt")}</Label>
            <p className="text-xs text-muted-foreground">{t("dcf.netDebtHint")}</p>
            <Input
              id="nd"
              type="number"
              min={0}
              step="any"
              value={Number.isFinite(netDebt) ? netDebt : ""}
              onChange={(e) => setNetDebt(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sh">{t("dcf.shares")}</Label>
            <Input
              id="sh"
              type="number"
              min={0}
              step="any"
              value={Number.isFinite(shares) ? shares : ""}
              onChange={(e) => setShares(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-500/20 bg-zinc-900/50">
        <CardHeader>
          <CardTitle>{t("dcf.resultTitle")}</CardTitle>
          <CardDescription>{t("dcf.resultDisclaimer")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result ? (
            <p className="text-sm text-muted-foreground">{t("dcf.needInputs")}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t("dcf.ev")}</p>
                  <p className="font-mono text-lg tabular-nums">{formatCurrencyCompact(result.enterpriseValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("dcf.equity")}</p>
                  <p className="font-mono text-lg tabular-nums">{formatCurrencyCompact(result.equityValue)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">{t("dcf.fairValue")}</p>
                  <p className="font-mono text-3xl font-semibold tabular-nums text-emerald-400">
                    {formatCurrency(result.fairValuePerShare)}
                  </p>
                </div>
              </div>
              {seed && seed.currentPrice > 0 && (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    vsMarketPct !== null && vsMarketPct >= 0
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-red-500/30 bg-red-500/10",
                  )}
                >
                  {t("dcf.vsMarket", { price: formatCurrency(seed.currentPrice) })}{" "}
                  {vsMarketPct !== null ? (
                    <span className="font-mono font-medium tabular-nums">
                      {t("dcf.vsMarketPct", {
                        pct: `${vsMarketPct >= 0 ? "+" : ""}${vsMarketPct.toFixed(1)}`,
                      })}
                    </span>
                  ) : null}
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t("dcf.detailPv")}</summary>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>
                    {t("dcf.pvFcf", { v: formatCurrencyCompact(result.pvProjectedFcf) })}
                  </li>
                  <li>{t("dcf.fcfY5", { v: formatCurrencyCompact(result.fcfYear5) })}</li>
                  <li>{t("dcf.terminalUndisc", { v: formatCurrencyCompact(result.terminalValue) })}</li>
                  <li>{t("dcf.pvTerminal", { v: formatCurrencyCompact(result.pvTerminal) })}</li>
                </ul>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
