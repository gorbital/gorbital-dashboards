import { beforeEach, describe, expect, it } from "vitest";
import { mockFetch, resetMock } from "./index";
import type { Accepted, DevApp, DevRouteList, GeneratorResponse, JobDefinition, JobDefinitionList, JobRun, JobSourceList, OpsSetting, Problem, Queue, Status, SystemInfo } from "../types";

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

describe("jobs in code and the job generator", () => {
  const postJson = (path: string, body: unknown) => mockFetch(path, { method: "POST", headers: { "X-Orb-Portal": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("lists the app's jobs with markers, one ejected", async () => {
    const res = await mockFetch("/_portal/api/jobs");
    expect(res.status).toBe(200);
    const { jobs } = (await res.json()) as JobSourceList;
    expect(jobs).toHaveLength(6);
    const byName = Object.fromEntries((jobs ?? []).map((j) => [j.name, j]));
    expect(Object.keys(byName["audit.rollup"]).sort()).toEqual(["definition", "ejected", "form", "generated", "ident", "kind", "name", "package", "worker"]);
    expect(byName["audit.rollup"]).toMatchObject({ generated: true, ejected: false, kind: "sql", form: { kind: "sql" } });
    expect(byName["invites.expire"]).toMatchObject({ generated: true, kind: "http", form: { http_method: "POST" } });
    expect(byName["sessions.prune"]).toMatchObject({ generated: true, ejected: true, kind: "custom" });
    expect(byName["mail.send"]).toMatchObject({ generated: false, ejected: false, kind: "custom" });
    expect(byName["mail.send"].form).toBeUndefined();
  });

  it("plans a job like orb gen job: four files, jobs.go with before, the marker in the definition", async () => {
    const res = await postJson("/_portal/api/generators/job/plan", { input: { name: "PingHealth", kind: "http", method: "get", url: "http://127.0.0.1:8080/readyz", trigger: "interval", every: "5m" } });
    expect(res.status).toBe(200);
    const { plan, applied } = (await res.json()) as GeneratorResponse;
    expect(applied).toBe(false);
    expect(plan.generator).toBe("job");
    expect(plan.changes.map((c) => [c.kind, c.path])).toEqual([
      ["create", "internal/jobs/pinghealth/pinghealth.go"],
      ["create", "internal/jobs/pinghealth/pinghealth_test.go"],
      ["create", "internal/app/job_ping_health.go"],
      ["modify", "internal/app/jobs.go"],
    ]);
    expect(plan.changes[3].before).toContain("//orb:anchor jobs");
    expect(plan.changes[3].content).toContain("definePingHealthJob(defs, deps)");
    expect(plan.changes[3].before).not.toContain("definePingHealthJob");
    expect(plan.changes[2].content).toMatch(/\/\/orb:job \{"kind":"http","http_method":"GET","http_url":"http:\/\/127\.0\.0\.1:8080\/readyz","worker":"sha256:[0-9a-f]{64}"\}/);
    expect(plan.changes[0].content).toContain('Method = "GET"');
    expect((plan.result as { definition: string }).definition).toBe("ping_health");
  });

  it("answers usage errors as the CLI prints them", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{}, "missing job name"],
      [{ name: "X", kind: "http", url: "nope" }, "--url must be an http or https URL"],
      [{ name: "X", kind: "sql", url: "http://x" }, "--url is for another kind of job, not sql"],
      [{ name: "X", kind: "email", to: "x" }, "--to must be an email address"],
      [{ name: "X", kind: "rocket" }, "--kind must be one of custom, http, sql, email, dispatch"],
      [{ name: "X", trigger: "sometimes" }, 'unknown trigger "sometimes"'],
      [{ name: "X", bogus: 1 }, "unknown field"],
    ];
    for (const [input, detail] of cases) {
      const res = await postJson("/_portal/api/generators/job/plan", { input });
      expect(res.status, detail).toBe(422);
      const p = (await res.json()) as Problem;
      expect(p.code).toBe("generator_failed");
      expect(p.detail, detail).toContain(detail);
    }
    const exists = await postJson("/_portal/api/generators/job/plan", { input: { name: "retention" } });
    expect(exists.status).toBe(409);
    expect(((await exists.json()) as Problem).code).toBe("plan_conflict");
  });

  it("refuses to apply on the dirty tree, then registers the job after a restart", async () => {
    const input = { name: "SelectOne", kind: "sql", sql: "SELECT 1", trigger: "manual" };
    let res = await postJson("/_portal/api/generators/job/apply", { input });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Problem).detail).toMatch(/allow-dirty/);
    res = await postJson("/_portal/api/generators/job/apply", { input, allow_dirty: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as GeneratorResponse).applied).toBe(true);
    // Not registered until the app restarts, like the real one.
    let defs = ((await (await mockFetch("/_portal/app/ops/jobs/definitions")).json()) as JobDefinitionList).definitions ?? [];
    expect(defs.some((d) => d.name === "select_one")).toBe(false);
    // Planning it again is a conflict now: the files exist.
    expect((await postJson("/_portal/api/generators/job/plan", { input })).status).toBe(409);
    expect((await post("/_portal/api/app/restart")).status).toBe(202);
    await new Promise((r) => setTimeout(r, 2400));
    defs = ((await (await mockFetch("/_portal/app/ops/jobs/definitions")).json()) as JobDefinitionList).definitions ?? [];
    expect(defs.find((d) => d.name === "select_one")).toMatchObject({ config: { enabled: true, schedule: "", timeout: "1m0s", max_attempts: 5, queue: "default" } });
    const { jobs } = (await (await mockFetch("/_portal/api/jobs")).json()) as JobSourceList;
    expect(jobs?.find((j) => j.name === "select_one")).toMatchObject({ generated: true, ejected: false, kind: "sql", worker: "internal/jobs/selectone/selectone.go", form: { kind: "sql", sql: "SELECT 1" } });
  }, 10_000);
});
