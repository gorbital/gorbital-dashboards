import type { Cell, StatementResult } from "../api/sql";

/** A result set as text: CSV (RFC 4180, NULL empty), JSON (an array of objects, NULL as null) or a Markdown table. */

export function toCSV(columns: string[], rows: Cell[][]): string {
  const line = (cells: Cell[]) => cells.map(csvCell).join(",");
  return [line(columns), ...rows.map(line)].join("\r\n") + "\r\n";
}

function csvCell(c: Cell): string {
  if (c === null) return "";
  return /[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
}

export function toJSON(columns: string[], rows: Cell[][]): string {
  const objects = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null])));
  return JSON.stringify(objects, null, 2) + "\n";
}

export function toMarkdown(columns: string[], rows: Cell[][]): string {
  const cell = (c: Cell) => (c === null ? "*NULL*" : c.replace(/\|/g, "\\|").replace(/\r?\n/g, " "));
  const head = `| ${columns.map(cell).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(cell).join(" | ")} |`);
  return [head, sep, ...body].join("\n") + "\n";
}

export type ExportFormat = "csv" | "json" | "markdown";

export function exportResult(s: StatementResult, format: ExportFormat): string {
  const columns = s.columns ?? [];
  const rows = s.rows ?? [];
  return format === "csv" ? toCSV(columns, rows) : format === "json" ? toJSON(columns, rows) : toMarkdown(columns, rows);
}

export const exportMime: Record<ExportFormat, string> = { csv: "text/csv;charset=utf-8", json: "application/json", markdown: "text/markdown;charset=utf-8" };
export const exportExtension: Record<ExportFormat, string> = { csv: "csv", json: "json", markdown: "md" };
