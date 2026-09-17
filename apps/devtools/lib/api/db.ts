"use client";

/**
 * The Table Editor's data layer: the shapes `/_portal/api/db/*` speaks
 * (cli/internal/pgmeta in the gorbital repository, field for field) and the
 * React Query hooks that read and change them.
 *
 * One rule runs through everything here: a cell is the PostgreSQL text
 * literal (`"t"`, `"{a,b}"`, `"2026-09-16 10:00:00+00"`, `"\\x00ff"`), or
 * `null`. The UI edits text and sends text; PostgreSQL parses it.
 */

import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, NotConnectedError, apiFetch } from "./client";
import { dataMode } from "./mode";
import type { DevMigrations, PlanChange } from "./types";

/* ---------- Catalog ---------- */

export type Schema = {
  id: number;
  name: string;
  owner: string;
  comment: string | null;
  /** pg_catalog, information_schema and pg_* schemas. */
  system: boolean;
  has_extensions: boolean;
};

/** Who may change a table from the portal. */
export type Ownership = "user" | "managed" | "system";

export type TableKind = "table" | "partitioned_table" | "view" | "materialized_view" | "foreign_table";

export type Table = {
  id: number;
  schema: string;
  name: string;
  kind: TableKind;
  is_partition: boolean;
  rls_enabled: boolean;
  rls_forced: boolean;
  /** The planner's estimate (0 when never analysed). */
  row_estimate: number;
  /** The statistics collector's count. */
  live_rows: number;
  bytes: number;
  /** `bytes` for humans, such as "48 kB". */
  size: string;
  comment: string | null;
  owner: string;
  from_extension: boolean;
  ownership: Ownership;
};

export type Column = {
  ordinal: number;
  name: string;
  /** The SQL type as format_type prints it: "character varying(100)", "integer[]". */
  data_type: string;
  type_name: string;
  type_schema: string;
  is_array: boolean;
  /** The allowed values when the type (or the array's element type) is an enum. */
  enum_values?: string[];
  is_nullable: boolean;
  default_expr: string | null;
  generation_expr: string | null;
  /** "" (none), "a" (ALWAYS) or "d" (BY DEFAULT). */
  identity: "" | "a" | "d";
  /** "" (no), "s" (STORED) or "v" (VIRTUAL). */
  generated: "" | "s" | "v";
  comment: string | null;
  is_primary_key: boolean;
  is_unique: boolean;
  /** The tables the column references, as "schema.table". */
  fk_targets?: string[];
};

export type ConstraintType = "p" | "u" | "f" | "c" | "x";

export type Constraint = {
  id: number;
  name: string;
  type: ConstraintType;
  /** As pg_get_constraintdef prints it. */
  definition: string;
  deferrable: boolean;
  deferred: boolean;
  validated: boolean;
  columns: string[];
  ref_schema: string | null;
  ref_table: string | null;
  ref_columns?: string[];
  on_delete: string | null;
  on_update: string | null;
};

export type Index = {
  id: number;
  name: string;
  definition: string;
  method: string;
  is_unique: boolean;
  is_primary: boolean;
  is_valid: boolean;
  is_partial: boolean;
  columns: string[];
  bytes: number;
  scans: number;
  last_scan: string | null;
};

export type Trigger = {
  id: number;
  name: string;
  definition: string;
  enabled: "origin" | "disabled" | "replica" | "always";
  timing: "BEFORE" | "AFTER" | "INSTEAD OF";
  orientation: "ROW" | "STATEMENT";
  events: string[];
  function_schema: string;
  function_name: string;
};

export type Enum = { id: number; schema: string; name: string; values: string[]; comment: string | null };

export type View = {
  id: number;
  schema: string;
  name: string;
  is_materialized: boolean;
  definition: string;
  is_updatable: boolean;
  is_populated: boolean | null;
  comment: string | null;
};

export type ForeignKey = {
  name: string;
  schema: string;
  table: string;
  columns: string[];
  ref_schema: string;
  ref_table: string;
  ref_columns: string[];
  on_delete: string;
  on_update: string;
};

