"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";

type StockAiSectionProps = {
  symbol: string;
};

export function StockAiSection({ symbol }: StockAiSectionProps) {
  const { t, locale } = useI18n();
  const { timeRange, freq, customFromYear, customToYear } = useStockAnalysisPeriod();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMarkdown(null);

    void (async () => {
      try {
        const res = await fetch("/api/ai-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: sym,
            timeRange,
            freq,
            customFromYear,
            customToYear,
            locale,
          }),
        });
        const data = (await res.json()) as { markdown?: string; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? t("ai.error"));
          return;
        }
        setMarkdown(data.markdown ?? "");
      } catch {
        if (!cancelled) setError(t("ai.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, timeRange, freq, customFromYear, customToYear, locale, t]);

  if (loading && !markdown) {
    return (
      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader className="flex flex-row items-center gap-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          <div>
            <CardTitle className="text-base">{t("ai.loading")}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">{t("ai.loadingFiltersHint")}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-amber-500/20 bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-base text-amber-200/90">{t("ai.unavailableTitle")}</CardTitle>
          <CardDescription className="text-muted-foreground">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!markdown?.trim()) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("ai.title")}</h2>
        <Badge variant="secondary" className="gap-1 font-normal">
          <Sparkles className="size-3.5 opacity-80" aria-hidden />
          {t("ai.badge")}
        </Badge>
        {loading ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("ai.refreshing")}
          </span>
        ) : null}
      </div>
      <Card className="border-white/10 bg-zinc-900/40">
        <CardContent className="prose prose-invert prose-sm max-w-none px-5 pb-6 pt-6 prose-p:my-3 prose-p:leading-relaxed prose-ul:my-3 prose-ul:space-y-2 prose-li:my-0.5 prose-headings:text-foreground prose-headings:mt-6 prose-headings:mb-2 prose-headings:scroll-mt-20 prose-strong:text-foreground">
          <AiMarkdown html={simpleMarkdownToHtml(markdown)} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Minimal markdown → HTML for lists and headings from the model (no raw HTML from user). */
function simpleMarkdownToHtml(md: string): string {
  const lines = md.trim().split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h3 class="text-base font-semibold mt-6 mb-3">${escapeHtml(h3[1])}</h3>`);
      continue;
    }
    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) {
      if (!inList) {
        out.push("<ul class='list-disc pl-5 space-y-2 my-3'>");
        inList = true;
      }
      out.push(`<li>${escapeHtml(li[1])}</li>`);
      continue;
    }
    if (line.trim() === "") {
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    out.push(`<p class="my-3 leading-relaxed">${escapeHtml(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function AiMarkdown({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
