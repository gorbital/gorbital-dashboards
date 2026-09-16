import { describe, expect, it } from "vitest";
import type { RouteTraffic } from "../api/observability";
import { fillMinutes, mostFailingRoutes, routeLabel, slowestRoutes, sortRoutes } from "./routes";

const route = (method: string, path: string, requests: number, server_errors: number, p95: number, p99 = p95 * 2): RouteTraffic => ({
  method,
  route: path,
  requests,
  requests_per_minute: requests / 15,
  client_errors: 0,
  server_errors,
  error_rate: requests ? server_errors / requests : 0,
  latency_ms: { mean: p95 / 3, p50: p95 / 4, p95, p99, max: p99 * 1.5 },
});

const routes = [
  route("GET", "/v1/projects", 5210, 2, 61.7),
  route("POST", "/v1/auth/sign-in", 320, 0, 140.2),
  route("GET", "/readyz", 900, 0, 1.2),
  route("PATCH", "/v1/orgs/{org}/projects/{id}", 40, 12, 380),
  route("GET", "/v1/reports", 3, 0, 2400),
  route("GET", "/", 96, 0, 0.8),
  route("DELETE", "/v1/projects/{id}", 12, 1, 90),
];

describe("routeLabel", () => {
  it("names the catch-all and the pre-routing series", () => {
    expect(routeLabel({ method: "GET", route: "/v1/projects" })).toBe("GET /v1/projects");
    expect(routeLabel({ method: "GET", route: "" })).toBe("GET (before routing)");
    expect(routeLabel({ method: "POST", route: "_overflow" })).toBe("POST (beyond the series limit)");
  });
});

describe("sortRoutes", () => {
  it("sorts by every server sort, largest first", () => {
    expect(sortRoutes(routes, "requests").map((r) => r.route).slice(0, 2)).toEqual(["/v1/projects", "/readyz"]);
    expect(sortRoutes(routes, "errors")[0].route).toBe("/v1/orgs/{org}/projects/{id}");
    expect(sortRoutes(routes, "error_rate")[0].route).toBe("/v1/orgs/{org}/projects/{id}");
    expect(sortRoutes(routes, "p95")[0].route).toBe("/v1/reports");
    expect(sortRoutes(routes, "p99")[0].route).toBe("/v1/reports");
  });
  it("breaks ties by requests then name, and leaves the input alone", () => {
    const tied = [route("GET", "/b", 1, 0, 5), route("GET", "/a", 1, 0, 5), route("GET", "/c", 2, 0, 5)];
    expect(sortRoutes(tied, "p95").map((r) => r.route)).toEqual(["/c", "/a", "/b"]);
    expect(tied[0].route).toBe("/b");
  });
});

describe("slowestRoutes", () => {
  it("takes the top five by p95 with at least the minimum requests", () => {
    expect(slowestRoutes(routes).map((r) => r.route)).toEqual(["/v1/reports", "/v1/orgs/{org}/projects/{id}", "/v1/auth/sign-in", "/v1/projects/{id}", "/v1/projects"]);
    expect(slowestRoutes(routes, 5, 10).map((r) => r.route)[0]).toBe("/v1/orgs/{org}/projects/{id}");
    expect(slowestRoutes(routes, 2)).toHaveLength(2);
  });
  it("skips routes without latency", () => {
    expect(slowestRoutes([route("GET", "/x", 5, 0, 0)])).toEqual([]);
  });
});

describe("mostFailingRoutes", () => {
  it("ranks by error rate then errors and drops routes without server errors", () => {
    expect(mostFailingRoutes(routes).map((r) => r.route)).toEqual(["/v1/orgs/{org}/projects/{id}", "/v1/projects/{id}", "/v1/projects"]);
  });
  it("is empty when nothing fails", () => {
    expect(mostFailingRoutes([route("GET", "/x", 5, 0, 1)])).toEqual([]);
  });
});

describe("fillMinutes", () => {
  it("fills the window with zero minutes", () => {
    const points = fillMinutes([{ minute: "2026-09-16T14:47:00Z", requests: 790, server_errors: 1, p95_ms: 58.3 }], "2026-09-16T14:46:00Z", "2026-09-16T14:51:00Z");
    expect(points).toHaveLength(5);
    expect(points.map((p) => p.requests)).toEqual([0, 790, 0, 0, 0]);
    expect(points[1].server_errors).toBe(1);
    expect(points[0].minute).toBe("2026-09-16T14:46:00.000Z");
  });
  it("copes with a null list and a bad window", () => {
    expect(fillMinutes(null, "2026-09-16T14:46:00Z", "2026-09-16T14:48:00Z").map((p) => p.requests)).toEqual([0, 0]);
    expect(fillMinutes([{ minute: "2026-09-16T14:47:00Z", requests: 1, server_errors: 0, p95_ms: 1 }], "bad", "worse")).toHaveLength(1);
  });
  it("caps at a day", () => {
    expect(fillMinutes([], "2026-09-15T00:00:00Z", "2026-09-18T00:00:00Z")).toHaveLength(1440);
  });
});
