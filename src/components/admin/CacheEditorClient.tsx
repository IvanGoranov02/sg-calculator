"use client";

import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminArrayTable, type AdminColumnDef } from "@/components/admin/AdminArrayTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminEditableBundle } from "@/lib/adminCacheSchema";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type Props = { symbol: string };

type Meta = { createdAt: string; updatedAt: string; adminEditedAt: string | null };

const incomeAnnualCols: AdminColumnDef<AdminEditableBundle["income"][number]>[] = [
  { key: "fiscalYear", label: "FY", type: "text" },
  { key: "date", label: "Date", type: "text" },
  { key: "revenue", label: "Revenue", type: "number" },
  { key: "grossProfit", label: "Gross profit", type: "number" },
  { key: "operatingExpenses", label: "OpEx", type: "number" },
  { key: "netIncome", label: "Net income", type: "number" },
  { key: "operatingIncome", label: "Op income", type: "number" },
  { key: "ebitda", label: "EBITDA", type: "number" },
  { key: "dilutedEps", label: "EPS", type: "number" },
];

const cfAnnualCols: AdminColumnDef<AdminEditableBundle["cashFlow"][number]>[] = [
  { key: "fiscalYear", label: "FY", type: "text" },
  { key: "date", label: "Date", type: "text" },
  { key: "freeCashFlow", label: "FCF", type: "number" },
  { key: "operatingCashFlow", label: "OCF", type: "number", nullable: true },
  { key: "capitalExpenditure", label: "CapEx", type: "number", nullable: true },
  { key: "dividendsPaid", label: "Dividends", type: "number", nullable: true },
];

const bsAnnualCols: AdminColumnDef<AdminEditableBundle["balanceSheet"][number]>[] = [
  { key: "fiscalYear", label: "FY", type: "text" },
  { key: "date", label: "Date", type: "text" },
  { key: "totalAssets", label: "Assets", type: "number", nullable: true },
  { key: "totalDebt", label: "Debt", type: "number", nullable: true },
  { key: "stockholdersEquity", label: "Equity", type: "number", nullable: true },
  { key: "cashAndCashEquivalents", label: "Cash", type: "number", nullable: true },
];

const incomeQCols: AdminColumnDef<AdminEditableBundle["incomeQuarterly"][number]>[] = [
  { key: "date", label: "Date", type: "text" },
  { key: "revenue", label: "Revenue", type: "number" },
  { key: "grossProfit", label: "Gross profit", type: "number" },
  { key: "operatingExpenses", label: "OpEx", type: "number" },
  { key: "netIncome", label: "Net income", type: "number" },
];

const cfQCols: AdminColumnDef<AdminEditableBundle["cashFlowQuarterly"][number]>[] = [
  { key: "date", label: "Date", type: "text" },
  { key: "freeCashFlow", label: "FCF", type: "number" },
  { key: "operatingCashFlow", label: "OCF", type: "number", nullable: true },
];

const bsQCols: AdminColumnDef<AdminEditableBundle["balanceSheetQuarterly"][number]>[] = [
  { key: "date", label: "Date", type: "text" },
  { key: "totalAssets", label: "Assets", type: "number", nullable: true },
  { key: "totalDebt", label: "Debt", type: "number", nullable: true },
  { key: "stockholdersEquity", label: "Equity", type: "number", nullable: true },
];

const divQCols: AdminColumnDef<AdminEditableBundle["dividendQuarterly"][number]>[] = [
  { key: "date", label: "Date", type: "text" },
  { key: "dividendPerShare", label: "DPS", type: "number", nullable: true },
];

