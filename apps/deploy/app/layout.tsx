import type { Metadata } from "next";
import { Geist_Mono, Manrope, Space_Grotesk } from "next/font/google";
import { Shell } from "@gorbital/dash/components/shell";
import { products } from "@gorbital/dash/lib/products";
import { THEME_INIT_SCRIPT } from "@gorbital/dash/lib/theme-store";
import { SidebarNav } from "@/components/sidebar-nav";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin", "latin-ext"], weight: "variable", variable: "--font-manrope", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin", "latin-ext"], weight: "variable", variable: "--font-geist-mono", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: "700", variable: "--font-grotesk", display: "swap" });

const p = products.deploy;

export const metadata: Metadata = {
  title: `${p.name} · ${p.kind} for gorbital`,
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
    <html lang="en" className={`${manrope.variable} ${geistMono.variable} ${grotesk.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved or system theme before the first paint; dark is the fallback. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <Shell
          product="deploy"
          variant="rail"
          version="v0.1"
          nav={<SidebarNav />}
          app={{ name: "acme-api", env: "production" }}
          user={{ name: "Muhammad Qazi", initials: "MQ" }}
          searchHint="Search release, commit, instance"
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
