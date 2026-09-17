"use client";

import type { ReactNode } from "react";
import { File, FileText, Folder, Image, type LucideIcon } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { previewKind, type PreviewKind } from "@/lib/storage/format";
import type { Entry } from "@/lib/storage/list";

export { CopyButton } from "@/components/auth/common";

const icons: Record<PreviewKind, LucideIcon> = { image: Image, pdf: FileText, text: FileText, other: File };

/** The icon for a folder or an object, by what the preview pane could show of it. */
export function EntryIcon({ entry, size = 14, className = "" }: { entry: Entry; size?: number; className?: string }) {
  if (entry.kind === "folder") return <Folder size={size} strokeWidth={1.75} className={`shrink-0 text-primary ${className}`} aria-label="folder" />;
  const Icon = icons[previewKind(entry.object.content_type, entry.key)];
  return <Icon size={size} strokeWidth={1.75} className={`shrink-0 text-dim ${className}`} aria-hidden="true" />;
}

export function KindBadge({ kind }: { kind: PreviewKind }) {
  return <Badge tone={kind === "image" ? "info" : kind === "pdf" ? "violet" : kind === "text" ? "accent" : "muted"}>{kind === "other" ? "binary" : kind}</Badge>;
}

/** A problem from the app, inline: the code and what it said. */
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

/** A label/value row for the metadata list; values are mono and may wrap. */
export function MetaRow({ label, children, mono = true }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-x-3 gap-y-0.5 py-1.5 text-[12px]">
      <dt className="pt-px text-dim">{label}</dt>
      <dd className={`min-w-0 break-all ${mono ? "font-mono text-[11.5px]" : ""} text-text`}>{children}</dd>
    </div>
  );
}
