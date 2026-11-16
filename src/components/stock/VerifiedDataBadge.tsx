"use client";

import { FileCheck2, ShieldCheck } from "lucide-react";

import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type Meta = {
  status: "verified" | "partial" | "failed";
  mode: "store" | "overlay";
  latestQuarter: string | null;
  periods: number;
  verifiedPeriods: number;
};

/** Says where the statements come from and how far they were confirmed (permanent store only). */
export function VerifiedDataBadge({ bundle }: { bundle: StockAnalysisBundle }) {
  const { locale } = useI18n();
  const meta = (bundle as StockAnalysisBundle & { __store?: Meta }).__store;
  if (!meta || meta.periods === 0) return null;
  const bg = locale === "bg";
  const q = meta.latestQuarter
    ? new Date(`${meta.latestQuarter}T00:00:00`).toLocaleDateString(bg ? "bg-BG" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const verified = meta.status === "verified";
  const counts = `${meta.verifiedPeriods}/${meta.periods}`;

  let label: string;
  let title: string;
  if (verified) {
    label = bg ? "Проверени данни" : "Verified data";
    title = bg
      ? "Отчетите са от документите на компанията и са сверени с втори източник. Без данни от AI."
      : "Statements come from the company's filings and were cross-checked against a second source. No AI-generated figures.";
  } else if (meta.mode === "store") {
    label = bg ? `Записани данни · ${counts} периода сверени` : `Stored data · ${counts} periods cross-checked`;
    title = bg
      ? "Отчетите са записани веднъж от документите на компанията и втори източник, без AI. Сверени са периодите, за които двата източника съвпадат."
      : "Statements were stored once from the company's filings and a second source, no AI. Cross-checked means both sources agree on that period.";
  } else {
    label = bg ? `Частично записани · ${counts} периода сверени` : `Partly stored · ${counts} periods cross-checked`;
    title = bg
      ? "Записаната история още е къса. Записаните периоди са от документи и втори източник; по-старите идват по обичайния начин и може да са оценка."
      : "The stored history is still short. Stored periods come from filings and a second source; older ones come from the regular pipeline and may be estimates.";
  }
  const Icon = verified ? ShieldCheck : FileCheck2;
  return (
    <p
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        verified ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border bg-muted/60 text-muted-foreground",
      )}
      title={title}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
      {q ? <span className="font-normal opacity-80">· {bg ? "до" : "through"} {q}</span> : null}
    </p>
  );
}
