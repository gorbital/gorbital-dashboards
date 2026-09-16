"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, Copy, Download, X } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Empty } from "@gorbital/dash/components/panel";
import { toast } from "@gorbital/dash/components/toast";
import { fmtMs } from "@gorbital/dash/lib/format";
import { ApiError } from "@/lib/api/client";
import type { Cell, RunResult, StatementResult, Warning } from "@/lib/api/sql";
import { exportExtension, exportMime, exportResult, type ExportFormat } from "@/lib/sql-editor/export";
import { statementLabel } from "@/lib/sql-editor/run";
import { FormatMenu } from "./toolbar";

type Props = {
  result?: RunResult;
  /** The HTTP problem when the request itself failed (422 for an empty script or a BEGIN outside commit mode). */
  requestError?: Error;
  running: boolean;
  /** Line numbers in the result are relative to what was sent; this maps them back to the buffer. */
  lineOffset: number;
  onJumpToLine: (line: number) => void;
  onDismissWarnings?: () => void;
};

/** The bottom pane after a run: a tab per statement, the grid, the exports, and the server's error with its line. */
export function Results({ result, requestError, running, lineOffset, onJumpToLine }: Props) {
  const [tab, setTab] = useState(0);
  useEffect(() => setTab(0), [result]);
  const statements = result?.statements ?? [];
  const current = statements[Math.min(tab, Math.max(0, statements.length - 1))];

  if (running && !result) {
    return <div className="flex h-full items-center justify-center text-[12px] text-dim">Running…</div>;
  }
  if (requestError) return <RequestProblem error={requestError} />;
  if (!result) {
    return <Empty title="No results yet" hint="Run the script (⌘⏎) and every statement's result lands here." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-1.5">
        {result.committed ? <Badge tone="warn">Committed</Badge> : result.rolled_back ? <Badge tone="ok">Rolled back</Badge> : <Badge tone="muted">{result.mode}</Badge>}
        <span className="font-mono text-[11px] text-dim tnum">{fmtMs(result.duration_ms)}</span>
        <span className="font-mono text-[11px] text-faint">
          {statements.length} statement{statements.length === 1 ? "" : "s"}
        </span>
        {statements.length > 1 && (
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {statements.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTab(i)}
                className={`h-6 shrink-0 rounded-md px-2 font-mono text-[11px] transition-colors ${i === tab ? "bg-elevated text-text" : "text-dim hover:bg-elevated/60 hover:text-muted"}`}
              >
                {statementLabel(s.command, i)}
              </button>
            ))}
          </div>
        )}
        {current?.columns && (
          <div className="ml-auto flex items-center gap-1">
            <FormatMenu label="Copy" icon={<Copy size={11} />} onPick={(f) => copy(current, f)} />
            <FormatMenu label="Download" icon={<Download size={11} />} onPick={(f) => download(current, f, tab)} />
          </div>
        )}
      </div>
      {result.warnings && result.warnings.length > 0 && !result.committed && <WarningsBanner warnings={result.warnings} lineOffset={lineOffset} onJumpToLine={onJumpToLine} />}
      {result.error && <ErrorPanel error={result.error} lineOffset={lineOffset} onJumpToLine={onJumpToLine} />}
      <div className="min-h-0 flex-1 overflow-auto">
        {current ? <Statement s={current} /> : !result.error && <Empty title="Nothing came back" hint="The script had no statements." />}
      </div>
    </div>
  );
}

