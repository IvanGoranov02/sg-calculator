import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { PreferencesProvider } from "@/lib/preferences/PreferencesProvider";
import { THEME_STORAGE_KEY } from "@/lib/preferences/preferences";

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
  description: "Stock analysis, DCF, and watchlist.",
};

const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.classList.toggle("dark",t!=="light")}catch(e){document.documentElement.classList.add("dark")}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <LocaleProvider>
          <PreferencesProvider>
            <AuthSessionProvider>{children}</AuthSessionProvider>
          </PreferencesProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
