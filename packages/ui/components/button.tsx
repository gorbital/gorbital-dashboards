import type { ReactNode } from "react";

type Props = { children: ReactNode; kind?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; className?: string; icon?: ReactNode };

export function Button({ children, kind = "secondary", size = "md", className = "", icon }: Props) {
  const base = "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors whitespace-nowrap";
  const sz = size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-[12px]";
  const k = {
    primary: "bg-primary text-bg hover:bg-primary-soft",
    secondary: "border border-border bg-elevated text-text hover:border-border-2",
    ghost: "text-muted hover:bg-elevated hover:text-text",
    danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15",
  }[kind];
  return (
    <button className={`${base} ${sz} ${k} ${className}`}>
      {icon}
      {children}
    </button>
  );
}
