"use client";

import {
  Briefcase,
  CalendarClock,
  Calculator,
  ChevronRight,
  Coins,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  ListPlus,
  PanelLeftClose,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

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
  { href: "/compare", labelKey: "nav.compare" as const, icon: GitCompareArrows },
  { href: "/dcf-calculator", labelKey: "nav.dcfCalculator" as const, icon: Calculator },
  { href: "/dividend-calculator", labelKey: "nav.dividendCalculator" as const, icon: Coins },
  { href: "/watchlist", labelKey: "nav.watchlist" as const, icon: ListPlus },
  { href: "/portfolio", labelKey: "nav.portfolio" as const, icon: Briefcase },
  { href: "/calendar", labelKey: "nav.calendar" as const, icon: CalendarClock },
];

export function Sidebar({ className, collapsed = false, onToggleCollapsed, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { symbols } = useWatchlist();
  const { t } = useI18n();
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.isAdmin;

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 min-w-0 shrink-0 flex-col border-r border-white/10 bg-sidebar transition-[width] duration-200 ease-out lg:h-dvh lg:max-h-dvh",
        collapsed ? "w-[4.25rem]" : "w-[10rem]",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-white/10",
          collapsed ? "justify-center px-1" : "justify-between gap-1 px-2",
        )}
      >
        <Link
          href="/dashboard"
          onClick={() => onNavigate?.()}
          className={cn("flex min-w-0 items-center gap-1.5 font-semibold tracking-tight", collapsed && "justify-center")}
          title={t("nav.brand")}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            SP
          </span>
          {!collapsed ? <span className="truncate text-sm text-sidebar-foreground">{t("nav.brand")}</span> : null}
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
      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain bg-sidebar p-1.5"
        aria-label="Main"
      >
        {nav.map(({ href, labelKey, icon: Icon }) => {
          const active =
            href.startsWith("/stock/")
              ? pathname.startsWith("/stock/")
              : pathname === href || pathname.startsWith(`${href}/`);
          const label = t(labelKey);
          const linkTitle =
            href === "/watchlist" && symbols.length > 0 ? `${label} (${symbols.length})` : label;
          return (
            <Link
              key={href}
              href={href}
              title={linkTitle}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex min-h-9 items-center rounded-lg py-2 text-xs font-medium transition-colors",
                collapsed ? "justify-center px-0" : "gap-2 px-2",
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
        {isAdmin ? (
          <Link
            href="/admin/cache"
            title={collapsed ? t("admin.link") : undefined}
            onClick={() => onNavigate?.()}
            className={cn(
              "mt-1 flex min-h-9 items-center rounded-lg py-2 text-xs font-medium text-amber-400/90 transition-colors hover:bg-amber-500/10 hover:text-amber-300",
              collapsed ? "justify-center px-0" : "gap-2 px-2",
              pathname.startsWith("/admin") && "bg-amber-500/10 text-amber-300",
            )}
          >
            <ShieldCheck className="size-4 shrink-0 opacity-90" aria-hidden />
            {!collapsed ? <span className="flex-1 truncate">{t("admin.link")}</span> : null}
          </Link>
        ) : null}
      </nav>
      {!collapsed ? (
        <div className="border-t border-white/10 p-2 text-[10px] leading-snug text-muted-foreground">{t("nav.footer")}</div>
      ) : null}
    </aside>
  );
}
