"use client";

import { AlertTriangle, Compass } from "lucide-react";
import Link from "next/link";

import { useI18n } from "@/lib/i18n/LocaleProvider";

const TEXT = {
  en: {
    notFoundTitle: "This page doesn't exist",
    notFoundBody: "The link may be old or mistyped. Head back to the dashboard and carry on from there.",
    errorTitle: "Something went wrong",
    errorBody: "This page hit an unexpected error. Trying again usually fixes it; if not, go back to the dashboard.",
    retry: "Try again",
    home: "Back to dashboard",
  },
  bg: {
    notFoundTitle: "Тази страница не съществува",
    notFoundBody: "Връзката може да е стара или грешно написана. Върни се към таблото и продължи оттам.",
    errorTitle: "Нещо се обърка",
    errorBody: "Страницата получи неочаквана грешка. Обикновено помага да опиташ пак; ако не, върни се към таблото.",
    retry: "Опитай пак",
    home: "Обратно към таблото",
  },
} as const;

export function StatusScreen({ kind, onRetry }: { kind: "notFound" | "error"; onRetry?: () => void }) {
  const { locale } = useI18n();
  const c = TEXT[locale === "bg" ? "bg" : "en"];
  const Icon = kind === "notFound" ? Compass : AlertTriangle;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Icon className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {kind === "notFound" ? c.notFoundTitle : c.errorTitle}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{kind === "notFound" ? c.notFoundBody : c.errorBody}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {kind === "error" && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-card hover:bg-primary/90"
          >
            {c.retry}
          </button>
        ) : null}
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
        >
          {c.home}
        </Link>
      </div>
    </div>
  );
}
