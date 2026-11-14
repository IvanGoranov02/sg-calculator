"use client";

import { ShieldCheck } from "lucide-react";

import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

type Meta = { verifiedAt: string | null; latestQuarter: string | null };

/** Shown only when the statements come from the verified store (SEC filings, cross-checked). */
export function VerifiedDataBadge({ bundle }: { bundle: StockAnalysisBundle }) {
  const { locale } = useI18n();
  const meta = (bundle as StockAnalysisBundle & { __verified?: Meta }).__verified;
  if (!meta) return null;
  const bg = locale === "bg";
  const q = meta.latestQuarter
    ? new Date(`${meta.latestQuarter}T00:00:00`).toLocaleDateString(bg ? "bg-BG" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  return (
    <p
      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400"
      title={
        bg
          ? "Отчетите са от документите на компанията в SEC и са сверени с втори източник. Без данни от AI."
          : "Statements come from the company's SEC filings and were cross-checked against a second source. No AI-generated figures."
      }
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      {bg ? "Проверени данни от SEC" : "Verified SEC data"}
      {q ? <span className="font-normal text-emerald-400/80">· {bg ? "до" : "through"} {q}</span> : null}
    </p>
  );
}
