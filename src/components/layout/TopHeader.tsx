"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Suspense } from "react";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { StockSearchWithRoute } from "@/components/layout/StockSearch";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";

function TopHeaderTagline() {
  const { t } = useI18n();
  return (
    <p className="hidden min-w-0 flex-1 text-sm text-muted-foreground sm:block">{t("header.tagline")}</p>
  );
}

function HeaderAuth() {
  const { t } = useI18n();
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="h-7 w-18 shrink-0 animate-pulse rounded-lg bg-zinc-800" aria-hidden />;
  }

  if (session?.user) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        {session.user.isAdmin ? (
          <Button
            nativeButton={false}
            variant="ghost"
            size="sm"
            className="hidden text-xs text-amber-400/90 hover:text-amber-300 sm:inline-flex"
            render={<Link href="/admin/cache" />}
          >
            {t("admin.link")}
          </Button>
        ) : null}
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-full ring-1 ring-white/15"
            unoptimized
          />
        ) : null}
        <span className="hidden max-w-[100px] truncate text-xs text-muted-foreground sm:inline">
          {session.user.name ?? session.user.email ?? ""}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/15 bg-zinc-900/60"
          onClick={() => void signOut({ callbackUrl: "/dashboard" })}
        >
          {t("header.signOut")}
        </Button>
      </div>
    );
  }

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
    <header className="sticky top-0 z-10 shrink-0 border-b border-white/10 bg-zinc-950/90 pt-[max(0px,env(safe-area-inset-top,0px))] backdrop-blur-md">
      <div className="flex flex-col gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3 lg:h-14 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:min-w-0 lg:flex-1">
          <TopHeaderTagline />
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:ml-0">
            <LanguageSwitcher />
            <HeaderAuth />
          </div>
        </div>
        <div className="min-w-0 lg:max-w-xl lg:flex-1 lg:justify-self-end">
          <Suspense
            fallback={
              <div className="h-11 w-full max-w-xl animate-pulse rounded-xl bg-zinc-900/60" />
            }
          >
            <StockSearchWithRoute />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