export type TableDetail = {
  table: Table;
  columns: Column[];
  constraints: Constraint[];
  indexes: Index[];
  triggers: Trigger[];
  /** The primary key's columns, in order; empty when the table has none (its rows can't be edited). */
  primary_key: string[];
};

/** One entry of the type picker. */
export type TypeOption = {
  /** What the UI offers and what a ColumnSpec's `type` carries: int8, text, timestamptz, or schema.name for an enum. */
  name: string;
  sql: string;
  group: "Numeric" | "JSON" | "Text" | "Date and time" | "Boolean" | "Binary" | "Enums" | (string & {});
  description: string;
  suggestions?: string[];
  enum_values?: string[];
};

/* ---------- Rows ---------- */

/** One value as PostgreSQL prints it; null is NULL. */
export type Cell = string | null;

export type FilterOperator = "=" | "<>" | ">" | "<" | ">=" | "<=" | "~~" | "~~*" | "in" | "is";

export type Filter = {
  column: string;
  operator: FilterOperator;
  /** The operand as text; for "is", one of null, not null, true, false. */
  value?: string;
  /** The list for "in". */
  values?: string[];
};

export type Sort = { column: string; descending?: boolean; nulls_first?: boolean };

export type RowQuery = {
  schema: string;
  table: string;
  filters?: Filter[];
  sorts?: Sort[];
  limit?: number;
  offset?: number;
};

export type RowPage = {
  columns: Column[];
  primary_key: string[];
  rows: Cell[][];
  count: number;
  /** The count comes from the planner rather than count(*). */
  estimated: boolean;
  limit: number;
  offset: number;
};

/** A row's identity: every primary key column → its literal. */
export type RowKey = Record<string, Cell>;

export type RowEdit = {
  schema: string;
  table: string;
  values?: Record<string, Cell>;
  keys?: RowKey[];
};

export type RowsResponse = { row: Cell[] };
export type DeleteResponse = { deleted: number };
export type ImportRequest = { schema: string; table: string; rows: Record<string, Cell>[] };
export type ImportResponse = { inserted: number };

/* ---------- DDL ---------- */

export type FKAction = "" | "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";

export type FKSpec = {
  name?: string;
  columns: string[];
  ref_schema: string;
  ref_table: string;
  ref_columns: string[];
  on_delete?: FKAction;
  on_update?: FKAction;
};

export type IndexSpec = {
  name?: string;
  columns: string[];
  unique?: boolean;
  method?: string;
  where?: string;
  concurrently?: boolean;
};

export type Identity = "none" | "always" | "by_default";

/** A column to create, or the target state of an alteration (unset fields keep their value). */
export type ColumnSpec = {
  name: string;
  /** A picker name (int8, text, numeric(10,2), varchar(100)) or an enum as schema.name. */
  type: string;
  array?: boolean;
  nullable?: boolean;
  /** A literal, or an expression when `default_is_expr`. */
  default?: string;
  default_is_expr?: boolean;
  identity?: Identity;
  primary_key?: boolean;
  unique?: boolean;
  check?: string;
  comment?: string;
  references?: FKSpec;
};

export type ChangeKind =
  | "create_table"
  | "drop_table"
  | "rename_table"
  | "add_column"
  | "drop_column"
  | "rename_column"
  | "alter_column"
  | "add_foreign_key"
  | "add_unique"
  | "add_check"
  | "drop_constraint"
  | "set_primary_key"
  | "create_index"
  | "drop_index"
  | "create_enum"
  | "add_enum_value"
  | "rename_enum_value"
  | "comment"
  | "rls";

/** One schema change; `kind` says which fields apply (pgmeta/ddl.go). */
export type Change = {
  kind: ChangeKind;
  schema: string;
  table?: string;
  new_name?: string;
  columns?: ColumnSpec[];
  column?: ColumnSpec;
  uniques?: string[][];
  foreign_keys?: FKSpec[];
  foreign_key?: FKSpec;
  unique?: string[];
  check?: string;
  name?: string;
  constraint_name?: string;
  primary_key?: string[];
  index?: IndexSpec;
  index_name?: string;
  values?: string[];
  value?: string;
  after?: string;
  comment?: string;
  enabled?: boolean;
  forced?: boolean;
  cascade?: boolean;
};

