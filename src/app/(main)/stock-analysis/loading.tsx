"use client";

import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function StockAnalysisLoading() {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
      <div className="size-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
      <p className="text-sm font-medium">{t("loading.stock")}</p>
    </div>
  );
}
