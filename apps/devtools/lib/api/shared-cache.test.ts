import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes("/schemas")) return { schemas: [{ name: "public", system: false }] };
      return { tables: [{ schema: "public", name: "projects", ownership: "user" }] };
    }),
  };
});

const db = await import("./db");
const schema = await import("./schema");

// The Table Editor and the Schema screen read the same endpoints under the
// same query keys. Whichever screen fills the cache first, the other must
// find the value it expects (regression: opening Schema after the Table
// Editor crashed with "(data ?? []).filter is not a function").
describe("queries shared by the Table Editor and the Schema screen", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
  });

  it("use the same keys", () => {
    expect(schema.schemasQuery().queryKey).toEqual(db.schemasQueryOptions().queryKey);
    expect(schema.tablesQuery(["public"]).queryKey).toEqual(db.tablesQueryOptions(["public"]).queryKey);
  });

  it("give the Schema screen lists from a cache the Table Editor filled", async () => {
    await qc.fetchQuery(db.tablesQueryOptions(["public"]));
    await qc.fetchQuery(db.schemasQueryOptions());
    const tables = schema.tablesQuery(["public"]);
    const schemas = schema.schemasQuery();
    expect(Array.isArray(tables.select!(qc.getQueryData(tables.queryKey)!))).toBe(true);
    expect(Array.isArray(schemas.select!(qc.getQueryData(schemas.queryKey)!))).toBe(true);
  });

  it("give the Table Editor lists from a cache the Schema screen filled", async () => {
    await qc.fetchQuery(schema.tablesQuery(["public"]));
    await qc.fetchQuery(schema.schemasQuery());
    const tables = db.tablesQueryOptions(["public"]);
    const schemas = db.schemasQueryOptions();
    expect(Array.isArray(tables.select!(qc.getQueryData(tables.queryKey)!))).toBe(true);
    expect(Array.isArray(schemas.select!(qc.getQueryData(schemas.queryKey)!))).toBe(true);
  });
});
