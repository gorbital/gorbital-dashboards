import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import { planChange, resetMockDb } from "./schema";
import type { Problem, SchemaStatus } from "../types";
import { mockSchemaRestarted, schemaStatus, startSchemaDemo } from "./schema";
import { mockSqlFetch } from "./sql";
import type { DbEnum, DbTable, DdlResponse, ForeignKey, Migration, TableDetail } from "../schema";

const get = <T>(path: string) => mockFetch(path).then(async (r) => ({ status: r.status, body: (await r.json()) as T }));
const post = <T>(path: string, json?: unknown) => mockFetch(path, { method: "POST", headers: { "X-Orb-Portal": "1" }, body: json === undefined ? undefined : JSON.stringify(json) }).then(async (r) => ({ status: r.status, body: (await r.json()) as T }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  resetMock();
  resetMockDb();
});

describe("mock database", () => {
  it("answers the catalog endpoints with the backend's shapes", async () => {
    const tables = await get<{ tables: DbTable[] }>("/_portal/api/db/tables?schema=public");
    expect(tables.status).toBe(200);
    expect(tables.body.tables.length).toBeGreaterThan(4);
    expect(tables.body.tables.every((t) => t.schema === "public" && ["user", "managed", "system"].includes(t.ownership))).toBe(true);
    const all = await get<{ tables: DbTable[] }>("/_portal/api/db/tables");
    expect(all.body.tables.some((t) => t.schema === "billing")).toBe(true);

    const fks = await get<{ foreign_keys: ForeignKey[] }>("/_portal/api/db/foreign-keys?schema=public");
    expect(fks.body.foreign_keys.length).toBeGreaterThan(3);
    expect(fks.body.foreign_keys[0]).toMatchObject({ columns: expect.any(Array), ref_columns: ["id"], on_delete: expect.any(String) });

    const d = await get<TableDetail>("/_portal/api/db/tables/public/projects");
    expect(d.body.primary_key).toEqual(["id"]);
    expect(d.body.columns.some((c) => c.fk_targets?.includes("public.organisations"))).toBe(true);
    expect(d.body.triggers.length).toBe(1);
    expect(d.body.indexes.some((i) => i.is_primary)).toBe(true);
    expect((await mockFetch("/_portal/api/db/tables/public/nope")).status).toBe(404);

    for (const [path, key] of [
      ["enums", "enums"],
      ["functions", "functions"],
      ["views", "views"],
      ["extensions", "extensions"],
      ["schemas", "schemas"],
      ["migrations", "migrations"],
    ] as const) {
      const r = await get<Record<string, unknown[]>>(`/_portal/api/db/${path}`);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body[key])).toBe(true);
    }
  });

  it("lists migrations oldest first with one pending", async () => {
    const { body } = await get<{ migrations: Migration[] }>("/_portal/api/db/migrations");
    const versions = body.migrations.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(body.migrations.filter((m) => !m.applied)).toHaveLength(1);
    const dev = await get<{ current: number; latest: number; pending: number }>("/_portal/app/_dev/migrations");
    expect(dev.body.pending).toBe(1);
    expect(dev.body.latest).toBeGreaterThan(dev.body.current);
  });

  it("plans the object kinds like ddl.go", () => {
    expect(planChange({ kind: "create_extension", schema: "public", name: "pg_trgm" })).toMatchObject({ up: ["CREATE EXTENSION IF NOT EXISTS pg_trgm;"], down: ["DROP EXTENSION IF EXISTS pg_trgm;"] });
    expect(planChange({ kind: "create_enum", schema: "public", name: "s", values: ["a", "it's"] }).up).toEqual(["CREATE TYPE public.s AS ENUM ('a', 'it''s');"]);
    expect(planChange({ kind: "add_enum_value", schema: "public", name: "s", value: "b", after: "a" })).toMatchObject({ irreversible: true, no_transaction: true, up: ["ALTER TYPE public.s ADD VALUE IF NOT EXISTS 'b' AFTER 'a';"] });
    expect(planChange({ kind: "drop_function", schema: "public", signature: "f(integer)" })).toMatchObject({ irreversible: true, down: [] });
    expect(planChange({ kind: "create_index", schema: "public", table: "projects", index: { columns: ["name", "(lower(description))"], concurrently: true } })).toMatchObject({ up: ["CREATE INDEX CONCURRENTLY projects_name_expr_idx ON public.projects (name, (lower(description)));"], no_transaction: true });
    expect(() => planChange({ kind: "create_index", schema: "public", table: "audit_events", index: { columns: ["action"] } })).toThrow(/managed table/);
    expect(() => planChange({ kind: "create_function", schema: "public", name: "f", definition: "SELECT 1" })).toThrow(/CREATE FUNCTION/);
    expect(planChange({ kind: "create_view", schema: "public", name: "v", definition: "SELECT 1;", materialized: true })).toMatchObject({ up: ["CREATE MATERIALIZED VIEW public.v AS\nSELECT 1;"], down: ["DROP MATERIALIZED VIEW public.v;"] });
  });

  it("plans through the endpoint, refuses system tables and dirty trees, and applies as a migration", async () => {
    const plan = await post<DdlResponse>("/_portal/api/db/ddl/plan", { change: { kind: "create_enum", schema: "public", name: "order_status", values: ["new", "paid"] } });
    expect(plan.status).toBe(200);
    expect(plan.body.applied).toBe(false);
    expect(plan.body.file.path).toMatch(/^db\/migrations\/\d{14}_create_enum_order_status\.sql$/);
    expect(plan.body.file.content).toContain("-- +goose Up\nCREATE TYPE public.order_status");

    const refused = await post<Problem>("/_portal/api/db/ddl/plan", { change: { kind: "drop_trigger", schema: "public", table: "audit_events", name: "audit_events_append_only" } });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("system_table");

    const dirty = await post<Problem>("/_portal/api/db/ddl/apply", { change: { kind: "create_enum", schema: "public", name: "order_status", values: ["new"] } });
    expect(dirty.status).toBe(409);
    expect(dirty.body.code).toBe("plan_conflict");

    const applied = await post<DdlResponse>("/_portal/api/db/ddl/apply", { change: { kind: "create_enum", schema: "public", name: "order_status", values: ["new", "paid"] }, allow_dirty: true, name: "orders" });
    expect(applied.status).toBe(200);
    expect(applied.body.applied).toBe(true);
    expect(applied.body.file.path).toMatch(/_orders\.sql$/);
    let list = (await get<{ migrations: Migration[] }>("/_portal/api/db/migrations")).body.migrations;
    expect(list.at(-1)).toMatchObject({ name: "orders", applied: false });
    await wait(1700);
    list = (await get<{ migrations: Migration[] }>("/_portal/api/db/migrations")).body.migrations;
    expect(list.every((m) => m.applied)).toBe(true);
    const enums = (await get<{ enums: DbEnum[] }>("/_portal/api/db/enums?schema=public")).body.enums;
    expect(enums.some((e) => e.name === "order_status" && e.values.length === 2)).toBe(true);
  }, 5000);

  it("rolls back and redoes through the app actions and refuses a second command while busy", async () => {
    const down = await post<{ accepted: boolean }>("/_portal/api/app/migrate-down");
    expect(down.status).toBe(202);
    expect(down.body.accepted).toBe(true);
    const again = await post<Problem>("/_portal/api/app/migrate");
    expect(again.status).toBe(409);
    await wait(1700);
    let list = (await get<{ migrations: Migration[] }>("/_portal/api/db/migrations")).body.migrations;
    expect(list.filter((m) => !m.applied)).toHaveLength(2);
    expect((await post("/_portal/api/app/migrate")).status).toBe(202);
    await wait(1700);
    list = (await get<{ migrations: Migration[] }>("/_portal/api/db/migrations")).body.migrations;
    expect(list.every((m) => m.applied)).toBe(true);
    expect((await post("/_portal/api/app/migrate-redo")).status).toBe(202);
    await wait(2200);
    list = (await get<{ migrations: Migration[] }>("/_portal/api/db/migrations")).body.migrations;
    expect(list.every((m) => m.applied)).toBe(true);
  }, 10_000);

  it("writes an empty migration through the generator", async () => {
    const plan = await post<{ applied: boolean; plan: { changes: { path: string; content: string }[] } }>("/_portal/api/generators/migration/plan", { input: { name: "Add phone" } });
    expect(plan.body.applied).toBe(false);
    expect(plan.body.plan.changes[0].path).toMatch(/_add_phone\.sql$/);
    expect(plan.body.plan.changes[0].content).toContain("-- +goose Down");
    const apply = await post<{ applied: boolean }>("/_portal/api/generators/migration/apply", { input: { name: "add_phone" } });
    expect(apply.body.applied).toBe(true);
    const list = (await get<{ migrations: Migration[] }>("/_portal/api/db/migrations")).body.migrations;
    expect(list.at(-1)).toMatchObject({ name: "add_phone", applied: false, has_down: true });
    expect((await post<Problem>("/_portal/api/generators/migration/plan", { input: { name: "" } })).status).toBe(422);
  });
});

