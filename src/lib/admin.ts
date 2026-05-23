import { auth } from "@/auth";

export function parseAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = parseAdminEmails();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

export type AdminSessionResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; status: 401 | 403 };

export async function requireAdminSession(): Promise<AdminSessionResult> {
  const session = await auth();
  const email = session?.user?.email;
  const userId = session?.user?.id;
  if (!userId || !email) {
    return { ok: false, status: 401 };
  }
  if (!isAdminEmail(email)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, userId, email };
}
