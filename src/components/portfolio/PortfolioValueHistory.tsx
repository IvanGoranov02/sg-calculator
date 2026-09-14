"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMonthKeyLabel, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { PortfolioValueChartPoint, PortfolioValueMonthSource } from "@/lib/portfolioValueHistory";
import { cn } from "@/lib/utils";

const MANUAL_CURRENCIES = ["EUR", "USD", "GBP"] as const;

export type PortfolioValueHistoryPayload = {
  chartSeries: PortfolioValueChartPoint[];
  baseCurrency: string;
  manualEntries: { month: string; amount: string; currency: string }[];
  computedHint: boolean;
};

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return n.toFixed(0);
  }
}

function sourceLabel(
  source: PortfolioValueMonthSource | null,
  t: (key: string) => string,
): string {
  if (source === "manual") return t("portfolio.valueSourceManual");
  if (source === "t212") return t("portfolio.valueSourceT212");
  if (source === "computed") return t("portfolio.valueSourceComputed");
  return "—";
}

type ChartProps = {
  data: PortfolioValueHistoryPayload | null;
  loading: boolean;
};

export function PortfolioValueChartCard({ data, loading }: ChartProps) {
  const { t, locale } = useI18n();

  const chartData = useMemo(() => {
    if (!data?.chartSeries.length) return [];
    return data.chartSeries.map((p) => ({
      ...p,
      label: formatMonthKeyLabel(p.month, locale),
    }));
  }, [data, locale]);

  if (loading && !data) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("portfolio.valueChartTitle")}</CardTitle>
        </CardHeader>
        <div className="flex items-center gap-2 px-4 pb-6 text-sm text-muted-foreground sm:px-6">
          <Loader2 className="size-4 animate-spin" />
          {t("portfolio.valueChartLoading")}
        </div>
      </Card>
    );
  }

  if (!data || chartData.length === 0) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-base">{t("portfolio.valueChartTitle")}</CardTitle>
        {data.computedHint ? (
          <CardDescription className="text-xs sm:text-sm">{t("portfolio.valueChartHint")}</CardDescription>
        ) : null}
      </CardHeader>
      <div className="h-64 px-2 pb-4 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => fmtMoney(v, data.baseCurrency)}
              width={72}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as PortfolioValueChartPoint & { label: string };
                if (!row) return null;
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                    <p className="font-medium text-popover-foreground">{row.label}</p>
                    <p className="text-emerald-600 dark:text-emerald-400">
                      {t("portfolio.valueChartValue")}: {fmtMoney(row.value ?? 0, data.baseCurrency)}
                    </p>
                    {row.changePct != null ? (
                      <p className="text-muted-foreground">
                        {t("portfolio.valueChartChange")}: {formatPercent(row.changePct)}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">{sourceLabel(row.source, t)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill="#34d399" radius={[4, 4, 0, 0]} barSize={18} />
            <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

type FormProps = {
  data: PortfolioValueHistoryPayload | null;
  saving: boolean;
  onSubmit: (month: string, amount: string, currency: string) => Promise<void>;
  onDelete: (month: string) => Promise<void>;
};

function monthKeyFromParts(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthName(monthIndex: number, locale: string): string {
  return new Date(Date.UTC(2020, monthIndex - 1, 1)).toLocaleString(locale === "bg" ? "bg-BG" : "en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

function yearOptions(entries: { month: string }[]): number[] {
  const now = new Date();
  const years = new Set<number>();
  for (let y = now.getFullYear(); y >= now.getFullYear() - 15; y--) years.add(y);
  for (const e of entries) {
    const y = Number(e.month.slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

export function PortfolioManualMonthlyValueCard({ data, saving, onSubmit, onDelete }: FormProps) {
  const { t, locale } = useI18n();
  const now = new Date();
  const [enabled, setEnabled] = useState(true);
  const [year, setYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const month = monthKeyFromParts(year, monthNum);
    if (!month) return;
    await onSubmit(month, amount, currency);
    setAmount("");
  }

  const entries = data?.manualEntries ?? [];
  const years = yearOptions(entries);
  const selectClass = "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground";

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-1 pb-2 sm:pb-6">
        <CardTitle className="text-base sm:text-lg">{t("portfolio.valueManualTitle")}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">{t("portfolio.valueManualHint")}</CardDescription>
      </CardHeader>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 sm:px-6">
        <Label htmlFor="pv-toggle" className="text-sm font-medium">
          {t("portfolio.valueManualToggle")}
        </Label>
        <button
          type="button"
          id="pv-toggle"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            enabled ? "bg-emerald-500" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
      {enabled ? (
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pv-year">{t("portfolio.valueManualYear")}</Label>
          <select
            id="pv-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={selectClass}
            required
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pv-month">{t("portfolio.valueManualMonth")}</Label>
          <select
            id="pv-month"
            value={monthNum}
            onChange={(e) => setMonthNum(Number(e.target.value))}
            className={selectClass}
            required
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthName(m, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pv-amount">{t("portfolio.valueManualAmount")}</Label>
          <Input
            id="pv-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-border bg-background"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pv-ccy">{t("portfolio.manualCurrency")}</Label>
          <select
            id="pv-ccy"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={selectClass}
          >
            {MANUAL_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="size-4 animate-spin" /> : t("portfolio.valueManualSave")}
          </Button>
        </div>
      </form>
      ) : null}
      {entries.length > 0 ? (
        <ul className="space-y-2 border-t border-border px-4 py-4 sm:px-6">
          {entries.map((e) => (
            <li key={e.month} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground">
                {formatMonthKeyLabel(e.month, locale)} — {e.amount} {e.currency}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 text-red-400 hover:text-red-300"
                aria-label={t("portfolio.valueManualDelete")}
                onClick={() => void onDelete(e.month)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
