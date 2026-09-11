"use client";

import { Suspense } from "react";

import { ProfileSettingsMenu } from "@/components/layout/ProfileSettingsMenu";
import { StockSearchWithRoute } from "@/components/layout/StockSearch";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function TopHeaderTagline() {
  const { t } = useI18n();
  return (
    <p className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block lg:max-w-xs">
      {t("header.tagline")}
    </p>
  );
}

function SearchFallback() {
  return <div className="h-11 w-full animate-pulse rounded-xl bg-muted/60" />;
}

export function TopHeader() {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/90 pt-[max(0px,env(safe-area-inset-top,0px))] backdrop-blur-md">
      <div className="hidden h-14 items-center gap-4 px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,42rem)_auto]">
        <TopHeaderTagline />
        <div className="min-w-0 justify-self-center">
          <Suspense fallback={<SearchFallback />}>
            <StockSearchWithRoute />
          </Suspense>
        </div>
        <div className="justify-self-end">
          <ProfileSettingsMenu />
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3 lg:hidden">
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
