import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { SiteContentRuntime } from "@/components/editor/SiteContentRuntime";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { PreferencesProvider } from "@/lib/preferences/PreferencesProvider";
import { THEME_STORAGE_KEY } from "@/lib/preferences/preferences";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Stelian Petrov · Stock analysis", template: "%s · Stelian Petrov" },
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
      className={`dark ${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <LocaleProvider>
          <PreferencesProvider>
            <AuthSessionProvider>
              {children}
              <SiteContentRuntime />
            </AuthSessionProvider>
          </PreferencesProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
