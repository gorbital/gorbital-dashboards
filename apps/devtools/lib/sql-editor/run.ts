import type { RunMode, RunRequest, Warning } from "../api/sql";

/** The run modes, in the order the toolbar shows them, with what each does. */
export const runModes: { value: RunMode; label: string; description: string }[] = [
  { value: "rollback", label: "Rollback", description: "Runs the whole script in one transaction and rolls it back: see what it would do without changing anything." },
  { value: "commit", label: "Commit", description: "Runs and commits: the changes stay. Warnings (drops, truncates, updates without WHERE) ask first." },
  { value: "readonly", label: "Read-only", description: "A read-only transaction: any write fails with an error." },
];

export const rowLimits = [100, 500, 1000, 10_000] as const;
export const timeouts = [10, 30, 60, 300] as const;

export type RunSettings = {
  mode: RunMode;
  rowLimit: number;
  timeoutSeconds: number;
};

/** What to send: the selection when there is one and the caller asked for it, else the whole buffer. */
export function buildRunRequest(buffer: string, selection: string, settings: RunSettings, useSelection: boolean): RunRequest {
  const sql = useSelection && selection.trim() ? selection : buffer;
  return { sql, mode: settings.mode, row_limit: settings.rowLimit, timeout_seconds: settings.timeoutSeconds };
}

/** Whether a run should ask first: warnings in commit mode block until confirmed; in the other modes they're a note, nothing is committed. */
export type WarningGate = "confirm" | "banner" | "none";

export function gateRun(mode: RunMode, warnings: Warning[]): WarningGate {
  if (warnings.length === 0) return "none";
  return mode === "commit" ? "confirm" : "banner";
}

const txControl = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|END)\b/im;

/** The server refuses these in rollback and read-only mode (422); the toolbar can say so before sending. */
export function scriptControlsTransaction(sql: string): boolean {
  return txControl.test(sql);
}

/** Runs in a mode that keeps nothing. */
export const isDryRun = (mode: RunMode) => mode !== "commit";

/** "SELECT 12", "UPDATE 3" → a short label for the result tab. */
export function statementLabel(command: string, index: number): string {
  const tag = command.trim();
  if (!tag) return `#${index + 1}`;
  const [verb, ...rest] = tag.split(/\s+/);
  const n = rest.at(-1);
  return n && /^\d+$/.test(n) ? `${verb} ${n}` : verb;
}
