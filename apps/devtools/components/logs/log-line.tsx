"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import type { Tone } from "@gorbital/dash/theme";
import type { DevLog } from "@/lib/api/types";
import { clock } from "@/lib/time";

/** Attributes worth a glance in the row; everything else waits for the expansion. */
const keyAttrs = ["route", "method", "status", "duration_ms", "kind", "queue", "key", "error", "panic", "request_id"];

export function levelTone(level: string): Tone {
  const l = level.toUpperCase();
  if (l.startsWith("ERROR")) return "danger";
  if (l.startsWith("WARN")) return "warn";
  if (l.startsWith("DEBUG")) return "muted";
  return "info";
}

/** One log record: time, level, message and its key attributes; click to see every attribute. */
export function LogLine({ log, open: initiallyOpen = false }: { log: DevLog; open?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const shown = log.attrs.filter((a) => keyAttrs.includes(a.key)).slice(0, 5);
  return (
    <li className="border-b border-hairline last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2.5 px-4 py-1.5 text-left font-mono text-[11.5px] leading-[1.6] hover:bg-elevated/40" aria-expanded={open}>
        <ChevronRight size={11} className={`mt-1.5 shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="shrink-0 text-faint tnum">{clock(log.time)}</span>
        <Badge tone={levelTone(log.level)} className="shrink-0">
          {log.level}
        </Badge>
        <span className={`min-w-0 shrink-0 ${levelTone(log.level) === "danger" ? "text-danger" : "text-text"}`}>{log.message}</span>
        {!open && (
          <span className="min-w-0 flex-1 truncate text-dim">
            {shown.map((a) => (
              <span key={a.key} className="mr-3">
                <span className="text-faint">{a.key}=</span>
                {a.value}
              </span>
            ))}
          </span>
        )}
      </button>
      {open && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 px-4 pb-2.5 pl-[3.25rem] font-mono text-[11px]">
          {log.attrs.length === 0 && <dd className="col-span-2 text-faint">no attributes</dd>}
          {log.attrs.map((a, i) => (
            <div key={`${a.key}-${i}`} className="contents">
              <dt className="text-dim">{a.key}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-all text-muted">{a.value}</dd>
            </div>
          ))}
          {log.dropped_attrs ? <dd className="col-span-2 text-faint">+{log.dropped_attrs} attributes over the limit</dd> : null}
        </dl>
      )}
    </li>
  );
}
