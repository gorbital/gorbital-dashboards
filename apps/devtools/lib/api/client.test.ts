import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, MUTATION_HEADER, NotConnectedError, apiFetch, parseDevStreamEvent, parseEvent, subscribeEvents, subscribeSSE, type EventsStatus } from "./client";
import type { DevStreamEvent, PortalEvent } from "./types";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });

describe("apiFetch", () => {
  it("sends the cookie and no mutation header on GET", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await expect(apiFetch<{ ok: boolean }>("/_portal/api/session")).resolves.toEqual({ ok: true });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/_portal/api/session");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Headers).get(MUTATION_HEADER)).toBeNull();
  });

  it("adds the mutation header and a JSON body on POST", async () => {
    fetchMock.mockResolvedValueOnce(json({ accepted: true }, 202));
    await apiFetch("/_portal/api/generators/job/plan", { method: "POST", json: { input: { name: "X" } } });
    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get(MUTATION_HEADER)).toBe("1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe('{"input":{"name":"X"}}');
  });

  it("turns problem+json into ApiError", async () => {
    fetchMock.mockResolvedValueOnce(json({ title: "Conflict", status: 409, code: "app_action_failed", detail: "a build is already running" }, 409, "application/problem+json"));
    const err = await apiFetch("/_portal/api/app/restart", { method: "POST" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const api = err as ApiError;
    expect(api.status).toBe(409);
    expect(api.code).toBe("app_action_failed");
    expect(api.detail).toBe("a build is already running");
    expect(api.message).toBe("a build is already running");
    expect(api.unauthorized).toBe(false);
  });

  it("flags 401 as unauthorized and copes with non-JSON errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401, headers: { "Content-Type": "text/plain" } }));
    const err = (await apiFetch("/_portal/api/status").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthorized");
    expect(err.unauthorized).toBe(true);
    expect(err.detail).toBe("nope");
  });

  it("turns a network failure into NotConnectedError", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await apiFetch("/_portal/api/status").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotConnectedError);
    expect((err as Error).cause).toBeInstanceOf(TypeError);
  });
});

describe("parseEvent", () => {
  it("normalises the first bare state event", () => {
    const e = parseEvent("state", '{"state":"running","addr":"127.0.0.1:8080","url":"http://127.0.0.1:8080","restarts":0,"console":true}');
    expect(e?.type).toBe("state");
    expect(e && e.type === "state" ? e.state.state : null).toBe("running");
  });

  it("reads wrapped state, output and dropped events", () => {
    expect(parseEvent("state", '{"type":"state","time":"t","state":{"state":"stopped","addr":"","url":"","restarts":1,"console":false}}')).toMatchObject({ type: "state", time: "t", state: { state: "stopped" } });
    expect(parseEvent("output", '{"type":"output","time":"t","output":{"time":"t","stream":"app","text":"hi"}}')).toEqual({ type: "output", time: "t", output: { time: "t", stream: "app", text: "hi" } });
    expect(parseEvent("dropped", '{"count":3}')).toMatchObject({ type: "dropped", count: 3 });
  });

  it("reads a schema event and fills the lists an older orb leaves out", () => {
    const e = parseEvent("schema", '{"type":"schema","time":"t","schema":{"database":true,"source":"migrate","checked_at":"c","applied":["20260917000010_invoices.sql"],"pending":null,"edited":null,"needs_restart":false,"problem":""}}');
    expect(e).toEqual({ type: "schema", time: "t", schema: { database: true, source: "migrate", checked_at: "c", applied: ["20260917000010_invoices.sql"], pending: [], edited: [], needs_restart: false, problem: "" } });
    expect(parseEvent("schema", '{"type":"schema","time":"t"}')).toBeNull();
    expect(parseEvent("schema", '{"type":"state","time":"t","schema":{}}')).toBeNull();
  });

  it("gives null for garbage and unknown events", () => {
    expect(parseEvent("state", "not json")).toBeNull();
    expect(parseEvent("whatever", "{}")).toBeNull();
    expect(parseEvent("output", '{"type":"output"}')).toBeNull();
  });
});

function sse(chunks: string[], status = 200) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

