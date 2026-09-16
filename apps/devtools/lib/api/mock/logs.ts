/**
 * The in-memory log store behind `/_portal/api/logs*` in mock mode
 * (ADR-0072): about 400 records over the last hour across every source,
 * the same filters, paging, histogram, error groups, saved filters, stats
 * and clear as cli/internal/portal/logstore.go, and a stream that keeps
 * adding records every couple of seconds while someone listens.
 */
import { rng } from "@gorbital/dash/lib/rand";
import type { ErrorGroup, LogAttr, LogBucket, LogRecord, LogStats, SavedFilter } from "../logs";
import type { Problem } from "../types";
import { fingerprint, fingerprintID } from "@/lib/logs/fingerprint";

const SEGMENT_BYTES = 8 << 20;
const MAX_STORE_BYTES = 64 << 20;
const MAX_QUERY = 1000;
const STREAM_EVERY = 2000;

/* ---------- Records ---------- */

type Draft = Omit<LogRecord, "id" | "time"> & { offset?: number };

const r = rng(72);
const reqId = () => `req_${r.hex(16)}`;
const traceId = () => r.hex(32);
const spanId = () => r.hex(16);
const users = ["usr_01j8x4a9k2", "usr_01j8x4b7m5", "usr_01j8x4c3p8"];
const emails = ["ada@example.com", "grace@example.com", "linus@example.com"];

/** Attributes sorted by key, as the store flattens a JSON line. */
const attrs = (o: Record<string, string | number | undefined>): LogAttr[] =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => ({ key, value: String(value) }));

type Route = { method: string; route: string; path: () => string; status: number; ms: [number, number]; user?: boolean; then?: (ctx: { request_id: string; user_id?: string; path: string }) => Draft[] };

const stack = "runtime error: invalid memory address or nil pointer dereference\ngoroutine 1 [running]:\ngithub.com/acme/app/internal/api/projects.(*Handler).Update(0x0, {0x1400012a000, 0x1400012a040})\n\t/src/internal/api/projects/update.go:48 +0x1f4\nnet/http.HandlerFunc.ServeHTTP(...)\n\t/usr/local/go/src/net/http/server.go:2220 +0x30";

/** A PostgreSQL line, as the container logs it (no request id: the database doesn't know one). */
const pg = (message: string): Draft => ({ source: "postgres", level: "INFO", message, attrs: attrs({ pid: r.int(40, 900), severity: "LOG" }), offset: 1 });

