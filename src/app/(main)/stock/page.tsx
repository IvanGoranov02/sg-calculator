import type { Metadata } from "next";
import { StockAnalysisLanding } from "@/components/stock/StockAnalysisLanding";

export const metadata: Metadata = { title: "Stock Analysis" };

export const dynamic = "force-dynamic";

export default function StockLandingPage() {
  return <StockAnalysisLanding />;
}
