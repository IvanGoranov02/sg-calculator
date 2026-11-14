"use client";

import { StatusScreen } from "@/components/layout/StatusScreen";

export default function MainError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <StatusScreen kind="error" onRetry={reset} />;
}
