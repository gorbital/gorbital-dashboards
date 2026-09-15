import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { Shell } from "@apistock/dash/components/shell";
import { products } from "@apistock/dash/lib/products";
import { SidebarNav } from "@/components/sidebar-nav";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin", "latin-ext"], weight: "variable", variable: "--font-manrope", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin", "latin-ext"], weight: "variable", variable: "--font-geist-mono", display: "swap" });

const p = products.observe;

export const metadata: Metadata = {
  title: `${p.name} · ${p.kind} for apistock`,
  description: p.tagline,
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${geistMono.variable}`}>
      <body suppressHydrationWarning>
        <Shell
          product="observe"
          variant="docked"
          version="v0.1"
          nav={<SidebarNav />}
          app={{ name: "acme-api", env: "production" }}
          user={{ name: "Muhammad Qazi", initials: "MQ" }}
          searchHint="Search path, request ID, org"
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
