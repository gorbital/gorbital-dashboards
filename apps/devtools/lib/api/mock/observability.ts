/**
 * The Observability screen's backends in memory (ADR-0073): the portal's
 * health table, the machine sampler and the pgmeta statistics under
 * `/_portal/api/`, and the app's `/ops/observability/*` through the proxy.
 * A degraded PostgreSQL (two sessions waiting on locks, one statement running
 * for a while), 25 statements with one heavy one, advice in every category,
 * and a system sample that wanders a little on every call. Registered from
 * `mock/index.ts` with one dispatch line.
 */
import { DAY, HOUR, MIN, NOW, rng } from "@gorbital/dash/lib/rand";
import type {
  Advice,
  DatabaseStats,
  HostSample,
  IndexAdvice,
  MinuteTraffic,
  ObservabilityOverview,
  ObservabilityRange,
  RouteSort,
  RouteTraffic,
  ServiceHealth,
  Statement,
  StatementSort,
  Statements,
} from "../observability";
import type { AppStatus, Problem } from "../types";

/* ---------- Responses ---------- */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 502: "Bad Gateway", 503: "Service Unavailable" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

const iso = (t: number) => new Date(t).toISOString();

/* ---------- Health ---------- */

/** Every service as orb dev checks it: the app follows the supervisor's state; PostgreSQL is degraded by the lock waits below. */
export function mockHealth(app: AppStatus, at = Date.now()): ServiceHealth[] {
  const running = app.state === "running";
  return [
    {
      name: "app",
      status: running ? "ok" : app.state === "building" || app.state === "preparing" ? "unknown" : "down",
      detail: running ? "ready" : app.state === "building" ? "building; the readiness check waits for the new process" : `the app is ${app.state}`,
      version: running ? "0.4.2" : undefined,
      url: app.url,
      checked_at: iso(at - 900),
      latency_ms: running ? 3.4 : 0,
    },
    {
      name: "postgres",
      status: "degraded",
      detail: `${dbStatsBase.locks.length} sessions waiting on locks · ${dbStatsBase.connections} of ${dbStatsBase.max_connections} connections`,
      version: "PostgreSQL 18.0",
      checked_at: iso(at - 850),
      latency_ms: 1.8,
    },
    { name: "mail", status: "ok", detail: "Mailpit answers; 7 messages captured", version: "Mailpit 1.21.5", url: "http://127.0.0.1:8025", checked_at: iso(at - 800), latency_ms: 2.2 },
    { name: "minio", status: "ok", detail: "container running (healthy)", version: "minio/minio:RELEASE.2026-08-30", url: "http://127.0.0.1:9001", checked_at: iso(at - 700), latency_ms: 41 },
    { name: "otel-collector", status: "down", detail: "container exited (1) 12 minutes ago", version: "otel/opentelemetry-collector:0.118.0", checked_at: iso(at - 700), latency_ms: 38 },
  ];
}

/* ---------- The machine ---------- */

let sampleIndex = 0;
const sampleRng = rng(4242);
const cpuWalk = sampleRng.walk(600, 34, 18, 2);
const appCpuWalk = sampleRng.walk(600, 2.4, 2.2, 0.1);
const memWalk = sampleRng.walk(600, 71, 1.2, 60);
const orbStarted = Date.now() - 21 * MIN;

/** One sample of the machine and the two processes; every call is the next step of a gentle walk. */
export function mockHostSample(app: AppStatus, at = Date.now()): HostSample {
  const i = sampleIndex++ % cpuWalk.length;
  const cpu = cpuWalk[i];
  const memPercent = memWalk[i];
  const total = 34_359_738_368;
  const used = Math.round((total * memPercent) / 100);
  const running = app.state === "running";
  return {
    sampled_at: iso(at - 400),
    host: { os: "darwin", arch: "arm64", cores: 10, hostname: "your-mac.local", cpu_percent: cpu, load1: 3.1 + cpu / 12, load5: 3.4 + cpu / 20, load15: 3.2, uptime_seconds: 6 * 86_400 + 4 * 3600 + 12 * 60 },
    app: running
      ? { pid: app.pid ?? 48123, cpu_percent: appCpuWalk[i], rss: 39_256_064 + i * 8192, threads: 13, open_files: 14 + (i % 3), started_at: app.started_at }
      : undefined,
    orb: { pid: 48101, cpu_percent: 0.6 + appCpuWalk[(i + 30) % appCpuWalk.length] / 8, rss: 22_511_616, threads: 14, open_files: 10, started_at: iso(orbStarted) },
    disk: { path: "/Users/you/code/acme-api", total: 994_662_584_320, used: 474_394_689_536, free: 520_267_894_784, percent: 47.7 },
    memory: { total, used, available: total - used, percent: memPercent },
  };
}

