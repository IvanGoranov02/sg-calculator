"use client";

import { Pencil, Plus, X } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPARE_SLOT_HEX, compareSlotStatus, weekRangePosition } from "@/lib/compareMetrics";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import {
  resolveStockSearchQuery,
  suggestCompanies,
  type SearchCompany,
} from "@/lib/stockSearch";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import type { CompareRow } from "@/lib/yahooCompare";
import { cn } from "@/lib/utils";

export function CompareTickerSlot({
  slotIndex,
  symbol,
  row,
  loading,
  companies,
  onSelect,
  onClear,
}: {
  slotIndex: 0 | 1;
  symbol: string | null;
  row: CompareRow | undefined;
  loading: boolean;
  companies: SearchCompany[];
  onSelect: (symbol: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accent = COMPARE_SLOT_HEX[slotIndex];
  const status = compareSlotStatus(Boolean(symbol), loading, row != null);
  const showSearch = !symbol || editing;

  const suggestionPool = useMemo(
    () =>
      suggestCompanies(companies, input).filter((c) => c.s.toUpperCase() !== symbol),
    [companies, input, symbol],
  );
  const suggestions = open ? suggestionPool : [];

  function pickTicker(raw: string) {
    const resolved = resolveStockSearchQuery(raw, suggestionPool, companies) ?? raw.trim().toUpperCase();
    if (!resolved || !isValidStockSymbolInput(resolved)) return;
    const s = resolved.toUpperCase();
    if (s === symbol) {
      setEditing(false);
      setInput("");
      setOpen(false);
      return;
    }
    onSelect(s);
    setInput("");
    setOpen(false);
    setHighlighted(-1);
    setEditing(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (highlighted >= 0 && highlighted < suggestionPool.length) {
      pickTicker(suggestionPool[highlighted].s);
      return;
    }
    pickTicker(input);
  }

  const searchFields = (
    <div className="flex items-center gap-1.5">
      <Input
        ref={inputRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value.toUpperCase());
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            setHighlighted(-1);
          }, 120);
        }}
        onKeyDown={(e) => {
          if (suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((h) => (h + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
            setHighlighted(-1);
            if (symbol) setEditing(false);
          }
        }}
        placeholder={t("compare.addPlaceholder")}
        className="h-9 bg-card"
        maxLength={12}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
      />
      <Button type="submit" size="sm" variant="outline" disabled={!input.trim()}>
        <Plus className="size-4" />
      </Button>
    </div>
  );

  const suggestionList =
    open && suggestions.length > 0 ? (
      <ul
        role="listbox"
        className="absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-md"
      >
        {suggestions.map((c, i) => (
          <li key={c.s} role="option" aria-selected={i === highlighted}>
            <button
              type="button"
              className={cn(
                "flex w-full px-3 py-1.5 text-left text-sm",
                i === highlighted ? "bg-emerald-500/15" : "hover:bg-muted/50",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                pickTicker(c.s);
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              <CompanyIdentity symbol={c.s} name={c.n} size="sm" />
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  const shellClass =
    "relative flex h-full min-h-[5.5rem] flex-col rounded-xl border border-border bg-card px-3 py-3 shadow-sm border-l-[3px]";

  if (showSearch) {
    return (
      <form
        onSubmit={onSubmit}
        className={cn(shellClass, !symbol && "border-dashed bg-muted/30")}
        style={{ borderLeftColor: accent }}
      >
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("compare.slotLabel", { n: slotIndex + 1 })}
          {symbol ? ` · ${symbol}` : ""}
        </p>
        {searchFields}
        {suggestionList}
      </form>
    );
  }

  const up = row ? row.changesPercentage >= 0 : true;
  const rec = row?.investor.recommendationKey?.replace(/_/g, " ") ?? null;
  const lo = row?.investor.fiftyTwoWeekLow;
  const hi = row?.investor.fiftyTwoWeekHigh;
  const pos = row ? weekRangePosition(row) : null;
  const rangePct = pos == null ? null : Math.max(0, Math.min(100, pos * 100));

  return (
    <div className={shellClass} style={{ borderLeftColor: accent }}>
      <div className="flex items-start justify-between gap-2">
        <CompanyIdentity
          symbol={symbol as string}
          name={row?.name}
          href={`/stock/${encodeURIComponent(symbol as string)}`}
          size="md"
          primaryLabel="name"
          className="min-w-0"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("compare.changeTicker", { symbol: symbol as string })}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-red-600 dark:hover:text-red-400"
            aria-label={t("compare.remove", { symbol: symbol as string })}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {status === "ready" && row ? (
        <>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums tracking-tight">
            {formatCurrency(row.price)}
          </p>
          <p
            className={cn(
              "font-mono text-sm tabular-nums",
              up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
            )}
          >
            {formatPercent(row.changesPercentage)}
            {row.weekChangePercent != null ? (
              <span className="ml-2 text-xs text-muted-foreground">
                {t("compare.weekChangeShort", { value: formatPercent(row.weekChangePercent, 1) })}
              </span>
            ) : null}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div>
              <dt className="text-muted-foreground">{t("compare.marketCap")}</dt>
              <dd className="font-mono tabular-nums">
                {row.investor.marketCap != null ? formatCurrencyCompact(row.investor.marketCap) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("compare.trailingPE")}</dt>
              <dd className="font-mono tabular-nums">
                {row.investor.trailingPE != null && Number.isFinite(row.investor.trailingPE)
                  ? row.investor.trailingPE.toFixed(1)
                  : "—"}
              </dd>
            </div>
          </dl>
          {row.sector || rec ? (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {row.sector}
              {row.sector && rec ? " · " : null}
              {rec ? `${t("compare.analysts")}: ${rec}` : null}
            </p>
          ) : null}
          {lo != null && hi != null && rangePct != null ? (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("compare.weekRange")}
              </p>
              <div className="relative h-1.5 rounded-full bg-muted">
                <span
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                  style={{ left: `${rangePct}%`, background: accent }}
                />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
                <span>{formatCurrency(lo)}</span>
                <span>{formatCurrency(hi)}</span>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {status === "loading" ? t("loading.stock") : t("compare.slotMissing")}
        </p>
      )}
    </div>
  );
}