describe("subscribeEvents", () => {
  it("delivers events from split chunks, ignores keep-alives, and reconnects after end", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        sse([
          "retry: 3000\n\n",
          'event: state\ndata: {"state":"running","addr":"127.0.0.1:8080","url":"u","restarts":0,"console":true}\n\n: keep-alive\n\nevent: out',
          'put\ndata: {"type":"output","time":"t1","output":{"time":"t1","stream":"orb","text":"ready"}}\n\n',
          'event: end\ndata: {"reason":"max_duration"}\n\n',
        ]),
      )
      .mockResolvedValueOnce(sse(['event: state\ndata: {"state":"stopped","addr":"","url":"","restarts":1,"console":false}\n\n']));
    const events: PortalEvent[] = [];
    const statuses: EventsStatus[] = [];
    const stop = subscribeEvents((e) => events.push(e), (s) => statuses.push(s));

    await vi.advanceTimersByTimeAsync(0);
    expect(events.map((e) => e.type)).toEqual(["state", "output"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe("same-origin");
    expect((init?.headers as Headers).get("Accept")).toBe("text/event-stream");
    expect(statuses.at(-1)).toMatchObject({ state: "closed", reason: "end", retryIn: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(3);
    expect(events[2]).toMatchObject({ type: "state", state: { state: "stopped" } });

    stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never reads a stream that arrives after stop() was called", async () => {
    vi.useFakeTimers();
    let resolve: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const events: PortalEvent[] = [];
    const stop = subscribeEvents((e) => events.push(e));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    resolve(sse(['event: state\ndata: {"state":"running","addr":"","url":"","restarts":0,"console":true}\n\n']));
    await vi.advanceTimersByTimeAsync(5000);
    expect(events).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backs off from 1 s to 10 s while nothing answers, and reports 401", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const statuses: EventsStatus[] = [];
    const stop = subscribeEvents(() => {}, (s) => statuses.push(s));
    await vi.advanceTimersByTimeAsync(0);
    const closed = () => statuses.filter((s) => s.state === "closed") as Extract<EventsStatus, { state: "closed" }>[];
    expect(closed().map((s) => s.retryIn)).toEqual([1000]);
    expect(closed()[0].error).toBeInstanceOf(NotConnectedError);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(closed().map((s) => s.retryIn)).toEqual([1000, 2000, 4000, 8000, 10_000]);

    fetchMock.mockResolvedValue(new Response('{"status":401,"code":"unauthorized"}', { status: 401, headers: { "Content-Type": "application/problem+json" } }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(closed().at(-1)).toMatchObject({ reason: "unauthorized", retryIn: 10_000 });
    stop();
  });
});

describe("subscribeSSE and parseDevStreamEvent", () => {
  it("delivers every named message from a dev console stream and parses items, dropped and end", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      sse(['retry: 3000\n\nevent: request\ndata: {"time":"t","method":"GET","route":"/v1/ping","path":"/v1/ping","status":200,"duration_ms":0.4}\n\n: keep-alive\n\nevent: dropped\ndata: {"count":2}\n\nevent: end\ndata: {"reason":"shutdown"}\n\n']),
    );
    fetchMock.mockRejectedValue(new TypeError("gone"));
    const seen: DevStreamEvent<{ path: string }>[] = [];
    const statuses: EventsStatus[] = [];
    const stop = subscribeSSE(
      "/_portal/app/_dev/requests/stream",
      (m) => {
        const e = parseDevStreamEvent<{ path: string }>(m.event, "request", m.data);
        if (e) seen.push(e);
      },
      (s) => statuses.push(s),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls[0][0]).toBe("/_portal/app/_dev/requests/stream");
    expect(seen).toEqual([
      { type: "item", item: expect.objectContaining({ path: "/v1/ping" }) },
      { type: "dropped", count: 2 },
    ]);
    // `end` closes the stream cleanly and schedules a reconnect rather than reaching onMessage.
    expect(statuses.at(-1)).toMatchObject({ state: "closed", reason: "end", retryIn: 1000 });
    stop();
  });

  it("parseDevStreamEvent ignores other event names and bad data", () => {
    expect(parseDevStreamEvent("log", "request", '{"a":1}')).toBeNull();
    expect(parseDevStreamEvent("request", "request", "nope")).toBeNull();
    expect(parseDevStreamEvent("end", "request", '{"reason":"max_duration"}')).toEqual({ type: "end", reason: "max_duration" });
  });
});
