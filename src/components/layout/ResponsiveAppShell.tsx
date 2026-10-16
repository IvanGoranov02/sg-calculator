"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const SIDEBAR_COLLAPSED_KEY = "sg-sidebar-collapsed-v2";
const SIDEBAR_CHANGED_EVENT = "sg-sidebar-changed";
let sidebarCollapsedFallback = true;
let sidebarPersistenceFailed = false;

function readSidebarCollapsed(): boolean {
  if (sidebarPersistenceFailed) return sidebarCollapsedFallback;
  try {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored == null ? sidebarCollapsedFallback : stored !== "0";
  } catch {
    return sidebarCollapsedFallback;
  }
}

function subscribeSidebar(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_COLLAPSED_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SIDEBAR_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SIDEBAR_CHANGED_EVENT, onChange);
  };
}

type ResponsiveAppShellProps = {
  children: React.ReactNode;
};

export function ResponsiveAppShell({ children }: ResponsiveAppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => true);
  const moreButton = useRef<HTMLButtonElement | null>(null);
  const mobileMenuId = useId();
  const { t } = useI18n();
  const pathname = usePathname();

  useEffect(() => {
    if (!mobileNavOpen) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileNavOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [mobileNavOpen]);

  const toggleSidebarCollapsed = useCallback(() => {
    const next = !readSidebarCollapsed();
    sidebarCollapsedFallback = next;
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      sidebarPersistenceFailed = false;
    } catch {
      // Keep the in-memory preference even if persistence is blocked.
      sidebarPersistenceFailed = true;
    }
    window.dispatchEvent(new Event(SIDEBAR_CHANGED_EVENT));
  }, []);

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden shrink-0 lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-dvh lg:max-h-dvh lg:self-start">
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} />
      </aside>

      <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/70 lg:hidden" />
          <Dialog.Popup
            id={mobileMenuId}
            finalFocus={moreButton}
            className="fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(18rem,88vw)] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] outline-none lg:hidden"
          >
            <Dialog.Title className="sr-only">{t("mobileNav.more")}</Dialog.Title>
            <Sidebar
              className="w-full max-w-none border-r-0 shadow-2xl"
              collapsed={false}
              onNavigate={closeMobileNav}
            />
            <Dialog.Close
              aria-label={t("header.closeMenu")}
              className="absolute right-2 top-[calc(0.5rem+env(safe-area-inset-top,0px))] flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-clip px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:py-6 lg:pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          {/* Keyed by route so content gently animates in on each navigation. */}
          <div key={pathname} className="animate-page-in">
            {children}
          </div>
        </main>
      </div>

      <MobileTabBar onMore={() => setMobileNavOpen(true)} moreButtonRef={moreButton} moreExpanded={mobileNavOpen} moreControls={mobileMenuId} />
    </div>
  );
}
