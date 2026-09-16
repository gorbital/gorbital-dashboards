import type { Statement, StatementSort } from "../api/observability";

/** The width of a statement's share bar, 0 to 100: `total_share` relative to the heaviest statement shown, so the heaviest fills its cell. */
export function shareWidth(s: Pick<Statement, "total_share">, maxShare: number): number {
  if (!Number.isFinite(s.total_share) || s.total_share <= 0 || maxShare <= 0) return 0;
  return Math.min(100, Math.max(0.5, (s.total_share / maxShare) * 100));
}

/** The largest `total_share` in the list, for `shareWidth`. */
export function maxShare(statements: Pick<Statement, "total_share">[]): number {
  return statements.reduce((m, s) => (Number.isFinite(s.total_share) && s.total_share > m ? s.total_share : m), 0);
}

/** A share (0 to 1) as the bar's label: `0.6` → `60%`, `0.0042` → `0.4%`, under 0.05% → `<0.1%`. */
export function shareLabel(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "0%";
  const p = share * 100;
  if (p < 0.05) return "<0.1%";
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

export const statementSortLabel: Record<StatementSort, string> = {
  total_time: "Total time",
  mean_time: "Mean time",
  calls: "Calls",
  rows: "Rows",
  max_time: "Max time",
};

/** Whether the statement's normalised text still carries parameters (`$1`), which makes EXPLAIN a generic plan. */
export function hasPlaceholders(query: string): boolean {
  return /\$\d+\b/.test(query);
}

/** The statement as the SQL editor should open it: trailing semicolon, a comment naming where it came from. */
export function statementForEditor(s: Pick<Statement, "query" | "calls" | "mean_ms" | "query_id">): string {
  const body = s.query.trim().replace(/;+$/, "");
  return `-- pg_stat_statements query ${s.query_id}: ${s.calls} calls, mean ${s.mean_ms.toFixed(2)} ms\n${body};\n`;
}

/** The statements with their share bars: what the table renders. */
export function statementRows(statements: Statement[]): (Statement & { share_width: number })[] {
  const max = maxShare(statements);
  return statements.map((s) => ({ ...s, share_width: shareWidth(s, max) }));
}
