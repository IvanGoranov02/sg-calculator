import { AppShell } from "@/components/layout/AppShell";
import { WatchlistProvider } from "@/components/watchlist/WatchlistProvider";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <WatchlistProvider>
      <AppShell>{children}</AppShell>
    </WatchlistProvider>
  );
}
