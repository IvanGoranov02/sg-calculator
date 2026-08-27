"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { T212DividendRow } from "@/lib/t212Dividends";

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

function formatPaidOn(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type T212RecentDividendsProps = {
  connected: boolean;
};

export function T212RecentDividends({ connected }: T212RecentDividendsProps) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<T212DividendRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!connected) {
      setRows([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trading212/dividends");
      const data = (await res.json()) as { dividends?: T212DividendRow[]; error?: string };
      setRows(Array.isArray(data.dividends) ? data.dividends : []);
      if (!res.ok || data.error) {
        setError(data.error ?? t("portfolio.t212DivError"));
      }
    } catch {
      setRows([]);
      setError(t("portfolio.t212DivError"));
    } finally {
      setLoading(false);
    }
  }, [connected, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const empty = !loading && rows.length === 0;

  return (
    <Card className="border-white/10 bg-zinc-900/40">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-base sm:text-lg">{t("portfolio.t212DivTitle")}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">{t("portfolio.t212DivHint")}</CardDescription>
      </CardHeader>
      {error ? (
        <p className="px-4 pb-2 text-sm text-amber-400/90 sm:px-6" role="status">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="px-4 pb-6 text-sm text-muted-foreground sm:px-6">{t("portfolio.loading")}</p>
      ) : empty ? (
        <p className="px-4 pb-6 text-sm text-muted-foreground sm:px-6">
          {connected ? t("portfolio.t212DivEmpty") : t("portfolio.t212DivNotConnected")}
        </p>
      ) : (
        <div className="-mx-px overflow-x-auto">
          <Table className="min-w-[28rem]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>{t("portfolio.t212DivColTicker")}</TableHead>
                <TableHead className="text-right">{t("portfolio.t212DivColAmount")}</TableHead>
                <TableHead>{t("portfolio.t212DivColCurrency")}</TableHead>
                <TableHead>{t("portfolio.t212DivColPaidOn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.ticker}-${r.paidOn ?? i}`} className="border-white/10">
                  <TableCell className="font-mono font-medium">{r.ticker}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.amount != null ? fmtMoney(r.amount, r.currency === "—" ? "USD" : r.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.currency}</TableCell>
                  <TableCell className="text-muted-foreground">{formatPaidOn(r.paidOn, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
