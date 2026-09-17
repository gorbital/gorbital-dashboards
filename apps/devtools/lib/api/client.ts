import { dataMode } from "./mode";
import { readSSE, type SSEMessage } from "./sse";
import type { AppStatus, DevStreamEvent, OutputLine, PortalEvent, Problem, SchemaStatus } from "./types";
import type { TunnelStatus } from "./tunnel";

/** Every request that isn't GET or HEAD must carry it; the portal refuses the rest with 403. */
export const MUTATION_HEADER = "X-Orb-Portal";

/** The portal or the app answered with a problem (4xx, 5xx). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly title: string;
  constructor(problem: Problem) {
    super(problem.detail || problem.title || `${problem.status} ${problem.code}`);
    this.name = "ApiError";
    this.status = problem.status;
    this.code = problem.code;
    this.detail = problem.detail ?? "";
    this.title = problem.title ?? "";
  }
  /** Not signed in: open the link orb dev printed. */
  get unauthorized() {
    return this.status === 401;
  }
}

/** Nothing answered at all: orb dev isn't running, or the dev server can't reach it. */
export class NotConnectedError extends Error {
  constructor(cause?: unknown) {
    super("orb dev isn't running, or the portal can't be reached", { cause });
    this.name = "NotConnectedError";
  }
}

/** The fetch behind every request: the browser's in live mode, the in-memory portal in mock mode. */
export async function transportFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (dataMode() === "mock") {
    const { mockFetch } = await import("./mock");
    return mockFetch(path, init);
  }
  return fetch(path, init);
}

/** Adds what the portal needs: the cookie, and the mutation header on anything but GET/HEAD. */
export function portalInit(init: RequestInit = {}): RequestInit {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, application/problem+json");
  if (method !== "GET" && method !== "HEAD") headers.set(MUTATION_HEADER, "1");
  return { ...init, method, headers, credentials: "same-origin" };
}

type FetchInit = Omit<RequestInit, "body"> & {
  /** Sent as the JSON body. */
  json?: unknown;
};

/**
 * Fetches a JSON endpoint on the portal's origin. Throws `ApiError` for a
 * problem response, `NotConnectedError` when the request never got an
 * answer.
 */
