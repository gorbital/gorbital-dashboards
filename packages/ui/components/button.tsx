import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./spinner";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ReactNode;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
};

export function Button({ children, kind = "secondary", size = "md", className = "", icon, loading, disabled, type = "button", ...rest }: Props) {
  const base = "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50";
  const sz = size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-[12px]";
  const k = {
    primary: "bg-primary text-bg hover:bg-primary-soft",
    secondary: "border border-border bg-elevated text-text hover:border-border-2",
    ghost: "text-muted hover:bg-elevated hover:text-text",
    danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15",
  }[kind];
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={`${base} ${sz} ${k} ${className}`} {...rest}>
      {loading ? <Spinner size={size === "sm" ? 11 : 12} /> : icon}
      {children}
    </button>
  );
}
