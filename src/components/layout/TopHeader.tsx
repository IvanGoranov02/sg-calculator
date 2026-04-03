"use client";

import Link from "next/link";
import { Suspense } from "react";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { StockSearchWithRoute } from "@/components/layout/StockSearch";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function TopHeaderTagline() {
  const { t } = useI18n();
  return (
    <p className="hidden text-sm text-muted-foreground sm:block">{t("header.tagline")}</p>
  );
}

function HeaderSignIn() {
  const { t } = useI18n();
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      className="shrink-0 border-white/15 bg-zinc-900/60"
      render={<Link href="/login" />}
    >
      {t("header.signIn")}
    </Button>
  );
}

export function TopHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-zinc-950/90 px-6 backdrop-blur-md">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TopHeaderTagline />
        <LanguageSwitcher />
        <HeaderSignIn />
      </div>
      <div className="flex min-w-0 flex-1 justify-end">
        <Suspense
          fallback={
            <div className="h-10 w-full max-w-xl animate-pulse rounded-xl bg-zinc-900/60" />
          }
        >
          <StockSearchWithRoute />
        </Suspense>
      </div>
    </header>
  );
}
