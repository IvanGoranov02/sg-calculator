"use client";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPARE_LEAD_GROUPS, categoryLeaderIndex, type CompareGroup } from "@/lib/compareMetrics";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { CompareRow } from "@/lib/yahooCompare";

const GROUP_LABEL: Record<CompareGroup, string> = {
  valuation: "compare.groupValuation",
  profitability: "compare.groupProfit",
  growth: "compare.groupGrowth",
  balance: "compare.groupBalance",
  income: "compare.groupIncome",
  market: "compare.groupMarket",
};

export function CompareLeads({ rows }: { rows: CompareRow[] }) {
  const { t } = useI18n();
  if (rows.length < 2) return null;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("compare.leadsTitle")}</CardTitle>
        <CardDescription>{t("compare.leadsHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {COMPARE_LEAD_GROUPS.map((group) => {
            const idx = categoryLeaderIndex(rows, group);
            const leader = idx >= 0 ? rows[idx] : null;
            return (
              <div
                key={group}
                className="min-w-0 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
              >
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(GROUP_LABEL[group])}
                </p>
                {leader ? (
                  <CompanyIdentity
                    symbol={leader.symbol}
                    name={leader.name}
                    href={`/stock/${encodeURIComponent(leader.symbol)}`}
                    size="sm"
                    primaryLabel="symbol"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("compare.noLead")}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