const routes: Route[] = [
  { method: "GET", route: "/healthz", path: () => "/healthz", status: 200, ms: [0.1, 0.8] },
  { method: "GET", route: "/readyz", path: () => "/readyz", status: 200, ms: [1.5, 6] },
  { method: "GET", route: "/v1/me", path: () => "/v1/me", status: 200, ms: [3, 12], user: true, then: () => (r.chance(0.5) ? [pg(`duration: ${(2 + r.next() * 20).toFixed(3)} ms  statement: SELECT id, email, created_at FROM users WHERE id = $1`)] : []) },
  { method: "GET", route: "/v1/orgs", path: () => "/v1/orgs", status: 200, ms: [8, 30], user: true },
  { method: "GET", route: "/v1/orgs/{org}/projects", path: () => `/v1/orgs/${r.pick(["acme", "globex", "initech"])}/projects`, status: 200, ms: [20, 90], user: true, then: () => (r.chance(0.3) ? [pg(`duration: ${(80 + r.next() * 400).toFixed(3)} ms  statement: SELECT p.* FROM projects p WHERE p.org_id = $1 ORDER BY p.created_at DESC`)] : []) },
  { method: "GET", route: "/v1/auth/me", path: () => "/v1/auth/me", status: 401, ms: [0.2, 1.5] },
  {
    method: "POST",
    route: "/v1/auth/login",
    path: () => "/v1/auth/login",
    status: 200,
    ms: [90, 180],
    then: ({ request_id, user_id }) => [
      { source: "auth", level: "INFO", message: "auth: session created", attrs: attrs({ request_id, session_id: `ses_${r.hex(12)}`, source: "auth", user_id }) },
    ],
  },
  {
    method: "POST",
    route: "/v1/auth/login",
    path: () => "/v1/auth/login",
    status: 401,
    ms: [80, 160],
    then: ({ request_id }) => [{ source: "auth", level: "WARN", message: "auth: sign-in failed", attrs: attrs({ email: r.pick(emails), error: "invalid credentials", request_id, source: "auth" }) }],
  },
  {
    method: "POST",
    route: "/v1/auth/login",
    path: () => "/v1/auth/login",
    status: 400,
    ms: [0.3, 1.2],
    then: ({ request_id }) => [{ source: "app", level: "WARN", message: "request body rejected", attrs: attrs({ error: "invalid character '}' looking for beginning of value", request_id }) }],
  },
  { method: "GET", route: "", path: () => r.pick(["/nope", "/favicon.ico", "/.env", "/wp-login.php"]), status: 404, ms: [0.1, 0.5] },
  {
    method: "PATCH",
    route: "/v1/orgs/{org}/projects/{id}",
    path: () => `/v1/orgs/acme/projects/prj_${r.hex(6)}`,
    status: 500,
    ms: [10, 40],
    user: true,
    then: ({ request_id, path }) => [{ source: "app", level: "ERROR", message: "handler panicked", attrs: attrs({ panic: "runtime error: invalid memory address or nil pointer dereference", path, request_id, route: "PATCH /v1/orgs/{org}/projects/{id}", stack }) }],
  },
  {
    method: "POST",
    route: "/v1/files",
    path: () => "/v1/files",
    status: 201,
    ms: [40, 300],
    user: true,
    then: ({ request_id }) => [{ source: "storage", level: "INFO", message: "storage: object stored", attrs: attrs({ bucket: "uploads", bytes: r.int(2_000, 4_000_000), key: `2026/09/${r.hex(24)}.png`, request_id, source: "storage" }) }],
  },
  { method: "DELETE", route: "/v1/orgs/{org}/projects/{id}", path: () => `/v1/orgs/acme/projects/prj_${r.hex(6)}`, status: 204, ms: [12, 35], user: true },
  { method: "GET", route: "/v1/orgs/{org}/projects/{id}", path: () => `/v1/orgs/acme/projects/prj_${r.hex(6)}`, status: 304, ms: [2, 6], user: true },
];


function httpEvent(): Draft[] {
  const route = r.pick(routes);
  const request_id = reqId();
  const user_id = route.user || (route.route === "/v1/auth/login" && route.status === 200) ? r.pick(users) : undefined;
  const path = route.path();
  const duration = route.ms[0] + r.next() * (route.ms[1] - route.ms[0]);
  const out: Draft[] = (route.then?.({ request_id, user_id, path }) ?? []).map((d, i) => ({ ...d, offset: i }));
  out.push({
    source: "http",
    level: "INFO",
    message: "http request",
    offset: out.length + 1,
    attrs: attrs({
      bytes: route.status === 204 || route.status === 304 ? 0 : r.int(80, 4200),
      duration_ms: duration < 1 ? duration.toFixed(3) : duration.toFixed(1),
      method: route.method,
      path,
      request_id,
      route: route.route,
      service: "fullsmoke",
      source: "http",
      span_id: spanId(),
      status: route.status,
      trace_id: traceId(),
      user_id,
    }),
  });
  return out;
}

const jobKinds = ["audit.rollup", "mail.send", "storage.gc", "reports.daily"];

