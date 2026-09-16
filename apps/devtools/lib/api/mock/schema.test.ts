import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import { planChange, resetMockDb } from "./schema";
import type { Problem } from "../types";
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
