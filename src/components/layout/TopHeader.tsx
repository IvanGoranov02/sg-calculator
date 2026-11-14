"use client";

import { Search, X } from "lucide-react";
import { Suspense, useState } from "react";

import { ProfileSettingsMenu } from "@/components/layout/ProfileSettingsMenu";
import { StockSearchWithRoute } from "@/components/layout/StockSearch";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function SearchFallback() {
  return <div className="h-8 w-full max-w-sm animate-pulse rounded-lg bg-muted/60" />;
}

/**
 * Desktop: search left, profile right. Tablet / landscape phone: one slim row. Portrait phone:
 * search folds into an icon so the header stays a single thin bar. On short screens (landscape
 * phones) the header scrolls away with the page instead of pinning and eating the view.
 */
export function TopHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/90 pt-[max(0px,env(safe-area-inset-top,0px))] backdrop-blur-md [@media(max-height:500px)]:static">
      <div className="hidden px-4 sm:px-6 lg:block">
        <div className="mx-auto flex h-12 w-full max-w-[1800px] items-center gap-3 sm:gap-4">
          <div className="min-w-0 w-full max-w-[min(100%,18rem)] sm:max-w-xs">
            <Suspense fallback={<SearchFallback />}>
              <StockSearchWithRoute compact />
            </Suspense>
          </div>
          <div className="ml-auto shrink-0">
            <ProfileSettingsMenu />
          </div>
        </div>
      </div>

      <div className="px-3 py-1.5 sm:px-6 lg:hidden">
        <div className="flex min-h-9 items-center gap-2">
          {/* sm+: inline search. Phones: icon toggle. */}
          <div className="hidden min-w-0 flex-1 sm:block sm:max-w-md">
            <Suspense fallback={<SearchFallback />}>
              <StockSearchWithRoute compact />
            </Suspense>
          </div>
          <div className="min-w-0 flex-1 sm:hidden">
            {searchOpen ? (
              <Suspense fallback={<SearchFallback />}>
                <StockSearchWithRoute compact />
              </Suspense>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
                aria-label={t("search.placeholder")}
              >
                <Search className="size-4" aria-hidden />
                <span>{t("search.submit")}</span>
              </button>
            )}
          </div>
          {searchOpen ? (
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground sm:hidden"
              aria-label={t("header.closeMenu")}
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
          <div className="ml-auto shrink-0">
            <ProfileSettingsMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
