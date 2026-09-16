/**
 * An in-memory orb dev: answers the portal's endpoints from lib/mock.ts so
 * the UI works without a backend (the public demo, tests, offline work). It
 * speaks HTTP shapes (Response objects, problem+json, an SSE body) so the
 * client code path is the same in both modes.
 */
import { devApp, devConfig, devJobRuns, devLogs, devMail, devMigrations, devRequests, devRoutes, liveOutputLines, outputLines, portalStatus } from "../../mock";
import type { Accepted, AppAction, AppStatus, GeneratorResponse, OutputLine, PortalEvent, Problem, Status } from "../types";

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

/** Resets the mock to its first state; tests call it between cases. */
export function resetMock() {
  app = initialApp();
  lines = [...outputLines];
  liveIndex = 0;
}

/* ---------- Responses ---------- */

function problem(status: number, code: string, detail: string): Problem {
  return { title: statusText(status), status, code, detail };
}

function statusText(status: number) {
  return { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 503: "Service Unavailable" }[status] ?? "Error";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
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

/* ---------- The router ---------- */

const latency = () => 60 + Math.random() * 120;

/** Answers `path` as orb dev would. Unknown paths get a 404 problem. */
export async function mockFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, "http://127.0.0.1:3100");
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD" && !headers.has(MUTATION_HEADER)) {
    return problemResponse(problem(403, "forbidden", `requests that change something must carry the ${MUTATION_HEADER} header`));
  }
  if (url.pathname === "/_portal/api/events") return events(init.signal ?? undefined);
  await wait(latency());
  if (init.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  const p = url.pathname;
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
  const gen = /^\/_portal\/api\/generators\/([a-z]+)\/(plan|apply)$/.exec(p);
  if (gen && method === "POST") {
    if (!portalStatus.generators.includes(gen[1])) return problemResponse(problem(404, "generator_not_found", `no generator ${gen[1]}; this orb has: ${portalStatus.generators.join(", ")}`));
    let input: Record<string, unknown> = {};
    try {
      input = (JSON.parse(typeof init.body === "string" ? init.body : "{}") as { input?: Record<string, unknown> }).input ?? {};
    } catch {
      return problemResponse(problem(400, "invalid_json", "the body must be JSON"));
    }
    return json(plan(gen[1], input, gen[2] === "apply"));
  }
  if (p.startsWith("/_portal/app/")) return appProxy(p.slice("/_portal/app".length));
  return problemResponse(problem(404, "not_found", `no portal endpoint ${method} ${p}`));
}

/** The app behind the proxy: readiness and the dev console. */
function appProxy(path: string): Response {
  if (app.state !== "running") return problemResponse(problem(502, "app_unavailable", `the app isn't answering at ${app.url}: connection refused`));
  if (path === "/readyz") return json({ status: "ok", checks: { postgres: "ok", river: "ok" } });
  if (path === "/healthz") return json({ status: "ok" });
  if (!app.console || !path.startsWith("/_dev")) return problemResponse(problem(404, "not_found", `no route matches GET ${path}`));
  const dev: Record<string, unknown> = {
    "/_dev/": { endpoints: ["/_dev/", "/_dev/app", "/_dev/config", "/_dev/jobs", "/_dev/logs", "/_dev/logs/stream", "/_dev/mail", "/_dev/migrations", "/_dev/openapi.json", "/_dev/requests", "/_dev/requests/stream", "/_dev/routes"] },
    "/_dev/app": devApp,
    "/_dev/routes": devRoutes,
    "/_dev/config": devConfig,
    "/_dev/requests": devRequests,
    "/_dev/logs": devLogs,
    "/_dev/migrations": devMigrations,
    "/_dev/jobs": devJobRuns,
    "/_dev/mail": devMail,
  };
  if (path in dev) return json(dev[path]);
  return problemResponse(problem(404, "not_found", `no route matches GET ${path}`));
}