export type DDLPlan = {
  summary: string;
  up: string[];
  down: string[];
  irreversible: boolean;
  notes?: string[];
  no_transaction?: boolean;
};

export type DDLRequest = {
  change: Change;
  /** Names the migration file; empty derives it from the summary. */
  name?: string;
  allow_dirty?: boolean;
};

export type DDLResponse = {
  plan: DDLPlan;
  /** The migration file the plan becomes. */
  file: PlanChange;
  applied: boolean;
};

/* ---------- Keys and hooks ---------- */

const base = "/_portal/api/db";

export const dbKeys = {
  all: ["db"] as const,
  schemas: ["db", "schemas"] as const,
  tables: (schemas: string[]) => ["db", "tables", schemas.join(",")] as const,
  detail: (schema: string, table: string) => ["db", "detail", schema, table] as const,
  types: (schemas: string[]) => ["db", "types", schemas.join(",")] as const,
  rows: (q: RowQuery) => ["db", "rows", q.schema, q.table, q] as const,
};

/** Don't retry what won't change by itself: not connected, not signed in, or refused. */
function retry(count: number, err: Error) {
  if (err instanceof NotConnectedError) return false;
  if (err instanceof ApiError && err.status < 500) return false;
  return count < 1;
}

const schemasQuery = (schemas: string[]) => (schemas.length ? "?" + schemas.map((s) => `schema=${encodeURIComponent(s)}`).join("&") : "");

/** The query of GET /db/schemas. The Schema screen (schema.ts) shares its key, so both cache the response as sent. */
export const schemasQueryOptions = () =>
  queryOptions({
    queryKey: dbKeys.schemas,
    queryFn: () => apiFetch<{ schemas: Schema[] }>(`${base}/schemas`),
    select: (d) => d.schemas,
  });

/** The query of GET /db/tables. The Schema screen (schema.ts) shares its key, so both cache the response as sent. */
export const tablesQueryOptions = (schemas: string[]) =>
  queryOptions({
    queryKey: dbKeys.tables(schemas),
    queryFn: () => apiFetch<{ tables: Table[] }>(`${base}/tables${schemasQuery(schemas)}`),
    select: (d) => d.tables,
  });

export function useSchemas(enabled = true) {
  return useQuery({ ...schemasQueryOptions(), staleTime: 30_000, enabled, retry });
}

/** The relations of `schemas`; none means every non-system schema. */
export function useTables(schemas: string[], enabled = true) {
  return useQuery({ ...tablesQueryOptions(schemas), staleTime: 15_000, enabled, retry });
}

export function useTableDetail(schema: string | undefined, table: string | undefined) {
  return useQuery({
    queryKey: dbKeys.detail(schema ?? "", table ?? ""),
    queryFn: () => apiFetch<TableDetail>(`${base}/tables/${encodeURIComponent(schema ?? "")}/${encodeURIComponent(table ?? "")}`),
    enabled: Boolean(schema && table),
    staleTime: 15_000,
    retry,
  });
}

export function useTypes(schemas: string[] = [], enabled = true) {
  return useQuery({
    queryKey: dbKeys.types(schemas),
    queryFn: () => apiFetch<{ types: TypeOption[] }>(`${base}/types${schemasQuery(schemas)}`),
    select: (d) => d.types,
    staleTime: 60_000,
    enabled,
    retry,
  });
}

export function fetchRows(q: RowQuery) {
  return apiFetch<RowPage>(`${base}/rows/query`, { method: "POST", json: q });
}

