"use client";

import { Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CompareRow } from "@/lib/yahooCompare";
import { formatCurrencyCompact, formatRatio, normalizeYahooDividendYieldToDecimal } from "@/lib/format";
import type { InvestorMetrics } from "@/lib/stockAnalysisTypes";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import { cn } from "@/lib/utils";

const MAX = 4;

type Dir = "high" | "low" | "none";
type MetricDef = {
  key: string;
  labelKey: string;
  get: (inv: InvestorMetrics) => number | null;
  fmt: (v: number) => string;
  better: Dir;
};

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

const METRICS: MetricDef[] = [
  { key: "marketCap", labelKey: "compare.marketCap", get: (i) => i.marketCap, fmt: formatCurrencyCompact, better: "none" },
  { key: "trailingPE", labelKey: "compare.trailingPE", get: (i) => i.trailingPE, fmt: formatRatio, better: "low" },
  { key: "forwardPE", labelKey: "compare.forwardPE", get: (i) => i.forwardPE, fmt: formatRatio, better: "low" },
  { key: "pegRatio", labelKey: "compare.peg", get: (i) => i.pegRatio, fmt: formatRatio, better: "low" },
  { key: "priceToSales", labelKey: "compare.ps", get: (i) => i.priceToSales, fmt: formatRatio, better: "low" },
  { key: "priceToBook", labelKey: "compare.pb", get: (i) => i.priceToBook, fmt: formatRatio, better: "low" },
  { key: "evEbitda", labelKey: "compare.evEbitda", get: (i) => i.enterpriseToEbitda, fmt: formatRatio, better: "low" },
  {
    key: "dividendYield",
    labelKey: "compare.divYield",
    get: (i) => normalizeYahooDividendYieldToDecimal(i.dividendYield),
    fmt: pct1,
    better: "high",
  },
  { key: "grossMargins", labelKey: "compare.grossMargin", get: (i) => i.grossMargins, fmt: pct1, better: "high" },
  { key: "operatingMargins", labelKey: "compare.opMargin", get: (i) => i.operatingMargins, fmt: pct1, better: "high" },
  { key: "profitMargins", labelKey: "compare.netMargin", get: (i) => i.profitMargins, fmt: pct1, better: "high" },
  { key: "returnOnEquity", labelKey: "compare.roe", get: (i) => i.returnOnEquity, fmt: pct1, better: "high" },
  { key: "revenueGrowth", labelKey: "compare.revGrowth", get: (i) => i.revenueGrowth, fmt: pct1, better: "high" },
  { key: "earningsGrowth", labelKey: "compare.earnGrowth", get: (i) => i.earningsGrowth, fmt: pct1, better: "high" },
  { key: "debtToEquity", labelKey: "compare.debtEquity", get: (i) => i.debtToEquity, fmt: formatRatio, better: "low" },
  { key: "beta", labelKey: "compare.beta", get: (i) => i.beta, fmt: (v) => v.toFixed(2), better: "none" },
];

/** Index of the best column for a metric row, or -1 (ties / not enough data → no highlight). */
function bestIndex(values: (number | null)[], dir: Dir): number {
  if (dir === "none") return -1;
  const present = values.map((v, i) => ({ v, i })).filter((x) => x.v != null && Number.isFinite(x.v));
  if (present.length < 2) return -1;
  const sorted = [...present].sort((a, b) => (dir === "low" ? (a.v as number) - (b.v as number) : (b.v as number) - (a.v as number)));
  // Skip non-positive ratios for "low is better" (a negative P/E isn't "cheap").
  const top = dir === "low" ? sorted.find((x) => (x.v as number) > 0) ?? sorted[0] : sorted[0];
  const tie = present.filter((x) => x.v === top.v).length > 1;
  return tie ? -1 : top.i;
}

export function CompareClient({ initialSymbols }: { initialSymbols: string[] }) {
  const { t } = useI18n();
  const [symbols, setSymbols] = useState<string[]>(initialSymbols.slice(0, MAX));
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const load = useCallback(async (syms: string[]) => {
    if (syms.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compare?symbols=${encodeURIComponent(syms.join(","))}`, { cache: "no-store" });
      const data = (await res.json()) as { rows?: CompareRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? t("compare.error"));
        return;
      }
      // Keep the requested order.
      const bySym = new Map((data.rows ?? []).map((r) => [r.symbol.toUpperCase(), r]));
      setRows(syms.map((s) => bySym.get(s)).filter((r): r is CompareRow => r != null));
    } catch {
      setError(t("compare.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load(symbols);
  }, [symbols, load]);

  function addSymbol(e: FormEvent) {
    e.preventDefault();
    const s = input.trim().toUpperCase();
    if (!s || !isValidStockSymbolInput(s)) return;
    if (symbols.includes(s) || symbols.length >= MAX) return;
    setSymbols((prev) => [...prev, s]);
    setInput("");
  }

  function removeSymbol(s: string) {
    setSymbols((prev) => prev.filter((x) => x !== s));
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("compare.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("compare.intro", { max: MAX })}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((s) => (
          <span key={s} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1 text-sm">
            <span className="font-mono font-medium">{s}</span>
            <button
              type="button"
              onClick={() => removeSymbol(s)}
              className="text-muted-foreground hover:text-red-400"
              aria-label={t("compare.remove", { symbol: s })}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        {symbols.length < MAX ? (
          <form onSubmit={addSymbol} className="flex items-center gap-1.5">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder={t("compare.addPlaceholder")}
              className="h-9 w-36 border-white/10 bg-zinc-900/60"
              maxLength={12}
              autoComplete="off"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!input.trim()}>
              <Plus className="size-4" />
            </Button>
          </form>
        ) : null}
        {loading ? <Loader2 className="size-4 animate-spin text-emerald-500" aria-hidden /> : null}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">{t("compare.empty")}</p>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60">
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">{t("compare.metric")}</th>
                {rows.map((r) => (
                  <th key={r.symbol} className="px-3 py-3 text-right">
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="font-mono font-semibold text-emerald-400 hover:underline">
                      {r.symbol}
                    </Link>
                    <p className="max-w-[10rem] truncate text-right text-[11px] font-normal text-muted-foreground">{r.name}</p>
                    <p
                      className={cn(
                        "text-right font-mono text-xs tabular-nums",
                        r.changesPercentage >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {formatCurrencyCompact(r.price)} · {r.changesPercentage >= 0 ? "+" : ""}
                      {r.changesPercentage.toFixed(2)}%
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const vals = rows.map((r) => m.get(r.investor));
                const best = bestIndex(vals, m.better);
                return (
                  <tr key={m.key} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="px-3 py-2 text-left text-muted-foreground">{t(m.labelKey)}</td>
                    {vals.map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-3 py-2 text-right font-mono tabular-nums",
                          i === best ? "font-semibold text-emerald-400" : "text-foreground/90",
                        )}
                      >
                        {v != null && Number.isFinite(v) ? m.fmt(v) : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("compare.footnote")}</p>
    </div>
  );
}
