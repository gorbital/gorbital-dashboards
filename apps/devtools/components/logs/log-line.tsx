"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Copy } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import type { Tone } from "@gorbital/dash/theme";
import type { DevAttr } from "@/lib/api/types";
import { copyText } from "@/lib/copy";
import { clock } from "@/lib/time";

/** What a row needs: the console's `DevLog` and the store's `LogRecord` both fit. */
export type LogLike = {
  id?: number;
  time: string;
  level: string;
  message: string;
  attrs?: DevAttr[];
  /** The line as written when it wasn't a log record (the store only). */
  raw?: string;
  source?: string;
  dropped_attrs?: number;
};

/** Attributes worth a glance in the row; everything else waits for the expansion. */
const keyAttrs = ["method", "path", "route", "status", "duration_ms", "kind", "queue", "key", "error", "panic", "user_id", "request_id"];

export function levelTone(level: string): Tone {
  const l = level.toUpperCase();
  if (l.startsWith("ERROR") || l === "FATAL" || l === "PANIC") return "danger";
  if (l.startsWith("WARN")) return "warn";
  if (l.startsWith("DEBUG") || l === "TRACE") return "muted";
  return "info";
}

const sourceTones: Record<string, Tone> = { http: "accent", auth: "violet", jobs: "info", mail: "ok", storage: "warn", postgres: "info", orb: "muted", app: "muted" };

export function sourceTone(source: string): Tone {
  return sourceTones[source] ?? "muted";
}

type Props = {
  log: LogLike;
  /** Start expanded. */
  open?: boolean;
  /** Show the source badge (the store's records have one; the console's don't). */
  showSource?: boolean;
  /** Buttons for the expanded record: filters, the request, the detail panel. */
  actions?: ReactNode;
  /** Draws the row as the one the detail panel shows. */
  selected?: boolean;
};

/**
 * One log record: time, level, source, message and its key attributes;
 * click to see every attribute (each with a copy button), the raw line
 * and the actions.
 */
export function LogLine({ log, open: initiallyOpen = false, showSource, actions, selected }: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const attrs = log.attrs ?? [];
  const shown = attrs.filter((a) => keyAttrs.includes(a.key)).slice(0, 5);
  const tone = levelTone(log.level);
  const raw = !log.message && log.raw;
  return (
    <li className={`border-b border-hairline last:border-0 ${selected ? "bg-primary/5" : ""}`} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 30px" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2.5 px-4 py-1.5 text-left font-mono text-[11.5px] leading-[1.6] hover:bg-elevated/40" aria-expanded={open}>
        <ChevronRight size={11} className={`mt-1.5 shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="shrink-0 text-faint tnum">{clock(log.time)}</span>
        <Badge tone={tone} className="w-[52px] shrink-0 justify-center">
          {log.level}
        </Badge>
        {showSource && log.source && (
          <Badge tone={sourceTone(log.source)} className="w-[66px] shrink-0 justify-center">
            {log.source}
          </Badge>
        )}
        {raw ? (
          <span className={`min-w-0 flex-1 text-muted ${open ? "whitespace-pre-wrap break-all" : "truncate"}`}>{log.raw}</span>
        ) : (
          <>
            <span className={`min-w-0 shrink-0 ${tone === "danger" ? "text-danger" : "text-text"} ${open ? "whitespace-pre-wrap break-words" : "truncate"}`}>{log.message}</span>
            {!open && (
              <span className="min-w-0 flex-1 truncate text-dim">
                {shown.map((a) => (
                  <span key={a.key} className="mr-3">
                    <span className="text-faint">{a.key}=</span>
                    {a.value.length > 80 ? `${a.value.slice(0, 80)}…` : a.value}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </button>
      {open && (
        <div className="grid gap-2 px-4 pb-2.5 pl-[3.25rem]">
          <dl className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-0.5 font-mono text-[11px]">
            {attrs.length === 0 && !raw && <dd className="col-span-3 text-faint">no attributes</dd>}
            {attrs.map((a, i) => (
              <div key={`${a.key}-${i}`} className="group contents">
                <dt className="text-dim">{a.key}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-all text-muted">{a.value}</dd>
                <dd>
                  <button type="button" aria-label={`Copy ${a.key}`} title={`Copy ${a.key}`} onClick={() => void copyText(a.value, `Copied ${a.key}`)} className="grid h-5 w-5 place-items-center rounded text-faint opacity-0 hover:bg-elevated hover:text-text focus-visible:opacity-100 group-hover:opacity-100">
                    <Copy size={10} />
                  </button>
                </dd>
              </div>
            ))}
            {log.dropped_attrs ? <dd className="col-span-3 text-faint">+{log.dropped_attrs} attributes over the limit</dd> : null}
          </dl>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
    </li>
  );
}
