import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySchemaEvent, dismissSchemaNotice, fetchSchemaStatus, invalidateSchemaViews, isRebuildFinished, isSchemaNoticeDismissed, namesFile, pendingSentence, resetSchemaNoticeDismissal, schemaNotices, schemaStatusKey, schemaToast } from "./schema-status";
import type { SchemaStatus } from "./types";

const healthy: SchemaStatus = { database: true, source: "startup", checked_at: "2026-09-17T06:00:00Z", applied: [], pending: [], edited: [], needs_restart: false, problem: "" };
const at = (checked_at: string, patch: Partial<SchemaStatus> = {}): SchemaStatus => ({ ...healthy, checked_at, ...patch });

describe("schemaNotices", () => {
  it("says nothing for a healthy status, a missing one, or an app without a database", () => {
    expect(schemaNotices(healthy)).toEqual([]);
    expect(schemaNotices(null)).toEqual([]);
    expect(schemaNotices(undefined)).toEqual([]);
    expect(schemaNotices(at("t", { database: false, problem: "boom" }))).toEqual([]);
  });

  it("warns about pending files only when orb dev will not apply them by itself", () => {
    const pending = [{ file: "20260917000020_x.sql", version: "20260917000020", reason: "new" as const }];
    expect(schemaNotices(at("t", { pending, needs_restart: false }))).toEqual([]);
    expect(schemaNotices(at("t", { pending, needs_restart: true }))).toEqual([{ kind: "pending", tone: "warn", files: ["20260917000020_x.sql"], outOfOrder: [] }]);
  });

  it("names the out-of-order files and lists the states worst first", () => {
    const s = at("t", {
      source: "code",
      needs_restart: true,
      pending: [
        { file: "20260910000005_old.sql", version: "20260910000005", reason: "out_of_order" },
        { file: "20260917000020_x.sql", version: "20260917000020", reason: "new" },
      ],
      edited: [{ file: "20260917000010_invoices.sql", version: "20260917000010" }],
      problem: "migrate: syntax error at or near )",
    });
    expect(schemaNotices(s).map((n) => n.kind)).toEqual(["problem", "pending", "edited"]);
    expect(schemaNotices(s)[1]).toMatchObject({ outOfOrder: ["20260910000005_old.sql"], files: ["20260910000005_old.sql", "20260917000020_x.sql"] });
    expect(schemaNotices(s)[2]).toEqual({ kind: "edited", tone: "warn", files: ["20260917000010_invoices.sql"] });
    expect(schemaNotices(s)[0]).toEqual({ kind: "problem", tone: "danger", message: "migrate: syntax error at or near )" });
  });

  it("words the pending sentence by count", () => {
    expect(pendingSentence(["a.sql"])).toEqual({ lead: "1 migration in code is not applied:", tail: "Restart the app to apply it." });
    expect(pendingSentence(["a.sql", "b.sql"])).toEqual({ lead: "2 migrations in code are not applied:", tail: "Restart the app to apply them." });
  });

  it("matches a status entry's file name against a migration's path", () => {
    const edited = [{ file: "20260917000010_invoices.sql", version: "20260917000010" }];
    expect(namesFile(edited, "db/migrations/20260917000010_invoices.sql")).toBe(true);
    expect(namesFile(edited, "20260917000010_invoices.sql")).toBe(true);
    expect(namesFile(edited, "db/migrations/20260917000011_other.sql")).toBe(false);
    expect(namesFile(edited, "")).toBe(false);
  });
});