/* ---------- The database's statistics ---------- */

const tables: DatabaseStats["tables"] = [
  { schema: "public", name: "audit_events", total: 412_876_800, table: 288_358_400, indexes: 118_620_160, toast: 5_898_240, rows: 1_842_211, seq_scans: 412, index_scans: 88_412, dead_rows: 41_200, last_vacuum: iso(NOW - 6 * HOUR) },
  { schema: "public", name: "observability_minutes", total: 201_326_592, table: 150_994_944, indexes: 50_331_648, toast: 0, rows: 921_600, seq_scans: 1_902, index_scans: 12_044, dead_rows: 380_400, last_vacuum: iso(NOW - 3 * DAY) },
  { schema: "public", name: "river_job", total: 98_566_144, table: 62_914_560, indexes: 34_603_008, toast: 1_048_576, rows: 214_000, seq_scans: 44, index_scans: 402_118, dead_rows: 9_120, last_vacuum: iso(NOW - 40 * MIN) },
  { schema: "public", name: "projects", total: 41_943_040, table: 25_165_824, indexes: 16_252_928, toast: 524_288, rows: 120_400, seq_scans: 8_804, index_scans: 51_200, dead_rows: 320, last_vacuum: iso(NOW - 2 * HOUR) },
  { schema: "billing", name: "invoices", total: 33_554_432, table: 20_971_520, indexes: 12_058_624, toast: 524_288, rows: 84_000, seq_scans: 3, index_scans: 19_800, dead_rows: 12, last_vacuum: iso(NOW - 5 * HOUR) },
  { schema: "public", name: "auth_sessions", total: 18_874_368, table: 10_485_760, indexes: 8_388_608, toast: 0, rows: 61_200, seq_scans: 21, index_scans: 240_112, dead_rows: 18_400, last_vacuum: iso(NOW - 26 * HOUR) },
  { schema: "public", name: "auth_users", total: 12_582_912, table: 7_340_032, indexes: 5_242_880, toast: 0, rows: 24_811, seq_scans: 12, index_scans: 118_400, dead_rows: 90, last_vacuum: iso(NOW - 8 * HOUR) },
  { schema: "billing", name: "invoice_lines", total: 9_437_184, table: 6_291_456, indexes: 3_145_728, toast: 0, rows: 240_000, seq_scans: 2, index_scans: 9_200, dead_rows: 0, last_vacuum: iso(NOW - 5 * HOUR) },
  { schema: "public", name: "org_members", total: 4_194_304, table: 2_621_440, indexes: 1_572_864, toast: 0, rows: 31_000, seq_scans: 16, index_scans: 42_000, dead_rows: 44, last_vacuum: iso(NOW - 12 * HOUR) },
  { schema: "public", name: "orgs", total: 2_097_152, table: 1_310_720, indexes: 786_432, toast: 0, rows: 4_120, seq_scans: 9, index_scans: 20_140, dead_rows: 3, last_vacuum: iso(NOW - 12 * HOUR) },
  { schema: "public", name: "settings_overrides", total: 65_536, table: 8_192, indexes: 49_152, toast: 8_192, rows: 6, seq_scans: 1_204, index_scans: 0, dead_rows: 0, last_vacuum: null },
  { schema: "public", name: "goose_db_version", total: 40_960, table: 8_192, indexes: 24_576, toast: 8_192, rows: -1, seq_scans: 31, index_scans: 0, dead_rows: 0, last_vacuum: null },
];