function WarningsBanner({ warnings, lineOffset, onJumpToLine }: { warnings: Warning[]; lineOffset: number; onJumpToLine: (line: number) => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="flex items-start gap-2 border-b border-hairline bg-warn/5 px-3 py-2 text-[11.5px]">
      <AlertTriangle size={13} className="mt-px shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <span className="text-warn">
          {warnings.length} warning{warnings.length === 1 ? "" : "s"}
        </span>
        <span className="text-muted"> · nothing was committed in this mode; switch to commit to keep the changes.</span>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {warnings.map((w, i) => (
            <li key={i}>
              <button type="button" onClick={() => onJumpToLine(w.line + lineOffset)} className="font-mono text-[11px] text-muted hover:text-text">
                <span className="text-warn">{w.kind}</span> line {w.line + lineOffset}: {w.message}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={() => setOpen(false)} className="grid h-5 w-5 shrink-0 place-items-center rounded text-dim hover:text-text" aria-label="Dismiss">
        <X size={12} />
      </button>
    </div>
  );
}

function ErrorPanel({ error, lineOffset, onJumpToLine }: { error: NonNullable<RunResult["error"]>; lineOffset: number; onJumpToLine: (line: number) => void }) {
  const line = error.line ? error.line + lineOffset : undefined;
  return (
    <div className="border-b border-danger/20 bg-danger/5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1 text-[12px]">
          <p className="font-mono text-danger">{error.message}</p>
          {error.detail && (
            <p className="mt-1 text-muted">
              <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Detail </span>
              {error.detail}
            </p>
          )}
          {error.hint && (
            <p className="mt-1 text-muted">
              <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Hint </span>
              {error.hint}
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-dim">
            {error.code && <span>SQLSTATE {error.code}</span>}
            {error.position && <span>position {error.position}</span>}
            {line && (
              <Button size="sm" kind="ghost" icon={<ArrowUpRight size={11} />} onClick={() => onJumpToLine(line)} className="h-6 px-1.5">
                line {line}
              </Button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function RequestProblem({ error }: { error: Error }) {
  const detail = error instanceof ApiError ? error.detail || error.message : error.message;
  const needsCommit = /commit mode/i.test(detail);
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-2 text-[12px]">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
        <div>
          <p className="font-mono text-danger">{detail}</p>
          {error instanceof ApiError && (
            <p className="mt-1 font-mono text-[11px] text-dim">
              {error.status} {error.code}
            </p>
          )}
          {needsCommit && <p className="mt-1 text-muted">Switch the mode to Commit to run a script that manages its own transaction; the portal can&apos;t roll it back for you.</p>}
        </div>
      </div>
    </div>
  );
}

/** Rows past this aren't rendered; the exports still carry all of them. */
const RENDER_CAP = 1000;

function Statement({ s }: { s: StatementResult }) {
  const rows = s.rows ?? [];
  const shown = useMemo(() => rows.slice(0, RENDER_CAP), [rows]);
  if (!s.columns) {
    return (
      <div className="flex flex-col items-start gap-1 px-4 py-4">
        <div className="flex items-center gap-2">
          <Check size={13} className="text-ok" />
          <span className="font-mono text-[12px] text-text">{s.command}</span>
        </div>
        <span className="text-[11.5px] text-dim">
          {s.rows_affected} row{s.rows_affected === 1 ? "" : "s"} affected
        </span>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-1 font-mono text-[10.5px] text-dim">
        <span>{s.command}</span>
        <span>·</span>
        <span className="tnum">
          {rows.length.toLocaleString("en-US")} row{rows.length === 1 ? "" : "s"}
          {s.truncated ? " (truncated at the row limit)" : ""}
        </span>
        {rows.length > RENDER_CAP && <span>· showing the first {RENDER_CAP.toLocaleString("en-US")}; download for all</span>}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 pb-3 text-[11.5px] text-dim">No rows.</div>
      ) : (
        <table className="w-max min-w-full border-collapse font-mono text-[11.5px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="border-b border-r border-hairline px-2 py-1 text-right text-[10px] font-normal text-faint tnum">#</th>
              {s.columns.map((c, i) => (
                <th key={i} className="whitespace-nowrap border-b border-hairline px-2.5 py-1 text-left font-medium text-muted">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="hover:bg-elevated/40">
                <td className="border-r border-hairline px-2 py-[3px] text-right text-[10px] text-faint tnum">{i + 1}</td>
                {r.map((cell, j) => (
                  <CellView key={j} cell={cell} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CellView({ cell }: { cell: Cell }) {
  if (cell === null) return <td className="px-2.5 py-[3px] italic text-faint">NULL</td>;
  const long = cell.length > 120;
  return (
    <td className="max-w-[420px] truncate px-2.5 py-[3px] text-text" title={long ? cell : undefined}>
      {long ? `${cell.slice(0, 120)}…` : cell === "" ? <span className="text-faint">&quot;&quot;</span> : cell}
    </td>
  );
}

async function copy(s: StatementResult, format: ExportFormat) {
  try {
    await navigator.clipboard.writeText(exportResult(s, format));
    toast.success(`Copied as ${format.toUpperCase()}`, { description: `${s.rows?.length ?? 0} rows` });
  } catch (err) {
    toast.error("Couldn't copy", { description: err instanceof Error ? err.message : String(err) });
  }
}

function download(s: StatementResult, format: ExportFormat, index: number) {
  const blob = new Blob([exportResult(s, format)], { type: exportMime[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `result-${index + 1}.${exportExtension[format]}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
