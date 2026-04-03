"use client";

import { useCallback, useEffect, useState } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const SIDEBAR_COLLAPSED_KEY = "sg-sidebar-collapsed-v1";

type ResponsiveAppShellProps = {
  children: React.ReactNode;
};

export function ResponsiveAppShell({ children }: ResponsiveAppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  return (
    <div className="flex min-h-dvh bg-zinc-950">
      <aside className="hidden shrink-0 lg:flex">
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} />
      </aside>

      {mobileNavOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            aria-label={t("header.closeMenu")}
            onClick={closeMobileNav}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] lg:hidden">
            <Sidebar
              className="w-full max-w-none border-r-0 shadow-2xl"
              collapsed={false}
              onNavigate={closeMobileNav}
            />
          </aside>
        </>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
