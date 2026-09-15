import type { ReactNode } from "react";
import type { Tone } from "../theme";

const tones: Record<Tone, string> = {
  accent: "bg-primary/12 text-primary border-primary/25",
  muted: "bg-elevated text-muted border-border",
  ok: "bg-ok/10 text-ok border-ok/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  info: "bg-info/10 text-info border-info/25",
  violet: "bg-violet/10 text-violet border-violet/25",
};

export function Badge({ tone = "muted", children, mono = true, className = "" }: { tone?: Tone; children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <span className={`inline-flex h-[20px] items-center gap-1 rounded-md border px-1.5 text-[11px] leading-none ${mono ? "font-mono" : "font-medium"} ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

const methodTone: Record<string, Tone> = { GET: "accent", POST: "info", PUT: "warn", PATCH: "warn", DELETE: "danger", HEAD: "muted", OPTIONS: "muted" };

export function Method({ m }: { m: string }) {
  return (
    <Badge tone={methodTone[m] ?? "muted"} className="w-[58px] justify-center font-semibold">
      {m}
    </Badge>
  );
}

export function StatusCode({ code }: { code: number }) {
  const tone: Tone = code >= 500 ? "danger" : code >= 400 ? "warn" : code >= 300 ? "muted" : "ok";
  return <Badge tone={tone}>{code}</Badge>;
}

export function Dot({ tone = "ok", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const bg: Record<Tone, string> = {
    accent: "bg-primary",
    muted: "bg-dim",
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
    violet: "bg-violet",
  };
  return <i className={`inline-block h-2 w-2 shrink-0 rounded-full ${bg[tone]} ${pulse ? "live-dot" : ""}`} />;
}
