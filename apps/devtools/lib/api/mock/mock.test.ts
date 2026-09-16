import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import type { Accepted, DevApp, DevRouteList, JobDefinition, JobRun, OpsSetting, Problem, Queue, Status, SystemInfo } from "../types";

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

  it("answers the ops API with versions, reasons and conflicts as the app does", async () => {
    const list = (await (await mockFetch("/_portal/app/ops/settings")).json()) as { settings: OpsSetting[] };
    const s = list.settings.find((x) => x.key === "auth.lockout_after")!;
    expect(s).toMatchObject({ kind: "int", reason_required: true, modified: true });
    const put = (body: unknown) => mockFetch(`/_portal/app/ops/settings/${s.key}`, { method: "PUT", headers: { "X-Orb-Portal": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let res = await put({ value: 9, version: s.version });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Problem).code).toBe("setting_reason_required");
    res = await put({ value: 9, version: s.version + 5, reason: "x" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Problem).code).toBe("setting_version_conflict");
    res = await put({ value: 999, version: s.version, reason: "x" });
    expect(((await res.json()) as Problem).code).toBe("invalid_setting_value");
    res = await put({ value: 9, version: s.version, reason: "test" });
    expect(res.status).toBe(200);
    const saved = (await res.json()) as OpsSetting;
    expect(saved).toMatchObject({ value: 9, version: s.version + 1, modified: true });
    const hist = (await (await mockFetch(`/_portal/app/ops/settings/${s.key}/history`)).json()) as { changes: { new_value: unknown; reason?: string }[] };
    expect(hist.changes[0]).toMatchObject({ new_value: 9, reason: "test" });
    res = await mockFetch(`/_portal/app/ops/settings/${s.key}`, { method: "DELETE", headers: { "X-Orb-Portal": "1" }, body: JSON.stringify({ version: saved.version, reason: "back" }) });
    expect(((await res.json()) as OpsSetting).modified).toBe(false);
  });

  it("runs jobs once a minute, pauses queues with a reason, and applies migrations", async () => {
    const defs = (await (await mockFetch("/_portal/app/ops/jobs/definitions")).json()) as { definitions: JobDefinition[] };
    expect(defs.definitions.some((d) => d.name === "sessions.prune")).toBe(true);
    const name = "sessions.prune";
    let res = await post(`/_portal/app/ops/jobs/definitions/${name}/run`);
    expect(res.status).toBe(202);
    expect(((await res.json()) as JobRun).kind).toBe(name);
    res = await post(`/_portal/app/ops/jobs/definitions/${name}/run`);
    expect(res.status).toBe(429);
    expect(((await res.json()) as Problem).code).toBe("job_run_limited");

    res = await mockFetch("/_portal/app/ops/queues/mail/pause", { method: "POST", headers: { "X-Orb-Portal": "1" }, body: "{}" });
    expect(((await res.json()) as Problem).code).toBe("job_reason_required");
    res = await mockFetch("/_portal/app/ops/queues/mail/pause", { method: "POST", headers: { "X-Orb-Portal": "1" }, body: JSON.stringify({ reason: "deploy" }) });
    expect(res.status).toBe(204);
    const queues = (await (await mockFetch("/_portal/app/ops/queues")).json()) as { queues: Queue[] };
    expect(queues.queues.find((q) => q.name === "mail")?.paused).toBe(true);

    let sys = (await (await mockFetch("/_portal/app/ops/system")).json()) as SystemInfo;
    expect(sys.database.migrations.pending).toBe(1);
    res = await post("/_portal/api/app/migrate");
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 1700));
    sys = (await (await mockFetch("/_portal/app/ops/system")).json()) as SystemInfo;
    expect(sys.database.migrations.pending).toBe(0);
  });

  it("filters and pages the audit log", async () => {
    const page = (await (await mockFetch("/_portal/app/ops/audit?limit=10&outcome=success")).json()) as { events: { id: number; outcome: string }[]; next_cursor?: string };
    expect(page.events).toHaveLength(10);
    expect(page.events.every((e) => e.outcome === "success")).toBe(true);
    expect(page.next_cursor).toBeDefined();
    const next = (await (await mockFetch(`/_portal/app/ops/audit?limit=10&outcome=success&cursor=${page.next_cursor}`)).json()) as { events: { id: number }[] };
    expect(next.events[0].id).toBeLessThan(page.events[9].id);
    const stats = (await (await mockFetch("/_portal/app/ops/audit/stats?group_by=outcome")).json()) as { total: number; groups: { key: string; count: number }[] };
    expect(stats.groups.reduce((a, g) => a + g.count, 0)).toBe(stats.total);
    expect((await mockFetch("/_portal/app/ops/audit/stats?group_by=nope")).status).toBe(422);
  });

  it("streams dev console items with the console's event names", async () => {
    const ac = new AbortController();
    const res = await mockFetch("/_portal/app/_dev/logs/stream", { signal: ac.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    while (!text.includes("event: log")) text += dec.decode((await reader.read()).value);
    expect(text).toMatch(/event: log\ndata: \{"time":"/);
    ac.abort();
    expect((await reader.read()).done).toBe(true);
  }, 10_000);
});
