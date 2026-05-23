import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
