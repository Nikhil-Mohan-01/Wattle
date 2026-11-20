import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Wattle — daily games for Waterloo students",
  description:
    "A new daily game every weekday, with a campus-wide leaderboard for Waterloo students.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              <span className="text-gold-deep">W</span>attle
            </Link>
            <Link href="/play" className="text-sm text-muted hover:text-foreground">
              Play
            </Link>
            <Link href="/leaderboard" className="text-sm text-muted hover:text-foreground">
              Leaderboard
            </Link>
            <div className="ml-auto">
              <Suspense fallback={<div className="h-8 w-16" />}>
                <AccountMenu />
              </Suspense>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-line py-4 text-center text-xs text-muted">
          Wattle is a student project and is not affiliated with the University of Waterloo. ·{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </footer>
      </body>
    </html>
  );
}
