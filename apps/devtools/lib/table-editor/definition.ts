/**
 * A CREATE TABLE reconstructed from the catalog, for the definition view.
 * It reads like pg_dump's output; it isn't what the app's migrations ran.
 */
import type { Column, TableDetail } from "../api/db";

export function quoteIdent(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : '"' + name.replaceAll('"', '""') + '"';
}

export function quoteLiteral(s: string): string {
  return "'" + s.replaceAll("'", "''") + "'";
}

export function columnDefinition(c: Column): string {
  const parts = [quoteIdent(c.name), c.data_type];
  if (c.generation_expr) parts.push(`GENERATED ALWAYS AS (${c.generation_expr}) ${c.generated === "v" ? "VIRTUAL" : "STORED"}`);
  else if (c.identity) parts.push(`GENERATED ${c.identity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`);
  else if (c.default_expr) parts.push(`DEFAULT ${c.default_expr}`);
  if (!c.is_nullable) parts.push("NOT NULL");
  return parts.join(" ");
}

export function createTableSQL(d: TableDetail): string {
  const t = `${quoteIdent(d.table.schema)}.${quoteIdent(d.table.name)}`;
  const kindWord = d.table.kind === "view" ? "VIEW" : d.table.kind === "materialized_view" ? "MATERIALIZED VIEW" : d.table.kind === "foreign_table" ? "FOREIGN TABLE" : "TABLE";
  const lines: string[] = d.columns.map((c) => "    " + columnDefinition(c));
  const order = { p: 0, u: 1, f: 2, c: 3, x: 4 };
  for (const con of [...d.constraints].sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name))) {
    lines.push(`    CONSTRAINT ${quoteIdent(con.name)} ${con.definition}`);
  }
  const out: string[] = [`CREATE ${kindWord} ${t} (\n${lines.join(",\n")}\n);`];
  const constraintNames = new Set(d.constraints.map((c) => c.name));
  for (const ix of d.indexes) {
    if (ix.is_primary || constraintNames.has(ix.name)) continue;
    out.push(`${ix.definition};`);
  }
  if (d.table.comment) out.push(`COMMENT ON ${kindWord} ${t} IS ${quoteLiteral(d.table.comment)};`);
  for (const c of d.columns) if (c.comment) out.push(`COMMENT ON COLUMN ${t}.${quoteIdent(c.name)} IS ${quoteLiteral(c.comment)};`);
  if (d.table.rls_enabled) out.push(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
  if (d.table.rls_forced) out.push(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`);
  for (const tr of d.triggers) out.push(`${tr.definition};`);
  return out.join("\n\n") + "\n";
}