const dbStatsBase: DatabaseStats = {
  database: "acme_api",
  version: "PostgreSQL 18.0",
  size: 1_051_721_728,
  connections: 41,
  max_connections: 100,
  clients: [
    { application: "acme-api", state: "idle", count: 18 },
    { application: "acme-api", state: "active", count: 4 },
    { application: "acme-api", state: "idle in transaction", count: 2 },
    { application: "river", state: "idle", count: 10 },
    { application: "river", state: "active", count: 2 },
    { application: "psql", state: "idle in transaction", count: 1 },
    { application: "psql", state: "active", count: 1 },
    { application: "orb dev portal", state: "active", count: 1 },
    { application: "", state: "idle", count: 2 },
  ],
  cache_hit_ratio: 0.9987,
  index_hit_ratio: 0.9621,
  commits: 4_812_331,
  rollbacks: 1_204,
  deadlocks: 2,
  temp_bytes: 734_003_200,
  stats_since: iso(NOW - 9 * DAY),
  tables,
  locks: [
    { pid: 31844, application: "acme-api", waiting: "UPDATE projects SET archived = true, updated_at = now() WHERE org_id = $1", lock_type: "relation", mode: "RowExclusiveLock", relation: "projects", blocked_by: [31790], waiting_for_ms: "4212" },
    { pid: 31871, application: "river", waiting: "DELETE FROM auth_sessions WHERE expires_at < now()", lock_type: "tuple", mode: "ExclusiveLock", relation: "auth_sessions", blocked_by: [31790, 31844], waiting_for_ms: "1380" },
  ],
  long_running: [
    { pid: 31790, application: "psql", state: "idle in transaction", query: "ALTER TABLE projects ADD COLUMN plan_tier text", duration_ms: 48_212, wait_event: "ClientRead" },
    { pid: 31802, application: "acme-api", state: "active", query: "SELECT count(*) FROM audit_events WHERE occurred_at > $1 AND actor_kind = $2", duration_ms: 3_180, wait_event: "DataFileRead" },
  ],
};

/** `/db/stats`: the base with the counters moving a little and the waits growing, so polling shows change. */
export function mockDbStats(at = Date.now()): DatabaseStats {
  const tick = Math.floor(at / 10_000);
  return {
    ...dbStatsBase,
    commits: dbStatsBase.commits + (tick % 1000) * 7,
    connections: dbStatsBase.connections + (tick % 3),
    clients: dbStatsBase.clients.map((c) => (c.application === "acme-api" && c.state === "active" ? { ...c, count: c.count + (tick % 3) } : c)),
    locks: dbStatsBase.locks.map((l) => ({ ...l, waiting_for_ms: String(Number(l.waiting_for_ms) + (tick % 30) * 1000) })),
    long_running: dbStatsBase.long_running.map((a) => ({ ...a, duration_ms: a.duration_ms + (tick % 30) * 1000 })),
  };
}

/* ---------- pg_stat_statements ---------- */

