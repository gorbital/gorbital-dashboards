import { beforeEach, describe, expect, it } from "vitest";
import type { Advice, DatabaseStats, HealthResponse, HostSample, ObservabilityOverview, RoutesResponse, Statements } from "../observability";
import type { AppStatus, Problem } from "../types";
import { mockObservabilityFetch, resetObservabilityMock } from "./observability";

const running: AppStatus = { state: "running", pid: 48123, addr: "127.0.0.1:8080", url: "http://127.0.0.1:8080", started_at: new Date(Date.now() - 60_000).toISOString(), restarts: 0, console: true } as AppStatus;
const stopped: AppStatus = { ...running, state: "stopped", pid: undefined, started_at: undefined };

const fetchAs = (app: AppStatus, path: string, method = "GET") => mockObservabilityFetch(new URL(path, "http://127.0.0.1:3100"), method, { method }, app);

describe("mock observability", () => {
  beforeEach(() => resetObservabilityMock());

  it("answers the health table, following the app's state", async () => {
    const up = (await fetchAs(running, "/_portal/api/health")!.json()) as HealthResponse;
    expect(up.services.map((s) => s.name)).toEqual(["app", "postgres", "mail", "minio", "otel-collector"]);
    expect(up.services[0].status).toBe("ok");
    expect(up.services[1].status).toBe("degraded");
    expect(up.services[1].detail).toContain("2 sessions waiting on locks");
    const down = (await fetchAs(stopped, "/_portal/api/health")!.json()) as HealthResponse;
    expect(down.services[0].status).toBe("down");
  });

  it("samples the machine and the app process, and moves between calls", async () => {
    const a = (await fetchAs(running, "/_portal/api/system")!.json()) as HostSample;
    const b = (await fetchAs(running, "/_portal/api/system")!.json()) as HostSample;
    expect(a.host.cores).toBe(10);
    expect(a.app?.pid).toBe(48123);
    expect(a.memory.used + a.memory.available).toBe(a.memory.total);
    expect(a.host.cpu_percent).not.toBe(b.host.cpu_percent);
    const gone = (await fetchAs(stopped, "/_portal/api/system")!.json()) as HostSample;
    expect(gone.app).toBeUndefined();
  });

  it("answers db/stats with a degraded database", async () => {
    const s = (await fetchAs(running, "/_portal/api/db/stats")!.json()) as DatabaseStats;
    expect(s.locks).toHaveLength(2);
    expect(s.locks[1].blocked_by).toEqual([31790, 31844]);
    expect(s.long_running.length).toBeGreaterThanOrEqual(1);
    expect(s.tables[0].name).toBe("audit_events");
    expect(s.tables.every((t, i, all) => i === 0 || all[i - 1].total >= t.total)).toBe(true);
    expect(s.connections).toBeLessThanOrEqual(s.max_connections);
    expect(s.cache_hit_ratio).toBeGreaterThan(0.99);
    expect(s.index_hit_ratio).toBeLessThan(0.99);
  });

  it("answers 25 statements with the heaviest at 60%, sorts and limits them, and resets", async () => {
    const all = (await fetchAs(running, "/_portal/api/db/statements")!.json()) as Statements;
    expect(all.available).toBe(true);
    expect(all.statements).toHaveLength(25);
    expect(all.sort).toBe("total_time");
    expect(all.statements[0].query).toContain("river_job");
    expect(all.statements[0].total_share).toBeGreaterThan(0.55);
    expect(all.statements[0].total_share).toBeLessThan(0.65);
    expect(all.statements.reduce((a, s) => a + s.total_share, 0)).toBeCloseTo(1, 6);
    const byMean = (await fetchAs(running, "/_portal/api/db/statements?sort=mean_time&limit=3")!.json()) as Statements;
    expect(byMean.statements).toHaveLength(3);
    expect(byMean.statements[0].mean_ms).toBeGreaterThanOrEqual(byMean.statements[1].mean_ms);
    expect(fetchAs(running, "/_portal/api/db/statements?sort=nope")!.status).toBe(422);
    expect(fetchAs(running, "/_portal/api/db/statements/reset", "POST")!.status).toBe(204);
    const after = (await fetchAs(running, "/_portal/api/db/statements")!.json()) as Statements;
    expect(after.statements[0].calls).toBeLessThan(all.statements[0].calls);
    expect(Date.parse(after.since!)).toBeGreaterThan(Date.now() - 5000);
  });

  it("answers advice in every category", async () => {
    const a = (await fetchAs(running, "/_portal/api/db/advice")!.json()) as Advice;
    for (const k of ["missing_fk_indexes", "unused_indexes", "seq_scanned", "dead_rows"] as const) expect(a[k].length).toBeGreaterThan(0);
    expect(a.missing_fk_indexes[0].sql).toMatch(/^CREATE INDEX/);
    expect(a.unused_indexes[0].size).toBeGreaterThan(0);
    expect(a.seq_scanned[0].sql).toBeUndefined();
  });

  it("answers the overview and the routes for every range, and 502 while the app is stopped", async () => {
    for (const w of ["15m", "1h", "6h", "24h"]) {
      const o = (await fetchAs(running, `/_portal/app/ops/observability/overview?window=${w}`)!.json()) as ObservabilityOverview;
      expect(o.requests).toBeGreaterThan(0);
      expect(o.minutes!.length).toBeGreaterThan(0);
      expect(Date.parse(o.to) - Date.parse(o.from)).toBe(o.window_seconds * 1000);
      expect(o.top_routes.by_errors!.length).toBeGreaterThan(0);
      expect(o.top_routes.by_latency![0].route).toBe("/v1/reports/usage");
    }
    const r = (await fetchAs(running, "/_portal/app/ops/observability/routes?window=1h&sort=p95&limit=3")!.json()) as RoutesResponse;
    expect(r.routes).toHaveLength(3);
    expect(r.routes![0].latency_ms.p95).toBeGreaterThanOrEqual(r.routes![1].latency_ms.p95);
    expect(fetchAs(running, "/_portal/app/ops/observability/routes?sort=nope")!.status).toBe(422);
    const refused = fetchAs(stopped, "/_portal/app/ops/observability/overview")!;
    expect(refused.status).toBe(502);
    expect(((await refused.json()) as Problem).code).toBe("app_unavailable");
  });

  it("streams overview events", async () => {
    const res = fetchAs(running, "/_portal/app/ops/observability/stream?window=15m")!;
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("retry: 5000");
    const second = new TextDecoder().decode((await reader.read()).value);
    expect(second.startsWith("event: overview\ndata: ")).toBe(true);
    await reader.cancel();
  });

  it("leaves other paths alone", () => {
    expect(fetchAs(running, "/_portal/api/status")).toBeUndefined();
    expect(fetchAs(running, "/_portal/api/db/tables")).toBeUndefined();
    expect(fetchAs(running, "/_portal/app/ops/system")).toBeUndefined();
  });
});
