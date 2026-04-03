import type { ReactNode } from "react";

import { ResponsiveAppShell } from "@/components/layout/ResponsiveAppShell";

export function AppShell({ children }: { children: ReactNode }) {
  return <ResponsiveAppShell>{children}</ResponsiveAppShell>;
}
