import { describe, expect, it } from "vitest";
import type { RouteInfo } from "@/lib/api/routes";
import type { DevRoute } from "@/lib/api/types";
import { filterRoutes, guardChip, joinRoutes, listGuards, shortDuration, sourceLabel, type RouteFilter } from "./join";

const dev = (method: string, path: string, over: Partial<DevRoute> = {}): DevRoute => ({ method, path, tags: [], secured: true, source: "openapi", ...over });

const info = (method: string, path: string, over: Partial<RouteInfo> = {}): RouteInfo => ({
  method,
  path,
  operation_id: "",
  summary: "",
  tags: [],
  module: "books",
  handler: "",
  source: null,
  handler_source: null,
  guards: ["authenticated"],
  middleware: [],
  public: false,
  deprecated: false,
  ...over,
});

const all: RouteFilter = { tag: "all", source: "all", search: "", publicOnly: false };

describe("joinRoutes", () => {
  it("joins by method and path, keeping the console's order", () => {
    const joined = joinRoutes([dev("GET", "/v1/books"), dev("get", "/v1/catalog/{id}"), dev("GET", "/docs", { source: "handler" })], [info("GET", "/v1/catalog/{id}", { public: true }), info("GET", "/v1/books", { handler: "h.listBooks" })]);
    expect(joined.map((r) => r.path)).toEqual(["/v1/books", "/v1/catalog/{id}", "/docs"]);
    expect(joined[0].info?.handler).toBe("h.listBooks");
    expect(joined[1].info?.public).toBe(true);
    expect(joined[2].info).toBeUndefined();
    expect(joined.every((r) => r.inConsole)).toBe(true);
  });

  it("doesn't join the same path under another method", () => {
    const joined = joinRoutes([dev("GET", "/v1/books")], [info("POST", "/v1/books")]);
    expect(joined).toHaveLength(2);
    expect(joined[0].info).toBeUndefined();
    expect(joined[1]).toMatchObject({ method: "POST", path: "/v1/books", inConsole: false, source: "openapi", secured: true });
  });

  it("appends routes only the source knows, and works before it answers", () => {
    expect(joinRoutes([dev("GET", "/a")], undefined)).toEqual([{ ...dev("GET", "/a"), info: undefined, inConsole: true }]);
    const joined = joinRoutes([], [info("get", "/v1/catalog/{id}", { public: true, summary: "Read", operation_id: "catalog-get" })]);
    expect(joined[0]).toMatchObject({ method: "GET", secured: false, summary: "Read", operation_id: "catalog-get", inConsole: false });
  });
});

describe("filterRoutes", () => {
  const routes = joinRoutes(
    [dev("GET", "/v1/books", { tags: ["books"] }), dev("GET", "/v1/catalog/{id}", { tags: ["catalog"] }), dev("GET", "/docs", { source: "handler" })],
    [info("GET", "/v1/books", { guards: ["authenticated", "permission:books.book.read"], middleware: ["requireClientVersion(\"2.4.0\")"] }), info("GET", "/v1/catalog/{id}", { public: true, guards: ["public"] })],
  );

  it("keeps only public routes when asked; a route without source info isn't public", () => {
    expect(filterRoutes(routes, { ...all, publicOnly: true }).map((r) => r.path)).toEqual(["/v1/catalog/{id}"]);
    expect(filterRoutes(routes, all)).toHaveLength(3);
  });

  it("combines the tag, source and search filters", () => {
    expect(filterRoutes(routes, { ...all, tag: "(untagged)" }).map((r) => r.path)).toEqual(["/docs"]);
    expect(filterRoutes(routes, { ...all, source: "handler" }).map((r) => r.path)).toEqual(["/docs"]);
    expect(filterRoutes(routes, { ...all, search: "books.book.read" }).map((r) => r.path)).toEqual(["/v1/books"]);
    expect(filterRoutes(routes, { ...all, search: "clientversion" }).map((r) => r.path)).toEqual(["/v1/books"]);
    expect(filterRoutes(routes, { ...all, search: "catalog", publicOnly: true, tag: "books" })).toEqual([]);
  });
});

describe("guard chips", () => {
  it("reads each guard", () => {
    expect(guardChip("public")).toMatchObject({ kind: "public" });
    expect(guardChip("authenticated")).toMatchObject({ kind: "authenticated", label: "signed in" });
    expect(guardChip("permission:books.book.read")).toMatchObject({ kind: "permission", label: "books.book.read" });
    expect(guardChip("rate_limit:30/1m0s")).toMatchObject({ kind: "rate_limit", label: "30/1m", title: "rate limit 30/1m0s" });
    expect(guardChip("webhook:stripe")).toMatchObject({ kind: "webhook", label: "webhook:stripe" });
    expect(guardChip("recent_reauth")).toMatchObject({ kind: "other", label: "recent_reauth" });
  });

  it("shortens Go durations", () => {
    expect(shortDuration("1m0s")).toBe("1m");
    expect(shortDuration("1h0m0s")).toBe("1h");
    expect(shortDuration("1h30m0s")).toBe("1h30m");
    expect(shortDuration("30s")).toBe("30s");
  });

  it("leaves public and authenticated to the badge", () => {
    expect(listGuards(["authenticated", "permission:x", "public"])).toEqual(["permission:x"]);
  });

  it("labels sources", () => {
    expect(sourceLabel({ file: "internal/modules/books/routes.go", line: 14 })).toBe("internal/modules/books/routes.go:14");
    expect(sourceLabel({ file: "a.go", line: 0 })).toBe("a.go");
    expect(sourceLabel(null)).toBe("");
  });
});
