"use client";

/**
 * The database catalog, DDL plans and migrations (Phase 4: Schema, Objects,
 * Migrations). Types match `cli/internal/pgmeta/catalog.go`, `ddl.go` and
 * `cli/internal/portal/db.go` field for field; hooks follow `queries.ts`.
 *
 * Every read is `GET /_portal/api/db/*` (404 `no_database` in a Minimal app,
 * 503 `database_unavailable` when PostgreSQL doesn't answer). Every change is
 * a migration: `POST db/ddl/plan` shows the SQL, `db/ddl/apply` writes the
 * file and queues `migrate`; `app/migrate`, `migrate-down` and `migrate-redo`
 * answer 202 and the outcome shows up in `db/migrations` a moment later.
 */

import { queryOptions, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, NotConnectedError, apiFetch } from "./client";
import { keys } from "./queries";
import type { Accepted, DevMigrations, GeneratorRequest, GeneratorResponse, Status } from "./types";

/* ---------- Catalog (pgmeta/catalog.go) ---------- */

export type DbSchema = {
  id: number;
  name: string;
  owner: string;
  comment: string | null;
  /** pg_catalog, information_schema and pg_* schemas. */
  system: boolean;
  has_extensions: boolean;
};

/** Who may change a table from the portal: the app's own, a gorbital module's, or a tool's. */
export type Ownership = "user" | "managed" | "system";

export type TableKind = "table" | "partitioned_table" | "view" | "materialized_view" | "foreign_table";

export type DbTable = {
  id: number;
  schema: string;
  name: string;
  kind: TableKind;
  is_partition: boolean;
  rls_enabled: boolean;
  rls_forced: boolean;
  /** The planner's estimate (0 when never analysed); `live_rows` is the collector's count. */
  row_estimate: number;
  live_rows: number;
  bytes: number;
  /** `bytes` for humans, such as "48 kB". */
  size: string;
  comment: string | null;
  owner: string;
  from_extension: boolean;
  ownership: Ownership;
};

export type DbColumn = {
  ordinal: number;
  name: string;
  /** As format_type prints it: "character varying(100)", "integer[]". */
  data_type: string;
  type_name: string;
  type_schema: string;
  is_array: boolean;
  enum_values?: string[];
  is_nullable: boolean;
  default_expr: string | null;
  generation_expr: string | null;
  /** "" (none), "a" (ALWAYS) or "d" (BY DEFAULT). */
  identity: string;
  /** "" (no), "s" (STORED) or "v" (VIRTUAL). */
  generated: string;
  comment: string | null;
  is_primary_key: boolean;
  is_unique: boolean;
  /** The tables the column references, as "schema.table". */
  fk_targets?: string[];
};

