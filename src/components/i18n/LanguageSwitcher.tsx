"use client";

import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  function select(next: AppLocale) {
    setLocale(next);
  }

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5"
      role="group"
      aria-label={t("header.language")}
    >
      <Languages className="ml-1.5 size-3.5 text-muted-foreground" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 rounded-md px-2 text-xs",
          locale === "en" && "bg-background text-foreground shadow-sm hover:bg-background",
        )}
        onClick={() => select("en")}
      >
        EN
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 rounded-md px-2 text-xs",
          locale === "bg" && "bg-background text-foreground shadow-sm hover:bg-background",
        )}
        onClick={() => select("bg")}
      >
        BG
      </Button>
    </div>
  );
}
