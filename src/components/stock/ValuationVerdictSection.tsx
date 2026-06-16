"use client";

import { useMemo } from "react";
import { Gauge } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { computeValuationByPeriodEnd } from "@/lib/valuationFromHistory";
import { computeValuationVerdict } from "@/lib/valuationVerdict";
import { cn } from "@/lib/utils";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function ValuationVerdictSection({ data }: { data: StockAnalysisBundle }) {
  const { t } = useI18n();

  const result = useMemo(() => {
    const price = data.quote.price;
    const inv = data.investor;

    const annualCf = [...data.cashFlow].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
    const baseFcf = annualCf.length ? annualCf[annualCf.length - 1].freeCashFlow : 0;

    const annualBs = [...data.balanceSheet].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
    const latestNetDebt = annualBs.length ? annualBs[annualBs.length - 1].netDebt : null;
    const netDebt =
      latestNetDebt != null
        ? latestNetDebt
        : inv.totalDebt != null && inv.totalCash != null
          ? inv.totalDebt - inv.totalCash
          : 0;

    // Company's own historical average trailing P/E (a grounded multiples anchor).
    const peValues: number[] = [];
    for (const v of computeValuationByPeriodEnd(data, "annual").values()) {
      if (v.peTtm != null && Number.isFinite(v.peTtm) && v.peTtm > 0) peValues.push(v.peTtm);
    }
    const avgHistoricalPe = peValues.length
      ? peValues.reduce((a, b) => a + b, 0) / peValues.length
      : inv.trailingPE && inv.trailingPE > 0
        ? inv.trailingPE
        : null;

    const growthSource = inv.revenueGrowth ?? inv.earningsGrowth ?? 0.08;
    const growthRate = clamp(Number.isFinite(growthSource) ? growthSource : 0.08, 0.02, 0.18);
    const wacc = clamp(0.07 + (inv.beta ?? 1) * 0.03, 0.07, 0.13);

    return computeValuationVerdict({
      price,
      baseFcf,
      netDebt,
      sharesOutstanding: inv.sharesOutstanding ?? 0,
      trailingEps: inv.trailingEps ?? null,
      avgHistoricalPe,
      growthRate,
      wacc,
      terminalGrowth: 0.025,
    });
  }, [data]);

  // Nothing trustworthy to show → render nothing (avoids an empty/misleading panel).
  if (result.verdict === "unknown" || result.fairValueMid == null) return null;

  const price = data.quote.price;
  const low = result.fairValueLow as number;
  const high = result.fairValueHigh as number;
  const discount = result.discountPct as number;

  const tone =
    result.verdict === "undervalued"
      ? { text: "text-emerald-400", bar: "bg-emerald-500", border: "border-emerald-500/30", bg: "bg-emerald-500/10" }
      : result.verdict === "overvalued"
        ? { text: "text-red-400", bar: "bg-red-500", border: "border-red-500/30", bg: "bg-red-500/10" }
        : { text: "text-amber-300", bar: "bg-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/10" };

  // Range bar domain spans the fair-value band and the price, with padding.
  const domainLo = Math.min(low, price) * 0.9;
  const domainHi = Math.max(high, price) * 1.1;
  const span = domainHi - domainLo || 1;
  const toPct = (v: number) => clamp(((v - domainLo) / span) * 100, 0, 100);
  const bandLeft = toPct(Math.min(low, high));
  const bandWidth = Math.max(2, toPct(Math.max(low, high)) - toPct(Math.min(low, high)));
  const priceLeft = toPct(price);

  const dcf = result.methods.find((m) => m.key === "dcf")?.fairValue ?? null;
  const multiples = result.methods.find((m) => m.key === "multiples")?.fairValue ?? null;

  const headline =
    discount >= 0
      ? t("valuation.belowEstimate", { pct: discount.toFixed(0) })
      : t("valuation.aboveEstimate", { pct: Math.abs(discount).toFixed(0) });

  return (
    <Card className={cn("border bg-zinc-900/40", tone.border)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className={cn("size-4", tone.text)} aria-hidden />
          {t("valuation.title")}
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", tone.border, tone.bg, tone.text)}>
            {t(`valuation.verdict.${result.verdict}`)}
          </span>
        </CardTitle>
        <CardDescription>{t("valuation.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm">
          <span className={cn("font-mono text-xl font-semibold", tone.text)}>{headline}</span>{" "}
          <span className="text-muted-foreground">
            {t("valuation.estimateRange", { low: formatCurrency(low), high: formatCurrency(high) })}
          </span>
        </p>

        <div className="space-y-2">
          <div className="relative h-7">
            {/* fair-value band */}
            <div
              className={cn("absolute top-1/2 h-2 -translate-y-1/2 rounded-full", tone.bar, "opacity-40")}
              style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
            />
            <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />
            {/* current price marker */}
            <div
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${priceLeft}%` }}
            >
              <span className="h-5 w-0.5 bg-foreground" />
              <span className="mt-0.5 whitespace-nowrap font-mono text-[10px] text-foreground">
                {formatCurrency(price)}
              </span>
            </div>
          </div>
          <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{t("valuation.fairValueLabel")}: {formatCurrency(low)}</span>
            <span>{formatCurrency(high)}</span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Method label={t("valuation.methodDcf")} value={dcf != null ? formatCurrency(dcf) : "—"} />
          <Method label={t("valuation.methodMultiples")} value={multiples != null ? formatCurrency(multiples) : "—"} />
          <Method
            label={t("valuation.impliedGrowth")}
            value={result.impliedGrowthPct != null ? `${result.impliedGrowthPct.toFixed(1)}%/yr` : "—"}
          />
        </div>

        {result.impliedGrowthPct != null ? (
          <p className="text-xs text-muted-foreground">
            {t("valuation.impliedGrowthNote", {
              symbol: data.quote.symbol,
              pct: result.impliedGrowthPct.toFixed(1),
            })}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground/80">{t("valuation.disclaimer")}</p>
      </CardContent>
    </Card>
  );
}

function Method({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}
