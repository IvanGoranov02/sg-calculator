"use client";

import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type Item = {
  rank: number;
  symbol: string;
  status: "verified" | "failed" | "pending";
  latestQuarter: string | null;
  verifiedAt: string | null;
  checkedAt: string | null;
  crossChecked: number;
  errors: { code: string; message: string }[];
};

const TEXT = {
  en: {
    title: "Verified company data",
    intro:
      "Statements for the largest companies come straight from SEC filings and are stored only when they add up and agree with a second source. Verified companies load from this store; the rest keep using the regular pipeline.",
    buildAll: "Build missing and failed",
    stop: "Stop",
    rebuild: "Rebuild",
    verified: "Verified",
    failed: "Not verified",
    pending: "Not built yet",
    company: "Company",
    status: "Status",
    latest: "Latest quarter",
    checks: "Figures cross-checked",
    reason: "Why it is not verified",
    summary: (v: number, f: number, p: number) => `${v} verified · ${f} not verified · ${p} not built yet`,
    loadError: "Could not load the list.",
    cache: "Cache editor",
  },
  bg: {
    title: "Проверени данни за компании",
    intro:
      "Отчетите на най-големите компании идват директно от документите в SEC и се записват само ако сборовете излизат и съвпадат с втори източник. Проверените компании се зареждат оттук; останалите ползват обичайния начин.",
    buildAll: "Построй липсващите и неуспешните",
    stop: "Спри",
    rebuild: "Построй наново",
    verified: "Проверена",
    failed: "Непроверена",
    pending: "Още не е построена",
    company: "Компания",
    status: "Статус",
    latest: "Последно тримесечие",
    checks: "Сравнени числа",
    reason: "Защо не е проверена",
    summary: (v: number, f: number, p: number) => `${v} проверени · ${f} непроверени · ${p} още не са построени`,
    loadError: "Списъкът не можа да се зареди.",
    cache: "Редактор на кеша",
  },
} as const;

export function VerifiedListClient() {
  const { locale } = useI18n();
  const c = TEXT[locale === "bg" ? "bg" : "en"];
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/verified", { cache: "no-store" });
      const json = (await res.json()) as { items?: Item[]; error?: string };
      if (!res.ok || !json.items) throw new Error(json.error ?? "load");
      setItems(json.items);
      setError(null);
    } catch {
      setError(c.loadError);
    }
  }, [c.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildOne = useCallback(async (symbol: string) => {
    setBusy(symbol);
    try {
      const res = await fetch("/api/admin/verified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const out = (await res.json().catch(() => null)) as
        | { status?: string; latestQuarter?: string | null; crossChecked?: number; errors?: Item["errors"]; error?: string }
        | null;
      setItems((prev) =>
        prev.map((it) =>
          it.symbol !== symbol
            ? it
            : out?.status === "verified"
              ? { ...it, status: "verified", latestQuarter: out.latestQuarter ?? null, crossChecked: out.crossChecked ?? 0, errors: [] }
              : {
                  ...it,
                  status: it.status === "verified" ? "verified" : "failed",
                  errors: out?.errors ?? [{ code: "error", message: out?.error ?? "Build failed." }],
                },
        ),
      );
    } catch {
      /* row stays as it was; the next reload shows the stored state */
    } finally {
      setBusy(null);
    }
  }, []);

  async function buildAll() {
    stopRef.current = false;
    setRunning(true);
    for (const it of items) {
      if (stopRef.current) break;
      if (it.status === "verified") continue;
      await buildOne(it.symbol);
    }
    setRunning(false);
    void load();
  }

  const counts = {
    v: items.filter((i) => i.status === "verified").length,
    f: items.filter((i) => i.status === "failed").length,
    p: items.filter((i) => i.status === "pending").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{c.intro}</p>
          <p className="mt-2 text-sm font-medium">{c.summary(counts.v, counts.f, counts.p)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/admin/cache" className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted">
            {c.cache}
          </Link>
          {running ? (
            <Button type="button" variant="outline" onClick={() => (stopRef.current = true)}>
              {c.stop}
            </Button>
          ) : (
            <Button type="button" onClick={() => void buildAll()} disabled={busy != null || items.length === 0}>
              {c.buildAll}
            </Button>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">{c.company}</th>
              <th className="px-3 py-2 font-semibold">{c.status}</th>
              <th className="px-3 py-2 font-semibold">{c.latest}</th>
              <th className="px-3 py-2 text-right font-semibold">{c.checks}</th>
              <th className="px-3 py-2 font-semibold">{c.reason}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {items.map((it) => {
              const Icon = it.status === "verified" ? CheckCircle2 : it.status === "failed" ? XCircle : Clock;
              return (
                <tr key={it.symbol}>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{it.rank}</td>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/stock/${encodeURIComponent(it.symbol)}`} className="hover:text-primary">
                      {it.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap",
                        it.status === "verified" ? "text-emerald-400" : it.status === "failed" ? "text-amber-400" : "text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {c[it.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{it.latestQuarter ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.crossChecked || "—"}</td>
                  <td className="max-w-md px-3 py-2 text-xs text-muted-foreground">
                    {it.errors.slice(0, 2).map((e, i) => (
                      <p key={i} className="break-words">
                        {e.message}
                      </p>
                    ))}
                    {it.errors.length > 2 ? <p>+{it.errors.length - 2}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy != null}
                      onClick={() => void buildOne(it.symbol)}
                      aria-label={`${c.rebuild} ${it.symbol}`}
                      title={c.rebuild}
                    >
                      {busy === it.symbol ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
