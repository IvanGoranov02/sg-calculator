"use client";

import { useEffect, useState } from "react";

import { freshnessLabel } from "@/lib/freshnessLabel";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type Props = {
  /** When the data on screen was fetched (ms since epoch); nothing is shown while unknown. */
  at: number | null;
  /** A newer copy is being fetched right now. */
  refreshing?: boolean;
  className?: string;
};

/** Small line telling how old the prices on screen are; turns amber once they are over 15 minutes old. */
export function DataFreshness({ at, refreshing = false, className }: Props) {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (at == null) return null;
  const lang = locale === "bg" ? "bg" : "en";
  const current = Math.max(now, at);
  const stale = current - at > 15 * 60_000;
  return (
    <p className={cn("text-xs tabular-nums", stale ? "text-amber-400" : "text-muted-foreground", className)} aria-live="polite">
      {freshnessLabel(at, current, lang)}
      {refreshing ? (lang === "bg" ? " · обновява се…" : " · refreshing…") : ""}
    </p>
  );
}
