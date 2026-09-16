"use client";

/**
 * The SQL Editor's side of the portal API (`/_portal/api/db/sql/*`,
 * cli/internal/portal/sql.go and sqlstore.go, ADR-0068) plus the two catalog
 * reads the completion provider needs (`/_portal/api/db/tables*`,
 * cli/internal/pgmeta/catalog.go). Types match the Go types field for field.
 */
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, NotConnectedError, apiFetch } from "./client";

/* ---------- Types ---------- */

export type RunMode = "rollback" | "commit" | "readonly";

/** A result cell: PostgreSQL's text form, or NULL. */
export type Cell = string | null;

export type RunRequest = {
  sql: string;
  /** rollback is the default. */
  mode?: RunMode;
  /** Rows of each result set; 500 by default, at most 10,000. */
  row_limit?: number;
  /** 30 by default, at most 300. */
  timeout_seconds?: number;
};

export type StatementResult = {
  /** The command tag: SELECT 3, UPDATE 1, CREATE TABLE. */
  command: string;
  columns?: string[];
  rows?: Cell[][];
  rows_affected: number;
  /** Rows beyond the limit were dropped. */
  truncated?: boolean;
};

export type RunError = {
  message: string;
  /** SQLSTATE. */
  code?: string;
  detail?: string;
  hint?: string;
  /** 1-based byte offset in the script. */
  position?: number;
  line?: number;
};

export type WarningKind = "drop" | "truncate" | "delete_without_where" | "update_without_where" | "drop_column" | "alter_type";

export type Warning = {
  kind: WarningKind | string;
  message: string;
  /** Where the statement starts. */
  line: number;
};

export type RunResult = {
  mode: RunMode;
  statements: StatementResult[];
  /** The server's error, as data: the HTTP status is still 200. */
  error?: RunError;
  committed: boolean;
  rolled_back: boolean;
  duration_ms: number;
  warnings?: Warning[];
};

export type ExplainRequest = { sql: string; analyze?: boolean };

/** One node of `EXPLAIN (FORMAT JSON)`; PostgreSQL's keys, with spaces. */
export type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  Alias?: string;
  Schema?: string;
  "Index Name"?: string;
  "Startup Cost"?: number;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Plan Width"?: number;
  "Actual Startup Time"?: number;
  "Actual Total Time"?: number;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Parent Relationship"?: string;
  "Join Type"?: string;
  Strategy?: string;
  Filter?: string;
  "Index Cond"?: string;
  "Recheck Cond"?: string;
  "Hash Cond"?: string;
  "Merge Cond"?: string;
  "Join Filter"?: string;
  "Sort Key"?: string[];
  "Group Key"?: string[];
  "Rows Removed by Filter"?: number;
  Output?: string[];
  Plans?: PlanNode[];
} & Record<string, unknown>;

export type PlanRoot = {
  Plan: PlanNode;
  "Planning Time"?: number;
  "Execution Time"?: number;
  Triggers?: unknown[];
} & Record<string, unknown>;

export type ExplainResponse = { plan: PlanRoot[] };

export type CheckResponse = { warnings: Warning[] };

export type Template = {
  name: string;
  description: string;
  sql: string;
  /** An extension the template needs, if any. */
  needs?: string;
};

export type TemplateList = { templates: Template[] };

export type Snippet = {
  /** Letters, digits, hyphens and underscores; the file is db/queries/<name>.sql. */
  name: string;
  sql: string;
  favorite: boolean;
  modified: string;
  /** Relative to the app. */
  path: string;
};

export type SnippetList = { snippets: Snippet[] };

export type SnippetRequest = { sql: string; favorite?: boolean };

export type HistoryEntry = {
  time: string;
  sql: string;
  mode: RunMode;
  duration_ms: number;
  /** Rows of the last result set. */
  rows: number;
  error?: string;
};

export type HistoryList = { history: HistoryEntry[]; max: number };

export type MigrationRequest = {
  name: string;
  sql: string;
  /** Also run the migration through the supervisor. */
  apply?: boolean;
  allow_dirty?: boolean;
};

export type MigrationPlan = {
  summary: string;
  up: string[];
  down: string[] | null;
  irreversible: boolean;
  notes?: string[];
  no_transaction?: boolean;
};

export type MigrationFile = {
  path: string;
  kind: "create" | "modify";
  content: string;
  before?: string;
};

export type MigrationResponse = {
  plan: MigrationPlan;
  file: MigrationFile;
  applied: boolean;
};

export type CatalogOwnership = "user" | "managed" | "system";

/** `GET db/tables`: the fields the editor reads; the endpoint returns more. */
export type CatalogTable = {
  schema: string;
  name: string;
  kind: string;
  ownership: CatalogOwnership;
};

export type CatalogTableList = { tables: CatalogTable[] };

export type CatalogColumn = {
  ordinal: number;
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
};