const statementTexts: [string, number, number, number][] = [
  // query, calls, mean ms, rows per call
  ["SELECT id, kind, queue, state, attempt, scheduled_at FROM river_job WHERE state = $1 AND queue = ANY($2) ORDER BY priority, scheduled_at, id LIMIT $3 FOR UPDATE SKIP LOCKED", 1_842_000, 5.15, 1.2],
  ["SELECT count(*) FROM audit_events WHERE occurred_at > $1 AND actor_kind = $2", 4_100, 512.4, 1],
  ["INSERT INTO observability_minutes (instance_id, minute, method, route, requests, client_errors, server_errors, duration_sum, duration_max, histogram) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (instance_id, minute, method, route) DO UPDATE SET requests = excluded.requests, client_errors = excluded.client_errors, server_errors = excluded.server_errors, duration_sum = excluded.duration_sum, duration_max = excluded.duration_max, histogram = excluded.histogram", 388_000, 1.9, 1],
  ["SELECT u.id, u.email, u.name, u.status, u.created_at, s.id AS session_id, s.expires_at FROM auth_users u JOIN auth_sessions s ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > now()", 921_400, 0.62, 1],
  ["SELECT p.id, p.name, p.slug, p.archived, p.created_at, p.updated_at FROM projects p WHERE p.org_id = $1 AND NOT p.archived ORDER BY p.updated_at DESC LIMIT $2 OFFSET $3", 212_000, 2.4, 20],
  ["UPDATE river_job SET state = $1, finalized_at = $2, errors = array_append(errors, $3) WHERE id = $4", 96_000, 3.1, 1],
  ["INSERT INTO audit_events (occurred_at, actor_kind, actor_id, action, resource_type, resource_id, org_id, outcome, metadata, request_id, trace_id, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)", 402_000, 0.71, 1],
  ["SELECT id, occurred_at, actor_kind, actor_id, actor_label, action, resource_type, resource_id, org_id, outcome, metadata, request_id FROM audit_events WHERE ($1::text IS NULL OR action LIKE $1 || '%') AND ($2::timestamptz IS NULL OR occurred_at >= $2) ORDER BY occurred_at DESC, id DESC LIMIT $3", 8_200, 24.6, 50],
  ["SELECT key, value, version, updated_at, updated_by FROM settings_overrides", 141_000, 0.34, 6],
  ["SELECT i.id, i.number, i.total_cents, i.status, i.issued_at FROM billing.invoices i WHERE i.org_id = $1 ORDER BY i.issued_at DESC LIMIT $2", 31_000, 1.7, 25],
  ["DELETE FROM auth_sessions WHERE expires_at < now()", 1_440, 188.2, 412],
  ["SELECT method, route, sum(requests), sum(client_errors), sum(server_errors), sum(duration_sum), max(duration_max), hist_sum(histogram) FROM observability_minutes WHERE minute >= $1 AND minute < $2 GROUP BY method, route", 12_400, 41.8, 38],
  ["SELECT m.user_id, m.role, m.created_at FROM org_members m WHERE m.org_id = $1", 88_000, 0.92, 12],
  ["UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '1 minute'", 240_000, 0.88, 1],
  ["SELECT id, name, slug, plan, created_at FROM orgs WHERE id = ANY($1)", 64_000, 0.55, 3],
  ["INSERT INTO river_job (kind, queue, args, priority, max_attempts, scheduled_at, state, metadata, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id", 41_000, 1.4, 1],
  ["SELECT id FROM auth_users WHERE lower(email) = lower($1)", 19_200, 0.41, 1],
  ["DELETE FROM observability_minutes WHERE minute < $1", 24, 2_812.5, 38_400],
  ["SELECT count(*) FROM projects WHERE org_id = $1", 52_000, 3.9, 1],
  ["SELECT l.id, l.description, l.quantity, l.unit_cents FROM billing.invoice_lines l WHERE l.invoice_id = $1 ORDER BY l.position", 28_000, 0.97, 8],
  ["UPDATE projects SET archived = true, updated_at = now() WHERE org_id = $1", 310, 92.4, 140],
  ["SELECT pid, state, query_start FROM pg_stat_activity WHERE datname = current_database()", 3_600, 1.1, 41],
  ["INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6)", 6_900, 0.77, 1],
  ["SELECT version_id, is_applied, tstamp FROM goose_db_version ORDER BY id DESC", 31, 0.29, 62],
  ["SELECT 1", 118_000, 0.02, 1],
];

let statementsResetAt: number | undefined;

/** The 25 statements: the River fetch is 60% of the total time; `total_share` is exact for the full list. */
export function mockStatements(sort: StatementSort, limit: number, at = Date.now()): Statements {
  const scale = statementsResetAt ? Math.max(0.01, Math.min(1, (at - statementsResetAt) / (5 * MIN))) : 1;
  const r = rng(99);
  const all: Statement[] = statementTexts.map(([query, calls, mean, rowsPerCall], i) => {
    const c = Math.max(1, Math.round(calls * scale));
    const total = c * mean;
    return {
      query_id: 1_000_000_000_000 + i * 7_919,
      query,
      calls: c,
      total_ms: total,
      mean_ms: mean,
      min_ms: mean * (0.2 + r.next() * 0.3),
      max_ms: mean * (4 + r.next() * 40),
      stddev_ms: mean * (0.3 + r.next() * 0.8),
      rows: Math.round(c * rowsPerCall),
      hit_ratio: i === 1 ? 0.71 : i === 17 ? 0.88 : 0.97 + r.next() * 0.03,
      total_share: 0,
    };
  });
  const sum = all.reduce((a, s) => a + s.total_ms, 0);
  for (const s of all) s.total_share = sum > 0 ? s.total_ms / sum : 0;
  const key: Record<StatementSort, (s: Statement) => number> = { total_time: (s) => s.total_ms, mean_time: (s) => s.mean_ms, calls: (s) => s.calls, rows: (s) => s.rows, max_time: (s) => s.max_ms };
  const sorted = [...all].sort((a, b) => key[sort](b) - key[sort](a));
  return { available: true, since: iso(statementsResetAt ?? NOW - 9 * DAY), statements: sorted.slice(0, limit), sort };
}

