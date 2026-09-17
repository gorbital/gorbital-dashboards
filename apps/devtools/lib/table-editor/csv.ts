/**
 * CSV import and export. Import maps the file's columns onto the table's,
 * turns every value into a cell literal (text as it is; empty → NULL when
 * asked) and sends batches to `rows/import`, stopping at the first batch the
 * server refuses. Export writes what the grid shows, one page at a time.
 */
import type { Cell, Column } from "../api/db";

/** For each CSV column, the table column it fills, or null to skip it. */
export type ColumnMapping = (string | null)[];

export const importBatchSize = 500;

function normalise(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Matches CSV headers to table columns by name (case, spaces and dashes ignored). */
export function guessMapping(headers: string[], columns: Pick<Column, "name">[]): ColumnMapping {
  const byName = new Map(columns.map((c) => [normalise(c.name), c.name]));
  const used = new Set<string>();
  return headers.map((h) => {
    const name = byName.get(normalise(h));
    if (!name || used.has(name)) return null;
    used.add(name);
    return name;
  });
}

export type MapOptions = {
  /** An empty string becomes NULL instead of ''. */
  emptyAsNull: boolean;
  /** The literal string NULL (any case) becomes NULL. */
  nullWord?: boolean;
};

/** Turns parsed CSV rows into row objects for `rows/import`; skipped columns and unmapped cells are left out. */
export function mapRows(rows: string[][], mapping: ColumnMapping, opts: MapOptions): Record<string, Cell>[] {
  const out: Record<string, Cell>[] = [];
  for (const r of rows) {
    if (r.every((v) => v === "" || v === undefined)) continue; // a blank line
    const row: Record<string, Cell> = {};
    mapping.forEach((col, i) => {
      if (!col) return;
      const v = r[i] ?? "";
      if (opts.emptyAsNull && v === "") row[col] = null;
      else if (opts.nullWord && v.toUpperCase() === "NULL") row[col] = null;
      else row[col] = v;
    });
    out.push(row);
  }
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type ImportProgress = { sent: number; total: number; batch: number; batches: number };

export type ImportOutcome = { inserted: number; failed?: { batch: number; error: unknown } };

/**
 * Sends rows in batches, in order, and stops at the first failure (the rows
 * before it are committed; the failed batch and everything after are not).
 */
export async function runImport(
  rows: Record<string, Cell>[],
  send: (batch: Record<string, Cell>[]) => Promise<{ inserted: number }>,
  onProgress?: (p: ImportProgress) => void,
  size = importBatchSize,
): Promise<ImportOutcome> {
  const batches = chunk(rows, size);
  let inserted = 0;
  for (let i = 0; i < batches.length; i++) {
    onProgress?.({ sent: inserted, total: rows.length, batch: i + 1, batches: batches.length });
    try {
      inserted += (await send(batches[i])).inserted;
    } catch (error) {
      return { inserted, failed: { batch: i + 1, error } };
    }
  }
  onProgress?.({ sent: inserted, total: rows.length, batch: batches.length, batches: batches.length });
  return { inserted };
}

/* ---------- Export ---------- */

function csvField(v: Cell): string {
  if (v === null) return "";
  return /[",\r\n]/.test(v) || v === "" ? '"' + v.replaceAll('"', '""') + '"' : v;
}

/** RFC 4180 with a header row; NULL is an empty field, '' is a quoted empty field. */
export function toCSV(columns: string[], rows: Cell[][]): string {
  const lines = [columns.map((c) => csvField(c)).join(",")];
  for (const r of rows) lines.push(r.map(csvField).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** An array of objects, cells as text literals, NULL as null. */
export function toJSONExport(columns: string[], rows: Cell[][]): string {
  return JSON.stringify(
    rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null]))),
    null,
    2,
  );
}
