import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in · Stelian Petrov",
  description: "Account sign-in — database and Google OAuth will be connected next.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      <LoginForm />
    </div>
  );
}
