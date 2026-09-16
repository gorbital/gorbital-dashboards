/**
 * An in-memory orb dev: answers the portal's endpoints from lib/mock.ts so
 * the UI works without a backend (the public demo, tests, offline work). It
 * speaks HTTP shapes (Response objects, problem+json, SSE bodies) so the
 * client code path is the same in both modes. The app behind the proxy is
 * mocked too: the dev console (`/_dev/*`, with its streams) and the ops API
 * (`/ops/*`), with versions, reasons and rate limits as the app enforces them.
 */
import {
  devApp,
  devConfig,
  devJobRuns,
  devLogs,
  devMail,
  devMigrations,
  devRequests,
  devRoutes,
  liveLogs,
  liveOutputLines,
  liveRequests,
  opsAuditEvents,
  opsJobDefinitions,
  opsJobRuns,
  opsMail,
  opsQueues,
  opsReleasesCurrent,
  opsSettingHistory,
  opsSettings,
  opsSuppressions,
  opsSystem,
  outputLines,
  portalStatus,
} from "../../mock";
import { initialJobSources, planJobMock, type PlannedJob } from "./jobs";
import type {
  Accepted,
  AppAction,
  AppStatus,
  AuditEvent,
  AuditGroupBy,
  AuditStats,
  DevLog,
  DevRequest,
  GeneratorResponse,
  JobDefinition,
  JobRun,
  JobSource,
  OpsSetting,
  OpsSettingChange,
  OutputLine,
  PortalEvent,
  Problem,
  Queue,
  Status,
  Suppression,
  SystemInfo,
} from "../types";
import { mockAuthFetch, resetMockAuth } from "./auth";
import { mockDbFetch } from "./db";
import { mockSqlFetch } from "./sql";
import { mockDb } from "./schema";

const MUTATION_HEADER = "X-Orb-Portal";

/* ---------- The mock supervisor and hub ---------- */

/** The mock app "started" 20 minutes before the page loaded, so uptime reads like a real session. */
const initialApp = (): AppStatus => ({ ...portalStatus.app, started_at: new Date(Date.now() - 20 * 60_000).toISOString() });

let app: AppStatus = initialApp();
let lines: OutputLine[] = [...outputLines];
const subscribers = new Set<(e: PortalEvent) => void>();
let liveIndex = 0;
let ticker: ReturnType<typeof setInterval> | undefined;

const now = () => new Date().toISOString();

function publish(e: PortalEvent) {
  for (const s of subscribers) s(e);
}

function addLine(stream: OutputLine["stream"], text: string) {
  const line = { time: now(), stream, text };
  lines = [...lines.slice(-1999), line];
  publish({ type: "output", time: line.time, output: line });
}

function setApp(patch: Partial<AppStatus>) {
  app = { ...app, ...patch };
  publish({ type: "state", time: now(), state: app });
}

function tick() {
  if (app.state !== "running") return;
  const l = liveOutputLines[liveIndex++ % liveOutputLines.length];
  addLine(l.stream, l.text);
}