export type DbConstraint = {
  id: number;
  name: string;
  /** p (primary key), u (unique), f (foreign key), c (check) or x (exclusion). */
  type: "p" | "u" | "f" | "c" | "x";
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

export type DbIndex = {
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

export type DbTrigger = {
  id: number;
  name: string;
  /** The whole CREATE TRIGGER statement. */
  definition: string;
  /** origin, disabled, replica or always. */
  enabled: string;
  /** BEFORE, AFTER or INSTEAD OF. */
  timing: string;
  /** ROW or STATEMENT. */
  orientation: string;
  events: string[];
  function_schema: string;
  function_name: string;
};

export type DbEnum = {
  id: number;
  schema: string;
  name: string;
  values: string[];
  comment: string | null;
};

export type DbFunction = {
  id: number;
  schema: string;
  name: string;
  language: string;
  /** function, procedure, aggregate or window. */
  kind: string;
  /** For display; `identity_args` is what DROP FUNCTION needs. */
  args: string;
  identity_args: string;
  return_type: string | null;
  returns_set: boolean;
  volatility: string;
  security_definer: boolean;
  /** The whole CREATE FUNCTION statement; null for internal functions. */
  definition: string | null;
  comment: string | null;
  from_extension: boolean;
};

export type DbExtension = {
  name: string;
  default_version: string | null;
  installed_version: string | null;
  schema: string | null;
  comment: string | null;
  installed: boolean;
};

export type DbView = {
  id: number;
  schema: string;
  name: string;
  is_materialized: boolean;
  /** The SELECT the view is defined as. */
  definition: string;
  is_updatable: boolean;
  /** Only for materialized views. */
  is_populated: boolean | null;
  comment: string | null;
};

export type TableDetail = {
  table: DbTable;
  columns: DbColumn[];
  constraints: DbConstraint[];
  indexes: DbIndex[];
  triggers: DbTrigger[];
  /** The primary key's columns in order; empty without one. */
  primary_key: string[];
};

/** One edge of the schema graph. */
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

/** One file under db/migrations and whether the database has it. */
export type Migration = {
  version: number;
  name: string;
  /** Relative to the app; empty for a version in the table without a file. */
  path: string;
  sql: string;
  applied: boolean;
  applied_at: string | null;
  /** The file has a Down section, so it can be rolled back. */
  has_down: boolean;
};

/* ---------- DDL (pgmeta/ddl.go, portal/db.go) ---------- */

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
  | "drop_enum"
  | "comment"
  | "rls"
  | "create_extension"
  | "drop_extension"
  | "create_function"
  | "drop_function"
  | "create_trigger"
  | "drop_trigger"
  | "create_view"
  | "drop_view";

export type IndexSpec = {
  name?: string;
  /** Column names, or expressions in parentheses. */
  columns: string[];
  unique?: boolean;
  method?: string;
  where?: string;
  concurrently?: boolean;
};

/** One schema change; `kind` says which fields apply (the fields this phase uses). */
export type Change = {
  kind: ChangeKind;
  schema: string;
  table?: string;
  /** rename_enum_value: the new value (`value` is the old one). */
  new_name?: string;
  /** create_extension, drop_extension, create_function, create_trigger, drop_trigger, create_view, drop_view, create_enum, add_enum_value, rename_enum_value, drop_enum. */
  name?: string;
  /** create_index. */
  index?: IndexSpec;
  /** drop_index. */
  index_name?: string;
  /** create_enum. */
  values?: string[];
  /** add_enum_value, rename_enum_value. */
  value?: string;
  after?: string;
  /** create_function/create_trigger: the whole CREATE statement; create_view: the SELECT; drops: the current definition, for the Down. */
  definition?: string;
  /** drop_function and the Down of create_function: "name(argument types)". */
  signature?: string;
  /** create_view, drop_view. */
  materialized?: boolean;
};

export type DdlPlan = {
  summary: string;
  up: string[];
  down: string[];
  /** No complete Down (data loss, an enum value); `notes` say why. */
  irreversible: boolean;
  notes?: string[];
  /** goose runs the file outside a transaction (CREATE INDEX CONCURRENTLY, ADD VALUE). */
  no_transaction?: boolean;
};

export type DdlRequest = {
  change: Change;
  /** The migration's name; the summary's slug when empty. */
  name?: string;
  allow_dirty?: boolean;
};

export type DdlFile = {
  path: string;
  kind: "create" | "modify";
  content: string;
  before?: string;
};

export type DdlResponse = {
  plan: DdlPlan;
  file: DdlFile;
  applied: boolean;
};

export type MigrateAction = "migrate" | "migrate-down" | "migrate-redo";

/* ---------- Keys and helpers ---------- */

export const dbKeys = {
  all: ["db"] as const,
  schemas: ["db", "schemas"] as const,
  tables: (schemas: string[]) => ["db", "tables", ...schemas] as const,
  table: (schema: string, table: string) => ["db", "table", schema, table] as const,
  foreignKeys: (schemas: string[]) => ["db", "foreign-keys", ...schemas] as const,
  enums: (schemas: string[]) => ["db", "enums", ...schemas] as const,
  functions: (schemas: string[]) => ["db", "functions", ...schemas] as const,
  views: (schemas: string[]) => ["db", "views", ...schemas] as const,
  extensions: ["db", "extensions"] as const,
  migrations: ["db", "migrations"] as const,
  devMigrations: ["dev", "migrations"] as const,
};

/** `?schema=a&schema=b`; empty for "every non-system schema" (the backend's default). */
export function schemaQuery(schemas: string[]): string {
  const q = schemas.filter(Boolean).map((s) => `schema=${encodeURIComponent(s)}`);
  return q.length ? `?${q.join("&")}` : "";
}

const DB = "/_portal/api/db";

function retry(count: number, err: Error) {
  if (err instanceof NotConnectedError) return false;
  if (err instanceof ApiError && err.status < 500) return false;
  return count < 1;
}

/** The problem in one line, for toasts and inline errors. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.code}${err.detail ? `: ${err.detail}` : ""}`;
  return err instanceof Error ? err.message : String(err);
}

/* ---------- Reads ---------- */

/*
 * The Table Editor (db.ts) reads the same endpoints under the same keys, so
 * the cache must hold the same value for both: the response as the portal
 * sends it. Each hook picks its list with select. Caching the list here and
 * the response there made the Schema screen crash when opened from the Table
 * Editor ("(data ?? []).filter is not a function").
 */

/** The query of GET /db/schemas, shared with the Table Editor. */
export const schemasQuery = () =>
  queryOptions({
    queryKey: dbKeys.schemas,
    queryFn: () => apiFetch<{ schemas: DbSchema[] }>(`${DB}/schemas`),
    select: (r) => r.schemas,
  });

/** The query of GET /db/tables for schemas, shared with the Table Editor. */
export const tablesQuery = (schemas: string[]) =>
  queryOptions({
    queryKey: dbKeys.tables(schemas),
    queryFn: () => apiFetch<{ tables: DbTable[] }>(`${DB}/tables${schemaQuery(schemas)}`),
    select: (r) => r.tables,
  });

export function useSchemas(enabled = true) {
  return useQuery({ ...schemasQuery(), enabled, staleTime: 60_000, retry });
}

export function useTables(schemas: string[], enabled = true) {
  return useQuery({ ...tablesQuery(schemas), enabled: enabled && schemas.length > 0, staleTime: 15_000, retry });
}

export function useTableDetail(schema: string | undefined, table: string | undefined) {
  return useQuery({
    queryKey: dbKeys.table(schema ?? "", table ?? ""),
    queryFn: () => apiFetch<TableDetail>(`${DB}/tables/${encodeURIComponent(schema ?? "")}/${encodeURIComponent(table ?? "")}`),
    enabled: Boolean(schema && table),
    staleTime: 15_000,
    retry,
  });
}

/** One detail query per table, for the diagram's columns; results in the same order as `tables`. */
export function useTableDetails(tables: { schema: string; name: string }[]) {
  return useQueries({
    queries: tables.map((t) => ({
      queryKey: dbKeys.table(t.schema, t.name),
      queryFn: () => apiFetch<TableDetail>(`${DB}/tables/${encodeURIComponent(t.schema)}/${encodeURIComponent(t.name)}`),
      staleTime: 15_000,
      retry,
    })),
  });
}

export function useForeignKeys(schemas: string[], enabled = true) {
  return useQuery({
    queryKey: dbKeys.foreignKeys(schemas),
    queryFn: () => apiFetch<{ foreign_keys: ForeignKey[] }>(`${DB}/foreign-keys${schemaQuery(schemas)}`).then((r) => r.foreign_keys),
    enabled: enabled && schemas.length > 0,
    staleTime: 15_000,
    retry,
  });
}

export function useEnums(schemas: string[], enabled = true) {
  return useQuery({
    queryKey: dbKeys.enums(schemas),
    queryFn: () => apiFetch<{ enums: DbEnum[] }>(`${DB}/enums${schemaQuery(schemas)}`).then((r) => r.enums),
    enabled,
    staleTime: 15_000,
    retry,
  });
}

export function useFunctions(schemas: string[], enabled = true) {
  return useQuery({
    queryKey: dbKeys.functions(schemas),
    queryFn: () => apiFetch<{ functions: DbFunction[] }>(`${DB}/functions${schemaQuery(schemas)}`).then((r) => r.functions),
    enabled,
    staleTime: 15_000,
    retry,
  });
}

export function useViews(schemas: string[], enabled = true) {
  return useQuery({
    queryKey: dbKeys.views(schemas),
    queryFn: () => apiFetch<{ views: DbView[] }>(`${DB}/views${schemaQuery(schemas)}`).then((r) => r.views),
    enabled,
    staleTime: 15_000,
    retry,
  });
}

export function useExtensions(enabled = true) {
  return useQuery({
    queryKey: dbKeys.extensions,
    queryFn: () => apiFetch<{ extensions: DbExtension[] }>(`${DB}/extensions`).then((r) => r.extensions),
    enabled,
    staleTime: 15_000,
    retry,
  });
}

/** Every migration file, oldest first as the backend lists them. */
export function useMigrations(enabled = true) {
  return useQuery({
    queryKey: dbKeys.migrations,
    queryFn: fetchMigrations,
    enabled,
    staleTime: 5000,
    retry,
  });
}

function fetchMigrations() {
  return apiFetch<{ migrations: Migration[] }>(`${DB}/migrations`).then((r) => r.migrations);
}

/** `/_dev/migrations` through the proxy: the app's own view of current, latest and pending. */
export function useDevMigrations(enabled: boolean) {
  return useQuery({
    queryKey: dbKeys.devMigrations,
    queryFn: () => apiFetch<DevMigrations>("/_portal/app/_dev/migrations"),
    enabled,
    staleTime: 5000,
    retry,
  });
}

/* ---------- Writes ---------- */

/** A fingerprint of the applied state, to notice when a queued command has run. */
export function migrationsFingerprint(list: Migration[]): string {
  return list.map((m) => `${m.version}:${m.applied ? 1 : 0}`).join(",");
}

/**
 * After a 202 the supervisor runs the command in its own time. Polls
 * `db/migrations` every second for up to `timeoutMs` until the applied
 * state differs from `before` (or the status reports a problem), then
 * invalidates every `db` query. Resolves with the list, or null on timeout.
 */
export async function waitForMigrations(qc: QueryClient, before: string, timeoutMs = 12_000): Promise<Migration[] | null> {
  const started = Date.now();
  let result: Migration[] | null = null;
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const list = await fetchMigrations();
      if (migrationsFingerprint(list) !== before) {
        result = list;
        break;
      }
      const status = qc.getQueryData<Status>(keys.status);
      if (status?.app.problem) break;
    } catch {
      // The portal may be busy; keep polling until the timeout.
    }
  }
  await Promise.all([qc.invalidateQueries({ queryKey: dbKeys.all }), qc.invalidateQueries({ queryKey: dbKeys.devMigrations }), qc.invalidateQueries({ queryKey: keys.status })]);
  return result;
}

