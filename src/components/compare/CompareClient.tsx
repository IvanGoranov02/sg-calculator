"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CompareLeads } from "@/components/compare/CompareLeads";
import { CompareMetricCharts } from "@/components/compare/CompareMetricCharts";
import { CompareMetricTables } from "@/components/compare/CompareMetricTables";
import { CompareSnapshotCards } from "@/components/compare/CompareSnapshotCards";
import { CompareTickerSlot } from "@/components/compare/CompareTickerSlot";
import { MAX_COMPARE, twelveMonthLead } from "@/lib/compareMetrics";
import usCompanies from "@/data/usCompanies.json";
import { formatPercent } from "@/lib/format";
import type { CompareRow } from "@/lib/yahooCompare";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { SearchCompany } from "@/lib/stockSearch";

type CompanyEntry = SearchCompany;
const INSTANT_COMPANIES = usCompanies as CompanyEntry[];

let fullCompaniesPromise: Promise<CompanyEntry[]> | null = null;
function loadFullCompanies(): Promise<CompanyEntry[]> {
  if (!fullCompaniesPromise) {
    fullCompaniesPromise = fetch("/us-companies.json")
      .then((r) => (r.ok ? (r.json() as Promise<CompanyEntry[]>) : INSTANT_COMPANIES))
      .catch(() => INSTANT_COMPANIES);
  }
  return fullCompaniesPromise;
}

function syncCompareUrl(symbols: string[]) {
  if (typeof window === "undefined") return;
  const qs = symbols.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  const next = `/compare${qs}`;
  const cur = `${window.location.pathname}${window.location.search}`;
  if (cur !== next) window.history.replaceState(null, "", next);
}

function toSlots(symbols: string[]): [string | null, string | null] {
  return [symbols[0] ?? null, symbols[1] ?? null];
}

export function CompareClient({ initialSymbols }: { initialSymbols: string[] }) {
  const { t } = useI18n();
  const [slots, setSlots] = useState<[string | null, string | null]>(() =>
    toSlots(initialSymbols.slice(0, MAX_COMPARE)),
  );
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(() => initialSymbols.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyEntry[]>(INSTANT_COMPANIES);

  const symbols = useMemo(() => slots.filter((s): s is string => s != null), [slots]);

  useEffect(() => {
    let active = true;
    void loadFullCompanies().then((list) => {
      if (active && list.length > INSTANT_COMPANIES.length) setCompanies(list);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    syncCompareUrl(symbols);

    async function load() {
      if (symbols.length === 0) {
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/compare?symbols=${encodeURIComponent(symbols.join(","))}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { rows?: CompareRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? t("compare.error"));
          setRows([]);
          return;
        }
        const bySym = new Map((data.rows ?? []).map((r) => [r.symbol.toUpperCase(), r]));
        setRows(symbols.map((s) => bySym.get(s)).filter((r): r is CompareRow => r != null));
      } catch {
        if (!cancelled) setError(t("compare.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [symbols, t]);

  const selected = useMemo(() => new Set(symbols), [symbols]);

  function setSlot(index: 0 | 1, ticker: string) {
    const s = ticker.toUpperCase();
    setSlots((prev) => {
      const other = (1 - index) as 0 | 1;
      if (prev[other] === s) {
        return index === 0 ? [s, prev[0]] : [prev[1], s];
      }
      const next: [string | null, string | null] = [...prev];
      next[index] = s;
      return next;
    });
  }

  function clearSlot(index: 0 | 1) {
    setSlots((prev) => {
      const next: [string | null, string | null] = [...prev];
      next[index] = null;
      return next;
    });
  }

  const loadedSet = new Set(rows.map((r) => r.symbol.toUpperCase()));
  const unresolved = symbols.filter((s) => !loadedSet.has(s));
  const displayRows = symbols
    .map((s) => rows.find((r) => r.symbol.toUpperCase() === s))
    .filter((r): r is CompareRow => r != null);
  const lead = twelveMonthLead(displayRows);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("compare.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("compare.intro")}</p>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <CompareTickerSlot
          slotIndex={0}
          symbol={slots[0]}
          row={rows.find((r) => r.symbol.toUpperCase() === slots[0])}
          companies={companies}
          exclude={selected}
          onSelect={(s) => setSlot(0, s)}
          onClear={() => clearSlot(0)}
        />
        <div className="flex items-center justify-center">
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("compare.vs")}
          </span>
        </div>
        <CompareTickerSlot
          slotIndex={1}
          symbol={slots[1]}
          row={rows.find((r) => r.symbol.toUpperCase() === slots[1])}
          companies={companies}
          exclude={selected}
          onSelect={(s) => setSlot(1, s)}
          onClear={() => clearSlot(1)}
        />
      </div>

      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-emerald-500" aria-hidden />
          {t("loading.stock")}
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!loading && unresolved.length > 0 ? (
        <p
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
          role="status"
        >
          {t("compare.unresolved", { symbols: unresolved.join(", ") })}
        </p>
      ) : null}

      {lead && displayRows[lead.winner] && displayRows[lead.loser] ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
          {t("compare.perfLead", {
            winner: displayRows[lead.winner].symbol,
            winnerRet: formatPercent(displayRows[lead.winner].weekChangePercent ?? 0, 1),
            loser: displayRows[lead.loser].symbol,
            loserRet: formatPercent(displayRows[lead.loser].weekChangePercent ?? 0, 1),
          })}
        </p>
      ) : null}

      {displayRows.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">{t("compare.empty")}</p>
      ) : displayRows.length > 0 ? (
        <>
          <CompareSnapshotCards rows={displayRows} />
          <CompareMetricCharts rows={displayRows} />
          <CompareLeads rows={displayRows} />
          <div>
            <h2 className="mb-3 text-base font-semibold tracking-tight">{t("compare.numbersTitle")}</h2>
            <CompareMetricTables rows={displayRows} />
          </div>
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("compare.footnote")}</p>
    </div>
  );
}