export type CatalogTableDetail = {
  table: CatalogTable;
  columns: CatalogColumn[];
  primary_key: string[];
};

/* ---------- Hooks ---------- */

const base = "/_portal/api/db/sql";

export const sqlKeys = {
  templates: ["db", "sql", "templates"] as const,
  snippets: ["db", "sql", "snippets"] as const,
  history: ["db", "sql", "history"] as const,
  tables: ["db", "sql", "catalog", "tables"] as const,
  table: (schema: string, table: string) => ["db", "sql", "catalog", "table", schema, table] as const,
};

/** Don't retry what won't change by itself: not connected, not signed in, refused, or no database. */
function retry(count: number, err: Error) {
  if (err instanceof NotConnectedError) return false;
  if (err instanceof ApiError && err.status < 500) return false;
  return count < 1;
}

export function useSqlTemplates(enabled = true) {
  return useQuery({ queryKey: sqlKeys.templates, queryFn: () => apiFetch<TemplateList>(`${base}/templates`), enabled, staleTime: Infinity, retry });
}

export function useSnippets(enabled = true) {
  return useQuery({ queryKey: sqlKeys.snippets, queryFn: () => apiFetch<SnippetList>(`${base}/snippets`), enabled, staleTime: 10_000, retry });
}

export function useSqlHistory(enabled = true) {
  return useQuery({ queryKey: sqlKeys.history, queryFn: () => apiFetch<HistoryList>(`${base}/history`), enabled, staleTime: 10_000, retry });
}

/** Every table the catalog lists, for completion. */
export function useSqlCatalogTables(enabled = true) {
  return useQuery({ queryKey: sqlKeys.tables, queryFn: () => apiFetch<CatalogTableList>("/_portal/api/db/tables"), enabled, staleTime: 60_000, retry });
}

/** The columns of the tables the script mentions, one query each, cached per table. */
export function useSqlCatalogColumns(tables: CatalogTable[]) {
  return useQueries({
    queries: tables.map((t) => ({
      queryKey: sqlKeys.table(t.schema, t.name),
      queryFn: () => apiFetch<CatalogTableDetail>(`/_portal/api/db/tables/${encodeURIComponent(t.schema)}/${encodeURIComponent(t.name)}`),
      staleTime: 60_000,
      retry,
    })),
  });
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs a script; the server's SQL error is in the result, an HTTP problem (422 for an empty script or a BEGIN in rollback mode) throws. */
export function useRunSql() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: RunRequest) => apiFetch<RunResult>(`${base}/run`, { method: "POST", json: req }),
    onSettled: () => void qc.invalidateQueries({ queryKey: sqlKeys.history }),
  });
}

export function useExplainSql() {
  return useMutation({ mutationFn: (req: ExplainRequest) => apiFetch<ExplainResponse>(`${base}/explain`, { method: "POST", json: req }) });
}

export function useCheckSql() {
  return useMutation({ mutationFn: (sql: string) => apiFetch<CheckResponse>(`${base}/check`, { method: "POST", json: { sql } }) });
}

export function useSaveSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...req }: SnippetRequest & { name: string }) => apiFetch<Snippet>(`${base}/snippets/${encodeURIComponent(name)}`, { method: "PUT", json: req }),
    onSuccess: (s) => void qc.setQueryData<SnippetList>(sqlKeys.snippets, (old) => (old ? { snippets: upsert(old.snippets, s) } : old)),
    onError: (err) => toast.error("Couldn't save the snippet", { description: describe(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: sqlKeys.snippets }),
  });
}

function upsert(list: Snippet[], s: Snippet): Snippet[] {
  const rest = list.filter((x) => x.name !== s.name);
  return [...rest, s].sort((a, b) => (a.favorite !== b.favorite ? (a.favorite ? -1 : 1) : a.name.localeCompare(b.name)));
}

export function useDeleteSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch<{ deleted: boolean }>(`${base}/snippets/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: (_, name) => void qc.setQueryData<SnippetList>(sqlKeys.snippets, (old) => (old ? { snippets: old.snippets.filter((s) => s.name !== name) } : old)),
    onError: (err) => toast.error("Couldn't delete the snippet", { description: describe(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: sqlKeys.snippets }),
  });
}

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ cleared: boolean }>(`${base}/history`, { method: "DELETE" }),
    onSuccess: () => {
      qc.setQueryData<HistoryList>(sqlKeys.history, (old) => (old ? { ...old, history: [] } : old));
      toast.success("History cleared");
    },
    onError: (err) => toast.error("Couldn't clear the history", { description: describe(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: sqlKeys.history }),
  });
}

/** Previews (apply: false) or writes (apply: true) the script as a migration's Up section. */
export function useSaveMigration() {
  return useMutation({
    mutationFn: (req: MigrationRequest) => apiFetch<MigrationResponse>(`${base}/migration`, { method: "POST", json: req }),
  });
}