function jobsEvent(): Draft[] {
  const kind = r.pick(jobKinds);
  const job_id = r.int(3000, 9000);
  const queue = kind === "mail.send" ? "mail" : "default";
  if (r.chance(0.25)) return [{ source: "jobs", level: "INFO", message: "producer: Producer job counts", attrs: attrs({ num_completed_jobs: r.int(0, 12), num_jobs_running: r.int(0, 2), num_jobs_stuck: 0, queue, service: "fullsmoke", source: "jobs" }) }];
  const failed = kind === "mail.send" && r.chance(0.5);
  return [
    { source: "jobs", level: "INFO", message: "job started", attrs: attrs({ attempt: failed ? 3 : 1, job_id, kind, queue, source: "jobs" }) },
    failed
      ? { source: "jobs", level: "ERROR", message: "job failed", attrs: attrs({ attempt: 3, error: "dial tcp 127.0.0.1:1025: connect: connection refused", job_id, kind, queue, source: "jobs" }), offset: r.int(200, 900) }
      : { source: "jobs", level: "INFO", message: "job succeeded", attrs: attrs({ duration_ms: r.int(40, 2400), job_id, kind, queue, source: "jobs" }), offset: r.int(200, 900) },
  ];
}

function mailEvent(): Draft[] {
  const message_id = `<${r.hex(20)}@fullsmoke.local>`;
  const to = r.pick(emails);
  if (r.chance(0.3)) return [{ source: "mail", level: "WARN", message: "mail: delivery failed", attrs: attrs({ error: "smtp: 421 4.7.0 too many connections from this host", message_id, source: "mail", to }) }];
  return [{ source: "mail", level: "INFO", message: "mail: queued", attrs: attrs({ message_id, source: "mail", template: r.pick(["welcome", "password_reset", "invoice"]), to }) }];
}

function authEvent(): Draft[] {
  if (r.chance(0.4)) return [{ source: "auth", level: "INFO", message: "auth: signed out", attrs: attrs({ session_id: `ses_${r.hex(12)}`, source: "auth", user_id: r.pick(users) }) }];
  return [{ source: "auth", level: "WARN", message: "auth: rate limited", attrs: attrs({ ip: "127.0.0.1", route: "POST /v1/auth/login", source: "auth", window: "1m" }) }];
}

function appEvent(): Draft[] {
  const pick = r.next();
  if (pick < 0.4) return [{ source: "app", level: "DEBUG", message: "cache hit", attrs: attrs({ key: `org:${r.pick(["acme", "globex"])}:settings`, ttl_s: r.int(10, 300) }) }];
  if (pick < 0.7) return [{ source: "app", level: "INFO", message: "settings loaded", attrs: attrs({ count: r.int(18, 24), modified: r.int(0, 3) }) }];
  if (pick < 0.85) return [{ source: "app", level: "ERROR", message: `flag evaluation failed for "${r.pick(["new_dashboard", "beta_exports"])}"`, attrs: attrs({ error: "rollout percentage 140 is out of range" }) }];
  return [{ source: "app", level: "INFO", message: "", raw: `2026/09/16 ${String(r.int(10, 23)).padStart(2, "0")}:${String(r.int(0, 59)).padStart(2, "0")}:00 http: TLS handshake error from 127.0.0.1:${r.int(40000, 65000)}: EOF` }];
}

function postgresEvent(): Draft[] {
  const pick = r.next();
  if (pick < 0.5) return [{ source: "postgres", level: "INFO", message: `checkpoint complete: wrote ${r.int(4, 120)} buffers (0.${r.int(1, 9)}%); 0 WAL file(s) added, 0 removed, 1 recycled`, attrs: attrs({ pid: r.int(40, 90), severity: "LOG" }) }];
  if (pick < 0.8) return [{ source: "postgres", level: "WARN", message: "there is already a transaction in progress", attrs: attrs({ pid: r.int(100, 900), severity: "WARNING" }) }];
  return [{ source: "postgres", level: "ERROR", message: 'duplicate key value violates unique constraint "users_email_key"', attrs: attrs({ pid: r.int(100, 900), severity: "ERROR" }) }];
}

