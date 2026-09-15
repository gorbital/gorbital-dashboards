"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { fmtDate } from "@gorbital/dash/lib/format";
import type { Log } from "@/lib/mock";

const level: Record<Log["level"], { label: string; cls: string }> = {
  debug: { label: "DEBUG", cls: "border-border text-faint" },
  info: { label: "INFO", cls: "border-border text-muted" },
  warn: { label: "WARN", cls: "border-warn/40 bg-warn/10 text-warn" },
  error: { label: "ERROR", cls: "border-danger/40 bg-danger/15 text-danger" },
};

function time(ts: number) {
  const d = new Date(ts);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
}

/** Every line expands to its attributes and the trace it ran in. */
export function LogTable({ rows, initiallyOpen }: { rows: Log[]; initiallyOpen?: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set(initiallyOpen ? [initiallyOpen] : []));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="font-mono text-[12px]">
      <div className="grid grid-cols-[28px_120px_84px_170px_minmax(0,1fr)] items-center gap-3 border-b border-hairline px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-dim">
        <span />
        <span>Time</span>
        <span>Level</span>
        <span>Context</span>
        <span>Message</span>
      </div>
      <ul>
        {rows.map((l) => {
          const isOpen = open.has(l.id);
          const lv = level[l.level];
          return (
            <li key={l.id} className={`border-b border-hairline/70 ${isOpen ? "bg-elevated/40" : ""}`}>
              <button onClick={() => toggle(l.id)} className="grid w-full grid-cols-[28px_120px_84px_170px_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 text-left hover:bg-elevated/40">
                <ChevronRight size={13} className={`text-dim transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <span className="text-muted tnum">{time(l.at)}</span>
                <span className={`inline-flex h-[20px] w-fit items-center rounded-full border px-2 text-[10px] font-semibold tracking-wider ${lv.cls}`}>{lv.label}</span>
                <span className="truncate text-text">{l.ctx}</span>
                <span className={`truncate ${l.level === "error" ? "text-danger" : l.level === "warn" ? "text-warn" : "text-muted"}`}>
                  {l.msg}
                  {l.fields.path && <span className="text-dim"> {l.fields.method} {l.fields.path}</span>}
                </span>
              </button>
              {isOpen && (
                <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 px-4 pb-4 pt-1">
                  <span />
                  <div className="grid gap-3">
                    <p className={`text-[12.5px] ${l.level === "error" ? "text-danger" : "text-text"}`}>{l.msg}</p>
                    <div>
                      <div className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-dim">Attributes</div>
                      <dl className="grid gap-1 pl-3">
                        {Object.entries(l.fields).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="text-dim">{k}:</dt>
                            <dd className={k === "err" ? "text-danger" : /^\d+(\.\d+)?$/.test(v) ? "text-info" : "text-primary/90"}>{/^\d+(\.\d+)?$/.test(v) ? v : `"${v}"`}</dd>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <dt className="text-dim">instance:</dt>
                          <dd className="text-primary/90">&quot;{l.instance}&quot;</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-dim">
                      <span>{fmtDate(l.at)} UTC</span>
                      <span>acme-api</span>
                      <span>{l.instance}</span>
                      <Link href={`/traces/${l.traceId}`} className="flex items-center gap-1 text-primary hover:underline">
                        Open trace <ExternalLink size={11} />
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
