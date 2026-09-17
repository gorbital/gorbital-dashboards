/**
 * The SQL editor's endpoints in mock mode (`/_portal/api/db/sql/*`), and the
 * two catalog reads its completion needs, answered from memory: a few
 * templates, two snippets, a history that grows as you run, plausible
 * results for SELECT and UPDATE, a server error for any script that says
 * "boom", and a small plan for explain. Registered from `mock/index.ts` with
 * one dispatch line.
 */
import type { CatalogColumn, CatalogTable, Cell, ExplainResponse, HistoryEntry, MigrationRequest, MigrationResponse, PlanNode, RunMode, RunRequest, RunResult, Snippet, SnippetRequest, StatementResult, Template, Warning } from "../sql";
import type { Problem } from "../types";
import { emitSchemaStatus } from "./schema";

/* ---------- Sample data ---------- */

const catalog: { table: CatalogTable; columns: CatalogColumn[] }[] = [
  {
    table: { schema: "public", name: "users", kind: "table", ownership: "user" },
    columns: cols(["id", "text", true], ["email", "text"], ["name", "text"], ["role", "text"], ["created_at", "timestamptz"], ["last_seen_at", "timestamptz", false, true]),
  },
  {
    table: { schema: "public", name: "orgs", kind: "table", ownership: "user" },
    columns: cols(["id", "text", true], ["slug", "text"], ["name", "text"], ["plan", "text"], ["created_at", "timestamptz"]),
  },
  {
    table: { schema: "public", name: "org_members", kind: "table", ownership: "user" },
    columns: cols(["org_id", "text", true], ["user_id", "text", true], ["role", "text"], ["joined_at", "timestamptz"]),
  },
  {
    table: { schema: "public", name: "projects", kind: "table", ownership: "user" },
    columns: cols(["id", "text", true], ["owner_id", "text"], ["name", "text"], ["description", "text", false, true], ["status", "text"], ["version", "integer"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"]),
  },
  {
    table: { schema: "public", name: "sessions", kind: "table", ownership: "managed" },
    columns: cols(["id", "text", true], ["user_id", "text"], ["expires_at", "timestamptz"], ["created_at", "timestamptz"]),
  },
  {
    table: { schema: "public", name: "audit_events", kind: "table", ownership: "managed" },
    columns: cols(["id", "bigint", true], ["occurred_at", "timestamptz"], ["action", "text"], ["actor_kind", "text"], ["actor_id", "text", false, true], ["target_kind", "text"], ["target_id", "text"]),
  },
  {
    table: { schema: "public", name: "river_job", kind: "table", ownership: "system" },
    columns: cols(["id", "bigint", true], ["kind", "text"], ["queue", "text"], ["state", "text"], ["attempt", "smallint"], ["max_attempts", "smallint"], ["scheduled_at", "timestamptz"], ["finalized_at", "timestamptz", false, true]),
  },
  {
    table: { schema: "public", name: "goose_db_version", kind: "table", ownership: "system" },
    columns: cols(["id", "integer", true], ["version_id", "bigint"], ["is_applied", "boolean"], ["tstamp", "timestamp"]),
  },
];

function cols(...defs: [name: string, type: string, pk?: boolean, nullable?: boolean][]): CatalogColumn[] {
  return defs.map(([name, data_type, pk = false, nullable = false], i) => ({ ordinal: i + 1, name, data_type, is_nullable: nullable, is_primary_key: pk }));
}

const templates: Template[] = [
  {
    name: "Table sizes",
    description: "Every table with its rows and size, largest first",
    sql: "SELECT n.nspname AS schema, c.relname AS table,\n       GREATEST(c.reltuples, 0)::bigint AS row_estimate,\n       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size\nFROM pg_class c\nJOIN pg_namespace n ON n.oid = c.relnamespace\nWHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')\nORDER BY pg_total_relation_size(c.oid) DESC\nLIMIT 50;",
  },
  {
    name: "Index usage",
    description: "Indexes and how often they were used; unused ones are candidates to drop",
    sql: "SELECT schemaname AS schema, relname AS table, indexrelname AS index,\n       idx_scan AS scans, pg_size_pretty(pg_relation_size(indexrelid)) AS size\nFROM pg_stat_user_indexes\nORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC\nLIMIT 50;",
  },
  {
    name: "Active connections",
    description: "Every connection, what it runs and for how long",
    sql: "SELECT pid, usename AS user, application_name, state,\n       now() - query_start AS running_for, left(query, 120) AS query\nFROM pg_stat_activity\nWHERE datname = current_database() AND pid <> pg_backend_pid()\nORDER BY query_start;",
  },
  {
    name: "Slow queries",
    description: "The statements that took the most time in all (needs pg_stat_statements)",
    needs: "pg_stat_statements",
    sql: "SELECT calls, round(total_exec_time::numeric, 1) AS total_ms, round(mean_exec_time::numeric, 2) AS mean_ms,\n       rows, left(query, 120) AS query\nFROM pg_stat_statements\nORDER BY total_exec_time DESC\nLIMIT 25;",
  },
  {
    name: "River queues",
    description: "Background jobs by queue and state",
    sql: "SELECT queue, state, count(*) AS jobs, min(scheduled_at) AS oldest\nFROM river_job\nGROUP BY queue, state\nORDER BY queue, state;",
  },
  {
    name: "Failed jobs",
    description: "The most recent job errors",
    sql: "SELECT id, kind, queue, state, attempt, max_attempts, finalized_at\nFROM river_job\nWHERE state IN ('retryable', 'discarded')\nORDER BY finalized_at DESC NULLS LAST\nLIMIT 25;",
  },
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const initialSnippets = (): Snippet[] => [
  { name: "active-projects", sql: "-- Projects that changed this week, busiest owners first\nSELECT p.owner_id, count(*) AS projects, max(p.updated_at) AS last_change\nFROM projects p\nWHERE p.status = 'active' AND p.updated_at > now() - interval '7 days'\nGROUP BY p.owner_id\nORDER BY projects DESC\nLIMIT 20;\n", favorite: true, modified: minutesAgo(3 * 60), path: "db/queries/active-projects.sql" },
  { name: "users-by-signup", sql: "SELECT date_trunc('day', created_at) AS day, count(*) AS signups\nFROM users\nGROUP BY 1\nORDER BY 1 DESC\nLIMIT 30;\n", favorite: false, modified: minutesAgo(2 * 24 * 60), path: "db/queries/users-by-signup.sql" },
];

const initialHistory = (): HistoryEntry[] => [
  { time: minutesAgo(4), sql: "SELECT * FROM projects WHERE status = 'active' LIMIT 50;", mode: "rollback", duration_ms: 3.4, rows: 50 },
  { time: minutesAgo(12), sql: "UPDATE projects SET status = 'archived' WHERE updated_at < now() - interval '90 days';", mode: "rollback", duration_ms: 8.1, rows: 0 },
  { time: minutesAgo(26), sql: "SELECT * FROM boom;", mode: "rollback", duration_ms: 0.6, rows: 0, error: 'relation "boom" does not exist' },
  { time: minutesAgo(41), sql: "SELECT queue, state, count(*) FROM river_job GROUP BY 1, 2;", mode: "readonly", duration_ms: 2.2, rows: 4 },
];

let snippets = initialSnippets();
let history = initialHistory();
let migrationVersion = 14;

/** Back to the first state; tests call it between cases. */
export function resetSqlMock() {
  snippets = initialSnippets();
  history = initialHistory();
  migrationVersion = 14;
}

/* ---------- Check (a port of pgmeta.Check) ---------- */

const rules: { kind: Warning["kind"]; message: string; re: RegExp; noWhere?: boolean }[] = [
  { kind: "drop", message: "drops a database object", re: /^\s*DROP\s+(TABLE|SCHEMA|DATABASE|INDEX|TYPE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|SEQUENCE|TRIGGER|EXTENSION)\b/i },
  { kind: "truncate", message: "removes every row of the table", re: /^\s*TRUNCATE\b/i },
  { kind: "drop_column", message: "drops a column and its values", re: /^\s*ALTER\s+TABLE\b.*\bDROP\s+(COLUMN\s+)?(IF\s+EXISTS\s+)?"?[A-Za-z_]/i },
  { kind: "delete_without_where", message: "deletes every row of the table (no WHERE)", re: /^\s*DELETE\s+FROM\b/i, noWhere: true },
  { kind: "update_without_where", message: "updates every row of the table (no WHERE)", re: /^\s*UPDATE\b/i, noWhere: true },
  { kind: "alter_type", message: "changes a column's type, converting every value", re: /^\s*ALTER\s+TABLE\b.*\b(SET\s+DATA\s+)?TYPE\b/i },
];

const blank = (s: string) => s.replace(/[^\n]/g, " ");

export function checkScript(script: string): Warning[] {
  const clean = script.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, blank).replace(/'(?:[^']|'')*'/g, blank);
  const out: Warning[] = [];
  let offset = 0;
  for (const stmt of clean.split(";")) {
    const line = 1 + (clean.slice(0, offset).match(/\n/g)?.length ?? 0);
    offset += stmt.length + 1;
    const flat = stmt.split(/\s+/).filter(Boolean).join(" ");
    if (!flat) continue;
    const leading = /^[ \t\r]*\n/.test(stmt) ? (stmt.match(/^\s*/)?.[0].match(/\n/g)?.length ?? 0) : 0;
    for (const r of rules) {
      if (!r.re.test(flat) || (r.noWhere && /\bWHERE\b/i.test(flat))) continue;
      out.push({ kind: r.kind, message: r.message, line: line + leading });
    }
  }
  return out;
}

/* ---------- Run ---------- */

const txControl = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|END)\b/im;

/** Sample rows per table; every table has ids, timestamps and one NULL somewhere. */
function sampleRows(table: string, n: number): { columns: string[]; rows: Cell[][] } {
  const entry = catalog.find((c) => c.table.name === table);
  const columns = entry ? entry.columns.map((c) => c.name) : ["id", "value"];
  const rows: Cell[][] = [];
  for (let i = 0; i < n; i++) {
    rows.push(
      columns.map((c, j) => {
        const col = entry?.columns[j];
        if (col?.is_nullable && i % 3 === 1) return null;
        if (c === "id") return table === "projects" ? `prj_${(1000 + i).toString(36).padStart(8, "x")}` : String(i + 1);
        if (c.endsWith("_id")) return `${c.slice(0, 3)}_${(2000 + i).toString(36).padStart(8, "y")}`;
        if (c.endsWith("_at") || c === "tstamp") return new Date(Date.now() - (i + 1) * 3_600_000).toISOString().replace("T", " ").replace("Z", "+00");
        if (c === "status") return i % 4 === 3 ? "archived" : "active";
        if (c === "state") return ["completed", "available", "retryable", "discarded"][i % 4];
        if (c === "queue") return "default";
        if (c === "kind") return ["mail.Send", "audit.Rotate", "projects.Reindex"][i % 3];
        if (c === "email") return `user${i + 1}@example.com`;
        if (c === "name") return table === "projects" ? ["Website redesign", "Mobile app", "Billing v2", "Data warehouse"][i % 4] : `User ${i + 1}`;
        if (c === "role") return i === 0 ? "owner" : "member";
        if (c === "plan") return "team";
        if (c === "slug") return `org-${i + 1}`;
        if (c === "description") return "A project.";
        if (c === "action") return ["project.created", "user.signed_in", "invite.sent"][i % 3];
        if (col?.data_type === "boolean") return i % 2 ? "t" : "f";
        if (col?.data_type.match(/int/)) return String(i + 1);
        return `${c} ${i + 1}`;
      }),
    );
  }
  return { columns, rows };
}

function runStatement(stmt: string, limit: number): StatementResult {
  const flat = stmt.trim().replace(/\s+/g, " ");
  const verb = (flat.split(" ")[0] ?? "").toUpperCase();
  const tableMatch = /\b(?:FROM|UPDATE|INTO|TABLE)\s+(?:ONLY\s+)?(?:"?public"?\.)?"?([A-Za-z_][\w]*)"?/i.exec(flat);
  const table = tableMatch?.[1]?.toLowerCase();
  const known = table ? catalog.find((c) => c.table.name === table) : undefined;
  switch (verb) {
    case "SELECT":
    case "WITH":
    case "TABLE": {
      if (!known) {
        if (/^SELECT\s+(\d+)/i.test(flat)) return { command: "SELECT 1", columns: ["?column?"], rows: [[/^SELECT\s+(\d+)/i.exec(flat)![1]]], rows_affected: 1 };
        if (/now\(\)/i.test(flat)) return { command: "SELECT 1", columns: ["now"], rows: [[new Date().toISOString().replace("T", " ").replace("Z", "+00")]], rows_affected: 1 };
        if (/pg_class|pg_stat|pg_namespace/i.test(flat)) {
          const rows = catalog.map((c, i): Cell[] => ["public", c.table.name, String((i + 1) * 137), `${(i + 1) * 48} kB`]);
          return { command: `SELECT ${rows.length}`, columns: ["schema", "table", "row_estimate", "total_size"], rows, rows_affected: rows.length };
        }
        return { command: "SELECT 0", columns: ["?column?"], rows: [], rows_affected: 0 };
      }
      const total = known.table.name === "audit_events" ? 1_200 : known.table.name === "river_job" ? 640 : 23;
      const wanted = /\bLIMIT\s+(\d+)/i.exec(flat) ? Math.min(total, Number(/\bLIMIT\s+(\d+)/i.exec(flat)![1])) : total;
      const groupBy = /\bGROUP BY\b/i.test(flat);
      if (groupBy) {
        const rows: Cell[][] = [
          ["default", "completed", "512", "2026-09-10 08:00:00+00"],
          ["default", "available", "3", "2026-09-16 09:12:00+00"],
          ["default", "retryable", "2", "2026-09-15 22:40:00+00"],
          ["mail", "discarded", "1", null],
        ];
        return { command: `SELECT ${rows.length}`, columns: ["queue", "state", "jobs", "oldest"], rows, rows_affected: rows.length };
      }
      const { columns, rows } = sampleRows(known.table.name, Math.min(wanted, limit + 1));
      const truncated = rows.length > limit;
      return { command: `SELECT ${wanted}`, columns, rows: truncated ? rows.slice(0, limit) : rows, rows_affected: wanted, truncated: truncated || undefined };
    }
    case "INSERT":
      return { command: "INSERT 0 1", rows_affected: 1 };
    case "UPDATE":
      return { command: `UPDATE ${/\bWHERE\b/i.test(flat) ? 3 : 23}`, rows_affected: /\bWHERE\b/i.test(flat) ? 3 : 23 };
    case "DELETE":
      return { command: `DELETE ${/\bWHERE\b/i.test(flat) ? 1 : 23}`, rows_affected: /\bWHERE\b/i.test(flat) ? 1 : 23 };
    case "CREATE":
    case "ALTER":
    case "DROP":
    case "TRUNCATE":
      return { command: `${verb} ${(flat.split(" ")[1] ?? "").toUpperCase()}`.trim(), rows_affected: 0 };
    case "EXPLAIN": {
      const rows = ["Seq Scan on projects  (cost=0.00..15.80 rows=480 width=120)"].map((l): Cell[] => [l]);
      return { command: "EXPLAIN", columns: ["QUERY PLAN"], rows, rows_affected: 1 };
    }
    default:
      return { command: verb || "SELECT 0", rows_affected: 0 };
  }
}

/** Splits on semicolons outside strings and comments; keeps each statement's starting offset. */
function splitStatements(sql: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let start = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === "-" && next === "-") inLineComment = true;
    else if (ch === "/" && next === "*") inBlockComment = true;
    else if (ch === ";") {
      out.push({ text: sql.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  if (sql.slice(start).trim()) out.push({ text: sql.slice(start), offset: start });
  return out.filter((s) => s.text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, "").trim());
}

function run(req: RunRequest): RunResult | Problem {
  const mode: RunMode = req.mode ?? "rollback";
  if (!["rollback", "commit", "readonly"].includes(mode)) return problem(422, "invalid_input", "pgmeta: invalid input: mode is rollback, commit or readonly");
  if (!req.sql.trim()) return problem(422, "invalid_input", "pgmeta: invalid input: the script is empty");
  if (mode !== "commit" && txControl.test(req.sql)) return problem(422, "invalid_input", "pgmeta: the script controls its own transaction (BEGIN, COMMIT, ROLLBACK, END); run it in commit mode");
  const limit = Math.min(req.row_limit && req.row_limit > 0 ? req.row_limit : 500, 10_000);
  const out: RunResult = { mode, statements: [], committed: false, rolled_back: false, duration_ms: 0, warnings: checkScript(req.sql) };
  const start = performance.now();
  for (const s of splitStatements(req.sql)) {
    const boom = /\bboom\b/i.exec(s.text);
    if (boom) {
      const position = s.offset + boom.index + 1;
      out.error = { message: 'relation "boom" does not exist', code: "42P01", position, line: 1 + (req.sql.slice(0, position - 1).match(/\n/g)?.length ?? 0) };
      out.rolled_back = true;
      break;
    }
    const syntax = /\bSELEC\b|\bFORM\b|\bWHER\b/i.exec(s.text);
    if (syntax) {
      const position = s.offset + syntax.index + 1;
      out.error = { message: `syntax error at or near "${syntax[0]}"`, code: "42601", position, line: 1 + (req.sql.slice(0, position - 1).match(/\n/g)?.length ?? 0) };
      out.rolled_back = true;
      break;
    }
    if (mode === "readonly" && /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(s.text)) {
      const position = s.offset + (s.text.match(/^\s*/)?.[0].length ?? 0) + 1;
      out.error = { message: "cannot execute UPDATE in a read-only transaction", code: "25006", position, line: 1 + (req.sql.slice(0, position - 1).match(/\n/g)?.length ?? 0), hint: "Run it in rollback mode to see what it would do, or commit mode to keep it." };
      out.rolled_back = true;
      break;
    }
    out.statements.push(runStatement(s.text, limit));
  }
  out.duration_ms = Math.round((performance.now() - start + 1.5 + Math.random() * 6) * 1000) / 1000;
  if (!out.error) {
    if (mode === "commit") out.committed = true;
    else out.rolled_back = true;
  }
  // A committed DDL: orb dev notices the schema changed and says so on the events stream.
  if (out.committed && out.statements.some((st) => /^(CREATE|ALTER|DROP)\b/i.test(st.command))) emitSchemaStatus("sql");
  const last = out.statements.at(-1);
  history = [{ time: new Date().toISOString(), sql: req.sql, mode, duration_ms: out.duration_ms, rows: last?.rows?.length ?? 0, error: out.error?.message }, ...history].slice(0, 500);
  return out;
}

/* ---------- Explain ---------- */

function explain(sql: string, analyze: boolean): ExplainResponse | Problem {
  if (!sql.trim()) return problem(422, "invalid_input", "pgmeta: invalid input: the statement is empty");
  if (txControl.test(sql)) return problem(422, "invalid_input", "pgmeta: the script controls its own transaction (BEGIN, COMMIT, ROLLBACK, END); run it in commit mode");
  if (/\bboom\b/i.test(sql)) return problem(422, "invalid_input", 'pgmeta: invalid input: relation "boom" does not exist');
  const table = /\bFROM\s+(?:"?public"?\.)?"?([A-Za-z_][\w]*)"?/i.exec(sql)?.[1] ?? "projects";
  const hasWhere = /\bWHERE\b/i.test(sql);
  const hasOrder = /\bORDER BY\b/i.test(sql);
  const actual = (rows: number, ms: number): Partial<PlanNode> => (analyze ? { "Actual Startup Time": ms / 4, "Actual Total Time": ms, "Actual Rows": rows, "Actual Loops": 1 } : {});
  const scan: PlanNode = {
    "Node Type": "Seq Scan",
    "Parent Relationship": hasOrder ? "Outer" : undefined,
    "Relation Name": table,
    Schema: "public",
    Alias: table,
    "Startup Cost": 0,
    "Total Cost": 15.8,
    "Plan Rows": hasWhere ? 120 : 480,
    "Plan Width": 120,
    Output: ["id", "name", "status", "updated_at"],
    ...(hasWhere ? { Filter: "(status = 'active'::text)", "Rows Removed by Filter": analyze ? 360 : undefined } : {}),
    ...actual(hasWhere ? 118 : 480, 0.42),
  };
  const sort: PlanNode = {
    "Node Type": "Sort",
    "Startup Cost": 21.3,
    "Total Cost": 21.6,
    "Plan Rows": hasWhere ? 120 : 480,
    "Plan Width": 120,
    "Sort Key": ["updated_at DESC"],
    Output: ["id", "name", "status", "updated_at"],
    ...(analyze ? { "Sort Method": "quicksort", "Sort Space Used": 41, "Sort Space Type": "Memory" } : {}),
    ...actual(hasWhere ? 118 : 480, 0.71),
    Plans: [scan],
  };
  const limit: PlanNode = {
    "Node Type": "Limit",
    "Startup Cost": 21.3,
    "Total Cost": 21.4,
    "Plan Rows": 20,
    "Plan Width": 120,
    Output: ["id", "name", "status", "updated_at"],
    ...actual(20, 0.74),
    Plans: [hasOrder ? sort : scan],
  };
  const root = /\bLIMIT\b/i.test(sql) ? limit : hasOrder ? sort : scan;
  return { plan: [{ Plan: root, ...(analyze ? { "Planning Time": 0.093, "Execution Time": 0.812, Triggers: [] } : { "Planning Time": 0.081 }) }] };
}

/* ---------- Migration ---------- */

function migration(req: MigrationRequest): MigrationResponse | Problem {
  if (!req.sql.trim()) return problem(422, "invalid_input", "the migration is empty");
  const slug = req.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  if (!slug) return problem(422, "invalid_input", "the migration needs a name");
  const version = String(migrationVersion).padStart(4, "0");
  const content = `-- ${req.name.trim().replace(/\n/g, " ")}.\n--\n-- Written from the Dev Portal's SQL editor. Change this migration freely\n-- until it is released; afterwards, add a new one.\n\n-- +goose Up\n${req.sql.replace(/\n+$/, "")}\n`;
  const out: MigrationResponse = { plan: { summary: req.name, up: [req.sql.trim()], down: null, irreversible: false }, file: { path: `db/migrations/${version}_${slug}.sql`, kind: "create", content }, applied: false };
  if (req.apply) {
    if (!req.allow_dirty) return problem(500, "database_error", "the git repository has uncommitted changes; commit them or allow a dirty tree");
    migrationVersion++;
    out.applied = true;
  }
  return out;
}

/* ---------- Responses ---------- */

function problem(status: number, code: string, detail: string): Problem {
  return { title: { 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 500: "Internal Server Error" }[status] ?? "Error", status, code, detail };
}

const isProblem = (v: unknown): v is Problem => typeof v === "object" && v !== null && "status" in v && "code" in v && !("mode" in v) && !("plan" in v);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function problemResponse(p: Problem): Response {
  return new Response(JSON.stringify(p), { status: p.status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

const reply = (v: unknown) => (isProblem(v) ? problemResponse(v) : json(v));

function parse<T>(body: RequestInit["body"]): T | Problem {
  try {
    return JSON.parse(typeof body === "string" ? body : "{}") as T;
  } catch {
    return problem(400, "invalid_json", "the body must be JSON");
  }
}

const snippetName = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/**
 * Answers the SQL editor's paths and the catalog reads it needs; returns
 * undefined for anything else so `mockFetch` can go on to its 404.
 */
export function mockSqlFetch(path: string, method: string, init: RequestInit): Response | undefined {
  if (path === "/_portal/api/db/tables" && method === "GET") return json({ tables: catalog.map((c) => c.table) });
  const table = /^\/_portal\/api\/db\/tables\/([^/]+)\/([^/]+)$/.exec(path);
  if (table && method === "GET") {
    const entry = catalog.find((c) => c.table.schema === decodeURIComponent(table[1]) && c.table.name === decodeURIComponent(table[2]));
    if (!entry) return problemResponse(problem(404, "not_found", `pgmeta: not found: no table ${table[1]}.${table[2]}`));
    return json({ table: entry.table, columns: entry.columns, constraints: [], indexes: [], triggers: [], primary_key: entry.columns.filter((c) => c.is_primary_key).map((c) => c.name) });
  }
  if (!path.startsWith("/_portal/api/db/sql/")) return undefined;
  const sub = path.slice("/_portal/api/db/sql/".length);

  if (sub === "templates" && method === "GET") return json({ templates });
  if (sub === "check" && method === "POST") {
    const body = parse<{ sql?: string }>(init.body);
    return isProblem(body) ? problemResponse(body) : json({ warnings: checkScript(body.sql ?? "") });
  }
  if (sub === "run" && method === "POST") {
    const body = parse<RunRequest>(init.body);
    return isProblem(body) ? problemResponse(body) : reply(run({ sql: body.sql ?? "", mode: body.mode, row_limit: body.row_limit, timeout_seconds: body.timeout_seconds }));
  }
  if (sub === "explain" && method === "POST") {
    const body = parse<{ sql?: string; analyze?: boolean }>(init.body);
    return isProblem(body) ? problemResponse(body) : reply(explain(body.sql ?? "", Boolean(body.analyze)));
  }
  if (sub === "snippets" && method === "GET") return json({ snippets });
  const snippet = /^snippets\/([^/]+)$/.exec(sub);
  if (snippet) {
    const name = decodeURIComponent(snippet[1]);
    if (!snippetName.test(name)) return problemResponse(problem(422, "invalid_input", "portal: a snippet name is 1 to 80 letters, digits, hyphens or underscores"));
    if (method === "PUT") {
      const body = parse<SnippetRequest>(init.body);
      if (isProblem(body)) return problemResponse(body);
      const s: Snippet = { name, sql: body.sql ?? "", favorite: Boolean(body.favorite), modified: new Date().toISOString(), path: `db/queries/${name}.sql` };
      snippets = [...snippets.filter((x) => x.name !== name), s].sort((a, b) => (a.favorite !== b.favorite ? (a.favorite ? -1 : 1) : a.name.localeCompare(b.name)));
      return json(s);
    }
    if (method === "DELETE") {
      snippets = snippets.filter((x) => x.name !== name);
      return json({ deleted: true });
    }
  }
  if (sub === "history" && method === "GET") return json({ history, max: 500 });
  if (sub === "history" && method === "DELETE") {
    history = [];
    return json({ cleared: true });
  }
  if (sub === "migration" && method === "POST") {
    const body = parse<MigrationRequest>(init.body);
    return isProblem(body) ? problemResponse(body) : reply(migration({ name: body.name ?? "", sql: body.sql ?? "", apply: body.apply, allow_dirty: body.allow_dirty }));
  }
  return problemResponse(problem(404, "not_found", `no portal endpoint ${method} ${path}`));
}