const migrateLabel: Record<MigrateAction, string> = { migrate: "Applying pending migrations", "migrate-down": "Rolling back the last migration", "migrate-redo": "Redoing the last migration" };

/**
 * `POST /_portal/api/app/migrate|migrate-down|migrate-redo`: 202 at once,
 * then the hook polls `db/migrations` until the change lands and refetches.
 * 409 while a previous command is still handled, or for apps without a database.
 */
export function useMigrateAction(action: MigrateAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const before = migrationsFingerprint(qc.getQueryData<Migration[]>(dbKeys.migrations) ?? []);
      const accepted = await apiFetch<Accepted>(`/_portal/api/app/${action}`, { method: "POST" });
      toast.message(migrateLabel[action], { description: "orb dev runs cmd/migrate; the list refreshes when it finishes" });
      const after = await waitForMigrations(qc, before);
      const status = qc.getQueryData<Status>(keys.status);
      return { accepted, after, problem: status?.app.problem };
    },
    onSuccess: ({ after, problem }) => {
      if (problem) toast.error("Migration failed", { description: problem });
      else if (after) toast.success(`${migrateLabel[action].replace(/ing\b/, "ed")}`);
      else toast.message("Still running", { description: "the migrations list refreshes when orb dev reports back" });
    },
    onError: (err) => toast.error(`Couldn't ${action.replace("-", " ")}`, { description: describeError(err) }),
  });
}

