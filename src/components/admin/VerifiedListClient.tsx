"use client";

import { CheckCircle2, Clock, FileCheck2, Loader2, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type Status = "verified" | "partial" | "failed" | "pending";

type Item = {
  symbol: string;
  name: string;
  country: string;
  world: number | null;
  us: number | null;
  status: Status;
  profile: "bank" | "general";
  full: boolean;
  latestQuarter: string | null;
  periods: number;
  verifiedPeriods: number;
  nextCheckAt: string | null;
  issues: { code: string; message: string }[];
};

type Filter = "all" | Status;

const MAX_ROWS = 300;

const TEXT = {
  en: {
    title: "Stored company data",
    intro:
      "Statements are stored once, period by period, from SEC filings and a second source (no AI). A period is cross-checked when both sources agree on it. The list holds the 1000 largest companies worldwide and the 1000 largest in the US; any other company is added the first time someone opens it.",
    run: "Fill and refresh now",
    stop: "Stop",
    rebuild: "Rebuild from the sources",
    verified: "Verified",
    partial: "Stored",
    failed: "No data",
    pending: "Not stored yet",
    all: "All",
    company: "Company",
    rank: "Rank (world / US)",
    status: "Status",
    served: "Page uses",
    servedStore: "Store only",
    servedOverlay: "Store + regular loading",
    periods: "Periods cross-checked",
    latest: "Latest quarter",
    next: "Next look",
    notes: "Notes",
    bank: "bank",
    search: "Search symbol or name",
    summary: (v: number, s: number, f: number, p: number) => `${v} verified · ${s} stored · ${f} no data · ${p} not stored yet`,
    progress: (done: number, left: number) => `${done} companies processed in this run, ${left} waiting`,
    showing: (n: number, total: number) => `Showing the first ${n} of ${total}. Narrow it down with the search or the filters.`,
    loadError: "Could not load the list.",
    runError: "The run stopped because of an error. Press the button to continue.",
    cache: "Cache editor",
  },
  bg: {
    title: "Записани данни за компании",
    intro:
      "Отчетите се записват веднъж, период по период, от документите в SEC и втори източник (без AI). Един период е сверен, когато двата източника съвпадат за него. Списъкът съдържа 1000-те най-големи компании в света и 1000-те най-големи в САЩ; всяка друга компания се добавя при първото ѝ отваряне.",
    run: "Запълни и обнови сега",
    stop: "Спри",
    rebuild: "Построй наново от източниците",
    verified: "Проверена",
    partial: "Записана",
    failed: "Няма данни",
    pending: "Още не е записана",
    all: "Всички",
    company: "Компания",
    rank: "Място (свят / САЩ)",
    status: "Статус",
    served: "Страницата ползва",
    servedStore: "Само склада",
    servedOverlay: "Склада + обичайното зареждане",
    periods: "Сверени периоди",
    latest: "Последно тримесечие",
    next: "Следваща проверка",
    notes: "Бележки",
    bank: "банка",
    search: "Търси символ или име",
    summary: (v: number, s: number, f: number, p: number) => `${v} проверени · ${s} записани · ${f} без данни · ${p} още не са записани`,
    progress: (done: number, left: number) => `${done} компании обработени в това пускане, ${left} чакат`,
    showing: (n: number, total: number) => `Показани са първите ${n} от ${total}. Стесни с търсачката или филтрите.`,
    loadError: "Списъкът не можа да се зареди.",
    runError: "Пускането спря заради грешка. Натисни бутона, за да продължи.",
    cache: "Редактор на кеша",
  },
} as const;

export function VerifiedListClient() {
  const { locale } = useI18n();
  const bg = locale === "bg";
  const c = TEXT[bg ? "bg" : "en"];
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; left: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
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

  const rebuildOne = useCallback(
    async (symbol: string) => {
      setBusy(symbol);
      try {
        await fetch("/api/admin/verified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol }),
        });
        await load();
      } catch {
        /* the list keeps showing the stored state */
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  /** Each request works the queue for one server time budget; repeat until nothing is waiting. */
  async function runQueue() {
    stopRef.current = false;
    setRunning(true);
    setError(null);
    let done = 0;
    let idle = 0;
    try {
      while (!stopRef.current) {
        const res = await fetch("/api/admin/verified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run" }),
        });
        if (!res.ok) throw new Error("run");
        const out = (await res.json()) as { processed?: unknown[]; remaining?: number };
        const n = out.processed?.length ?? 0;
        done += n;
        setProgress({ done, left: out.remaining ?? 0 });
        if (!out.remaining) break;
        idle = n === 0 ? idle + 1 : 0;
        if (idle >= 3) break;
        if (done % 40 < n) void load();
      }
    } catch {
      setError(c.runError);
    }
    setRunning(false);
    void load();
  }

  const counts = useMemo(
    () => ({
      verified: items.filter((i) => i.status === "verified").length,
      partial: items.filter((i) => i.status === "partial").length,
      failed: items.filter((i) => i.status === "failed").length,
      pending: items.filter((i) => i.status === "pending").length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) => (filter === "all" || i.status === filter) && (!q || i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)),
    );
  }, [items, filter, query]);
  const shown = filtered.slice(0, MAX_ROWS);

  const day = (isoDate: string | null) =>
    isoDate ? new Date(isoDate).toLocaleDateString(bg ? "bg-BG" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: c.all, count: items.length },
    { key: "verified", label: c.verified, count: counts.verified },
    { key: "partial", label: c.partial, count: counts.partial },
    { key: "failed", label: c.failed, count: counts.failed },
    { key: "pending", label: c.pending, count: counts.pending },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{c.intro}</p>
          <p className="mt-2 text-sm font-medium">{c.summary(counts.verified, counts.partial, counts.failed, counts.pending)}</p>
          {progress ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {c.progress(progress.done, progress.left)}
            </p>
          ) : null}
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
            <Button type="button" onClick={() => void runQueue()} disabled={busy != null || items.length === 0}>
              {c.run}
            </Button>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key ? "border-primary bg-primary/15 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{f.count}</span>
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={c.search}
          aria-label={c.search}
          className="h-8 min-w-48 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-semibold">{c.company}</th>
              <th className="px-3 py-2 font-semibold">{c.rank}</th>
              <th className="px-3 py-2 font-semibold">{c.status}</th>
              <th className="px-3 py-2 font-semibold">{c.served}</th>
              <th className="px-3 py-2 text-right font-semibold">{c.periods}</th>
              <th className="px-3 py-2 font-semibold">{c.latest}</th>
              <th className="px-3 py-2 font-semibold">{c.next}</th>
              <th className="px-3 py-2 font-semibold">{c.notes}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {shown.map((it) => {
              const Icon = it.status === "verified" ? CheckCircle2 : it.status === "partial" ? FileCheck2 : it.status === "failed" ? XCircle : Clock;
              return (
                <tr key={it.symbol}>
                  <td className="max-w-56 px-3 py-2">
                    <Link href={`/stock/${encodeURIComponent(it.symbol)}`} className="font-medium hover:text-primary">
                      {it.symbol}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.name}
                      {it.country ? ` · ${it.country}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {it.world ?? "—"} / {it.us ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap",
                        it.status === "verified"
                          ? "text-emerald-400"
                          : it.status === "partial"
                            ? "text-sky-400"
                            : it.status === "failed"
                              ? "text-amber-400"
                              : "text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {c[it.status]}
                    </span>
                    {it.profile === "bank" ? <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{c.bank}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{it.periods === 0 ? "—" : it.full ? c.servedStore : c.servedOverlay}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.periods ? `${it.verifiedPeriods} / ${it.periods}` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{it.latestQuarter ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{day(it.nextCheckAt)}</td>
                  <td className="max-w-sm px-3 py-2 text-xs text-muted-foreground">
                    {it.issues.slice(0, 2).map((e, i) => (
                      <p key={i} className="break-words">
                        {e.message}
                      </p>
                    ))}
                    {it.issues.length > 2 ? <p>+{it.issues.length - 2}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy != null || running}
                      onClick={() => void rebuildOne(it.symbol)}
                      aria-label={`${c.rebuild}: ${it.symbol}`}
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
      {filtered.length > shown.length ? <p className="text-xs text-muted-foreground">{c.showing(shown.length, filtered.length)}</p> : null}
    </div>
  );
}
