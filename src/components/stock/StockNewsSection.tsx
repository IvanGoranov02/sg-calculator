"use client";

import { Newspaper } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MarketNewsItem } from "@/lib/yahooQuickQuote";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { fetchWithTimeout } from "@/lib/asyncTimeout";

type Props = { symbol: string; name?: string };
const fetchNews = fetchWithTimeout(25_000);

function timeAgo(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((Date.now() - t) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale === "bg" ? "bg" : "en", { numeric: "auto" });
  if (mins < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

export function StockNewsSection({ symbol, name }: Props) {
  const { t, locale } = useI18n();
  const [result, setResult] = useState<{ key: string; items: MarketNewsItem[]; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([symbol, name ?? "", retry]);
  const items = result?.key === requestKey ? result.items : null;
  const failed = result?.key === requestKey && result.failed;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const qs = new URLSearchParams({ symbol });
    if (name) qs.set("name", name);
    queueMicrotask(() => {
      if (!active) return;
      void fetchNews(`/api/stock-news?${qs.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Could not load news");
        return r.json();
      })
      .then((d: { items?: MarketNewsItem[] }) => {
        if (!Array.isArray(d.items)) throw new Error("Invalid news response");
        if (active) setResult({ key: requestKey, items: d.items, failed: false });
      })
      .catch(() => {
        if (active) setResult({ key: requestKey, items: [], failed: true });
      });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [symbol, name, retry, requestKey]);

  // Hide entirely until we know there's something to show.
  if (!failed && items != null && items.length === 0) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4 text-emerald-400" aria-hidden />
          {t("stockNews.title", { symbol })}
        </CardTitle>
        <CardDescription>{t("stockNews.subtitle")}</CardDescription>
      </CardHeader>
      {failed ? (
        <div className="flex items-center gap-3 px-6 pb-6">
          <p role="alert" className="text-sm text-muted-foreground">{t("stockNews.error")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>{t("stock.tryAgain")}</Button>
        </div>
      ) : null}
      <div className="grid gap-2 px-6 pb-6 sm:grid-cols-2">
        {items == null
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border border-border/60 bg-muted" />
            ))
          : items.map((item) => {
              const ago = timeAgo(item.publishedAt, locale);
              return (
                <a
                  key={`${item.link}-${item.title}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-lg border border-border bg-muted/50 px-3 py-2.5 transition-colors hover:border-emerald-500/30 hover:bg-card"
                  title={item.title}
                >
                  <p className="line-clamp-2 text-sm text-foreground/90 group-hover:text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.publisher ?? "—"}
                    {ago ? ` · ${ago}` : ""}
                  </p>
                </a>
              );
            })}
      </div>
    </Card>
  );
}
