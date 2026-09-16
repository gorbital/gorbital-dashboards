import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import type { Accepted, DevApp, DevRouteList, Problem, Status } from "../types";

const post = (path: string) => mockFetch(path, { method: "POST", headers: { "X-Orb-Portal": "1" } });

beforeEach(() => resetMock());

describe("mockFetch", () => {
  it("answers /status with the portal's shape", async () => {
    const res = await mockFetch("/_portal/api/status");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const s = (await res.json()) as Status;
    expect(Object.keys(s).sort()).toEqual(["app", "generators", "links", "portal", "project"]);
    expect(s.portal).toMatchObject({ ui: "bundled" });
    expect(s.project.preset).toBe("full");
    expect(s.app).toMatchObject({ state: "running", addr: "127.0.0.1:8080", console: true });
    expect(s.links.api).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(s.generators).toEqual(["job", "migration", "resource"]);
  });

  it("refuses mutations without the header, like the portal", async () => {
    const res = await mockFetch("/_portal/api/app/stop", { method: "POST" });
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(((await res.json()) as Problem).code).toBe("forbidden");
  });

  it("stops and starts the app, and refuses what doesn't apply", async () => {
    let res = await post("/_portal/api/app/stop");
    expect(res.status).toBe(202);
    expect(((await res.json()) as Accepted).app.state).toBe("stopped");
    res = await post("/_portal/api/app/stop");
    expect(res.status).toBe(409);
    expect(((await res.json()) as Problem).code).toBe("app_action_failed");
    res = await mockFetch("/_portal/app/readyz");
    expect(res.status).toBe(502);
    res = await post("/_portal/api/app/start");
    expect(res.status).toBe(202);
    expect(((await res.json()) as Accepted).app.state).toBe("running");
    expect((await mockFetch("/_portal/app/readyz")).status).toBe(200);
  });

  it("returns output oldest first within the limit", async () => {
    const out = (await (await mockFetch("/_portal/api/output?limit=5")).json()) as { max: number; lines: { time: string }[] };
    expect(out.max).toBe(2000);
    expect(out.lines).toHaveLength(5);
    expect(out.lines.map((l) => l.time)).toEqual([...out.lines.map((l) => l.time)].sort());
  });

  it("proxies the dev console shapes", async () => {
    const app = (await (await mockFetch("/_portal/app/_dev/app")).json()) as DevApp;
    for (const k of ["name", "version", "go_version", "env", "libraries", "modules", "jobs", "settings", "flags", "permissions"]) expect(app).toHaveProperty(k);
    const routes = (await (await mockFetch("/_portal/app/_dev/routes")).json()) as DevRouteList;
    expect(routes.routes.every((r) => ["openapi", "handler"].includes(r.source))).toBe(true);
    expect((await mockFetch("/_portal/app/_dev/nothing")).status).toBe(404);
    expect((await mockFetch("/_portal/api/nothing")).status).toBe(404);
  });

  it("streams a bare state event first", async () => {
    const ac = new AbortController();
    const res = await mockFetch("/_portal/api/events", { signal: ac.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    while (!text.includes("event: state")) text += dec.decode((await reader.read()).value);
    expect(text.startsWith("retry: 3000\n\n")).toBe(true);
    expect(text).toContain('event: state\ndata: {"state":"running"');
    ac.abort();
    expect((await reader.read()).done).toBe(true);
  });
});
