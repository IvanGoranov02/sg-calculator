"use client";

import { Suspense } from "react";

import { ProfileSettingsMenu } from "@/components/layout/ProfileSettingsMenu";
import { StockSearchWithRoute } from "@/components/layout/StockSearch";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function TopHeaderTagline() {
  const { t } = useI18n();
  return (
    <p className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block lg:max-w-xs" title={t("header.tagline")}>
      {t("header.tagline")}
    </p>
  );
}

function SearchFallback() {
  return <div className="h-9 w-full animate-pulse rounded-lg bg-muted/60 lg:h-10 lg:rounded-xl" />;
}

export function TopHeader() {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/90 pt-[max(0px,env(safe-area-inset-top,0px))] backdrop-blur-md">
      <div className="hidden px-4 sm:px-6 lg:block">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 sm:gap-4">
          <TopHeaderTagline />
          <div className="min-w-0 flex-1">
            <Suspense fallback={<SearchFallback />}>
              <StockSearchWithRoute />
            </Suspense>
          </div>
          <div className="shrink-0">
            <ProfileSettingsMenu />
          </div>
        </div>
      </div>

      <div className="px-4 py-2 sm:px-6 lg:hidden">
        <div className="hidden items-center justify-between gap-2 sm:flex">
          <TopHeaderTagline />
          <ProfileSettingsMenu />
        </div>
        <div className="flex items-center gap-2 sm:mt-2">
          <div className="min-w-0 flex-1">
            <Suspense fallback={<SearchFallback />}>
              <StockSearchWithRoute />
            </Suspense>
          </div>
          <div className="shrink-0 sm:hidden">
            <ProfileSettingsMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