/** A page of rows; the previous page stays on screen while the next loads. */
export function useRows(q: RowQuery | undefined) {
  return useQuery({
    queryKey: q ? dbKeys.rows(q) : ["db", "rows", "none"],
    queryFn: () => fetchRows(q as RowQuery),
    enabled: Boolean(q),
    placeholderData: (prev) => prev,
    staleTime: 5000,
    retry,
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || err.title || `${err.status} ${err.code}`;
  return err instanceof Error ? err.message : String(err);
}

function invalidateTable(qc: QueryClient, schema: string, table: string) {
  void qc.invalidateQueries({ queryKey: ["db", "rows", schema, table] });
  void qc.invalidateQueries({ queryKey: dbKeys.detail(schema, table) });
  void qc.invalidateQueries({ queryKey: ["db", "tables"] });
}

export function useInsertRow(schema: string, table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, Cell>) => apiFetch<RowsResponse>(`${base}/rows/insert`, { method: "POST", json: { schema, table, values } satisfies RowEdit }),
    onSuccess: () => {
      toast.success("Row inserted", { description: `${schema}.${table}` });
      invalidateTable(qc, schema, table);
    },
  });
}

export function useUpdateRow(schema: string, table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, values }: { key: RowKey; values: Record<string, Cell> }) =>
      apiFetch<RowsResponse>(`${base}/rows/update`, { method: "POST", json: { schema, table, keys: [key], values } satisfies RowEdit }),
    // The caller shows the problem where the edit happened (the cell, the sheet).
    onSettled: () => invalidateTable(qc, schema, table),
  });
}

export function useDeleteRows(schema: string, table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keys: RowKey[]) => apiFetch<DeleteResponse>(`${base}/rows/delete`, { method: "POST", json: { schema, table, keys } satisfies RowEdit }),
    onSuccess: (d) => toast.success(`Deleted ${d.deleted} ${d.deleted === 1 ? "row" : "rows"}`, { description: `${schema}.${table}` }),
    onError: (err) => toast.error("Couldn't delete", { description: errorMessage(err) }),
    onSettled: () => invalidateTable(qc, schema, table),
  });
}

/** One batch of an import (at most 1000 rows, all or nothing). */
export function importRows(req: ImportRequest) {
  return apiFetch<ImportResponse>(`${base}/rows/import`, { method: "POST", json: req });
}

export function planDDL(req: DDLRequest) {
  return apiFetch<DDLResponse>(`${base}/ddl/plan`, { method: "POST", json: req });
}

export function applyDDL(req: DDLRequest) {
  return apiFetch<DDLResponse>(`${base}/ddl/apply`, { method: "POST", json: req });
}

export function usePlanDDL() {
  return useMutation({ mutationFn: planDDL });
}

/**
 * Applies a change and waits for orb dev to run the migration: polls
 * `/_dev/migrations` until nothing is pending (or ~10 s pass), then drops
 * every catalog query so the pages refetch.
 */
export function useApplyDDL() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: DDLRequest) => {
      const before = await readMigrations();
      const out = await applyDDL(req);
      const settled = await waitForMigrations(before);
      return { ...out, settled };
    },
    onSuccess: (d) => {
      toast.success(d.settled ? "Migration applied" : "Migration written", { description: d.file.path + (d.settled ? "" : " · still applying; refresh in a moment") });
      void qc.invalidateQueries({ queryKey: dbKeys.all });
    },
  });
}

/** The dev console's migration state, or undefined when the app doesn't answer (it restarts around a migration). */
export async function readMigrations(): Promise<DevMigrations | undefined> {
  try {
    return await apiFetch<DevMigrations>("/_portal/app/_dev/migrations");
  } catch {
    return undefined;
  }
}

/**
 * Polls the dev console's migrations until the applied version moved past
 * `before` (the state read before the apply) and nothing is pending; false
 * when it gave up after `timeoutMs`.
 */
export async function waitForMigrations(before?: DevMigrations, timeoutMs = 15_000, everyMs = 500): Promise<boolean> {
  // The in-memory orb dev applies at once and its sample migrations always show one pending.
  if (dataMode() === "mock") return true;
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, everyMs));
    const m = await readMigrations();
    if (m && m.pending === 0 && (!before || m.current > before.current)) return true;
  }
  return false;
}