/* ---------- Advice ---------- */

const advice: Advice = {
  missing_fk_indexes: [
    { schema: "public", table: "audit_events", index: "audit_events_org_id_idx", columns: ["org_id"], reason: "foreign key audit_events_org_id_fkey has no index on (org_id): deletes and updates on the referenced table scan audit_events", sql: 'CREATE INDEX "audit_events_org_id_idx" ON "public"."audit_events" ("org_id");' },
    { schema: "billing", table: "invoice_lines", index: "invoice_lines_invoice_id_idx", columns: ["invoice_id"], reason: "foreign key invoice_lines_invoice_id_fkey has no index on (invoice_id): deletes and updates on the referenced table scan invoice_lines", sql: 'CREATE INDEX "invoice_lines_invoice_id_idx" ON "billing"."invoice_lines" ("invoice_id");' },
  ],
  unused_indexes: [
    { schema: "public", table: "projects", index: "projects_slug_trgm_idx", reason: "never scanned since the statistics were reset; if that stays true under real traffic, drop it", sql: 'DROP INDEX "public"."projects_slug_trgm_idx";', size: 9_437_184 },
    { schema: "public", table: "auth_sessions", index: "auth_sessions_ip_idx", reason: "never scanned since the statistics were reset; if that stays true under real traffic, drop it", sql: 'DROP INDEX "public"."auth_sessions_ip_idx";', size: 2_097_152 },
  ],
  seq_scanned: [
    { schema: "public", table: "projects", reason: "8804 sequential scans read 1059601600 rows of a 120400-row table (51200 index scans): the queries on it may need an index on the columns they filter by" },
    { schema: "public", table: "observability_minutes", reason: "1902 sequential scans read 1752883200 rows of a 921600-row table (12044 index scans): the queries on it may need an index on the columns they filter by" },
  ],
  dead_rows: [
    { schema: "public", table: "observability_minutes", reason: "380400 dead rows against 921600 live: autovacuum hasn't caught up", sql: 'VACUUM ANALYZE "public"."observability_minutes";' },
    { schema: "public", table: "auth_sessions", reason: "18400 dead rows against 61200 live: autovacuum hasn't caught up", sql: 'VACUUM ANALYZE "public"."auth_sessions";' },
  ],
};

export const mockAdvice = (): Advice => ({ missing_fk_indexes: [...advice.missing_fk_indexes], unused_indexes: [...advice.unused_indexes], seq_scanned: [...advice.seq_scanned], dead_rows: [...advice.dead_rows] } satisfies Record<keyof Advice, IndexAdvice[]>);

/* ---------- /ops/observability ---------- */

const windows: Record<ObservabilityRange, number> = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440 };

/** Per minute at full traffic: requests, server errors per 10k, p50, p95, p99 (ms). */
const routeProfiles: [string, string, number, number, number, number, number][] = [
  ["GET", "/readyz", 12, 0, 0.9, 1.4, 2.1],
  ["GET", "/v1/me", 96, 2, 3.8, 9.2, 18.4],
  ["GET", "/v1/orgs", 54, 0, 6.1, 14.8, 31.2],
  ["GET", "/v1/orgs/{org}/projects", 148, 4, 12.4, 36.2, 88.1],
  ["POST", "/v1/orgs/{org}/projects", 9, 40, 22.1, 61.7, 140.2],
  ["PATCH", "/v1/orgs/{org}/projects/{id}", 6, 310, 18.7, 380.4, 812.5],
  ["DELETE", "/v1/orgs/{org}/projects/{id}", 1, 90, 30.2, 90.4, 210],
  ["POST", "/v1/auth/sign-in", 22, 0, 41.2, 140.2, 302.8],
  ["POST", "/v1/auth/sign-out", 4, 0, 2.1, 4.8, 9.2],
  ["GET", "/v1/reports/usage", 2, 0, 812.4, 2400.5, 4100.2],
  ["GET", "/v1/billing/invoices", 18, 6, 9.4, 28.2, 64.1],
  ["GET", "/ops/system", 3, 0, 1.1, 2.4, 3.9],
  ["GET", "/ops/observability/overview", 2, 0, 4.2, 9.8, 15.1],
  ["GET", "/", 7, 0, 0.3, 0.8, 1.2],
  ["GET", "", 3, 0, 0.1, 0.4, 0.7],
];

