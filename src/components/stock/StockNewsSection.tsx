"use client";

import { Newspaper } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MarketNewsItem } from "@/lib/yahooQuickQuote";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type Props = { symbol: string; name?: string };

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
  const [items, setItems] = useState<MarketNewsItem[] | null>(null);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({ symbol });
    if (name) qs.set("name", name);
    fetch(`/api/stock-news?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: MarketNewsItem[] }) => {
        if (active) setItems(d.items ?? []);
      })
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [symbol, name]);

  // Hide entirely until we know there's something to show.
  if (items != null && items.length === 0) return null;

  return (
    <Card className="border-white/10 bg-zinc-900/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4 text-emerald-400" aria-hidden />
          {t("stockNews.title", { symbol })}
        </CardTitle>
        <CardDescription>{t("stockNews.subtitle")}</CardDescription>
      </CardHeader>
      <div className="grid gap-2 px-6 pb-6 sm:grid-cols-2">
        {items == null
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border border-white/5 bg-zinc-800/40" />
            ))
          : items.map((item) => {
              const ago = timeAgo(item.publishedAt, locale);
              return (
                <a
                  key={`${item.link}-${item.title}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2.5 transition-colors hover:border-emerald-500/30 hover:bg-zinc-900/60"
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