function ensureTicker() {
  if (!ticker && subscribers.size > 0) ticker = setInterval(tick, 4000);
  if (ticker && subscribers.size === 0) {
    clearInterval(ticker);
    ticker = undefined;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function restart() {
  addLine("orb", "restart requested from the Dev Portal");
  setApp({ state: "building", problem: undefined });
  addLine("orb", "building… go build ./cmd/api");
  await wait(1800);
  addLine("orb", "built in 1.8s");
  const pid = 48000 + Math.floor(Math.random() * 900);
  setApp({ state: "running", pid, started_at: now(), restarts: app.restarts + 1 });
  addLine("orb", `starting app (pid ${pid}) on ${app.addr}`);
  await wait(300);
  addLine("app", 'level=INFO msg="listening" addr=127.0.0.1:8080');
  for (const job of pendingJobs) {
    definitions = [...definitions, job.definition];
    sources = [...sources, job.source];
    addLine("app", `level=INFO msg="job registered" name=${job.definition.name} schedule="${job.definition.config.schedule || "on demand"}"`);
  }
  pendingJobs = [];
}

const actions: Record<AppAction, () => Problem | undefined> = {
  restart() {
    if (app.state === "building") return problem(409, "app_action_failed", "a build is already running");
    void restart();
    return undefined;
  },
  stop() {
    if (app.state !== "running") return problem(409, "app_action_failed", `the app is ${app.state}, not running`);
    addLine("orb", "stopping app (pid " + app.pid + ")");
    setApp({ state: "stopped", pid: undefined, started_at: undefined });
    return undefined;
  },
  start() {
    if (app.state !== "stopped") return problem(409, "app_action_failed", `the app is ${app.state}; use restart`);
    const pid = 48000 + Math.floor(Math.random() * 900);
    setApp({ state: "running", pid, started_at: now(), restarts: app.restarts + 1 });
    addLine("orb", `starting app (pid ${pid}) on ${app.addr}`);
    return undefined;
  },
};

/* ---------- The mock app's state: what /ops changes ---------- */

let migrations = { ...devMigrations };
let settings: OpsSetting[] = opsSettings.map((s) => ({ ...s }));
let history: Record<string, OpsSettingChange[]> = Object.fromEntries(Object.entries(opsSettingHistory).map(([k, v]) => [k, [...v]]));
let definitions: JobDefinition[] = opsJobDefinitions.map((d) => ({ ...d, config: { ...d.config } }));
let runs: JobRun[] = [...opsJobRuns];
let queues: Queue[] = opsQueues.map((q) => ({ ...q }));
let sources: JobSource[] = initialJobSources(opsJobDefinitions);
/** Jobs applied by the generator, registered when the app restarts (the real app needs the rebuild too). */
let pendingJobs: PlannedJob[] = [];
let suppressions: Suppression[] = [...opsSuppressions];
let nextRunId = Math.max(...opsJobRuns.map((r) => r.id)) + 1;
let nextChangeId = 10;
const lastRunAt = new Map<string, number>();
let testEmails = 0;

/** Resets the mock to its first state; tests call it between cases. */
export function resetMock() {
  app = initialApp();
  lines = [...outputLines];
  liveIndex = 0;
  migrations = { ...devMigrations };
  settings = opsSettings.map((s) => ({ ...s }));
  history = Object.fromEntries(Object.entries(opsSettingHistory).map(([k, v]) => [k, [...v]]));
  definitions = opsJobDefinitions.map((d) => ({ ...d, config: { ...d.config } }));
  runs = [...opsJobRuns];
  queues = opsQueues.map((q) => ({ ...q }));
  sources = initialJobSources(opsJobDefinitions);
  pendingJobs = [];
  suppressions = [...opsSuppressions];
  nextRunId = Math.max(...opsJobRuns.map((r) => r.id)) + 1;
  nextChangeId = 10;
  lastRunAt.clear();
  testEmails = 0;
  resetMockAuth();
}

/* ---------- Responses ---------- */

function problem(status: number, code: string, detail: string): Problem {
  return { title: statusText(status), status, code, detail };
}

function statusText(status: number) {
  return { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 429: "Too Many Requests", 503: "Service Unavailable" }[status] ?? "Error";
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-ID": `req_${Math.random().toString(16).slice(2, 18).padEnd(16, "0")}`, ...extra } });
}

function problemResponse(p: Problem): Response {
  return new Response(JSON.stringify(p), { status: p.status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

function events(signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  let listener: ((e: PortalEvent) => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) return controller.close();
      const write = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      write("state", app);
      listener = (e) => write(e.type, e);
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
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
}

/** A dev console stream: one `event` item from `feed` every `every` ms while the app runs, until the client aborts. */
function devStream<T>(event: string, feed: readonly T[], every: number, signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let i = Math.floor(Math.random() * feed.length);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) return controller.close();
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      timer = setInterval(() => {
        if (app.state !== "running") return;
        const item = { time: now(), ...feed[i++ % feed.length] };
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(item)}\n\n`));
        } catch {
          // Closed underneath us.
        }
      }, every);
      signal?.addEventListener(
        "abort",
        () => {
          if (timer) clearInterval(timer);
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
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
}

function plan(name: string, input: Record<string, unknown>, applied: boolean): GeneratorResponse {
  const n = String(input.name ?? "Example");
  const file = `internal/jobs/${n.replace(/[A-Z]/g, (c, i) => (i ? "_" : "") + c.toLowerCase())}.go`;
  return {
    applied,
    plan: {
      generator: name,
      name: n,
      summary: `${applied ? "Wrote" : "Would write"} ${file} and register it in internal/app/jobs.go`,
      changes: [
        { path: file, kind: "create", content: `package jobs\n\n// ${n} is a job.\ntype ${n} struct{}\n` },
        { path: "internal/app/jobs.go", kind: "modify", before: "\tregister(mail.Send)\n", content: `\tregister(mail.Send)\n\tregister(jobs.${n})\n` },
      ],
      next: ["go test ./internal/jobs/...", `orb jobs run ${n}`],
    },
  };
}

async function migrate(): Promise<Problem | undefined> {
  if (!portalStatus.project.database) return problem(409, "app_action_failed", "this app has no database (Minimal preset)");
  if (app.state !== "running") return problem(409, "app_action_failed", `the app is ${app.state}; start it first`);
  addLine("orb", "migrations requested from the Dev Portal");
  addLine("orb", "running go run ./cmd/migrate");
  void (async () => {
    await wait(1500);
    const applied = migrations.pending;
    migrations = { current: migrations.latest, latest: migrations.latest, pending: 0 };
    addLine("orb", `applied ${applied} migration${applied === 1 ? "" : "s"} · current ${migrations.current}`);
  })();
  return undefined;
}

/* ---------- The router ---------- */

const latency = () => 60 + Math.random() * 120;

function parseBody(init: RequestInit): Record<string, unknown> | null {
  if (typeof init.body !== "string" || init.body === "") return {};
  try {
    const v = JSON.parse(init.body) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Answers `path` as orb dev would. Unknown paths get a 404 problem. */
export async function mockFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, "http://127.0.0.1:3100");
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD" && !headers.has(MUTATION_HEADER)) {
    return problemResponse(problem(403, "forbidden", `requests that change something must carry the ${MUTATION_HEADER} header`));
  }
  if (url.pathname === "/_portal/api/events") return events(init.signal ?? undefined);
  if (url.pathname === "/_portal/app/_dev/requests/stream" || url.pathname === "/_portal/app/_dev/logs/stream") {
    if (app.state !== "running") return problemResponse(problem(502, "app_unavailable", `the app isn't answering at ${app.url}: connection refused`));
    return url.pathname.endsWith("requests/stream") ? devStream<Omit<DevRequest, "time">>("request", liveRequests, 3500, init.signal ?? undefined) : devStream<Omit<DevLog, "time">>("log", liveLogs, 2800, init.signal ?? undefined);
  }
  await wait(latency());
  if (init.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  const p = url.pathname;
  // The catalog mock answers migrate too; the Phase 1 state (pending count in /ops/system) follows along.
  if (p === "/_portal/api/app/migrate" && method === "POST") void migrate();
  const db = await mockDb(url, method, init, app);
  if (db) return db; // the database, migrate and migration-generator endpoints (mock/schema.ts)
  if (p === "/_portal/api/status") return json({ ...portalStatus, app } satisfies Status);
  if (p === "/_portal/api/session") return json({ ok: true });
  if (p === "/_portal/api/output") {
    const limit = Number(url.searchParams.get("limit") ?? 200);
    if (!Number.isInteger(limit) || limit < 0) return problemResponse(problem(400, "invalid_limit", "limit must be a non-negative number"));
    return json({ max: 2000, lines: limit ? lines.slice(-limit) : lines });
  }
  const action = /^\/_portal\/api\/app\/(restart|stop|start)$/.exec(p);
  if (action && method === "POST") {
    const refused = actions[action[1] as AppAction]();
    if (refused) return problemResponse(refused);
    return json({ accepted: true, app } satisfies Accepted, 202);
  }
  if (p === "/_portal/api/app/migrate" && method === "POST") {
    const refused = await migrate();
    if (refused) return problemResponse(refused);
    return json({ accepted: true, app } satisfies Accepted, 202);
  }
  const gen = /^\/_portal\/api\/generators\/([a-z]+)\/(plan|apply)$/.exec(p);
  if (gen && method === "POST") {
    if (!portalStatus.generators.includes(gen[1])) return problemResponse(problem(404, "generator_not_found", `no generator ${gen[1]}; this orb has: ${portalStatus.generators.join(", ")}`));
    const body = parseBody(init);
    if (!body) return problemResponse(problem(400, "invalid_json", "the body must be JSON"));
    const input = (body.input as Record<string, unknown> | undefined) ?? {};
    if (gen[1] === "job") {
      const planned = planJobMock(input, [...definitions.map((d) => d.name), ...pendingJobs.map((j) => j.definition.name)], gen[2] === "apply");
      if ("problem" in planned) return problemResponse(planned.problem);
      if (gen[2] === "apply") {
        // The sample repository has an uncommitted migration (the one the Database page shows pending).
        if (!body.allow_dirty) return problemResponse(problem(422, "generator_failed", "the git repository has uncommitted changes; commit or stash them first, or pass --allow-dirty"));
        pendingJobs = [...pendingJobs, planned];
        addLine("orb", `orb gen job ${planned.response.plan.name}: wrote ${planned.response.plan.changes.length} files; restart the app to register ${planned.definition.name}`);
      }
      return json(planned.response);
    }
    return json(plan(gen[1], input, gen[2] === "apply"));
  }
  if (p === "/_portal/api/jobs" && method === "GET") return json({ jobs: sources });
  if (p.startsWith("/_portal/api/db/sql/")) return mockSqlFetch(p, method, init) ?? problemResponse(problem(404, "not_found", `no portal endpoint ${method} ${p}`));
  if (p.startsWith("/_portal/api/db/")) return mockDbFetch(url, method, init);
  if (p.startsWith("/_portal/app/")) return appProxy(p.slice("/_portal/app".length), url.searchParams, method, init);
  return problemResponse(problem(404, "not_found", `no portal endpoint ${method} ${p}`));
}

/** The app behind the proxy: readiness, the dev console and the ops API. */
function appProxy(path: string, query: URLSearchParams, method: string, init: RequestInit): Response {
  if (app.state !== "running") return problemResponse(problem(502, "app_unavailable", `the app isn't answering at ${app.url}: connection refused`));
  if (path === "/readyz") return json({ status: "ok", checks: { postgres: "ok", river: "ok" } });
  if (path === "/healthz") return json({ status: "ok" });
  if (path === "/v1/ping") return json({ message: settings.find((s) => s.key === "example.ping_message")?.value ?? "pong" });
  if (path.startsWith("/ops/")) return opsProxy(path, query, method, init);
  if (!app.console || !path.startsWith("/_dev")) return problemResponse(problem(404, "not_found", `no route matches ${method} ${path}`));
  if (method !== "GET" && method !== "HEAD") return problemResponse(problem(405, "method_not_allowed", "the dev console accepts GET only"));
  const dev: Record<string, unknown> = {
    "/_dev/": { endpoints: ["/_dev/", "/_dev/app", "/_dev/config", "/_dev/jobs", "/_dev/logs", "/_dev/logs/stream", "/_dev/mail", "/_dev/migrations", "/_dev/openapi.json", "/_dev/requests", "/_dev/requests/stream", "/_dev/routes"] },
    "/_dev/app": devApp,
    "/_dev/routes": devRoutes,
    "/_dev/config": devConfig,
    "/_dev/requests": devRequests,
    "/_dev/logs": devLogs,
    "/_dev/migrations": migrations,
    "/_dev/jobs": devJobRuns,
    "/_dev/mail": devMail,
  };
  if (path in dev) return json(dev[path]);
  return problemResponse(problem(404, "not_found", `no route matches GET ${path}`));
}

const reasonOf = (body: Record<string, unknown>) => (typeof body.reason === "string" ? body.reason.trim() : "");

/** `/ops/*` as the Full preset answers the development operator. */
function opsProxy(path: string, query: URLSearchParams, method: string, init: RequestInit): Response {
  if (!portalStatus.project.features.includes("ops")) return problemResponse(problem(404, "not_found", `no route matches ${method} ${path}`));
  const body = method === "GET" ? {} : parseBody(init);
  if (!body) return problemResponse(problem(422, "validation_failed", "the body must be JSON"));

  // Accounts, sign-in methods and rate limiters (mock/auth.ts)
  const auth = mockAuthFetch(path, query, method, body);
  if (auth) return auth;

  // Settings
  if (path === "/ops/settings" && method === "GET") {
    const group = query.get("group");
    return json({ settings: group ? settings.filter((s) => s.group === group) : settings });
  }
  const setting = /^\/ops\/settings\/([^/]+)(\/history)?$/.exec(path);
  if (setting) {
    const key = decodeURIComponent(setting[1]);
    const s = settings.find((x) => x.key === key);
    if (!s) return problemResponse(problem(404, "setting_not_found", `no setting ${key}`));
    if (setting[2]) return json({ changes: history[key] ?? [] });
    if (method === "GET") return json(s);
    if (method !== "PUT" && method !== "DELETE") return problemResponse(problem(405, "method_not_allowed", `${method} not allowed`));
    if (typeof body.version !== "number") return problemResponse(problem(422, "validation_failed", "version is required"));
    if (body.version !== s.version) return problemResponse(problem(409, "setting_version_conflict", `the setting is at version ${s.version}, not ${body.version}; read it again`));
    if (s.reason_required && !reasonOf(body)) return problemResponse(problem(422, "setting_reason_required", `${key} needs a reason for every change`));
    const oldValue = s.modified ? s.value : null;
    let next: OpsSetting;
    if (method === "DELETE") {
      next = { ...s, value: s.default, modified: false, version: s.version + 1, updated_at: now(), updated_by: "dev_operator", restart_pending: s.restart_required };
    } else {
      const invalid = validateSetting(s, body.value);
      if (invalid) return problemResponse(problem(422, "invalid_setting_value", invalid));
      next = { ...s, value: body.value, modified: JSON.stringify(body.value) !== JSON.stringify(s.default), version: s.version + 1, updated_at: now(), updated_by: "dev_operator", restart_pending: s.restart_required };
    }
    settings = settings.map((x) => (x.key === key ? next : x));
    const change: OpsSettingChange = { id: nextChangeId++, key, old_value: oldValue, new_value: next.modified ? next.value : null, version: s.version, reason: reasonOf(body) || undefined, actor_kind: "dev_operator", actor_id: "orb dev", request_id: `req_${Math.random().toString(16).slice(2, 18)}`, changed_at: now() };
    history[key] = [change, ...(history[key] ?? [])];
    addLine("app", `level=INFO msg="setting changed" key=${key} version=${next.version} by=dev_operator`);
    return json(next);
  }

  // Jobs
  if (path === "/ops/jobs/definitions" && method === "GET") return json({ definitions: withLastRuns(definitions) });
  if (path === "/ops/jobs/scheduled" && method === "GET") {
    const scheduled = withLastRuns(definitions.filter((d) => d.config.enabled && d.config.schedule)).sort((a, b) => (a.next_run_at ?? "").localeCompare(b.next_run_at ?? ""));
    return json({ definitions: scheduled });
  }
  if (path === "/ops/jobs/overview" && method === "GET") {
    const dayAgo = Date.now() - 86_400_000;
    const q = queues.map((qu) => ({
      name: qu.name,
      active: true,
      paused: qu.paused,
      available: runs.filter((r) => r.queue === qu.name && r.state === "available").length,
      scheduled: runs.filter((r) => r.queue === qu.name && r.state === "scheduled").length,
      running: runs.filter((r) => r.queue === qu.name && r.state === "running").length,
      retryable: runs.filter((r) => r.queue === qu.name && r.state === "retryable").length,
      discarded_last_day: runs.filter((r) => r.queue === qu.name && r.state === "discarded" && Date.parse(r.finalized_at ?? "") > dayAgo).length,
    }));
    const failing = withLastRuns(definitions).filter((d) => d.last_run && (d.last_run.state === "retryable" || d.last_run.state === "discarded"));
    return json({ queues: q, failing });
  }
  const def = /^\/ops\/jobs\/definitions\/([^/]+)(\/run|\/history)?$/.exec(path);
  if (def) {
    const name = decodeURIComponent(def[1]);
    const d = definitions.find((x) => x.name === name);
    if (!d) return problemResponse(problem(404, "job_definition_not_found", `no job ${name}`));
    if (def[2] === "/history") return json({ changes: [] });
    if (def[2] === "/run") {
      if (method !== "POST") return problemResponse(problem(405, "method_not_allowed", `${method} not allowed`));
      if (!d.config.enabled) return problemResponse(problem(409, "job_definition_disabled", `${name} is disabled; enable it first`));
      const last = lastRunAt.get(name) ?? 0;
      if (Date.now() - last < 60_000 || runs.some((r) => r.kind === name && (r.state === "running" || r.state === "available" || r.state === "scheduled"))) {
        return problemResponse(problem(429, "job_run_limited", `${name} ran less than a minute ago, or a run is queued; wait for it`));
      }
      lastRunAt.set(name, Date.now());
      const run: JobRun = { id: nextRunId++, kind: name, queue: d.config.queue, state: "available", attempt: 0, max_attempts: d.config.max_attempts, priority: d.config.priority, created_at: now(), scheduled_at: now(), actor_kind: "dev_operator", actor_id: "orb dev" };
      runs = [run, ...runs];
      addLine("app", `level=INFO msg="job enqueued" kind=${name} queue=${d.config.queue} by=dev_operator`);
      void (async () => {
        await wait(1200);
        runs = runs.map((r) => (r.id === run.id ? { ...r, state: "running", attempt: 1, attempted_at: now() } : r));
        await wait(1500);
        runs = runs.map((r) => (r.id === run.id ? { ...r, state: "completed", finalized_at: now() } : r));
        addLine("app", `level=INFO msg="job succeeded" kind=${name} attempt=1`);
      })();
      return json(run, 202);
    }
    if (method === "GET") return json(withLastRuns([d])[0]);
    if (method !== "PUT" && method !== "DELETE") return problemResponse(problem(405, "method_not_allowed", `${method} not allowed`));
    if (typeof body.version !== "number") return problemResponse(problem(422, "validation_failed", "version is required"));
    if (body.version !== d.version) return problemResponse(problem(409, "job_definition_version_conflict", `the definition is at version ${d.version}, not ${body.version}; read it again`));
    let next: JobDefinition;
    if (method === "DELETE") {
      const risky = d.config.schedule !== d.defaults.schedule || d.config.timeout !== d.defaults.timeout || d.config.max_attempts !== d.defaults.max_attempts || d.config.queue !== d.defaults.queue || (d.config.enabled && !d.defaults.enabled);
      if (risky && !reasonOf(body)) return problemResponse(problem(422, "job_reason_required", "a reason is required to disable or reschedule a job, change its timeout, attempts or queue, or pause a queue"));
      next = { ...d, config: { ...d.defaults }, modified: false, version: d.version + 1, updated_at: now(), updated_by: "dev_operator" };
    } else {
      const config = { ...d.config };
      const risky = (body.enabled === false && d.config.enabled) || (typeof body.schedule === "string" && body.schedule !== d.config.schedule && d.config.enabled) || (typeof body.timeout === "string" && body.timeout !== d.config.timeout) || (typeof body.max_attempts === "number" && body.max_attempts !== d.config.max_attempts) || (typeof body.queue === "string" && body.queue !== d.config.queue);
      if (risky && !reasonOf(body)) return problemResponse(problem(422, "job_reason_required", "a reason is required to disable or reschedule a job, or change its timeout, attempts or queue"));
      if (typeof body.enabled === "boolean") config.enabled = body.enabled;
      if (typeof body.schedule === "string") {
        if (body.schedule !== "" && !/^(@every \d+[smh]|@(hourly|daily|weekly|monthly)|(\S+\s+){4}\S+)$/.test(body.schedule)) return problemResponse(problem(422, "invalid_job_config", "schedule must be 5-field cron, @every <duration>, or empty"));
        config.schedule = body.schedule;
      }
      if (typeof body.timeout === "string") {
        if (!/^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(body.timeout)) return problemResponse(problem(422, "invalid_job_config", "timeout must be a Go duration such as 5m"));
        config.timeout = body.timeout;
      }
      if (typeof body.max_attempts === "number") {
        if (body.max_attempts < 1 || body.max_attempts > 25) return problemResponse(problem(422, "invalid_job_config", "max_attempts must be between 1 and 25"));
        config.max_attempts = body.max_attempts;
      }
      if (typeof body.queue === "string" && body.queue) config.queue = body.queue;
      if (typeof body.priority === "number") config.priority = body.priority;
      next = { ...d, config, modified: JSON.stringify(config) !== JSON.stringify(d.defaults), version: d.version + 1, updated_at: now(), updated_by: "dev_operator", next_run_at: config.enabled && config.schedule ? new Date(Date.now() + 5 * 60_000).toISOString() : undefined };
    }
    definitions = definitions.map((x) => (x.name === name ? next : x));
    addLine("app", `level=INFO msg="job definition changed" name=${name} version=${next.version} enabled=${next.config.enabled}`);
    return json(withLastRuns([next])[0]);
  }
  if (path === "/ops/jobs/runs" && method === "GET") {
    const kind = query.get("kind");
    const queue = query.get("queue");
    const states = query.get("state")?.split(",").filter(Boolean);
    const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 50)));
    const cursor = Number(query.get("cursor") ?? 0);
    let list = runs;
    if (kind) list = list.filter((r) => r.kind === kind);
    if (queue) list = list.filter((r) => r.queue === queue);
    if (states?.length) list = list.filter((r) => states.includes(r.state));
    if (cursor) list = list.filter((r) => r.id < cursor);
    const page = list.slice(0, limit);
    return json({ jobs: page, next_cursor: list.length > limit ? String(page[page.length - 1].id) : undefined });
  }
  const run = /^\/ops\/jobs\/runs\/(\d+)(\/retry|\/cancel)?$/.exec(path);
  if (run) {
    const id = Number(run[1]);
    const r = runs.find((x) => x.id === id);
    if (!r) return problemResponse(problem(404, "job_not_found", `no run ${id}`));
    if (!run[2]) return json(r);
    if (method !== "POST") return problemResponse(problem(405, "method_not_allowed", `${method} not allowed`));
    if (run[2] === "/retry") {
      if (!["retryable", "discarded", "cancelled"].includes(r.state)) return problemResponse(problem(409, "job_not_retryable", `run ${id} is ${r.state}; only retryable, discarded and cancelled runs can run again`));
      if (!definitions.find((d) => d.name === r.kind)?.config.enabled) return problemResponse(problem(409, "job_definition_disabled", `${r.kind} is disabled`));
      const next = { ...r, state: "available", scheduled_at: now(), finalized_at: undefined };
      runs = runs.map((x) => (x.id === id ? next : x));
      void (async () => {
        await wait(1500);
        runs = runs.map((x) => (x.id === id ? { ...x, state: "completed", attempt: x.attempt + 1, attempted_at: now(), finalized_at: now() } : x));
      })();
      return json(next);
    }
    if (["completed", "discarded", "cancelled"].includes(r.state)) return problemResponse(problem(409, "job_not_cancellable", `run ${id} is already ${r.state}`));
    const next = { ...r, state: "cancelled", finalized_at: now() };
    runs = runs.map((x) => (x.id === id ? next : x));
    return json(next);
  }

  // Queues
  if (path === "/ops/queues" && method === "GET") return json({ queues });
  const queue = /^\/ops\/queues\/([^/]+)\/(pause|resume)$/.exec(path);
  if (queue && method === "POST") {
    const name = decodeURIComponent(queue[1]);
    const q = queues.find((x) => x.name === name);
    if (!q) return problemResponse(problem(422, "queue_not_active", `no worker runs queue ${name}`));
    if (queue[2] === "pause" && !reasonOf(body)) return problemResponse(problem(422, "job_reason_required", "pausing a queue stops every job in it; say why"));
    queues = queues.map((x) => (x.name === name ? { ...x, paused: queue[2] === "pause", paused_at: queue[2] === "pause" ? now() : undefined, updated_at: now() } : x));
    addLine("app", `level=INFO msg="queue ${queue[2]}d" queue=${name} by=dev_operator`);
    return new Response(null, { status: 204 });
  }

  // Audit
  if (path === "/ops/audit" && method === "GET") {
    const events = filterAudit(query);
    const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 50)));
    const cursor = Number(query.get("cursor") ?? 0);
    const list = cursor ? events.filter((e) => e.id < cursor) : events;
    const page = list.slice(0, limit);
    return json({ events: page, next_cursor: list.length > limit ? String(page[page.length - 1].id) : undefined });
  }
  if (path === "/ops/audit/stats" && method === "GET") {
    const groupBy = (query.get("group_by") ?? "action") as AuditGroupBy;
    if (!["action", "outcome", "actor_kind", "resource_type", "day"].includes(groupBy)) return problemResponse(problem(422, "invalid_audit_filter", `unknown group_by ${groupBy}`));
    const events = filterAudit(query);
    const counts = new Map<string, number>();
    for (const e of events) {
      const k = groupBy === "day" ? e.occurred_at.slice(0, 10) : String((e as unknown as Record<string, unknown>)[groupBy] ?? "");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const groups = [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => (groupBy === "day" ? a.key.localeCompare(b.key) : b.count - a.count));
    const from = query.get("from") ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = query.get("to") ?? now();
    return json({ from, to, group_by: groupBy, total: events.length, groups, other: 0 } satisfies AuditStats);
  }
  const auditOne = /^\/ops\/audit\/(\d+)$/.exec(path);
  if (auditOne) {
    const e = opsAuditEvents.find((x) => x.id === Number(auditOne[1]));
    return e ? json(e) : problemResponse(problem(404, "audit_event_not_found", `no audit event ${auditOne[1]}`));
  }

  // System, mail, releases
  if (path === "/ops/system" && method === "GET") {
    const started = Date.parse(app.started_at ?? "") || Date.now();
    const sys: SystemInfo = {
      ...opsSystem,
      instance: { ...opsSystem.instance, started_at: new Date(started).toISOString(), uptime_seconds: Math.max(0, Math.round((Date.now() - started) / 1000)) },
      database: { ...opsSystem.database, migrations: { ...migrations }, pool: { ...opsSystem.database.pool, in_use: Math.floor(Math.random() * 3), idle: 5 - Math.floor(Math.random() * 3) } },
      runtime: { ...opsSystem.runtime, goroutines: 58 + Math.floor(Math.random() * 12) },
      jobs: { ...opsSystem.jobs, queues: queues.map((q) => q.name) },
    };
    return json(sys);
  }
  if (path === "/ops/mail" && method === "GET") {
    const name = settings.find((s) => s.key === "mail.sender_name")?.value;
    const replyTo = settings.find((s) => s.key === "mail.reply_to")?.value;
    return json({ ...opsMail, from_name: typeof name === "string" ? name : opsMail.from_name, reply_to: typeof replyTo === "string" ? replyTo : "" });
  }
  if (path === "/ops/mail/test" && method === "POST") {
    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return problemResponse(problem(422, "invalid_recipient", "to must be an email address"));
    if (++testEmails > 5) return problemResponse(problem(429, "rate_limited", "each operator can send 5 test emails an hour"));
    const run: JobRun = { id: nextRunId++, kind: "mail.send", queue: "mail", state: "available", attempt: 0, max_attempts: 5, priority: 1, created_at: now(), scheduled_at: now(), actor_kind: "dev_operator", actor_id: "orb dev" };
    runs = [run, ...runs];
    addLine("app", `level=INFO msg="job enqueued" kind=mail.send queue=mail template=test`);
    void (async () => {
      await wait(1200);
      runs = runs.map((r) => (r.id === run.id ? { ...r, state: "completed", attempt: 1, attempted_at: now(), finalized_at: now() } : r));
      devMail.messages.unshift({ id: `msg_${Math.random().toString(16).slice(2, 8)}`, from: { name: opsMail.from_name, address: opsMail.from_email }, to: [{ name: "", address: to }], subject: "Test email from acme-api", snippet: "test · If you can read this, email delivery works.", created: now(), size: 2048, attachments: 0, read: false });
      devMail.total = devMail.messages.length;
      addLine("app", `level=INFO msg="mail sent" template=test to=${to}`);
    })();
    return json({ status: "queued", to, delivery: opsMail.delivery }, 202);
  }
  if (path === "/ops/mail/suppressions" && method === "GET") {
    const reason = query.get("reason");
    return json({ suppressions: reason ? suppressions.filter((s) => s.reason === reason) : suppressions });
  }
  const supp = /^\/ops\/mail\/suppressions\/(\d+)$/.exec(path);
  if (supp && method === "DELETE") {
    const s = suppressions.find((x) => x.id === Number(supp[1]));
    if (!s) return problemResponse(problem(404, "mail_suppression_not_found", `no suppression ${supp[1]}`));
    if (!reasonOf(body)) return problemResponse(problem(422, "mail_suppression_reason_required", "say why the address may receive email again"));
    suppressions = suppressions.filter((x) => x.id !== s.id);
    return json(s);
  }
  if (path === "/ops/releases/current" && method === "GET") return json({ releases: opsReleasesCurrent });

  return problemResponse(problem(404, "not_found", `no route matches ${method} ${path}`));
}

