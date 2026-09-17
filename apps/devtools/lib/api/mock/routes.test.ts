import { beforeEach, describe, expect, it } from "vitest";
import { joinRoutes } from "@/lib/routes/join";
import { mockFetch, resetMock } from "./index";
import type { RouteList } from "../routes";
import type { DevRouteList } from "../types";

beforeEach(() => resetMock());

describe("the routes endpoint in mock mode", () => {
  it("answers a RouteList whose counts add up", async () => {
    const res = await mockFetch("/_portal/api/routes");
    expect(res.status).toBe(200);
    const list = (await res.json()) as RouteList;
    expect(list.guards_known).toBe(true);
    expect(list.total).toBe(list.routes.length);
    expect(list.public).toBe(list.routes.filter((r) => r.public).length);
    const catalog = list.routes.find((r) => r.path === "/v1/catalog/{id}");
    expect(catalog).toMatchObject({ public: true, module: "books", middleware: ['requireClientVersion("2.4.0")'] });
    expect(list.routes.some((r) => r.module === "" && r.source === null)).toBe(true);
    expect((await mockFetch("/_portal/api/routes", { method: "POST", headers: { "X-Orb-Portal": "1" } })).status).toBe(405);
  });

  it("joins with the dev console's list, with one route only in the source", async () => {
    const list = (await (await mockFetch("/_portal/api/routes")).json()) as RouteList;
    const dev = (await (await mockFetch("/_portal/app/_dev/routes")).json()) as DevRouteList;
    const joined = joinRoutes(dev.routes, list.routes);
    expect(joined.filter((r) => !r.inConsole).map((r) => r.path)).toEqual(["/v1/webhooks/bookshop"]);
    expect(joined.find((r) => r.path === "/v1/books" && r.method === "POST")?.info?.guards).toContain("rate_limit:30/1m0s");
  });
});
