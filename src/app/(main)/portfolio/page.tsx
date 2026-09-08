import { Suspense } from "react";

import { PortfolioClient } from "@/components/portfolio/PortfolioClient";

export default function PortfolioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-muted-foreground">
          Loading portfolio…
        </div>
      }
    >
      <PortfolioClient />
    </Suspense>
  );
}