function routesFor(range: ObservabilityRange, seed: number): RouteTraffic[] {
  const minutes = windows[range];
  const r = rng(seed);
  return routeProfiles.map(([method, route, perMin, errPer10k, p50, p95, p99]) => {
    const requests = Math.round(perMin * minutes * (0.85 + r.next() * 0.3));
    const server_errors = Math.round((requests * errPer10k) / 10_000);
    const client_errors = Math.round(requests * (route.includes("auth") ? 0.06 : route === "/" || route === "" ? 1 : 0.008));
    const jitter = 0.9 + r.next() * 0.2;
    return {
      method,
      route,
      requests,
      requests_per_minute: requests / minutes,
      client_errors,
      server_errors,
      error_rate: requests ? server_errors / requests : 0,
      latency_ms: { mean: p50 * 1.4 * jitter, p50: p50 * jitter, p95: p95 * jitter, p99: p99 * jitter, max: p99 * 3 * jitter },
    };
  });
}

function minutesFor(range: ObservabilityRange, to: number, seed: number): MinuteTraffic[] {
  const n = windows[range];
  const r = rng(seed);
  const walk = r.walk(n, 1, 0.35, 0.3);
  const perMin = routeProfiles.reduce((a, p) => a + p[2], 0);
  const out: MinuteTraffic[] = [];
  for (let i = 0; i < n; i++) {
    const minute = to - (n - i) * MIN;
    const requests = Math.round(perMin * walk[i]);
    if (requests === 0) continue;
    out.push({ minute: iso(minute), requests, server_errors: r.chance(0.3) ? r.int(0, 3) : 0, p95_ms: 30 + walk[i] * 22 + r.next() * 12 });
  }
  return out;
}

/** `GET /ops/observability/overview?window=`: the window's totals, one instance, the top routes and the minutes. */
export function mockOverview(range: ObservabilityRange, at = Date.now()): ObservabilityOverview {
  const n = windows[range];
  const to = at - (at % MIN) + MIN;
  const seed = Math.floor(at / 5000);
  const routes = routesFor(range, seed);
  const requests = routes.reduce((a, x) => a + x.requests, 0);
  const client_errors = routes.reduce((a, x) => a + x.client_errors, 0);
  const server_errors = routes.reduce((a, x) => a + x.server_errors, 0);
  const w = (f: (r: RouteTraffic) => number) => routes.reduce((a, x) => a + f(x) * x.requests, 0) / Math.max(1, requests);
  const latency_ms = { mean: w((x) => x.latency_ms.mean), p50: w((x) => x.latency_ms.p50), p95: 61.7 * (0.95 + (seed % 10) / 100), p99: 140.2 * (0.95 + (seed % 7) / 100), max: Math.max(...routes.map((x) => x.latency_ms.max)) };
  const byRequests = [...routes].sort((a, b) => b.requests - a.requests).slice(0, 5);
  const byErrors = routes.filter((x) => x.server_errors > 0).sort((a, b) => b.server_errors - a.server_errors).slice(0, 5);
  const byLatency = [...routes].sort((a, b) => b.latency_ms.p95 - a.latency_ms.p95).slice(0, 5);
  return {
    window: `${range === "15m" ? "15m0s" : range === "1h" ? "1h0m0s" : range === "6h" ? "6h0m0s" : "24h0m0s"}`,
    window_seconds: n * 60,
    from: iso(to - n * MIN),
    to: iso(to),
    requests,
    requests_per_minute: requests / n,
    client_errors,
    server_errors,
    error_rate: requests ? server_errors / requests : 0,
    latency_ms,
    instances: [{ instance_id: "9b1c4d2e7f3a6b8c0d1e2f3a4b5c6d7e", last_minute: iso(to - MIN), last_write: iso(at - 4000), requests, requests_per_minute: requests / n, client_errors, server_errors, error_rate: requests ? server_errors / requests : 0, latency_ms }],
    top_routes: { by_requests: byRequests, by_errors: byErrors, by_latency: byLatency },
    minutes: minutesFor(range, to, 7),
  };
}

