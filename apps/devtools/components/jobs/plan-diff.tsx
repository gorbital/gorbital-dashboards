"use client";

import { useMemo, useState } from "react";
import { Check, Copy, FileCode2, FilePlus2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import type { Plan, PlanChange } from "@/lib/api/types";
import { diffHunks, diffStat, lineDiff, unifiedDiff } from "@/lib/jobs/diff";

/** A button that copies `text` and says so for a moment. */
export function CopyButton({ text, label = "Copy", size = "sm", kind = "ghost" }: { text: string; label?: string; size?: "sm" | "md"; kind?: "ghost" | "secondary" | "primary" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      kind={kind}
      icon={done ? <Check size={11} /> : <Copy size={11} />}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

/** One file of a plan: the whole content for a created file, a folded diff for a modified one. */
export function PlanFile({ change, open }: { change: PlanChange; open?: boolean }) {
  const lines = useMemo(() => (change.kind === "modify" ? lineDiff(change.before ?? "", change.content) : []), [change]);
  const hunks = useMemo(() => diffHunks(lines, 3), [lines]);
  const stat = diffStat(lines);
  const created = change.kind === "create";
  const contentLines = change.content.split("\n").length - (change.content.endsWith("\n") ? 1 : 0);
  return (
    <details open={open} className="group min-w-0 overflow-hidden rounded-lg border border-hairline bg-bg/40">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[12px] hover:bg-elevated/40">
        {created ? <FilePlus2 size={12} className="text-ok" /> : <FileCode2 size={12} className="text-accent" />}
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text">{change.path}</span>
        <Badge tone={created ? "ok" : "accent"}>{created ? "new" : "modified"}</Badge>
        <span className="font-mono text-[10.5px] text-dim tnum">{created ? `${contentLines} lines` : `+${stat.added} −${stat.removed}`}</span>
      </summary>
      <div className="border-t border-hairline p-2">
        {created ? (
          <Code className="max-h-[420px] overflow-auto text-text">{change.content}</Code>
        ) : hunks.length === 0 ? (
          <div className="px-2 py-1 font-mono text-[11px] text-dim">no change</div>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-hairline bg-code-bg font-mono text-[11.5px] leading-[1.6]">
            {hunks.map((h, i) => (
              <div key={i}>
                <div className="bg-elevated/60 px-3 py-0.5 text-[10.5px] text-info">
                  @@ -{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
                </div>
                {h.lines.map((l, j) => (
                  <div key={j} className={`grid grid-cols-[3.2em_3.2em_1em_1fr] px-2 ${l.type === "add" ? "bg-ok/10 text-ok" : l.type === "del" ? "bg-danger/10 text-danger" : "text-muted"}`}>
                    <span className="select-none pr-1 text-right text-dim tnum">{l.oldNo ?? ""}</span>
                    <span className="select-none pr-1 text-right text-dim tnum">{l.newNo ?? ""}</span>
                    <span className="select-none">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
                    <span className="whitespace-pre">{l.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex justify-end">
          <CopyButton text={created ? change.content : unifiedDiff(change.path, change.before ?? "", change.content)} label={created ? "Copy file" : "Copy diff"} />
        </div>
      </div>
    </details>
  );
}

/** Every file of a plan, the summary and what to do next. */
export function PlanView({ plan, applied }: { plan: Plan; applied?: boolean }) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-text">
          {plan.changes.filter((c) => c.kind === "create").length} files to create, {plan.changes.filter((c) => c.kind === "modify").length} to modify
        </span>
        {applied && <Badge tone="ok">written</Badge>}
      </div>
      {plan.changes.map((c, i) => (
        <PlanFile key={c.path} change={c} open={i === 0} />
      ))}
      {plan.next?.length > 0 && (
        <div className="grid gap-1 text-[11.5px] text-muted">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Next</div>
          {plan.next.map((n, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-dim tnum">{i + 1}.</span>
              <span>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
