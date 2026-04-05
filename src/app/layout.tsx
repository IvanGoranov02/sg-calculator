import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stelian Petrov · Stock analysis",
  description: "Stock analysis, DCF, and watchlist — Yahoo Finance data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-950">
        <LocaleProvider>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
