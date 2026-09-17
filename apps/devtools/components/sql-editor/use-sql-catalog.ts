"use client";

import { useMemo } from "react";
import type { SqlCatalog } from "@gorbital/dash/components/monaco";
import { mentionedTables } from "@gorbital/dash/components/monaco-sql";
import { useSqlCatalogColumns, useSqlCatalogTables } from "@/lib/api/sql";

/** Columns of every table are fetched when the catalog is this small; above it, only the tables the script mentions. */
const SMALL_CATALOG = 12;
/** At most this many column lists in flight for one script. */
const MAX_MENTIONED = 12;

/**
 * What the completion provider knows: every table from `db/tables`, and the
 * columns of the tables the buffer mentions (or of all of them when there
 * are few), each fetched once and cached.
 */
export function useSqlCatalog(sql: string, enabled: boolean): SqlCatalog {
  const tables = useSqlCatalogTables(enabled);
  const all = useMemo(() => tables.data?.tables ?? [], [tables.data]);
  const wanted = useMemo(() => (all.length <= SMALL_CATALOG ? all : mentionedTables(sql, all).slice(0, MAX_MENTIONED)), [all, sql]);
  const details = useSqlCatalogColumns(wanted);
  const columnsKey = details.map((d) => (d.data ? `${d.data.table.schema}.${d.data.table.name}:${d.data.columns.length}` : "")).join("|");
  return useMemo(() => {
    const columns: SqlCatalog["columns"] = {};
    for (const d of details) {
      if (!d.data) continue;
      columns[`${d.data.table.schema}.${d.data.table.name}`] = d.data.columns.map((c) => ({ name: c.name, type: c.data_type, nullable: c.is_nullable, primary: c.is_primary_key }));
    }
    return { tables: all.map((t) => ({ schema: t.schema, name: t.name, kind: t.kind })), columns };
    // details is a new array every render; columnsKey captures what changed in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, columnsKey]);
}
