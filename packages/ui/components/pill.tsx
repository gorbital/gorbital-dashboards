import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = { children: ReactNode; dot?: "ok" | "warn" | "danger" | "accent"; active?: boolean; caret?: boolean; className?: string };

const dots = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", accent: "bg-primary" };

/** A rounded filter chip used in page headers and toolbars. */
export function Pill({ children, dot, active, caret = true, className = "" }: Props) {
  return (
    <button
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors ${
        active ? "border-primary/40 bg-primary/10 text-text" : "border-border bg-surface text-muted hover:border-border-2 hover:text-text"
      } ${className}`}
    >
      {dot && <i className={`h-1.5 w-1.5 rounded-full ${dots[dot]}`} />}
      {children}
      {caret && <ChevronDown size={12} className="text-dim" />}
    </button>
  );
}

export function Segmented<T extends string>({ options, value }: { options: { value: T; label: string }[]; value: T }) {
  return (
    <div className="inline-flex h-8 items-center rounded-lg border border-border bg-surface p-[3px] text-[12px]">
      {options.map((o) => (
        <button
          key={o.value}
          className={`h-full rounded-[6px] px-2.5 font-medium transition-colors ${o.value === value ? "bg-elevated text-text" : "text-dim hover:text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
