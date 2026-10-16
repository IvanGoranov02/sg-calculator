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
      <div className="px-4 py-2 sm:px-6 lg:py-0">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 lg:h-12 lg:gap-3">
          <div className="min-w-0 flex-1 sm:max-w-md lg:max-w-xs">
            <Suspense fallback={<SearchFallback />}>
              <StockSearchWithRoute compact />
            </Suspense>
          </div>
          <div className="ml-auto shrink-0">
            <ProfileSettingsMenu />
          </div>
        </div>
      </div>

    </header>
  );
}