function orbEvent(): Draft[] {
  const pid = r.int(40000, 49000);
  const lines = r.chance(0.5)
    ? [`orb: watching ${r.int(180, 240)} files in ./internal, ./cmd`]
    : [`orb: change in internal/api/${r.pick(["projects", "auth", "files"])}.go; rebuilding`, "orb: building… go build ./cmd/api", `orb: built in ${(1 + r.next() * 2).toFixed(1)}s`, `orb: starting app (pid ${pid}) on 127.0.0.1:8080`];
  return lines.map((raw, i) => ({ source: "orb", level: "INFO", message: "", raw, offset: i * 400 }));
}

/** One moment in the app's life: a request with its companions, a job, mail, a postgres line… */
function event(): Draft[] {
  const pick = r.next();
  if (pick < 0.5) return httpEvent();
  if (pick < 0.65) return jobsEvent();
  if (pick < 0.72) return mailEvent();
  if (pick < 0.8) return authEvent();
  if (pick < 0.9) return appEvent();
  if (pick < 0.96) return postgresEvent();
  return orbEvent();
}

/* ---------- The store ---------- */

let records: LogRecord[] = [];
let seq = 0;
let savedFilters: SavedFilter[] = [];
let lastEventAt = 0;
const subscribers = new Set<(rec: LogRecord) => void>();
let ticker: ReturnType<typeof setInterval> | undefined;

function add(d: Draft, time: number): LogRecord {
  const rec: LogRecord = { id: ++seq, time: new Date(time).toISOString(), source: d.source, level: d.level, message: d.message };
  if (d.attrs && d.attrs.length > 0) rec.attrs = d.attrs;
  if (d.raw) rec.raw = d.raw;
  records.push(rec);
  for (const s of subscribers) s(rec);
  return rec;
}

function emit(at: number) {
  for (const d of event()) add(d, at + (d.offset ?? 0));
  lastEventAt = at;
}

/** Adds the events that "happened" since the last one, a few seconds apart, so a refresh after a pause shows new records. */
function catchUp(now = Date.now()) {
  let n = 0;
  while (lastEventAt + 6000 <= now && n++ < 200) emit(lastEventAt + 6000 + r.int(0, 3000));
}

function fill() {
  records = [];
  seq = 0;
  savedFilters = [];
  const now = Date.now();
  let t = now - 3_600_000;
  while (t < now - 2000) {
    emit(t);
    t += 8000 + r.int(0, 8000);
  }
  lastEventAt = now - 2000;
}

/** Back to the first state; tests call it between cases. */
export function resetMockLogs() {
  fill();
}

fill();

/* ---------- Queries, mirroring LogQuery in Go ---------- */

type Query = {
  from?: number;
  to?: number;
  levels: string[];
  minLevel: string;
  sources: string[];
  user: string;
  method: string;
  path: string;
  statusClass: string;
  status: number;
  minDuration: number;
  requestId: string;
  traceId: string;
  text: string;
  before: number;
  after: number;
  limit: number;
};

function levelRank(level: string): number {
  switch (level.toUpperCase()) {
    case "DEBUG":
    case "TRACE":
      return 0;
    case "WARN":
    case "WARNING":
      return 2;
    case "ERROR":
    case "FATAL":
    case "PANIC":
      return 3;
  }
  return 1;
}

