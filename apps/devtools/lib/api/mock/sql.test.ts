import { beforeEach, describe, expect, it } from "vitest";
import type { ExplainResponse, HistoryList, RunResult, Snippet, SnippetList } from "../sql";
import { checkScript, mockSqlFetch, resetSqlMock } from "./sql";

const post = (path: string, body: unknown, method = "POST") => mockSqlFetch(path, method, { method, body: JSON.stringify(body) })!;
const get = (path: string) => mockSqlFetch(path, "GET", {})!;

describe("mock sql", () => {
  beforeEach(() => resetSqlMock());

  it("runs a SELECT with rows and records it in the history", async () => {
    const res = await post("/_portal/api/db/sql/run", { sql: "SELECT * FROM projects LIMIT 5" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RunResult;
    expect(body.mode).toBe("rollback");
    expect(body.rolled_back).toBe(true);
    expect(body.statements[0].columns).toContain("name");
    expect(body.statements[0].rows).toHaveLength(5);
    expect(body.error).toBeUndefined();
    const history = (await get("/_portal/api/db/sql/history").json()) as HistoryList;
    expect(history.history[0].sql).toBe("SELECT * FROM projects LIMIT 5");
    expect(history.history[0].rows).toBe(5);
  });

  it("truncates at the row limit", async () => {
    const body = (await post("/_portal/api/db/sql/run", { sql: "SELECT * FROM audit_events", row_limit: 100 }).json()) as RunResult;
    expect(body.statements[0].rows).toHaveLength(100);
    expect(body.statements[0].truncated).toBe(true);
  });

  it("answers an error with its line for a script that says boom, as data", async () => {
    const res = post("/_portal/api/db/sql/run", { sql: "SELECT 1;\nSELECT * FROM boom;" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RunResult;
    expect(body.error?.code).toBe("42P01");
    expect(body.error?.line).toBe(2);
    expect(body.statements).toHaveLength(1);
    expect(body.rolled_back).toBe(true);
  });

  it("refuses an empty script and a BEGIN outside commit mode with 422", async () => {
    expect(post("/_portal/api/db/sql/run", { sql: "  " }).status).toBe(422);
    const res = post("/_portal/api/db/sql/run", { sql: "BEGIN; SELECT 1; COMMIT;" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { detail: string }).detail).toMatch(/commit mode/);
    expect(post("/_portal/api/db/sql/run", { sql: "BEGIN; SELECT 1; COMMIT;", mode: "commit" }).status).toBe(200);
  });

  it("commits in commit mode and carries the warnings", async () => {
    const body = (await post("/_portal/api/db/sql/run", { sql: "UPDATE projects SET status = 'x'", mode: "commit" }).json()) as RunResult;
    expect(body.committed).toBe(true);
    expect(body.statements[0].command).toBe("UPDATE 23");
    expect(body.warnings).toEqual([{ kind: "update_without_where", message: "updates every row of the table (no WHERE)", line: 1 }]);
  });

  it("checks scripts like the server", () => {
    expect(checkScript("SELECT 1;\n\nDROP TABLE users;\nDELETE FROM x WHERE id = 1;\nDELETE FROM y;")).toEqual([
      { kind: "drop", message: "drops a database object", line: 3 },
      { kind: "delete_without_where", message: "deletes every row of the table (no WHERE)", line: 5 },
    ]);
    expect(checkScript("SELECT 'DROP TABLE x' -- TRUNCATE y")).toEqual([]);
  });

  it("explains with a small plan, and actual figures when analyzed", async () => {
    const plain = (await post("/_portal/api/db/sql/explain", { sql: "SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC LIMIT 20" }).json()) as ExplainResponse;
    expect(plain.plan[0].Plan["Node Type"]).toBe("Limit");
    expect(plain.plan[0].Plan.Plans?.[0]["Node Type"]).toBe("Sort");
    expect(plain.plan[0]["Execution Time"]).toBeUndefined();
    const analyzed = (await post("/_portal/api/db/sql/explain", { sql: "SELECT * FROM users", analyze: true }).json()) as ExplainResponse;
    expect(analyzed.plan[0].Plan["Actual Rows"]).toBe(480);
    expect(analyzed.plan[0]["Execution Time"]).toBeDefined();
  });

  it("saves, lists, favourites and deletes snippets", async () => {
    const saved = (await post("/_portal/api/db/sql/snippets/weekly", { sql: "SELECT 1", favorite: true }, "PUT").json()) as Snippet;
    expect(saved).toMatchObject({ name: "weekly", favorite: true, path: "db/queries/weekly.sql" });
    let list = (await get("/_portal/api/db/sql/snippets").json()) as SnippetList;
    expect(list.snippets.map((s) => s.name)).toEqual(["active-projects", "weekly", "users-by-signup"]);
    expect(post("/_portal/api/db/sql/snippets/bad%20name", { sql: "x" }, "PUT").status).toBe(422);
    expect(mockSqlFetch("/_portal/api/db/sql/snippets/weekly", "DELETE", {})!.status).toBe(200);
    list = (await get("/_portal/api/db/sql/snippets").json()) as SnippetList;
    expect(list.snippets.map((s) => s.name)).toEqual(["active-projects", "users-by-signup"]);
  });

  it("clears the history", async () => {
    expect(mockSqlFetch("/_portal/api/db/sql/history", "DELETE", {})!.status).toBe(200);
    expect(((await get("/_portal/api/db/sql/history").json()) as HistoryList).history).toEqual([]);
  });

  it("previews a migration without applying, and applies with allow_dirty", async () => {
    const preview = (await post("/_portal/api/db/sql/migration", { name: "Add status index", sql: "CREATE INDEX ON projects (status);" }).json()) as { file: { path: string; content: string }; applied: boolean };
    expect(preview.applied).toBe(false);
    expect(preview.file.path).toBe("db/migrations/0014_add_status_index.sql");
    expect(preview.file.content).toContain("-- +goose Up\nCREATE INDEX ON projects (status);\n");
    expect(post("/_portal/api/db/sql/migration", { name: "x", sql: "SELECT 1", apply: true }).status).toBe(500);
    const applied = (await post("/_portal/api/db/sql/migration", { name: "x", sql: "SELECT 1", apply: true, allow_dirty: true }).json()) as { applied: boolean };
    expect(applied.applied).toBe(true);
  });

  it("serves the catalog the completion reads, and leaves other paths alone", async () => {
    const tables = (await get("/_portal/api/db/tables").json()) as { tables: { name: string }[] };
    expect(tables.tables.map((t) => t.name)).toContain("projects");
    const detail = (await get("/_portal/api/db/tables/public/projects").json()) as { columns: { name: string }[]; primary_key: string[] };
    expect(detail.columns.map((c) => c.name)).toContain("owner_id");
    expect(detail.primary_key).toEqual(["id"]);
    expect(get("/_portal/api/db/tables/public/nothing").status).toBe(404);
    expect(mockSqlFetch("/_portal/api/status", "GET", {})).toBeUndefined();
  });
});
