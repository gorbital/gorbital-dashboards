"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Eye, Layers, Lock, Table2, type LucideIcon } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Checkbox } from "@gorbital/dash/components/input";
import type { Tone } from "@gorbital/dash/theme";
import { ApiError } from "@/lib/api/client";
import type { Column, Ownership, Table, TableKind } from "@/lib/api/db";
import { errorMessage } from "@/lib/api/db";

export const kindIcons: Record<TableKind, LucideIcon> = { table: Table2, partitioned_table: Layers, view: Eye, materialized_view: Eye, foreign_table: Lock };
export const kindLabels: Record<TableKind, string> = { table: "table", partitioned_table: "partitioned table", view: "view", materialized_view: "materialized view", foreign_table: "foreign table" };

export function KindIcon({ kind, size = 13, className = "" }: { kind: TableKind; size?: number; className?: string }) {
  const Icon = kindIcons[kind] ?? Table2;
  return <Icon size={size} strokeWidth={1.75} className={className} aria-label={kindLabels[kind]} />;
}

const ownershipTone: Record<Ownership, Tone | undefined> = { user: undefined, managed: "warn", system: "muted" };

export function OwnershipBadge({ ownership }: { ownership: Ownership }) {
  const tone = ownershipTone[ownership];
  if (!tone) return null;
  return <Badge tone={tone}>{ownership}</Badge>;
}

/** The short type for a column header: `text`, `int8`, `text[]`, `status`. */
export function shortType(c: Pick<Column, "type_name" | "is_array" | "data_type">): string {
  const base = c.is_array && c.type_name.startsWith("_") ? c.type_name.slice(1) : c.type_name;
  const sized = /\((\d+(?:,\s*\d+)?)\)/.exec(c.data_type)?.[1];
  return `${base}${sized ? `(${sized.replace(/\s/g, "")})` : ""}${c.is_array ? "[]" : ""}`;
}

export function TypeBadge({ column }: { column: Column }) {
  return <span className="rounded border border-hairline bg-bg/50 px-1 py-px font-mono text-[10px] normal-case tracking-normal text-dim">{shortType(column)}</span>;
}

/** Why a table's rows can't be edited, or nothing. */
export function readOnlyReason(t: Table | undefined, primaryKey: string[] | undefined): string | undefined {
  if (!t) return undefined;
  if (t.ownership === "system") return `${kindLabels[t.kind]} owned by a tool or an extension: read-only`;
  if (t.kind === "view" || t.kind === "materialized_view") return `a ${kindLabels[t.kind]} has no rows of its own: read-only`;
  if (t.kind === "foreign_table") return "a foreign table: read-only here";
  if (primaryKey && primaryKey.length === 0) return "no primary key, so a row can't be named: read-only";
  return undefined;
}

export function Banner({ tone, icon, children, action }: { tone: "warn" | "muted"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const cls = tone === "warn" ? "border-warn/25 bg-warn/8 text-warn" : "border-border bg-elevated/60 text-muted";
  return (
    <div className={`flex items-center gap-2.5 border-b px-4 py-2 text-[12px] ${cls}`}>
      {icon ?? (tone === "warn" ? <AlertTriangle size={13} /> : <Lock size={13} />)}
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

/** The managed-table warning with its unlock checkbox. */
export function ManagedBanner({ unlocked, onUnlock }: { unlocked: boolean; onUnlock: (v: boolean) => void }) {
  return (
    <Banner
      tone="warn"
      action={
        <label className="flex shrink-0 items-center gap-2 text-[11.5px] text-text">
          <Checkbox checked={unlocked} onCheckedChange={(v) => onUnlock(v === true)} aria-label="Allow edits" />
          allow edits
        </label>
      }
    >
      gorbital&apos;s table: rows are yours, the schema is the framework&apos;s. Edit rows with care; columns and constraints change through the module&apos;s migrations.
    </Banner>
  );
}

/** A problem from the portal, inline: the code and what it said. */
export function ProblemNote({ error, className = "" }: { error: unknown; className?: string }) {
  const code = error instanceof ApiError ? `${error.status} ${error.code}` : undefined;
  return (
    <div className={`rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-[12px] ${className}`}>
      {code && <span className="mr-2 font-mono text-[10.5px] uppercase tracking-wider text-danger">{code}</span>}
      <span className="font-mono text-[11.5px] text-text">{errorMessage(error)}</span>
    </div>
  );
}

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`font-mono text-[10px] uppercase tracking-[0.12em] text-dim ${className}`}>{children}</div>;
}
