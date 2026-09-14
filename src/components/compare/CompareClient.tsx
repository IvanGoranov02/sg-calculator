"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CompareLeads } from "@/components/compare/CompareLeads";
import { CompareMetricCharts } from "@/components/compare/CompareMetricCharts";
import { CompareMetricTables } from "@/components/compare/CompareMetricTables";
import { CompareTickerSlot } from "@/components/compare/CompareTickerSlot";
import {
  assignCompareSlot,
  serializeCompareSlots,
  slotAlignedRows,
  twelveMonthLead,
  type CompareSlots,
} from "@/lib/compareMetrics";
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

function syncCompareUrl(slots: CompareSlots) {
  if (typeof window === "undefined") return;
  const serialized = serializeCompareSlots(slots);
  const qs = serialized ? `?symbols=${encodeURIComponent(serialized)}` : "";
  const next = `/compare${qs}`;
  const cur = `${window.location.pathname}${window.location.search}`;
  if (cur !== next) window.history.replaceState(null, "", next);
}

export function CompareClient({ initialSlots }: { initialSlots: CompareSlots }) {
  const { t } = useI18n();
  const [slots, setSlots] = useState<CompareSlots>(initialSlots);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(() => Boolean(initialSlots[0] || initialSlots[1]));
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyEntry[]>(INSTANT_COMPANIES);

  const fetchKey = useMemo(() => serializeCompareSlots(slots), [slots]);
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
    syncCompareUrl(slots);

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
        const res = await fetch(`/api/compare?symbols=${encodeURIComponent(fetchKey)}`, {
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
  }, [fetchKey, symbols, slots, t]);

  function setSlot(index: 0 | 1, ticker: string) {
    setSlots((prev) => assignCompareSlot(prev, index, ticker));
  }

  function clearSlot(index: 0 | 1) {
    setSlots((prev) => {
      const next: CompareSlots = [...prev];
      next[index] = null;
      return next;
    });
  }

  const aligned = slotAlignedRows(slots, rows);
  const filledRows = aligned.filter((r): r is CompareRow => r != null);
  const unresolved = slots.filter((s, i): s is string => s != null && aligned[i] == null);
  const lead = twelveMonthLead(filledRows);

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
          row={aligned[0] ?? undefined}
          loading={loading}
          companies={companies}
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
          row={aligned[1] ?? undefined}
          loading={loading}
          companies={companies}
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

      {lead && filledRows[lead.winner] && filledRows[lead.loser] ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
          {t("compare.perfLead", {
            winner: filledRows[lead.winner].symbol,
            winnerRet: formatPercent(filledRows[lead.winner].weekChangePercent ?? 0, 1),
            loser: filledRows[lead.loser].symbol,
            loserRet: formatPercent(filledRows[lead.loser].weekChangePercent ?? 0, 1),
          })}
        </p>
      ) : null}

      {filledRows.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">{t("compare.empty")}</p>
      ) : filledRows.length > 0 ? (
        <>
          <CompareMetricCharts slots={slots} rows={aligned} />
          <CompareLeads rows={filledRows} />
          <div>
            <h2 className="mb-3 text-base font-semibold tracking-tight">{t("compare.numbersTitle")}</h2>
            <CompareMetricTables rows={filledRows} />
          </div>
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("compare.footnote")}</p>
    </div>
  );
}