const INVESTOR_KEYS = [
  "currency",
  "marketCap",
  "enterpriseValue",
  "trailingPE",
  "forwardPE",
  "pegRatio",
  "priceToSales",
  "priceToBook",
  "enterpriseToRevenue",
  "enterpriseToEbitda",
  "beta",
  "fiftyTwoWeekLow",
  "fiftyTwoWeekHigh",
  "fiftyDayAverage",
  "twoHundredDayAverage",
  "regularMarketVolume",
  "averageDailyVolume3Month",
  "grossMargins",
  "operatingMargins",
  "profitMargins",
  "returnOnEquity",
  "returnOnAssets",
  "revenueGrowth",
  "earningsGrowth",
  "debtToEquity",
  "currentRatio",
  "quickRatio",
  "totalCash",
  "totalDebt",
  "dividendRate",
  "dividendYield",
  "payoutRatio",
  "trailingEps",
  "forwardEps",
  "bookValue",
  "revenuePerShare",
  "sharesOutstanding",
  "floatShares",
  "heldPercentInsiders",
  "heldPercentInstitutions",
  "shortPercentOfFloat",
  "targetMeanPrice",
  "targetMedianPrice",
  "recommendationKey",
  "numberOfAnalystOpinions",
] as const;

export function CacheEditorClient({ symbol }: Props) {
  const { t } = useI18n();
  const [bundle, setBundle] = useState<AdminEditableBundle | null>(null);
  // Raw text being typed into numeric quote fields, so partial input ("-", "1.") isn't clobbered.
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cache/${encodeURIComponent(symbol)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        bundle?: AdminEditableBundle;
        createdAt?: string;
        updatedAt?: string;
        adminEditedAt?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? t("admin.errLoad"));
        setBundle(null);
        return;
      }
      if (data.bundle) {
        setBundle(data.bundle);
        setQuoteDrafts({});
      }
      if (data.createdAt && data.updatedAt) {
        setMeta({
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          adminEditedAt: data.adminEditedAt ?? null,
        });
      }
    } catch {
      setError(t("admin.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [symbol, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!bundle) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/admin/cache/${encodeURIComponent(symbol)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const data = (await res.json()) as {
        bundle?: AdminEditableBundle;
        updatedAt?: string;
        createdAt?: string;
        adminEditedAt?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? t("admin.errSave"));
        return;
      }
      if (data.bundle) setBundle(data.bundle);
      if (data.createdAt && data.updatedAt) {
        setMeta({
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          adminEditedAt: data.adminEditedAt ?? null,
        });
      }
      setSavedMsg(t("admin.saved"));
    } catch {
      setError(t("admin.errSave"));
    } finally {
      setSaving(false);
    }
  };

  const refreshGemini = async () => {
    if (!window.confirm(t("admin.confirmRefresh", { symbol }))) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cache/${encodeURIComponent(symbol)}/refresh`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        bundle?: AdminEditableBundle;
        updatedAt?: string;
        createdAt?: string;
        adminEditedAt?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? t("admin.errRefresh"));
        return;
      }
      if (data.bundle) {
        setBundle(data.bundle);
        setQuoteDrafts({});
      }
      if (data.createdAt && data.updatedAt) {
        setMeta({
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          adminEditedAt: data.adminEditedAt ?? null,
        });
      }
      setSavedMsg(t("admin.refreshed"));
    } catch {
      setError(t("admin.errRefresh"));
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("admin.loading")}
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error ?? t("admin.notFound")}</p>
        <Button nativeButton={false} variant="outline" render={<Link href="/admin/cache" />}>
          {t("admin.backToList")}
        </Button>
      </div>
    );
  }

  const sym = symbol.toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button
            nativeButton={false}
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 text-muted-foreground"
            render={<Link href="/admin/cache" />}
          >
            ← {t("admin.backToList")}
          </Button>
          <h1 className="font-mono text-2xl font-semibold">
            {sym}
            {meta?.adminEditedAt ? (
              <span
                className="ml-3 align-middle rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-sans text-[10px] uppercase tracking-wide text-amber-400"
                title={new Date(meta.adminEditedAt).toLocaleString()}
              >
                {t("admin.editedBadge")}
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">{bundle.quote.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/15"
            disabled={refreshing || saving}
            onClick={() => void refreshGemini()}
          >
            <RefreshCw className={cn("mr-2 size-4", refreshing && "animate-spin")} />
            {t("admin.refreshGemini")}
          </Button>
          <Button type="button" size="sm" disabled={saving || refreshing} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("admin.save")}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {savedMsg ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {savedMsg}
        </p>
      ) : null}

      <Tabs defaultValue="quote">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-zinc-900/80 p-1">
          <TabsTrigger value="quote">{t("admin.tabQuote")}</TabsTrigger>
          <TabsTrigger value="annual">{t("admin.tabAnnual")}</TabsTrigger>
          <TabsTrigger value="quarterly">{t("admin.tabQuarterly")}</TabsTrigger>
          <TabsTrigger value="investor">{t("admin.tabInvestor")}</TabsTrigger>
          <TabsTrigger value="meta">{t("admin.tabMeta")}</TabsTrigger>
        </TabsList>

        <TabsContent value="quote" className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["symbol", "text"],
                ["name", "text"],
                ["price", "number"],
                ["change", "number"],
                ["changesPercentage", "number"],
                ["earningsDate", "text"],
              ] as const
            ).map(([key, kind]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{key}</Label>
                <Input
                  className="border-white/10 bg-zinc-900/80"
                  type="text"
                  inputMode={kind === "number" ? "decimal" : undefined}
                  value={
                    kind === "number" && quoteDrafts[key] != null
                      ? quoteDrafts[key]
                      : bundle.quote[key] == null
                        ? ""
                        : String(bundle.quote[key as keyof typeof bundle.quote] ?? "")
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (kind === "number") {
                      setQuoteDrafts((prev) => ({ ...prev, [key]: raw }));
                      const n = Number(raw);
                      if (raw.trim() === "" || !Number.isFinite(n)) return;
                      setBundle({ ...bundle, quote: { ...bundle.quote, [key]: n } });
                      return;
                    }
                    setBundle({
                      ...bundle,
                      quote: {
                        ...bundle.quote,
                        [key]: key === "earningsDate" ? raw || null : raw,
                      },
                    });
                  }}
                  onBlur={() => {
                    if (kind !== "number") return;
                    setQuoteDrafts((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="annual" className="mt-4 space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-medium">{t("admin.incomeAnnual")}</h2>
            <AdminArrayTable
              columns={incomeAnnualCols}
              rows={bundle.income}
              onChange={(income) => setBundle({ ...bundle, income })}
              addLabel={t("admin.addRow")}
              onAddRow={() => ({
                date: "",
                symbol: sym,
                fiscalYear: "",
                revenue: 0,
                grossProfit: 0,
                operatingExpenses: 0,
                netIncome: 0,
              })}
            />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium">{t("admin.cashFlowAnnual")}</h2>
            <AdminArrayTable
              columns={cfAnnualCols}
              rows={bundle.cashFlow}
              onChange={(cashFlow) => setBundle({ ...bundle, cashFlow })}
              addLabel={t("admin.addRow")}
              onAddRow={() => ({
                date: "",
                symbol: sym,
                fiscalYear: "",
                freeCashFlow: 0,
                operatingCashFlow: null,
                capitalExpenditure: null,
                investingCashFlow: null,
                financingCashFlow: null,
                dividendsPaid: null,
                stockRepurchase: null,
              })}
            />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium">{t("admin.balanceAnnual")}</h2>
            <AdminArrayTable
              columns={bsAnnualCols}
              rows={bundle.balanceSheet}
              onChange={(balanceSheet) => setBundle({ ...bundle, balanceSheet })}
              addLabel={t("admin.addRow")}
              onAddRow={() => ({
                date: "",
                symbol: sym,
                fiscalYear: "",
                totalAssets: null,
                totalDebt: null,
                netDebt: null,
                stockholdersEquity: null,
                cashAndCashEquivalents: null,
                totalCurrentAssets: null,
                totalCurrentLiabilities: null,
                inventory: null,
                accountsReceivable: null,
                goodwill: null,
                longTermDebt: null,
              })}
            />
          </section>
        </TabsContent>

        <TabsContent value="quarterly" className="mt-4 space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-medium">{t("admin.incomeQuarterly")}</h2>
            <AdminArrayTable
              columns={incomeQCols}
              rows={bundle.incomeQuarterly}
              onChange={(incomeQuarterly) => setBundle({ ...bundle, incomeQuarterly })}
              addLabel={t("admin.addRow")}
              onAddRow={() => ({
                date: "",
                symbol: sym,
                revenue: 0,
                grossProfit: 0,
                operatingExpenses: 0,
                netIncome: 0,
              })}
            />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium">{t("admin.cashFlowQuarterly")}</h2>
            <AdminArrayTable
              columns={cfQCols}
              rows={bundle.cashFlowQuarterly}
              onChange={(cashFlowQuarterly) => setBundle({ ...bundle, cashFlowQuarterly })}
              addLabel={t("admin.addRow")}
              onAddRow={() => ({
                date: "",
                symbol: sym,
                freeCashFlow: 0,
                operatingCashFlow: null,
                capitalExpenditure: null,
                investingCashFlow: null,
                financingCashFlow: null,
                dividendsPaid: null,
                stockRepurchase: null,
              })}
            />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium">{t("admin.balanceQuarterly")}</h2>
            <AdminArrayTable
              columns={bsQCols}
              rows={bundle.balanceSheetQuarterly}
              onChange={(balanceSheetQuarterly) =>
                setBundle({ ...bundle, balanceSheetQuarterly })
              }
              addLabel={t("admin.addRow")}
              onAddRow={() => ({
                date: "",
                symbol: sym,
                totalAssets: null,
                totalDebt: null,
                netDebt: null,
                stockholdersEquity: null,
                cashAndCashEquivalents: null,
                totalCurrentAssets: null,
                totalCurrentLiabilities: null,
                inventory: null,
                accountsReceivable: null,
                goodwill: null,
                longTermDebt: null,
              })}
            />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium">{t("admin.dividendQuarterly")}</h2>
            <AdminArrayTable
              columns={divQCols}
              rows={bundle.dividendQuarterly}
              onChange={(dividendQuarterly) => setBundle({ ...bundle, dividendQuarterly })}
              addLabel={t("admin.addRow")}
              onAddRow={() => ({ date: "", dividendPerShare: null })}
            />
          </section>
        </TabsContent>

        <TabsContent value="investor" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INVESTOR_KEYS.map((key) => {
              const val = bundle.investor[key];
              const isStr = key === "currency" || key === "recommendationKey";
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{key}</Label>
                  <Input
                    className="border-white/10 bg-zinc-900/80"
                    type={isStr ? "text" : "number"}
                    value={val == null ? "" : String(val)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setBundle({
                        ...bundle,
                        investor: {
                          ...bundle.investor,
                          [key]: isStr
                            ? key === "recommendationKey"
                              ? raw || null
                              : raw
                            : raw === ""
                              ? null
                              : (() => {
                                  const n = Number(raw);
                                  return Number.isFinite(n) ? n : bundle.investor[key];
                                })(),
                        },
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="meta" className="mt-4 space-y-3 text-sm">
          {meta ? (
            <>
              <p>
                <span className="text-muted-foreground">{t("admin.created")}: </span>
                {new Date(meta.createdAt).toLocaleString()}
              </p>
              <p>
                <span className="text-muted-foreground">{t("admin.updated")}: </span>
                {new Date(meta.updatedAt).toLocaleString()}
              </p>
              {meta.adminEditedAt ? (
                <p>
                  <span className="text-muted-foreground">{t("admin.adminEdited")}: </span>
                  {new Date(meta.adminEditedAt).toLocaleString()}
                </p>
              ) : null}
            </>
          ) : null}
          <p className="text-muted-foreground">{t("admin.metaHint")}</p>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="border-white/15"
            render={<Link href={`/stock/${encodeURIComponent(sym)}`} target="_blank" />}
          >
            {t("admin.viewAsUser")}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