const attr = (rec: LogRecord, key: string) => rec.attrs?.find((a) => a.key === key)?.value ?? "";
const eqFold = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function parseQuery(p: URLSearchParams): Query | Problem {
  const list = (key: string) =>
    (p.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const q: Query = {
    levels: list("level"),
    minLevel: (p.get("min_level") ?? "").toUpperCase(),
    sources: list("source"),
    user: (p.get("user") ?? "").trim(),
    method: (p.get("method") ?? "").trim().toUpperCase(),
    path: p.get("path") ?? "",
    statusClass: p.get("status_class") ?? "",
    status: 0,
    minDuration: 0,
    requestId: p.get("request_id") ?? "",
    traceId: p.get("trace_id") ?? "",
    text: p.get("q") ?? "",
    before: 0,
    after: 0,
    limit: 0,
  };
  for (const k of ["from", "to"] as const) {
    const v = p.get(k);
    if (v) {
      const t = Date.parse(v);
      if (Number.isNaN(t)) return problem(400, "invalid_query", `${k}: parsing time "${v}" as RFC 3339`);
      q[k] = t;
    }
  }
  const num = (key: string, integer: boolean): number | Problem => {
    const v = p.get(key);
    if (!v) return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) return problem(400, "invalid_query", `${key}: parsing "${v}": invalid syntax`);
    return n;
  };
  for (const [key, field, integer] of [
    ["status", "status", true],
    ["min_duration_ms", "minDuration", false],
    ["before", "before", true],
    ["after", "after", true],
    ["limit", "limit", true],
  ] as const) {
    const n = num(key, integer);
    if (typeof n !== "number") return n;
    q[field] = n;
  }
  if (q.statusClass && !q.statusClass.endsWith("xx")) return problem(400, "invalid_query", "status_class: want 2xx, 3xx, 4xx or 5xx");
  return q;
}

function matches(q: Query, rec: LogRecord): boolean {
  const t = Date.parse(rec.time);
  if (q.from !== undefined && t < q.from) return false;
  if (q.to !== undefined && t >= q.to) return false;
  if (q.levels.length > 0 && !q.levels.some((l) => eqFold(l, rec.level))) return false;
  if (q.minLevel && levelRank(rec.level) < levelRank(q.minLevel)) return false;
  if (q.sources.length > 0 && !q.sources.some((s) => eqFold(s, rec.source))) return false;
  if (q.user && !eqFold(attr(rec, "user_id"), q.user) && !eqFold(attr(rec, "email"), q.user) && !eqFold(attr(rec, "actor_id"), q.user)) return false;
  if (q.method && !eqFold(attr(rec, "method"), q.method)) return false;
  if (q.path && !attr(rec, "path").startsWith(q.path) && !attr(rec, "route").startsWith(q.path)) return false;
  if (q.statusClass || q.status) {
    const status = Number(attr(rec, "status"));
    if (!Number.isInteger(status) || attr(rec, "status") === "") return false;
    if (q.status && status !== q.status) return false;
    if (q.statusClass && `${Math.floor(status / 100)}xx` !== q.statusClass) return false;
  }
  if (q.minDuration > 0) {
    const d = Number(attr(rec, "duration_ms"));
    if (attr(rec, "duration_ms") === "" || !Number.isFinite(d) || d < q.minDuration) return false;
  }
  if (q.requestId && attr(rec, "request_id") !== q.requestId) return false;
  if (q.traceId && attr(rec, "trace_id") !== q.traceId) return false;
  if (q.text) {
    const needle = q.text.toLowerCase();
    const hit = rec.message.toLowerCase().includes(needle) || (rec.raw ?? "").toLowerCase().includes(needle) || (rec.attrs ?? []).some((a) => a.value.toLowerCase().includes(needle) || a.key.toLowerCase().includes(needle));
    if (!hit) return false;
  }
  return true;
}

function query(q: Query): { logs: LogRecord[]; next_before?: number } {
  const limit = Math.min(q.limit > 0 ? q.limit : 200, MAX_QUERY);
  const logs: LogRecord[] = [];
  let next: number | undefined;
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    if (q.before && rec.id >= q.before) continue;
    if (q.after && rec.id <= q.after) break;
    if (!matches(q, rec)) continue;
    if (logs.length >= limit) {
      next = logs[logs.length - 1].id;
      break;
    }
    logs.push(rec);
  }
  return next ? { logs, next_before: next } : { logs };
}

