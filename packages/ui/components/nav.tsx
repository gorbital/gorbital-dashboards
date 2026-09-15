"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
  tone?: "hot" | "accent";
};

export type NavSection = { title?: string; items: NavItem[] };

export function Nav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {sections.map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.title && (
            <div className="px-3 pt-4 pb-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-dim">{section.title}</div>
          )}
          {section.items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-[7px] font-medium transition-colors ${
                  active ? "bg-elevated text-text" : "text-muted hover:text-text hover:bg-elevated/60"
                }`}
              >
                {active && <i className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r bg-primary" />}
                <Icon size={15} strokeWidth={1.75} className={active ? "text-primary" : "text-dim group-hover:text-muted"} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className={`ml-auto font-mono text-[11px] tnum ${item.tone === "hot" ? "text-danger" : item.tone === "accent" ? "text-primary" : "text-dim"}`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
