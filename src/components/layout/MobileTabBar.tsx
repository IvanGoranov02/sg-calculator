"use client";

import { Briefcase, LayoutDashboard, LineChart, ListPlus, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type Props = { onMore: () => void };

const TABS = [
  { href: "/dashboard", labelKey: "mobileNav.home", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  { href: "/stock/AAPL", labelKey: "mobileNav.stocks", icon: LineChart, match: (p: string) => p.startsWith("/stock") },
  { href: "/portfolio", labelKey: "mobileNav.portfolio", icon: Briefcase, match: (p: string) => p.startsWith("/portfolio") },
  { href: "/watchlist", labelKey: "mobileNav.watchlist", icon: ListPlus, match: (p: string) => p.startsWith("/watchlist") },
] as const;

/** Thumb-reachable primary navigation on phones; "More" opens the full drawer. */
export function MobileTabBar({ onMore }: Props) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-zinc-950/95 pb-[max(0px,env(safe-area-inset-bottom,0px))] backdrop-blur-md lg:hidden"
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ href, labelKey, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors",
                active ? "text-emerald-400" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span className="truncate">{t(labelKey)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <MoreHorizontal className="size-5" aria-hidden />
          <span className="truncate">{t("mobileNav.more")}</span>
        </button>
      </div>
    </nav>
  );
}
