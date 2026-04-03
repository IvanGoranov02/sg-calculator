"use client";

import {
  Calculator,
  ChevronRight,
  LayoutDashboard,
  LineChart,
  ListPlus,
  PanelLeftClose,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWatchlist } from "@/components/watchlist/WatchlistProvider";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type SidebarProps = {
  className?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Call when a nav link is clicked (e.g. close mobile drawer). */
  onNavigate?: () => void;
};

const nav = [
  { href: "/dashboard", labelKey: "nav.dashboard" as const, icon: LayoutDashboard },
  { href: "/stock/AAPL", labelKey: "nav.stockAnalysis" as const, icon: LineChart },
  { href: "/dcf-calculator", labelKey: "nav.dcfCalculator" as const, icon: Calculator },
  { href: "/watchlist", labelKey: "nav.watchlist" as const, icon: ListPlus },
];

export function Sidebar({ className, collapsed = false, onToggleCollapsed, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { symbols } = useWatchlist();
  const { t } = useI18n();

  return (
    <aside
      className={cn(
        "flex h-full min-w-0 shrink-0 flex-col border-r border-white/10 bg-sidebar transition-[width] duration-200 ease-out",
        collapsed ? "w-[4.25rem]" : "w-64",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-white/10",
          collapsed ? "justify-center px-1" : "justify-between px-3",
        )}
      >
        <Link
          href="/dashboard"
          onClick={() => onNavigate?.()}
          className={cn("flex items-center gap-2 font-semibold tracking-tight", collapsed && "justify-center")}
          title={t("nav.brand")}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            SP
          </span>
          {!collapsed ? <span className="text-sidebar-foreground">{t("nav.brand")}</span> : null}
        </Link>
        {onToggleCollapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-8 shrink-0 text-muted-foreground hover:bg-white/10 hover:text-foreground",
              collapsed && "hidden",
            )}
            aria-label={t("header.sidebarCollapse")}
            title={t("header.sidebarCollapse")}
            onClick={onToggleCollapsed}
          >
            <PanelLeftClose className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {collapsed && onToggleCollapsed ? (
        <div className="flex justify-center border-b border-white/10 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label={t("header.sidebarExpand")}
            title={t("header.sidebarExpand")}
            onClick={onToggleCollapsed}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Main">
        {nav.map(({ href, labelKey, icon: Icon }) => {
          const active =
            href.startsWith("/stock/")
              ? pathname.startsWith("/stock/")
              : pathname === href || pathname.startsWith(`${href}/`);
          const label = t(labelKey);
          const collapsedTitle =
            collapsed && href === "/watchlist" && symbols.length > 0
              ? `${label} (${symbols.length})`
              : collapsed
                ? label
                : undefined;
          return (
            <Link
              key={href}
              href={href}
              title={collapsedTitle}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex min-h-10 items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              {!collapsed ? <span className="flex-1 truncate">{label}</span> : null}
              {!collapsed && href === "/watchlist" && symbols.length > 0 ? (
                <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                  {symbols.length}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {!collapsed ? (
        <div className="border-t border-white/10 p-4 text-xs text-muted-foreground">{t("nav.footer")}</div>
      ) : null}
    </aside>
  );
}
