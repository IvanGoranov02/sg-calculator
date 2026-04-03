"use client";

import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { WATCHLIST_MAX } from "@/lib/watchlistStorage";
import { cn } from "@/lib/utils";

import { useWatchlist } from "./WatchlistProvider";

type WatchlistToggleProps = {
  symbol: string;
};

export function WatchlistToggle({ symbol }: WatchlistToggleProps) {
  const { t } = useI18n();
  const { has, toggle, symbols } = useWatchlist();
  const saved = has(symbol);
  const full = !saved && symbols.length >= WATCHLIST_MAX;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 gap-2 border-white/15"
      disabled={full}
      title={full ? t("watchlist.fullTitle", { max: WATCHLIST_MAX }) : undefined}
      onClick={() => toggle(symbol)}
    >
      <Bookmark className={cn("size-4", saved && "fill-amber-400 text-amber-400")} aria-hidden />
      {saved ? t("watchlist.saved") : t("watchlist.toggle")}
    </Button>
  );
}