function histogram(q: Query, width: number): LogBucket[] | Problem {
  const to = q.to ?? Date.now();
  const from = Math.floor((q.from ?? to - 3_600_000) / width) * width;
  const n = Math.floor((to - from) / width) + 1;
  if (n > 10000) return problem(400, "invalid_query", "too many buckets; widen the interval");
  const buckets: LogBucket[] = Array.from({ length: n }, (_, i) => ({ time: new Date(from + i * width).toISOString(), total: 0, levels: { debug: 0, info: 0, warn: 0, error: 0 } }));
  const scan = { ...q, from, to, before: 0, after: 0, limit: 0 };
  for (const rec of records) {
    if (!matches(scan, rec)) continue;
    const i = Math.floor((Date.parse(rec.time) - from) / width);
    if (i < 0 || i >= n) continue;
    const b = buckets[i];
    b.total++;
    const rank = levelRank(rec.level);
    if (rank === 0) b.levels.debug++;
    else if (rank === 2) b.levels.warn++;
    else if (rank === 3) b.levels.error++;
    else b.levels.info++;
  }
  return buckets;
}

function errors(q: Query): ErrorGroup[] {
  const scan = { ...q, minLevel: q.minLevel || "WARN", before: 0, after: 0, limit: 0 };
  const groups = new Map<string, ErrorGroup>();
  for (const rec of records) {
    if (!matches(scan, rec)) continue;
    const { shape, top } = fingerprint(rec);
    const key = `${shape}\0${top}`;
    let g = groups.get(key);
    if (!g) {
      g = { fingerprint: fingerprintID(shape, top), shape, top: top || undefined, source: rec.source, level: rec.level, count: 0, first_seen: rec.time, last_seen: rec.time, last: rec };
      groups.set(key, g);
    }
    g.count++;
    g.last_seen = rec.time;
    g.last = rec;
    if (levelRank(rec.level) > levelRank(g.level)) g.level = rec.level;
  }
  return [...groups.values()].sort((a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen));
}

function stats(): LogStats {
  const bytes = records.reduce((n, rec) => n + JSON.stringify(rec).length + 1, 0);
  const st: LogStats = { bytes, max_bytes: MAX_STORE_BYTES, segments: records.length ? Math.max(1, Math.ceil(bytes / SEGMENT_BYTES)) : 0, records: records.length, dir: ".orb/portal/logs" };
  if (records.length) st.oldest = records[0].time;
  return st;
}

/** Go's `time.ParseDuration` for what the UI sends: `30s`, `1m`, `5m`, `15m`, `1h`, `1h30m`. */
function parseDuration(s: string): number | undefined {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(s.trim());
  if (m) return Number(m[1]) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2] as "ms" | "s" | "m" | "h"];
  let total = 0;
  let rest = s.trim();
  while (rest) {
    const part = /^(\d+(?:\.\d+)?)(ms|s|m|h)/.exec(rest);
    if (!part) return undefined;
    total += Number(part[1]) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[part[2] as "ms" | "s" | "m" | "h"];
    rest = rest.slice(part[0].length);
  }
  return total || undefined;
}

const filterName = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}$/;

/* ---------- Responses ---------- */

function problem(status: number, code: string, detail: string): Problem {
  return { title: { 400: "Bad Request", 404: "Not Found", 429: "Too Many Requests" }[status] ?? "Error", status, code, detail };
}

const isProblem = (v: unknown): v is Problem => typeof v === "object" && v !== null && "status" in v && "code" in v && "title" in v;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function problemResponse(p: Problem): Response {
  return new Response(JSON.stringify(p), { status: p.status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

function ensureTicker() {
  if (!ticker && subscribers.size > 0) ticker = setInterval(() => catchUp(), STREAM_EVERY);
  if (ticker && subscribers.size === 0) {
    clearInterval(ticker);
    ticker = undefined;
  }
}

/** `GET logs/stream`: the missed records after `after`, then every new one that matches, until the client aborts. */
function stream(q: Query, signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  let listener: ((rec: LogRecord) => void) | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) return controller.close();
      const write = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Closed underneath us.
        }
      };
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      if (q.after > 0) {
        const missed = query({ ...q, before: 0, limit: MAX_QUERY });
        for (let i = missed.logs.length - 1; i >= 0; i--) write("log", missed.logs[i]);
      }
      listener = (rec) => {
        if (matches({ ...q, after: 0, before: 0 }, rec)) write("log", rec);
      };
      subscribers.add(listener);
      ensureTicker();
      signal?.addEventListener(
        "abort",
        () => {
          if (listener) subscribers.delete(listener);
          ensureTicker();
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        },
        { once: true },
      );
    },
    cancel() {
      if (listener) subscribers.delete(listener);
      ensureTicker();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
}