describe("schemaToast", () => {
  it("announces applied files after a migrate from code or the portal", () => {
    expect(schemaToast(at("t", { source: "migrate", applied: ["20260917000010_invoices.sql"] }))).toEqual({ kind: "success", title: "Schema updated: applied 20260917000010_invoices.sql", description: "views refreshed" });
    expect(schemaToast(at("t", { source: "portal", applied: ["a.sql", "b.sql"] }))?.title).toBe("Schema updated: applied a.sql, b.sql");
  });

  it("announces a DDL from the SQL editor", () => {
    expect(schemaToast(at("t", { source: "sql" }))).toEqual({ kind: "info", title: "Schema changed by your SQL; views refreshed" });
  });

  it("stays quiet at startup, for a code change, for a migrate that applied nothing, and for a repeat", () => {
    expect(schemaToast(at("t", { source: "startup" }))).toBeNull();
    expect(schemaToast(at("t", { source: "code", needs_restart: true }))).toBeNull();
    expect(schemaToast(at("t", { source: "migrate", applied: [] }))).toBeNull();
    const s = at("t", { source: "sql" });
    expect(schemaToast(s, s)).toBeNull();
    expect(schemaToast(at("t2", { source: "sql" }), s)).not.toBeNull();
  });
});

describe("applySchemaEvent", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
  });
  afterEach(() => qc.clear());

  const seed = (key: readonly unknown[]) => {
    qc.setQueryData(key, { seeded: true });
    return () => qc.getQueryState(key)!.isInvalidated;
  };

  it("stores the status and drops every other schema view, not the status itself", () => {
    const tables = seed(["db", "tables", "public"]);
    const rows = seed(["db", "rows", "public", "projects", { schema: "public", table: "projects" }]);
    const sqlCatalog = seed(["db", "sql", "catalog", "tables"]);
    const migrations = seed(["db", "migrations"]);
    const devMigrations = seed(["dev", "migrations"]);
    const system = seed(["ops", "system"]);
    const settings = seed(["ops", "settings"]);
    const status = at("t1", { source: "migrate", applied: ["a.sql"] });
    applySchemaEvent(qc, status);
    expect(qc.getQueryData(schemaStatusKey)).toEqual(status);
    expect(qc.getQueryState(schemaStatusKey)!.isInvalidated).toBe(false);
    for (const invalidated of [tables, rows, sqlCatalog, migrations, devMigrations, system]) expect(invalidated()).toBe(true);
    expect(settings()).toBe(false);
  });

  it("invalidateSchemaViews leaves an existing status alone", () => {
    qc.setQueryData(schemaStatusKey, healthy);
    invalidateSchemaViews(qc);
    expect(qc.getQueryState(schemaStatusKey)!.isInvalidated).toBe(false);
  });

  it("isRebuildFinished fires only on building/preparing → running", () => {
    expect(isRebuildFinished("building", "running")).toBe(true);
    expect(isRebuildFinished("preparing", "running")).toBe(true);
    expect(isRebuildFinished("stopped", "running")).toBe(false);
    expect(isRebuildFinished(undefined, "running")).toBe(false);
    expect(isRebuildFinished("building", "stopped")).toBe(false);
  });
});

describe("fetchSchemaStatus", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the endpoint and fills the lists an older orb leaves out", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ database: true, source: "startup", checked_at: "t", applied: null, pending: null, edited: null, needs_restart: false, problem: "" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(fetchSchemaStatus()).resolves.toEqual(at("t"));
    expect(fetchMock.mock.calls[0][0]).toBe("/_portal/api/db/schema-status");
  });

  it("treats a 404 (an orb without the endpoint) as healthy, not as an error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("404 page not found", { status: 404, headers: { "Content-Type": "text/plain" } }));
    await expect(fetchSchemaStatus()).resolves.toBeNull();
  });

  it("still throws for anything else", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 503, code: "database_unavailable" }), { status: 503, headers: { "Content-Type": "application/problem+json" } }));
    await expect(fetchSchemaStatus()).rejects.toMatchObject({ status: 503 });
  });
});

describe("dismissal", () => {
  afterEach(() => resetSchemaNoticeDismissal());

  it("hides the banner for that status only, and the next status brings it back", () => {
    expect(isSchemaNoticeDismissed("t1")).toBe(false);
    dismissSchemaNotice("t1");
    expect(isSchemaNoticeDismissed("t1")).toBe(true);
    expect(isSchemaNoticeDismissed("t2")).toBe(false);
    expect(isSchemaNoticeDismissed(undefined)).toBe(false);
    resetSchemaNoticeDismissal();
    expect(isSchemaNoticeDismissed("t1")).toBe(false);
  });
});
