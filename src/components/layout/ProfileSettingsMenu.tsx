"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import type { AppTheme, DateFormat, DisplayCurrency } from "@/lib/preferences/preferences";
import { cn } from "@/lib/utils";

function SettingsToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div
        className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5"
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 flex-1 rounded-md px-2 text-xs",
              value === option.value && "bg-background text-foreground shadow-sm hover:bg-background",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ProfileSettingsPanel() {
  const { t } = useI18n();
  const { theme, setTheme, displayCurrency, setDisplayCurrency, dateFormat, setDateFormat } =
    usePreferences();
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="flex flex-col">
      <div className="space-y-3 px-4 py-4">
        {user ? (
          <div className="flex items-center gap-3">
            <Avatar
              src={user.image}
              alt={user.name ?? user.email ?? t("settings.account")}
              fallback={user.name ?? user.email ?? undefined}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <PopoverTitle className="truncate">{user.name ?? user.email ?? t("settings.account")}</PopoverTitle>
              {user.email ? (
                <PopoverDescription className="truncate">{user.email}</PopoverDescription>
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <PopoverTitle>{t("settings.title")}</PopoverTitle>
            <PopoverDescription>{t("settings.guestHint")}</PopoverDescription>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-4 px-4 py-4">
        <SettingsToggleGroup<AppTheme>
          label={t("settings.theme")}
          value={theme}
          options={[
            { value: "light", label: t("settings.themeLight") },
            { value: "dark", label: t("settings.themeDark") },
          ]}
          onChange={setTheme}
        />

        <SettingsToggleGroup<DisplayCurrency>
          label={t("settings.currency")}
          value={displayCurrency}
          options={[
            { value: "usd", label: "USD" },
            { value: "eur", label: "EUR" },
          ]}
          onChange={setDisplayCurrency}
        />

        <SettingsToggleGroup<DateFormat>
          label={t("settings.dateFormat")}
          value={dateFormat}
          options={[
            { value: "dmy", label: t("settings.dateFormatDmy") },
            { value: "mdy", label: t("settings.dateFormatMdy") },
          ]}
          onChange={setDateFormat}
        />

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{t("header.language")}</Label>
          <LanguageSwitcher />
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2 px-4 py-3">
        {user ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => void signOut({ callbackUrl: "/dashboard" })}
          >
            {t("header.signOut")}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="w-full justify-start"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            {t("header.signIn")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProfileSettingsMenu() {
  const { t } = useI18n();
  const { data: session, status } = useSession();
  const user = session?.user;

  if (status === "loading") {
    return <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" aria-hidden />;
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("settings.openMenu")}
        className="inline-flex shrink-0 rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {user ? (
          <Avatar
            src={user.image}
            alt={user.name ?? user.email ?? t("settings.account")}
            fallback={user.name ?? user.email ?? undefined}
            size="md"
          />
        ) : (
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
            <UserRound className="size-4" aria-hidden />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10}>
        <ProfileSettingsPanel />
      </PopoverContent>
    </Popover>
  );
}
