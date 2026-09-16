import type { SqlCatalog, SqlCatalogTable } from "./monaco";

/**
 * The pgsql completion source's pure parts: which tables a script mentions,
 * what an alias stands for, and the keyword list. Kept free of Monaco so
 * they can be unit-tested.
 */

export const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "IS", "NULL", "AS", "ON", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "LATERAL",
  "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET", "DISTINCT", "UNION", "UNION ALL", "EXCEPT", "INTERSECT", "WITH", "RECURSIVE",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "RETURNING", "ON CONFLICT", "DO NOTHING", "DO UPDATE",
  "CREATE TABLE", "CREATE INDEX", "CREATE UNIQUE INDEX", "CREATE VIEW", "CREATE OR REPLACE", "ALTER TABLE", "ADD COLUMN", "DROP COLUMN", "RENAME TO", "DROP TABLE", "DROP INDEX", "TRUNCATE",
  "PRIMARY KEY", "FOREIGN KEY", "REFERENCES", "UNIQUE", "DEFAULT", "CHECK", "CONSTRAINT", "IF EXISTS", "IF NOT EXISTS", "CASCADE",
  "CASE", "WHEN", "THEN", "ELSE", "END", "BETWEEN", "LIKE", "ILIKE", "SIMILAR TO", "EXISTS", "ANY", "ALL", "SOME", "ASC", "DESC", "NULLS FIRST", "NULLS LAST",
  "BEGIN", "COMMIT", "ROLLBACK", "EXPLAIN", "ANALYZE", "VACUUM", "USING", "NATURAL", "OVER", "PARTITION BY", "WINDOW", "FILTER", "FETCH FIRST", "ROWS ONLY", "FOR UPDATE", "SKIP LOCKED",
  "TRUE", "FALSE", "CAST", "INTERVAL", "TIMESTAMP", "TIMESTAMPTZ", "DATE", "TEXT", "INTEGER", "BIGINT", "BOOLEAN", "NUMERIC", "JSONB", "UUID", "SERIAL", "VARCHAR",
] as const;

export const SQL_FUNCTIONS = [
  "count", "sum", "avg", "min", "max", "coalesce", "nullif", "greatest", "least", "now", "current_date", "current_timestamp", "date_trunc", "extract", "age", "to_char", "to_timestamp",
  "lower", "upper", "length", "left", "right", "substring", "trim", "concat", "concat_ws", "split_part", "replace", "regexp_replace", "position", "format", "initcap", "md5",
  "round", "floor", "ceil", "abs", "random", "generate_series", "array_agg", "array_length", "unnest", "string_agg", "json_agg", "jsonb_agg", "jsonb_build_object", "json_build_object", "jsonb_set", "row_number", "rank", "dense_rank", "lag", "lead", "first_value", "last_value",
  "pg_size_pretty", "pg_total_relation_size", "pg_relation_size", "pg_indexes_size", "pg_backend_pid", "pg_blocking_pids", "current_database", "current_user", "version", "gen_random_uuid",
] as const;

const identifier = String.raw`("?[A-Za-z_][\w$]*"?)`;
/** FROM x, JOIN x, UPDATE x, INTO x, TABLE x: the table references a script makes, with their aliases. */
const reference = new RegExp(String.raw`\b(?:FROM|JOIN|UPDATE|INTO|TABLE|ONLY)\s+(?:${identifier}\.)?${identifier}(?:\s+(?:AS\s+)?(?!(?:ON|WHERE|SET|USING|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|JOIN|GROUP|ORDER|LIMIT|VALUES|SELECT|RETURNING|NATURAL|LATERAL|HAVING|WINDOW|UNION|EXCEPT|INTERSECT|FOR|WITH|DO|CASCADE|RESTRICT)\b)${identifier})?`, "gi");

const unquote = (s: string | undefined) => (s ? s.replace(/^"|"$/g, "") : undefined);

export type TableReference = { schema?: string; table: string; alias?: string };

/** Every table reference in the script, in order (comments and strings stripped first). */
export function tableReferences(sql: string): TableReference[] {
  const clean = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ").replace(/'(?:[^']|'')*'/g, "''");
  const out: TableReference[] = [];
  for (const m of clean.matchAll(reference)) {
    const table = unquote(m[2]);
    if (!table) continue;
    out.push({ schema: unquote(m[1]), table, alias: unquote(m[3]) });
  }
  return out;
}

/** The catalog key of a table: `schema.table`. */
export const tableKey = (t: SqlCatalogTable) => `${t.schema}.${t.name}`;

/** The catalog tables the script mentions, by name or `schema.name`. */
export function mentionedTables<T extends SqlCatalogTable>(sql: string, tables: T[]): T[] {
  const refs = tableReferences(sql);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of refs) {
    const match = findTable(r, tables);
    if (!match) continue;
    const key = tableKey(match);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match);
  }
  return out;
}

function findTable<T extends SqlCatalogTable>(r: { schema?: string; table: string }, tables: T[]): T | undefined {
  const lower = r.table.toLowerCase();
  if (r.schema) {
    const s = r.schema.toLowerCase();
    return tables.find((t) => t.schema.toLowerCase() === s && t.name.toLowerCase() === lower);
  }
  return tables.find((t) => t.schema === "public" && t.name.toLowerCase() === lower) ?? tables.find((t) => t.name.toLowerCase() === lower);
}

/** What `name.` before the cursor stands for: an alias, a table, or a schema. */
export function resolveQualifier(sql: string, name: string, catalog: SqlCatalog): { kind: "table"; table: SqlCatalogTable } | { kind: "schema"; schema: string } | undefined {
  const lower = name.toLowerCase();
  for (const r of tableReferences(sql)) {
    if (r.alias?.toLowerCase() === lower) {
      const t = findTable(r, catalog.tables);
      if (t) return { kind: "table", table: t };
    }
  }
  const t = findTable({ table: name }, catalog.tables);
  if (t) return { kind: "table", table: t };
  if (catalog.tables.some((x) => x.schema.toLowerCase() === lower)) return { kind: "schema", schema: catalog.tables.find((x) => x.schema.toLowerCase() === lower)!.schema };
  return undefined;
}

/** How a table is typed in a script: bare when it's in public, qualified otherwise. */
export const tableInsertText = (t: SqlCatalogTable) => (t.schema === "public" ? t.name : `${t.schema}.${t.name}`);
