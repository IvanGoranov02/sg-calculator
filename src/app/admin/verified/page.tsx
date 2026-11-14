import type { Metadata } from "next";

import { VerifiedListClient } from "@/components/admin/VerifiedListClient";

export const metadata: Metadata = { title: "Admin · Verified data" };

export default function AdminVerifiedPage() {
  return <VerifiedListClient />;
}