/** Answers `/_portal/api/logs*` as orb dev's log endpoints do; anything else under it is a 404. */
export function mockLogsFetch(url: URL, method: string, init: RequestInit = {}): Response {
  const p = url.pathname;
  const rest = p.slice("/_portal/api/logs".length);
  catchUp();
  if (rest === "" && method === "GET") {
    const q = parseQuery(url.searchParams);
    return isProblem(q) ? problemResponse(q) : json(query(q));
  }
  if (rest === "" && method === "DELETE") {
    records = [];
    return new Response(null, { status: 204 });
  }
  if (rest === "/histogram" && method === "GET") {
    const q = parseQuery(url.searchParams);
    if (isProblem(q)) return problemResponse(q);
    let width = 60_000;
    const b = url.searchParams.get("bucket");
    if (b) {
      const w = parseDuration(b);
      if (w === undefined || w < 1000) return problemResponse(problem(400, "invalid_query", "bucket: a duration of at least 1s, such as 1m"));
      width = w;
    }
    const buckets = histogram(q, width);
    if (isProblem(buckets)) return problemResponse(buckets);
    return json({ bucket: b ?? "1m0s", buckets });
  }
  if (rest === "/stream" && method === "GET") {
    const q = parseQuery(url.searchParams);
    return isProblem(q) ? problemResponse(q) : stream(q, init.signal ?? undefined);
  }
  if (rest === "/errors" && method === "GET") {
    const q = parseQuery(url.searchParams);
    if (isProblem(q)) return problemResponse(q);
    if (q.from === undefined && q.to === undefined) q.from = Date.now() - 24 * 3_600_000;
    return json({ groups: errors(q) });
  }
  const request = /^\/request\/([^/]+)$/.exec(rest);
  if (request && method === "GET") {
    const id = decodeURIComponent(request[1]);
    const page = query({ ...emptyQuery(), requestId: id, limit: MAX_QUERY });
    return json({ request_id: id, logs: page.logs.reverse() });
  }
  if (rest === "/stats" && method === "GET") return json(stats());
  if (rest === "/filters" && method === "GET") return json({ filters: savedFilters });
  if (rest === "/filters" && method === "PUT") {
    let body: unknown;
    try {
      body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object") return problemResponse(problem(400, "invalid_body", "the body must be JSON"));
    const { name, query: q } = body as { name?: unknown; query?: unknown };
    if (typeof name !== "string" || !filterName.test(name)) return problemResponse(problem(400, "invalid_filter", "a filter name is 1 to 60 letters, digits, spaces, dots, hyphens or underscores"));
    if (!q || typeof q !== "object") return problemResponse(problem(400, "invalid_filter", "the filter's query must be a JSON object"));
    const f: SavedFilter = { name, query: q, saved: new Date().toISOString() };
    savedFilters = [...savedFilters.filter((x) => x.name !== name), f].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return json({ filters: savedFilters });
  }
  const del = /^\/filters\/([^/]+)$/.exec(rest);
  if (del && method === "DELETE") {
    const name = decodeURIComponent(del[1]);
    savedFilters = savedFilters.filter((x) => x.name !== name);
    return new Response(null, { status: 204 });
  }
  return problemResponse(problem(404, "not_found", `no portal endpoint ${method} ${p}`));
}

function emptyQuery(): Query {
  return { levels: [], minLevel: "", sources: [], user: "", method: "", path: "", statusClass: "", status: 0, minDuration: 0, requestId: "", traceId: "", text: "", before: 0, after: 0, limit: 0 };
}