/** Reads `/_portal/api/events` and collects every `schema` event after the initial one until `stop`. */
function watchSchemaEvents() {
  const ac = new AbortController();
  const seen: SchemaStatus[] = [];
  let initial = true;
  const done = (async () => {
    const res = await mockFetch("/_portal/api/events", { signal: ac.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const m = /^event: schema\ndata: (.*)$/m.exec(block);
        if (!m) continue;
        if (initial) initial = false;
        else seen.push((JSON.parse(m[1]) as { schema: SchemaStatus }).schema);
      }
    }
  })();
  return { seen, stop: async () => (ac.abort(), done) };
}

describe("live schema status", () => {
  it("answers db/schema-status with the contract's shape, healthy by default", async () => {
    const res = await get<SchemaStatus>("/_portal/api/db/schema-status");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["applied", "checked_at", "database", "edited", "needs_restart", "pending", "problem", "source"]);
    expect(res.body).toMatchObject({ database: true, source: "startup", applied: [], edited: [], needs_restart: false, problem: "" });
    // The seed has one pending file, but this orb dev applies it by itself: no restart needed, no banner.
    expect(res.body.pending).toEqual([{ file: "20260916000001_projects_search_tsvector.sql", version: "20260916000001", reason: "new" }]);
  });

  it("sends the latest status to a new subscriber right after the initial state", async () => {
    const ac = new AbortController();
    const res = await mockFetch("/_portal/api/events", { signal: ac.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    while (!text.includes("event: schema")) text += dec.decode((await reader.read()).value);
    expect(text.indexOf("event: state")).toBeLessThan(text.indexOf("event: schema"));
    expect(text).toContain('event: schema\ndata: {"type":"schema","time":"');
    ac.abort();
  });

  it("publishes a portal status with the applied file after a DDL apply, and a migrate one after app/migrate", { timeout: 15_000 }, async () => {
    const watch = watchSchemaEvents();
    await wait(20);
    const applied = await post<DdlResponse>("/_portal/api/db/ddl/apply", { change: { kind: "create_enum", schema: "public", name: "order_status", values: ["new", "paid"] }, allow_dirty: true, name: "orders" });
    expect(applied.status).toBe(200);
    await wait(1700);
    expect(watch.seen.at(-1)).toMatchObject({ source: "portal", needs_restart: false, pending: [] });
    expect(watch.seen.at(-1)!.applied).toEqual(expect.arrayContaining(["20260916000001_projects_search_tsvector.sql", expect.stringMatching(/_orders\.sql$/)]));

    expect((await post("/_portal/api/app/migrate-down")).status).toBe(202);
    await wait(1700);
    expect(watch.seen.at(-1)).toMatchObject({ source: "migrate", applied: [] });
    expect(watch.seen.at(-1)!.pending).toHaveLength(1);
    expect((await post("/_portal/api/app/migrate")).status).toBe(202);
    await wait(1700);
    expect(watch.seen.at(-1)).toMatchObject({ source: "migrate" });
    expect(watch.seen.at(-1)!.applied).toEqual([expect.stringMatching(/_orders\.sql$/)]);
    await watch.stop();
  });

  it("publishes a sql status after a committed DDL, not after a rolled-back one or a SELECT", async () => {
    const watch = watchSchemaEvents();
    await wait(20);
    const run = (sql: string, mode?: string) => mockSqlFetch("/_portal/api/db/sql/run", "POST", { method: "POST", headers: { "X-Orb-Portal": "1" }, body: JSON.stringify({ sql, mode }) })!;
    await run("SELECT 1", "commit");
    await run("CREATE TABLE t (id int)");
    await wait(20);
    expect(watch.seen).toEqual([]);
    await run("CREATE TABLE t (id int)", "commit");
    await wait(20);
    expect(watch.seen.map((s) => s.source)).toEqual(["sql"]);
    await watch.stop();
  });

  it("the demo: a file this orb won't apply until a restart, then the restart applies it", { timeout: 10_000 }, async () => {
    const watch = watchSchemaEvents();
    await wait(20);
    startSchemaDemo("pending");
    await wait(20);
    expect(watch.seen.at(-1)).toMatchObject({ source: "code", needs_restart: true });
    expect(watch.seen.at(-1)!.pending.map((p) => p.file)).toContain("20260917000020_invoices_paid_at.sql");
    const list = (await get<{ migrations: Migration[] }>("/_portal/api/db/migrations")).body.migrations;
    expect(list.at(-1)).toMatchObject({ version: 20260917000020, applied: false });
    mockSchemaRestarted();
    await wait(20);
    expect(watch.seen.at(-1)).toMatchObject({ source: "migrate", needs_restart: false, applied: ["20260917000020_invoices_paid_at.sql"] });

    startSchemaDemo("out_of_order");
    expect(schemaStatus().pending.map((p) => p.reason)).toContain("out_of_order");
    startSchemaDemo("edited");
    expect(schemaStatus().edited).toEqual([{ file: "20260917000020_invoices_paid_at.sql", version: "20260917000020" }]);
    startSchemaDemo("problem");
    expect(schemaStatus().problem).toMatch(/SQLSTATE/);
    // A redo replays the edited file and clears the mark; the next successful migrate clears the problem.
    expect((await post("/_portal/api/app/migrate-redo")).status).toBe(202);
    await wait(2200);
    expect(watch.seen.at(-1)).toMatchObject({ source: "migrate", edited: [], problem: "" });
    await watch.stop();
  });
});
