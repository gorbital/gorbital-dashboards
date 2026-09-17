"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { toast } from "@gorbital/dash/components/toast";
import type { OpsUser } from "@/lib/api/auth";

/** Copies `text` to the clipboard and says so for a moment. */
export function CopyButton({ text, label = "Copy", size = "sm", kind = "ghost" }: { text: string; label?: string; size?: "sm" | "md"; kind?: "ghost" | "secondary" | "primary" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      kind={kind}
      icon={done ? <Check size={11} /> : <Copy size={11} />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Couldn't copy", { description: "Select the text and copy it by hand." });
        }
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

/** The badges that describe an account at a glance: banned (the reason inline, or on hover), unverified, no password. */
export function UserBadges({ user, reason = true }: { user: OpsUser; reason?: boolean }) {
  return (
    <>
      {user.banned_at && (
        <span title={user.banned_reason || undefined} className="inline-flex max-w-[260px]">
          <Badge tone="danger" mono={false} className="truncate">
            banned{reason && user.banned_reason ? ` · ${user.banned_reason}` : ""}
          </Badge>
        </span>
      )}
      {!user.email_verified && <Badge tone="warn">unverified</Badge>}
      {!user.has_password && <Badge tone="muted">no password</Badge>}
    </>
  );
}

/** A role as a chip, optionally with a remove button. */
export function RoleChip({ role, onRemove, removing }: { role: string; onRemove?: () => void; removing?: boolean }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap gap-1 rounded-md border border-primary/25 bg-primary/12 px-1.5 py-0.5 font-mono text-[11px] text-primary">
      {role}
      {onRemove && (
        <button type="button" onClick={onRemove} disabled={removing} className="-mr-0.5 grid h-3.5 w-3.5 place-items-center rounded text-primary/70 hover:bg-primary/20 hover:text-primary disabled:opacity-50" aria-label={`Revoke ${role}`}>
          ×
        </button>
      )}
    </span>
  );
}

/** A short user agent: the browser and platform words, not the whole string. */
export function shortUserAgent(ua: string | undefined): string {
  if (!ua) return "—";
  const browser = /Edg\/|Chrome\/|Firefox\/|Safari\/|curl\/|Go-http-client/.exec(ua)?.[0].replace("/", "") ?? "";
  const platform = /iPhone|iPad|Android|Macintosh|Windows|Linux|CrOS/.exec(ua)?.[0] ?? "";
  const words = [browser === "Edg" ? "Edge" : browser, platform].filter(Boolean);
  return words.length ? words.join(" · ") : ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
}
