"use client";

import { Suspense } from "react";

import { ProfileSettingsMenu } from "@/components/layout/ProfileSettingsMenu";
import { StockSearchWithRoute } from "@/components/layout/StockSearch";

function SearchFallback() {
  return <div className="h-8 w-full max-w-sm animate-pulse rounded-lg bg-muted/60" />;
}

export function TopHeader() {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/90 pt-[max(0px,env(safe-area-inset-top,0px))] backdrop-blur-md">
      <div className="hidden px-4 sm:px-6 lg:block">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 sm:gap-4">
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

      <div className="px-4 py-2 sm:px-6 lg:hidden">
        <div className="hidden items-center justify-end gap-2 sm:flex">
          <ProfileSettingsMenu />
        </div>
        <div className="flex items-center gap-2 sm:mt-2">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <Suspense fallback={<SearchFallback />}>
              <StockSearchWithRoute compact />
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