function withLastRuns(defs: JobDefinition[]): JobDefinition[] {
  return defs.map((d) => ({ ...d, last_run: runs.find((r) => r.kind === d.name && r.state !== "scheduled" && r.state !== "available") }));
}

function filterAudit(query: URLSearchParams): AuditEvent[] {
  let list = opsAuditEvents;
  const eq = (k: keyof AuditEvent, q: string) => {
    const v = query.get(q);
    if (v) list = list.filter((e) => String(e[k] ?? "") === v);
  };
  eq("actor_kind", "actor_kind");
  eq("actor_id", "actor_id");
  eq("action", "action");
  eq("resource_type", "resource_type");
  eq("resource_id", "resource_id");
  eq("org_id", "org_id");
  eq("outcome", "outcome");
  eq("request_id", "request_id");
  const prefix = query.get("action_prefix");
  if (prefix) list = list.filter((e) => e.action.startsWith(prefix));
  const from = query.get("from");
  const to = query.get("to");
  if (from) list = list.filter((e) => e.occurred_at >= new Date(from).toISOString());
  if (to) list = list.filter((e) => e.occurred_at < new Date(to).toISOString());
  return list;
}

function validateSetting(s: OpsSetting, value: unknown): string | undefined {
  const c = s.constraints ?? {};
  switch (s.kind) {
    case "bool":
      return typeof value === "boolean" ? undefined : "value must be true or false";
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value)) return "value must be a whole number";
      if (typeof c.min === "number" && value < c.min) return `value must be at least ${c.min}`;
      if (typeof c.max === "number" && value > c.max) return `value must be at most ${c.max}`;
      return undefined;
    case "float":
      return typeof value === "number" ? undefined : "value must be a number";
    case "duration":
      return typeof value === "string" && /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$|^0$/.test(value) ? undefined : "value must be a duration such as 30m or 24h";
    case "string_list":
      return Array.isArray(value) ? undefined : "value must be a list of strings";
    default:
      if (typeof value !== "string") return "value must be a string";
      if (typeof c.max_len === "number" && value.length > c.max_len) return `value must be at most ${c.max_len} characters`;
      return undefined;
  }
}
