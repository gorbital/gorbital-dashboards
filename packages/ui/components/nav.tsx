"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: ReactNode;
  /** hot: red badge; accent: lime badge; live: a pulsing dot instead of the badge, for something running now. */
  tone?: "hot" | "accent" | "live";
};

export type NavSection = { title?: string; items: NavItem[] };

type Props = {
  sections: NavSection[];
  /** "list" is the labelled default; "caps" uses small mono capitals; "rail" is icons only with a tooltip. */
  style?: "list" | "caps" | "rail";
};

export function Nav({ sections, style = "list" }: Props) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  if (style === "rail") {
    return (
      <nav className="flex flex-col items-center gap-1">
        {sections.map((section, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            {i > 0 && <i className="my-2 h-px w-6 bg-hairline" />}
            {section.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className={`group relative grid h-10 w-10 place-items-center rounded-xl transition-colors ${
                    active ? "bg-primary text-bg" : "text-dim hover:bg-elevated hover:text-text"
                  }`}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  {(item.badge !== undefined || item.tone === "live") && (
                    <i className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${item.tone === "hot" ? "bg-danger" : item.tone === "live" ? "bg-ok" : active ? "bg-bg" : "bg-primary"}`} />
                  )}
                  <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[12px] font-medium text-text opacity-0 shadow-xl shadow-black/40 transition-opacity group-hover:opacity-100">
                    {item.label}
                    {item.badge !== undefined && <span className="ml-2 font-mono text-[11px] text-dim">{item.badge}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    );
  }

  const caps = style === "caps";
  return (
    <nav className="flex flex-col gap-0.5">
      {sections.map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.title && (
            <div className={`px-3 pt-4 pb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${caps ? "text-faint" : "text-dim"}`}>{section.title}</div>
          )}
          {section.items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-2.5 rounded-lg px-3 transition-colors ${
                  caps ? "py-[8px] font-mono text-[11px] uppercase tracking-[0.1em]" : "py-[7px] font-medium"
                } ${active ? (caps ? "bg-primary/10 text-primary" : "bg-elevated text-text") : "text-muted hover:bg-elevated/60 hover:text-text"}`}
              >
                {active && !caps && <i className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-primary" />}
                <Icon size={caps ? 14 : 15} strokeWidth={1.75} className={active ? "text-primary" : "text-dim group-hover:text-muted"} />
                <span>{item.label}</span>
                {item.tone === "live" ? (
                  <i className="live-dot ml-auto" aria-label="running" />
                ) : (
                  item.badge !== undefined && (
                    <span className={`ml-auto font-mono text-[11px] tnum normal-case tracking-normal ${item.tone === "hot" ? "text-danger" : item.tone === "accent" ? "text-primary" : "text-dim"}`}>
                      {item.badge}
                    </span>
                  )
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
