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

export function PortfolioManualMonthlyValueCard({ data, saving, onSubmit, onDelete }: FormProps) {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState(currentMonthInputValue);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit(month, amount, currency);
    setAmount("");
  }

  const entries = data?.manualEntries ?? [];

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-1 pb-2 sm:pb-6">
        <CardTitle className="text-base sm:text-lg">{t("portfolio.valueManualTitle")}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">{t("portfolio.valueManualHint")}</CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pv-month">{t("portfolio.valueManualMonth")}</Label>
          <Input
            id="pv-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border-border bg-background"
            required
          />
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
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
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

function currentMonthInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