/** `POST db/ddl/plan`: the SQL a change becomes, without writing anything. */
export function useDdlPlan() {
  return useMutation({
    mutationFn: (req: DdlRequest) => apiFetch<DdlResponse>(`${DB}/ddl/plan`, { method: "POST", json: req }),
  });
}

/** `POST db/ddl/apply`: writes the migration, queues migrate, then waits for it to land and refetches. */
export function useDdlApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: DdlRequest) => {
      const before = migrationsFingerprint(qc.getQueryData<Migration[]>(dbKeys.migrations) ?? []);
      const res = await apiFetch<DdlResponse>(`${DB}/ddl/apply`, { method: "POST", json: req });
      const after = await waitForMigrations(qc, before);
      const status = qc.getQueryData<Status>(keys.status);
      return { ...res, landed: after !== null, problem: status?.app.problem };
    },
    onSuccess: (res) => {
      if (res.problem) toast.error("Migration failed", { description: res.problem });
      else toast.success(res.plan.summary, { description: res.landed ? `${res.file.path} applied` : `${res.file.path} written; waiting for orb dev` });
    },
    onError: (err) => toast.error("Couldn't apply the change", { description: describeError(err) }),
  });
}

/** The `migration` generator: plan or apply an empty migration file named `name`. */
export function useMigrationGenerator(apply: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: GeneratorRequest<{ name: string }>) => apiFetch<GeneratorResponse>(`/_portal/api/generators/migration/${apply ? "apply" : "plan"}`, { method: "POST", json: req }),
    onSuccess: (res) => {
      if (!apply) return;
      toast.success("Migration file written", { description: res.plan.changes[0]?.path });
      void qc.invalidateQueries({ queryKey: dbKeys.all });
      void qc.invalidateQueries({ queryKey: dbKeys.devMigrations });
    },
    onError: (err) => {
      if (apply) toast.error("Couldn't write the migration", { description: describeError(err) });
    },
  });
}
