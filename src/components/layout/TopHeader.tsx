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
  return <div className="h-10 w-full animate-pulse rounded-xl bg-muted/60" />;
}

export function TopHeader() {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/90 pt-[max(0px,env(safe-area-inset-top,0px))] backdrop-blur-md">
      <div className="hidden h-14 items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:flex">
        <TopHeaderTagline />
        <div className="min-w-0 flex-1 max-w-2xl">
          <Suspense fallback={<SearchFallback />}>
            <StockSearchWithRoute />
          </Suspense>
        </div>
        <div className="ml-auto shrink-0">
          <ProfileSettingsMenu />
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 py-2 sm:px-6 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <TopHeaderTagline />
          <div className="ml-auto shrink-0">
            <ProfileSettingsMenu />
          </div>
        </div>
        <div className="min-w-0">
          <Suspense fallback={<SearchFallback />}>
            <StockSearchWithRoute />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
