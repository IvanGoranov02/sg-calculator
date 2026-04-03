"use client";

import {
  Calculator,
  LayoutDashboard,
  LineChart,
  ListPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWatchlist } from "@/components/watchlist/WatchlistProvider";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type SidebarProps = {
  className?: string;
  /** Call when a nav link is clicked (e.g. close mobile drawer). */
  onNavigate?: () => void;
};

const nav = [
  { href: "/dashboard", labelKey: "nav.dashboard" as const, icon: LayoutDashboard },
  { href: "/stock-analysis", labelKey: "nav.stockAnalysis" as const, icon: LineChart },
  { href: "/dcf-calculator", labelKey: "nav.dcfCalculator" as const, icon: Calculator },
  { href: "/watchlist", labelKey: "nav.watchlist" as const, icon: ListPlus },
];

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { symbols } = useWatchlist();
  const { t } = useI18n();

  return (
    <aside
      className={cn(
        "flex h-full w-64 min-w-0 shrink-0 flex-col border-r border-white/10 bg-sidebar",
        className,
      )}
    >
      <div className="flex h-14 items-center border-b border-white/10 px-5">
        <Link
          href="/dashboard"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            SG
          </span>
          <span className="text-sidebar-foreground">{t("nav.brand")}</span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Main">
        {nav.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              <span className="flex-1">{t(labelKey)}</span>
              {href === "/watchlist" && symbols.length > 0 ? (
                <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                  {symbols.length}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4 text-xs text-muted-foreground">{t("nav.footer")}</div>
    </aside>
  );
}
