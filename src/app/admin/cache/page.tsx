import type { Metadata } from "next";
import { CacheListClient } from "@/components/admin/CacheListClient";

export const metadata: Metadata = { title: "Admin · Cache" };

export default function AdminCacheListPage() {
  return <CacheListClient />;
}
