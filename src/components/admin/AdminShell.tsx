"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin/cache" className="font-semibold tracking-tight text-foreground">
              {t("admin.title")}
            </Link>
            <span className="hidden text-xs text-muted-foreground sm:inline">·</span>
            <Link
              href="/dashboard"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              {t("admin.backToApp")}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
