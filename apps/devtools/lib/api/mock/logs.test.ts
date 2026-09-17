import { beforeEach, describe, expect, it } from "vitest";
import type { ErrorGroups, LogHistogram, LogPage, LogRecord, LogStats, RequestLogs, SavedFilters } from "../logs";
import type { Problem } from "../types";
import { mockLogsFetch, resetMockLogs } from "./logs";

const get = async <T>(path: string): Promise<T> => {
  const res = mockLogsFetch(new URL(path, "http://127.0.0.1:3100"), "GET");
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};
const attr = (r: LogRecord, k: string) => r.attrs?.find((a) => a.key === k)?.value;

beforeEach(() => resetMockLogs());

describe("the mock log store", () => {
  it("holds a few hundred records over the last hour across every source, newest first", async () => {
    const page = await get<LogPage>("/_portal/api/logs?limit=1000");
    expect(page.logs.length).toBeGreaterThan(300);
    expect(page.logs.length).toBeLessThan(700);
    expect(page.next_before).toBeUndefined();
    const ids = page.logs.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    const sources = new Set(page.logs.map((r) => r.source));
    for (const s of ["http", "auth", "jobs", "mail", "storage", "postgres", "app", "orb"]) expect(sources.has(s)).toBe(true);
    expect(Date.now() - Date.parse(page.logs[page.logs.length - 1].time)).toBeLessThan(3_700_000);
    const http = page.logs.find((r) => r.source === "http")!;
    for (const k of ["method", "path", "route", "status", "duration_ms", "request_id", "trace_id"]) expect(attr(http, k)).toBeDefined();
    expect(page.logs.some((r) => r.raw && !r.message)).toBe(true);
    expect(page.logs.some((r) => r.level === "ERROR" && attr(r, "stack"))).toBe(true);
  });

  it("pages backwards with next_before", async () => {
    const first = await get<LogPage>("/_portal/api/logs?limit=50");
    expect(first.logs).toHaveLength(50);
    expect(first.next_before).toBe(first.logs[49].id);
    const second = await get<LogPage>(`/_portal/api/logs?limit=50&before=${first.next_before}`);
    expect(second.logs[0].id).toBeLessThan(first.logs[49].id);
    const after = await get<LogPage>(`/_portal/api/logs?after=${first.logs[10].id}&limit=1000`);
    expect(after.logs.map((r) => r.id)).toEqual(first.logs.slice(0, 10).map((r) => r.id));
  });

  it("filters like the store's Matches", async () => {
    const all = (await get<LogPage>("/_portal/api/logs?limit=1000")).logs;
    const errors = (await get<LogPage>("/_portal/api/logs?limit=1000&level=error,WARN")).logs;
    expect(errors.length).toBe(all.filter((r) => r.level === "ERROR" || r.level === "WARN").length);
    expect((await get<LogPage>("/_portal/api/logs?limit=1000&min_level=warn")).logs.length).toBe(errors.length);
    const http5xx = (await get<LogPage>("/_portal/api/logs?limit=1000&source=http&status_class=5xx")).logs;
    expect(http5xx.length).toBeGreaterThan(0);
    expect(http5xx.every((r) => r.source === "http" && attr(r, "status") === "500")).toBe(true);
    expect((await get<LogPage>("/_portal/api/logs?limit=1000&status=404")).logs.every((r) => attr(r, "status") === "404")).toBe(true);
    const slow = (await get<LogPage>("/_portal/api/logs?limit=1000&min_duration_ms=100")).logs;
    expect(slow.every((r) => Number(attr(r, "duration_ms")) >= 100)).toBe(true);
    const posts = (await get<LogPage>("/_portal/api/logs?limit=1000&method=post&path=/v1/auth")).logs;
    expect(posts.every((r) => attr(r, "method") === "POST" && attr(r, "path")!.startsWith("/v1/auth"))).toBe(true);
    const user = attr(all.find((r) => attr(r, "user_id"))!, "user_id")!;
    const byUser = (await get<LogPage>(`/_portal/api/logs?limit=1000&user=${user}`)).logs;
    expect(byUser.length).toBeGreaterThan(0);
    expect(byUser.every((r) => attr(r, "user_id") === user)).toBe(true);
    const text = (await get<LogPage>("/_portal/api/logs?limit=1000&q=PANICKED")).logs;
    expect(text.length).toBeGreaterThan(0);
    expect(text.every((r) => r.message.includes("panicked"))).toBe(true);
    const from = new Date(Date.now() - 10 * 60_000).toISOString();
    const recent = (await get<LogPage>(`/_portal/api/logs?limit=1000&from=${encodeURIComponent(from)}`)).logs;
    expect(recent.every((r) => r.time >= from)).toBe(true);
    expect(recent.length).toBeLessThan(all.length);
    const bad = mockLogsFetch(new URL("/_portal/api/logs?from=yesterday", "http://x"), "GET");
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Problem).code).toBe("invalid_query");
    expect(mockLogsFetch(new URL("/_portal/api/logs?status_class=5", "http://x"), "GET").status).toBe(400);
  });

  it("answers a request's records oldest first", async () => {
    const all = (await get<LogPage>("/_portal/api/logs?limit=1000")).logs;
    const withCompanion = all.find((r) => r.source === "auth" && attr(r, "request_id"))!;
    const id = attr(withCompanion, "request_id")!;
    const req = await get<RequestLogs>(`/_portal/api/logs/request/${id}`);
    expect(req.request_id).toBe(id);
    expect(req.logs.length).toBeGreaterThanOrEqual(2);
    expect(req.logs.map((r) => r.id)).toEqual([...req.logs.map((r) => r.id)].sort((a, b) => a - b));
    expect(req.logs.every((r) => attr(r, "request_id") === id)).toBe(true);
  });

  it("buckets the histogram, one per interval, empty ones included", async () => {
    const h = await get<LogHistogram>("/_portal/api/logs/histogram?bucket=5m");
    expect(h.bucket).toBe("5m");
    expect(h.buckets.length).toBe(13);
    const total = h.buckets.reduce((n, b) => n + b.total, 0);
    const all = (await get<LogPage>("/_portal/api/logs?limit=1000")).logs;
    expect(total).toBe(all.length);
    for (const b of h.buckets) expect(b.levels.debug + b.levels.info + b.levels.warn + b.levels.error).toBe(b.total);
    expect(mockLogsFetch(new URL("/_portal/api/logs/histogram?bucket=1ms", "http://x"), "GET").status).toBe(400);
    expect(mockLogsFetch(new URL("/_portal/api/logs/histogram?bucket=1s&from=2020-01-01T00:00:00Z", "http://x"), "GET").status).toBe(400);
  });

  it("groups errors by fingerprint with counts and the last record", async () => {
    const { groups } = await get<ErrorGroups>("/_portal/api/logs/errors");
    expect(groups.length).toBeGreaterThan(3);
    expect(groups.every((g) => g.level === "WARN" || g.level === "ERROR")).toBe(true);
    const panics = groups.find((g) => g.shape === "handler panicked")!;
    expect(panics.top).toBe("runtime error: invalid memory address or nil pointer dereference");
    expect(panics.count).toBeGreaterThan(1);
    expect(attr(panics.last, "request_id")).toBeDefined();
    expect(panics.first_seen <= panics.last_seen).toBe(true);
    const failed = groups.find((g) => g.shape === "auth: sign-in failed")!;
    expect(failed.top).toBe("invalid credentials");
    const lastSeen = groups.map((g) => g.last_seen);
    expect(lastSeen).toEqual([...lastSeen].sort().reverse());
    const only = await get<ErrorGroups>("/_portal/api/logs/errors?source=jobs");
    expect(only.groups.every((g) => g.source === "jobs")).toBe(true);
  });

  it("reports stats and clears", async () => {
    const st = await get<LogStats>("/_portal/api/logs/stats");
    expect(st.records).toBeGreaterThan(300);
    expect(st.bytes).toBeGreaterThan(10_000);
    expect(st).toMatchObject({ max_bytes: 64 << 20, segments: 1, dir: ".orb/portal/logs" });
    expect(st.oldest).toBeDefined();
    const del = mockLogsFetch(new URL("/_portal/api/logs", "http://x"), "DELETE", { headers: { "X-Orb-Portal": "1" } });
    expect(del.status).toBe(204);
    const after = await get<LogStats>("/_portal/api/logs/stats");
    expect(after.records).toBe(0);
    expect(after.oldest).toBeUndefined();
    expect((await get<LogPage>("/_portal/api/logs")).logs).toEqual([]);
  });

  it("saves, lists and deletes filters", async () => {
    expect((await get<SavedFilters>("/_portal/api/logs/filters")).filters).toEqual([]);
    const put = (body: unknown) => mockLogsFetch(new URL("/_portal/api/logs/filters", "http://x"), "PUT", { body: JSON.stringify(body) });
    let res = put({ name: "Slow requests", query: { source: ["http"], min_duration_ms: 250 } });
    expect(res.status).toBe(200);
    res = put({ name: "5xx", query: { status_class: "5xx" } });
    const list = (await res.json()) as SavedFilters;
    expect(list.filters.map((f) => f.name)).toEqual(["5xx", "Slow requests"]);
    expect(list.filters[1].query).toEqual({ source: ["http"], min_duration_ms: 250 });
    expect(put({ name: "/bad", query: {} }).status).toBe(400);
    expect(put({ name: "ok", query: "nope" }).status).toBe(400);
    expect(mockLogsFetch(new URL("/_portal/api/logs/filters/5xx", "http://x"), "DELETE").status).toBe(204);
    expect((await get<SavedFilters>("/_portal/api/logs/filters")).filters.map((f) => f.name)).toEqual(["Slow requests"]);
  });

  it("streams the records after a cursor, then new ones", async () => {
    const first = await get<LogPage>("/_portal/api/logs?limit=3");
    const after = first.logs[2].id;
    const ac = new AbortController();
    const res = mockLogsFetch(new URL(`/_portal/api/logs/stream?after=${after}`, "http://x"), "GET", { signal: ac.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    while ((text.match(/event: log/g) ?? []).length < 2) text += dec.decode((await reader.read()).value);
    expect(text.startsWith("retry: 3000\n\n")).toBe(true);
    const ids = [...text.matchAll(/data: (\{.*\})/g)].map((m) => (JSON.parse(m[1]) as LogRecord).id);
    expect(ids.slice(0, 2)).toEqual([first.logs[1].id, first.logs[0].id]);
    ac.abort();
    expect((await reader.read()).done).toBe(true);
  });
});