/** `GET /ops/observability/routes?window=&sort=&limit=`. */
export function mockRoutes(range: ObservabilityRange, sort: RouteSort, limit: number, at = Date.now()): RouteTraffic[] {
  const routes = routesFor(range, Math.floor(at / 5000));
  const key: Record<RouteSort, (r: RouteTraffic) => number> = { requests: (r) => r.requests, errors: (r) => r.server_errors, error_rate: (r) => r.error_rate, p95: (r) => r.latency_ms.p95, p99: (r) => r.latency_ms.p99 };
  return routes.sort((a, b) => key[sort](b) - key[sort](a) || b.requests - a.requests).slice(0, limit);
}

function overviewStream(range: ObservabilityRange, isRunning: () => boolean, signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) return controller.close();
      const write = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Closed underneath us.
        }
      };
      controller.enqueue(encoder.encode("retry: 5000\n\n"));
      write("overview", mockOverview(range));
      timer = setInterval(() => {
        if (!isRunning()) {
          write("end", { reason: "shutting_down" });
          if (timer) clearInterval(timer);
          try {
            controller.close();
          } catch {
            // Already closed.
          }
          return;
        }
        write("overview", mockOverview(range));
      }, 5000);
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

/* ---------- The router ---------- */

const isRange = (v: string | null): v is ObservabilityRange => v !== null && v in windows;
const isRouteSort = (v: string | null): v is RouteSort => ["requests", "errors", "error_rate", "p95", "p99"].includes(v ?? "");
const isStatementSort = (v: string): v is StatementSort => ["total_time", "mean_time", "calls", "rows", "max_time"].includes(v);

/** Resets what the screen can change (the statement counters); tests call it between cases. */
export function resetObservabilityMock() {
  statementsResetAt = undefined;
  sampleIndex = 0;
}

/**
 * Answers the Observability screen's endpoints, or `undefined` for a path
 * it doesn't own. `app` is the supervisor's state: the health table and the
 * sampler follow it, and `/ops/observability/*` is a 502 while it isn't running.
 */
export function mockObservabilityFetch(url: URL, method: string, init: RequestInit, app: AppStatus, isRunning: () => boolean = () => app.state === "running"): Response | undefined {
  const p = url.pathname;
  const q = url.searchParams;
  if (p === "/_portal/api/health" && method === "GET") return json({ services: mockHealth(app) });
  if (p === "/_portal/api/system" && method === "GET") return json(mockHostSample(app));
  if (p === "/_portal/api/db/stats" && method === "GET") return json(mockDbStats());
  if (p === "/_portal/api/db/statements" && method === "GET") {
    const sort = q.get("sort") || "total_time";
    if (!isStatementSort(sort)) return problem(422, "invalid_input", `unknown sort ${JSON.stringify(sort)}`);
    const limit = Number(q.get("limit") ?? 0);
    return json(mockStatements(sort, limit > 0 && limit <= 500 ? limit : 50));
  }
  if (p === "/_portal/api/db/statements/reset" && method === "POST") {
    statementsResetAt = Date.now();
    return new Response(null, { status: 204 });
  }
  if (p === "/_portal/api/db/advice" && method === "GET") return json(mockAdvice());
  const ops = /^\/_portal\/app\/ops\/observability\/(overview|routes|stream)$/.exec(p);
  if (ops && method === "GET") {
    if (!isRunning()) return problem(502, "app_unavailable", `the app isn't answering at ${app.url}: connection refused`);
    const w = q.get("window") ?? "15m";
    if (!isRange(w)) return problem(422, "validation_failed", "window must be whole minutes from 1m to 24h (the mock knows 15m, 1h, 6h and 24h)");
    if (ops[1] === "overview") return json(mockOverview(w));
    if (ops[1] === "stream") return overviewStream(w, isRunning, init.signal ?? undefined);
    const sort = q.get("sort") ?? "requests";
    if (!isRouteSort(sort)) return problem(422, "validation_failed", `sort must be requests, errors, error_rate, p95 or p99, not ${sort}`);
    const limit = Number(q.get("limit") ?? 100);
    return json({ window: mockOverview(w).window, from: mockOverview(w).from, to: mockOverview(w).to, routes: mockRoutes(w, sort, limit > 0 ? Math.min(500, limit) : 100) });
  }
  return undefined;
}