export async function apiFetch<T>(path: string, { json, ...init }: FetchInit = {}): Promise<T> {
  const req = portalInit(init);
  if (json !== undefined) {
    (req.headers as Headers).set("Content-Type", "application/json");
    req.body = JSON.stringify(json);
  }
  let res: Response;
  try {
    res = await transportFetch(path, req);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NotConnectedError(err);
  }
  if (!res.ok) throw new ApiError(await readProblem(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Builds a `Problem` from any error response, even one that isn't problem+json. */
export async function readProblem(res: Response): Promise<Problem> {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    try {
      const body = (await res.json()) as Partial<Problem>;
      return { ...body, status: typeof body.status === "number" ? body.status : res.status, code: body.code ?? codeFor(res.status) };
    } catch {
      // Fall through: not JSON after all.
    }
  }
  let detail = "";
  try {
    detail = (await res.text()).trim().slice(0, 300);
  } catch {
    // The body may be gone.
  }
  return { status: res.status, code: codeFor(res.status), title: res.statusText, detail };
}

function codeFor(status: number): string {
  return { 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 429: "rate_limited", 502: "app_unavailable" }[status] ?? "error";
}

/* ---------- Server-Sent Events ---------- */

export type EventsStatus =
  | { state: "connecting"; attempt: number }
  | { state: "open"; attempt: number }
  | { state: "closed"; attempt: number; reason: "end" | "error" | "unauthorized"; retryIn: number; error?: Error };

const backoff = { min: 1000, max: 10_000 };

/**
 * Subscribes to a `text/event-stream` on the portal's origin with fetch
 * (EventSource can't carry the cookie's protections nor let us control
 * reconnects). Every message reaches `onMessage` except `end`, which closes
 * the stream cleanly; after `end` or any failure the stream reconnects with
 * a 1 s → 10 s backoff. Returns the function that stops it. Both the portal's
 * `/_portal/api/events` and the dev console's streams under `/_dev/` (through the
 * proxy) speak this shape.
 */
export function subscribeSSE(path: string, onMessage: (m: SSEMessage) => void, onStatus?: (s: EventsStatus) => void): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (reason: "end" | "error" | "unauthorized", error?: Error) => {
    if (signal.aborted) return;
    const retryIn = Math.min(backoff.max, backoff.min * 2 ** Math.min(attempt, 10));
    attempt++;
    onStatus?.({ state: "closed", attempt, reason, retryIn, error });
    timer = setTimeout(connect, retryIn);
  };

  const connect = async () => {
    if (signal.aborted) return;
    onStatus?.({ state: "connecting", attempt });
    let res: Response;
    try {
      res = await transportFetch(path, { ...portalInit({ headers: { Accept: "text/event-stream" } }), signal, cache: "no-store" });
    } catch (err) {
      if (signal.aborted) return;
      return schedule("error", new NotConnectedError(err));
    }
    if (signal.aborted) {
      // Stopped while the request was in flight: never read a stream nobody wants.
      await res.body?.cancel().catch(() => {});
      return;
    }
    if (!res.ok || !res.body) {
      const problem = await readProblem(res);
      return schedule(res.status === 401 ? "unauthorized" : "error", new ApiError(problem));
    }
    attempt = 0;
    onStatus?.({ state: "open", attempt });
    let ended = false;
    try {
      await readSSE(
        res.body,
        (m) => {
          if (m.event === "end") {
            ended = true;
            return;
          }
          onMessage(m);
        },
        signal,
      );
    } catch (err) {
      if (signal.aborted) return;
      return schedule("error", err instanceof Error ? err : new NotConnectedError(err));
    }
    if (signal.aborted) return;
    schedule(ended ? "end" : "error");
  };

  void connect();
  return () => {
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}

/**
 * The portal's own stream, `/_portal/api/events`. The first `state` event
 * carries a bare AppStatus; it is normalised into a `PortalEvent`.
 */
export function subscribeEvents(onEvent: (e: PortalEvent) => void, onStatus?: (s: EventsStatus) => void): () => void {
  return subscribeSSE(
    "/_portal/api/events",
    (m) => {
      const e = parseEvent(m.event, m.data);
      if (e) onEvent(e);
    },
    onStatus,
  );
}

/**
 * A dev console stream (`/_dev/requests/stream`, `/_dev/logs/stream`): each
 * message named `event` is one item, `dropped` counts what the client missed.
 */
export function parseDevStreamEvent<T>(event: string, itemEvent: string, data: string): DevStreamEvent<T> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (event === itemEvent) return { type: "item", item: parsed as T };
  if (event === "dropped" && typeof (parsed as { count?: unknown }).count === "number") return { type: "dropped", count: (parsed as { count: number }).count };
  if (event === "end") return { type: "end", reason: String((parsed as { reason?: unknown }).reason ?? "") };
  return null;
}

/** Turns one SSE message into a `PortalEvent`; unknown events and malformed data give null. */
export function parseEvent(event: string, data: string): PortalEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (event === "state") {
    if (o.type === "state" && o.state && typeof o.state === "object") return { type: "state", time: String(o.time ?? ""), state: o.state as AppStatus };
    if (typeof o.state === "string") return { type: "state", time: new Date().toISOString(), state: o as unknown as AppStatus };
    return null;
  }
  if (event === "output" && o.type === "output" && o.output && typeof o.output === "object") {
    return { type: "output", time: String(o.time ?? ""), output: o.output as OutputLine };
  }
  if (event === "schema" && o.type === "schema" && o.schema && typeof o.schema === "object") {
    return { type: "schema", time: String(o.time ?? ""), schema: normaliseSchemaStatus(o.schema as Partial<SchemaStatus>) };
  }
  if (event === "tunnel" && o.type === "tunnel" && o.tunnel && typeof o.tunnel === "object") {
    const t = o.tunnel as TunnelStatus;
    return { type: "tunnel", time: String(o.time ?? ""), tunnel: { ...t, log: Array.isArray(t.log) ? t.log : [] } };
  }
  if (event === "dropped" && typeof o.count === "number") return { type: "dropped", time: new Date().toISOString(), count: o.count };
  return null;
}

/** Fills the lists an older orb may leave out (`null` for an empty slice in Go), so the UI never reads `undefined.length`. */
export function normaliseSchemaStatus(s: Partial<SchemaStatus>): SchemaStatus {
  return {
    database: s.database !== false,
    source: s.source ?? "startup",
    checked_at: s.checked_at ?? "",
    applied: Array.isArray(s.applied) ? s.applied : [],
    pending: Array.isArray(s.pending) ? s.pending : [],
    edited: Array.isArray(s.edited) ? s.edited : [],
    needs_restart: Boolean(s.needs_restart),
    problem: s.problem ?? "",
  };
}
