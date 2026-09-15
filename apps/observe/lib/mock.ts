import { rng, NOW, MIN, HOUR, DAY } from "@gorbital/dash/lib/rand";
import type { Span } from "@gorbital/dash/charts/waterfall";

export { NOW };

const r = rng(20260915);

export const ROUTES = [
  { m: "GET", p: "/v1/orgs/{org}/projects", w: 22 },
  { m: "POST", p: "/v1/orgs/{org}/projects", w: 5 },
  { m: "GET", p: "/v1/orgs/{org}/projects/{id}", w: 18 },
  { m: "PATCH", p: "/v1/orgs/{org}/projects/{id}", w: 3 },
  { m: "DELETE", p: "/v1/orgs/{org}/projects/{id}", w: 1 },
  { m: "GET", p: "/v1/me", w: 20 },
  { m: "POST", p: "/v1/auth/sign-in", w: 6 },
  { m: "POST", p: "/v1/auth/passkeys/verify", w: 2 },
  { m: "POST", p: "/v1/auth/2fa/verify", w: 2 },
  { m: "GET", p: "/v1/orgs/{org}/members", w: 8 },
  { m: "POST", p: "/v1/orgs/{org}/invites", w: 2 },
  { m: "GET", p: "/ops/audit/stats", w: 1 },
  { m: "GET", p: "/ops/jobs/runs", w: 2 },
  { m: "GET", p: "/healthz", w: 8 },
] as const;

export const ORGS = ["acme", "northwind", "globex", "initech", "umbrella", "hooli", "stark"] as const;
export const INSTANCE_IDS = ["i-7f3a", "i-9c21", "i-b04e"] as const;
export const REGIONS = ["eu-west-1a", "eu-west-1b", "eu-west-1c"] as const;

/* Hourly request series, 24 hours. */
export const hours = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(NOW - (23 - i) * HOUR);
  return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
});
const base = r.walk(24, 5300, 1800, 1200).map((v, i) => v * (1 + 0.35 * Math.sin(((i + 6) / 24) * Math.PI * 2)));
export const perHour = {
  ok: base.map((v) => Math.round(v * 0.971)),
  redirect: base.map((v) => Math.round(v * 0.012)),
  client: base.map((v) => Math.round(v * 0.014)),
  server: base.map((v, i) => Math.round(v * (i === 17 ? 0.021 : 0.003))),
};
export const totals = {
  requests: perHour.ok.reduce((a, b) => a + b, 0) + perHour.redirect.reduce((a, b) => a + b, 0) + perHour.client.reduce((a, b) => a + b, 0) + perHour.server.reduce((a, b) => a + b, 0),
  ok: perHour.ok.reduce((a, b) => a + b, 0),
  redirect: perHour.redirect.reduce((a, b) => a + b, 0),
  client: perHour.client.reduce((a, b) => a + b, 0),
  server: perHour.server.reduce((a, b) => a + b, 0),
};
export const p95 = r.walk(24, 44, 8, 20);
export const p50 = p95.map((v) => v * 0.31);
export const errRate = r.walk(24, 0.3, 0.12, 0.05).map((v, i) => (i === 17 ? 2.1 : v));

/* Latency heatmap: 24 columns × 8 buckets. */
export const latencyBuckets = ["<10", "10–25", "25–50", "50–100", "100–250", "250–500", "0.5–1s", ">1s"];
export const latencyHeat = latencyBuckets.map((_, b) =>
  hours.map((_, h) => {
    const peak = 2.2;
    const dist = Math.abs(b - peak);
    let v = Math.max(0, 1 - dist / 3.2) * (0.6 + 0.4 * Math.sin(((h + 6) / 24) * Math.PI * 2)) * (0.85 + r.next() * 0.3);
    if (h === 17 && b >= 5) v = 0.5 + r.next() * 0.4;
    return Math.min(1, v);
  }),
);

export const slowest = [
  { route: "GET /ops/audit/stats", p95: 312, n: 1_204 },
  { route: "GET /v1/orgs/{org}/members", p95: 148, n: 9_812 },
  { route: "POST /v1/auth/sign-in", p95: 131, n: 7_420 },
  { route: "GET /v1/orgs/{org}/projects", p95: 71, n: 27_101 },
  { route: "POST /v1/orgs/{org}/projects", p95: 64, n: 6_080 },
];

function pickRoute() {
  const total = ROUTES.reduce((a, x) => a + x.w, 0);
  let t = r.next() * total;
  for (const x of ROUTES) {
    t -= x.w;
    if (t <= 0) return x;
  }
  return ROUTES[0];
}

export type Request = {
  id: string;
  at: number;
  method: string;
  path: string;
  status: number;
  ms: number;
  org: string;
  instance: string;
  actor: string;
  traceId: string;
  spans: number;
  sql: number;
};

function realPath(p: string, org: string) {
  return p.replace("{org}", org).replace("{id}", `prj_${r.hex(6)}`);
}

export const requests: Request[] = Array.from({ length: 60 }, (_, i) => {
  const route = pickRoute();
  const org = r.pick(ORGS);
  const err = r.chance(0.04);
  const client = !err && r.chance(0.03);
  const slow = r.chance(0.08);
  const ms = (route.p.includes("audit") ? 220 : route.p === "/healthz" ? 1.2 : 18) * (slow ? 6 : 1) * (0.6 + r.next());
  return {
    id: `req_${r.hex(10)}`,
    at: NOW - i * r.int(4, 40) * 1000,
    method: route.m,
    path: realPath(route.p, org),
    status: err ? r.pick([500, 502, 503]) : client ? r.pick([400, 401, 403, 404, 422]) : route.m === "POST" ? 201 : route.m === "DELETE" ? 204 : 200,
    ms: Math.round(ms * 10) / 10,
    org,
    instance: r.pick(INSTANCE_IDS),
    actor: r.chance(0.15) ? "anonymous" : `usr_${r.hex(5)}`,
    traceId: r.hex(16),
    spans: r.int(3, 14),
    sql: r.int(0, 7),
  };
});

/* Traces */
export type Trace = { id: string; name: string; at: number; ms: number; spans: Span[]; status: number; org: string; instance: string; requestId: string };

function buildSpans(kind: "projects" | "signin" | "audit" | "invite"): Span[] {
  const s: Span[] = [];
  let t = 0;
  const push = (name: string, k: Span["kind"], dur: number, depth: number, error = false) => {
    s.push({ id: `sp${s.length}`, name, kind: k, start: t, duration: dur, depth, error });
    return s[s.length - 1];
  };
  if (kind === "projects") {
    push("GET /v1/orgs/acme/projects", "http", 38.2, 0);
    t = 0.4; push("auth.session.load", "internal", 1.8, 1);
    t = 0.6; push("SELECT sessions WHERE token_hash = $1", "sql", 1.1, 2);
    t = 2.4; push("orgs.membership.check", "internal", 1.4, 1);
    t = 2.6; push("SELECT org_members WHERE org_id = $1 AND user_id = $2", "sql", 0.9, 2);
    t = 4.1; push("projects.list", "internal", 31.2, 1);
    t = 4.3; push("SELECT count(*) FROM projects WHERE org_id = $1", "sql", 3.9, 2);
    t = 8.4; push("SELECT projects ... ORDER BY created_at DESC LIMIT 50", "sql", 22.7, 2);
    t = 31.4; push("cache.set projects:acme:p1", "cache", 0.6, 2);
    t = 35.9; push("encode json", "internal", 1.9, 1);
  } else if (kind === "signin") {
    push("POST /v1/auth/sign-in", "http", 131.6, 0);
    t = 0.5; push("ratelimit.check ip", "cache", 0.7, 1);
    t = 1.5; push("SELECT users WHERE email = $1", "sql", 1.4, 1);
    t = 3.2; push("argon2id.verify", "internal", 118.4, 1);
    t = 122.0; push("auth.2fa.required", "internal", 0.3, 1);
    t = 122.5; push("INSERT sessions", "sql", 2.1, 1);
    t = 125.0; push("INSERT audit_events", "sql", 1.8, 1);
    t = 127.1; push("jobs.enqueue mail.sign_in_notice", "job", 2.9, 1);
  } else if (kind === "audit") {
    push("GET /ops/audit/stats", "http", 312.4, 0);
    t = 0.4; push("auth.session.load", "internal", 1.6, 1);
    t = 2.2; push("auth.platform_role.require ops.read", "internal", 0.4, 1);
    t = 3.0; push("audit.stats", "internal", 306.1, 1);
    t = 3.2; push("SELECT date_trunc('hour', at), count(*) FROM audit_events ...", "sql", 241.8, 2);
    t = 246.0; push("SELECT actor_id, count(*) ... GROUP BY actor_id", "sql", 61.2, 2);
    t = 309.5; push("encode json", "internal", 2.4, 1);
  } else {
    push("POST /v1/orgs/acme/invites", "http", 64.3, 0, true);
    t = 0.4; push("auth.session.load", "internal", 1.7, 1);
    t = 2.4; push("orgs.membership.check", "internal", 1.2, 1);
    t = 4.0; push("orgs.invite.create", "internal", 58.0, 1, true);
    t = 4.2; push("INSERT org_invites", "sql", 2.6, 2);
    t = 7.1; push("mail.send invite", "mail", 54.6, 2, true);
    t = 7.4; push("smtp.connect mail.acme.dev:587", "ext", 54.1, 3, true);
  }
  return s;
}

const traceKinds = ["projects", "signin", "audit", "invite"] as const;
export const traces: Trace[] = Array.from({ length: 14 }, (_, i) => {
  const kind = i === 0 ? "invite" : i === 1 ? "audit" : traceKinds[i % 4];
  const spans = buildSpans(kind);
  const root = spans[0];
  return {
    id: r.hex(16),
    name: root.name,
    at: NOW - i * r.int(30, 400) * 1000,
    ms: root.duration,
    spans,
    status: root.error ? 502 : root.name.startsWith("POST") ? 201 : 200,
    org: r.pick(ORGS),
    instance: r.pick(INSTANCE_IDS),
    requestId: `req_${r.hex(10)}`,
  };
});

/* Errors, grouped by cause. */
export type ErrorGroup = {
  id: string;
  title: string;
  kind: string;
  where: string;
  count: number;
  users: number;
  first: number;
  last: number;
  trend: number[];
  status: "open" | "regressed" | "resolved" | "ignored";
  sample: { request: string; trace: string; stack: string[]; route: string };
};

export const errorGroups: ErrorGroup[] = [
  {
    id: "err_2f1a",
    title: "dial tcp 10.0.3.12:587: i/o timeout",
    kind: "mail.SendError",
    where: "modules/mail/smtp.go:142",
    count: 47,
    users: 19,
    first: NOW - 2 * DAY,
    last: NOW - 3 * MIN,
    trend: r.walk(24, 2, 3, 0).map((v, i) => (i > 15 ? v + 6 : v)),
    status: "open",
    sample: {
      request: "req_3b9e0f21ac",
      trace: traces[0].id,
      route: "POST /v1/orgs/acme/invites",
      stack: [
        "modules/mail.(*smtpSender).Send  modules/mail/smtp.go:142",
        "modules/orgs.(*Service).Invite  modules/orgs/invite.go:88",
        "internal/app/orgs.(*Handler).CreateInvite  internal/app/orgs/handlers.go:211",
        "httpx.Handle.func1  httpx/handle.go:61",
        "net/http.HandlerFunc.ServeHTTP  net/http/server.go:2220",
      ],
    },
  },
  {
    id: "err_91cc",
    title: "pq: canceling statement due to statement timeout",
    kind: "postgres.Timeout",
    where: "audit/stats.go:57",
    count: 12,
    users: 2,
    first: NOW - 6 * HOUR,
    last: NOW - 41 * MIN,
    trend: r.walk(24, 0.4, 1, 0),
    status: "regressed",
    sample: {
      request: "req_a01f7cc2e4",
      trace: traces[1].id,
      route: "GET /ops/audit/stats",
      stack: ["audit.(*Store).Stats  audit/stats.go:57", "internal/app/ops.(*Handler).AuditStats  internal/app/ops/audit.go:44", "httpx.Handle.func1  httpx/handle.go:61"],
    },
  },
  {
    id: "err_7be0",
    title: "passkey: challenge expired",
    kind: "auth.ChallengeExpired",
    where: "modules/auth/passkeys.go:203",
    count: 31,
    users: 24,
    first: NOW - 9 * DAY,
    last: NOW - 2 * HOUR,
    trend: r.walk(24, 1.2, 1.5, 0),
    status: "ignored",
    sample: {
      request: "req_c8e21b7f10",
      trace: traces[2].id,
      route: "POST /v1/auth/passkeys/verify",
      stack: ["modules/auth.(*Passkeys).Verify  modules/auth/passkeys.go:203", "internal/app/auth.(*Handler).VerifyPasskey  internal/app/auth/handlers.go:301"],
    },
  },
  {
    id: "err_c3d2",
    title: "orgs: member limit reached for plan free",
    kind: "orgs.LimitError",
    where: "modules/orgs/limits.go:31",
    count: 8,
    users: 3,
    first: NOW - 3 * DAY,
    last: NOW - 5 * HOUR,
    trend: r.walk(24, 0.3, 0.8, 0),
    status: "resolved",
    sample: { request: "req_0e11d5aa97", trace: traces[3].id, route: "POST /v1/orgs/globex/invites", stack: ["modules/orgs.checkLimits  modules/orgs/limits.go:31"] },
  },
  {
    id: "err_5a19",
    title: "context deadline exceeded",
    kind: "context.DeadlineExceeded",
    where: "modules/jobs/worker.go:77",
    count: 5,
    users: 0,
    first: NOW - 1 * DAY,
    last: NOW - 8 * HOUR,
    trend: r.walk(24, 0.2, 0.6, 0),
    status: "open",
    sample: { request: "job_9f2c", trace: traces[4].id, route: "job retention", stack: ["modules/jobs.(*Worker).Work  modules/jobs/worker.go:77", "modules/releases.retention  modules/releases/tracker.go:118"] },
  },
];

/* Jobs */
export const queues = [
  { name: "default", depth: 12, workers: 8, rate: 118, wait: 0.42, series: r.walk(30, 12, 8, 0) },
  { name: "mail", depth: 3, workers: 4, rate: 41, wait: 0.9, series: r.walk(30, 4, 4, 0) },
  { name: "maintenance", depth: 0, workers: 1, rate: 2, wait: 0.1, series: r.walk(30, 1, 1.5, 0) },
];
export const jobDefs = [
  { name: "mail.send", schedule: "on demand", queue: "mail", runs: 2_814, fail: 0.4, p95: 380, enabled: true },
  { name: "sessions.prune", schedule: "@every 10m", queue: "maintenance", runs: 144, fail: 0, p95: 62, enabled: true },
  { name: "retention", schedule: "0 3 * * *", queue: "maintenance", runs: 30, fail: 6.7, p95: 41_200, enabled: true },
  { name: "audit.rollup", schedule: "*/15 * * * *", queue: "default", runs: 96, fail: 0, p95: 910, enabled: true },
  { name: "invites.expire", schedule: "0 * * * *", queue: "default", runs: 24, fail: 0, p95: 88, enabled: true },
  { name: "projects.reindex", schedule: "on demand", queue: "default", runs: 6, fail: 0, p95: 12_400, enabled: false },
];
export type JobRun = { id: string; job: string; queue: string; state: "succeeded" | "failed" | "running" | "retrying" | "scheduled"; attempt: number; at: number; ms: number; by: string };
export const jobRuns: JobRun[] = Array.from({ length: 24 }, (_, i) => {
  const def = r.pick(jobDefs);
  const st = i === 0 ? "running" : i === 2 ? "retrying" : i === 5 ? "failed" : "succeeded";
  return {
    id: `job_${r.hex(6)}`,
    job: def.name,
    queue: def.queue,
    state: st,
    attempt: st === "retrying" ? 2 : st === "failed" ? 3 : 1,
    at: NOW - i * r.int(20, 300) * 1000,
    ms: st === "running" ? 0 : def.p95 * (0.4 + r.next() * 0.8),
    by: def.schedule === "on demand" ? `req_${r.hex(8)}` : "scheduler",
  };
});

/* Mail */
export type Mail = { id: string; to: string; subject: string; template: string; state: "delivered" | "sent" | "bounced" | "queued" | "failed"; at: number; job: string; opens: number };
const templates = ["invite", "sign_in_notice", "password_reset", "2fa_recovery", "org_digest"];
const subjects: Record<string, string> = {
  invite: "You're invited to {org} on acme",
  sign_in_notice: "New sign-in to your acme account",
  password_reset: "Reset your acme password",
  "2fa_recovery": "Your two-factor recovery codes",
  org_digest: "This week in {org}",
};
export const mails: Mail[] = Array.from({ length: 22 }, (_, i) => {
  const t = r.pick(templates);
  const org = r.pick(ORGS);
  const st = i === 0 ? "queued" : i === 1 ? "failed" : i === 4 ? "bounced" : i < 8 ? "sent" : "delivered";
  return {
    id: `msg_${r.hex(8)}`,
    to: `${r.pick(["ada", "grace", "linus", "ken", "dennis", "barbara", "margaret"])}@${org}.dev`,
    subject: subjects[t].replace("{org}", org),
    template: t,
    state: st,
    at: NOW - i * r.int(40, 900) * 1000,
    job: `job_${r.hex(6)}`,
    opens: st === "delivered" ? r.int(0, 3) : 0,
  };
});

/* Logs */
export type Log = { id: string; at: number; level: "debug" | "info" | "warn" | "error"; ctx: string; msg: string; fields: Record<string, string>; instance: string; traceId: string };
const logLines: [Log["level"], string, string, Record<string, string>][] = [
  ["info", "httpx", "request", { method: "GET", path: "/v1/orgs/acme/projects", status: "200", durationMs: "38.2", org: "acme" }],
  ["info", "httpx", "request", { method: "POST", path: "/v1/auth/sign-in", status: "201", durationMs: "131.6", region: "eu-west-1" }],
  ["warn", "ratelimit", "rate limit exceeded", { ip: "203.0.113.42", route: "POST /v1/auth/sign-in", limit: "10/min", retryAfter: "41" }],
  ["error", "mail.Sender", "send failed", { template: "invite", err: "dial tcp 10.0.3.12:587: i/o timeout", job: "job_9c2e1a", attempt: "3" }],
  ["info", "jobs.Worker", "job completed", { job: "sessions.prune", pruned: "412", durationMs: "58", queue: "maintenance" }],
  ["debug", "settings.Store", "settings reloaded", { key: "auth.session_ttl", version: "7", source: "LISTEN/NOTIFY" }],
  ["info", "httpx", "request", { method: "GET", path: "/v1/me", status: "200", durationMs: "4.1", org: "northwind" }],
  ["warn", "postgres", "slow query", { durationMs: "241.8", sql: "SELECT date_trunc('hour', at), count(*) FROM audit_events", route: "GET /ops/audit/stats" }],
  ["info", "releases.Tracker", "release seen", { version: "v0.5.0", commit: "8f1c2ab", instance: "i-b04e" }],
  ["error", "audit.Store", "pq: canceling statement due to statement timeout", { route: "GET /ops/audit/stats", request: "req_a01f7cc2e4", statementTimeout: "250ms" }],
  ["info", "httpx", "request", { method: "DELETE", path: "/v1/orgs/hooli/projects/prj_1a2b3c", status: "204", durationMs: "22.7", org: "hooli" }],
  ["info", "mail.Sender", "mail delivered", { template: "sign_in_notice", to: "ada@acme.dev", durationMs: "412", provider: "smtp" }],
];
export const logs: Log[] = Array.from({ length: 40 }, (_, i) => {
  const [level, ctx, msg, fields] = logLines[(i * 7 + 3) % logLines.length];
  return { id: `log_${i}`, at: NOW - i * r.int(1, 9) * 1000, level, ctx, msg, fields, instance: r.pick(INSTANCE_IDS), traceId: traces[i % traces.length].id };
});

/* Instances */
export const instances = INSTANCE_IDS.map((id, i) => ({
  id,
  region: REGIONS[i],
  version: "v0.5.0",
  commit: "8f1c2ab",
  started: NOW - (i === 2 ? 2 * HOUR : 3 * DAY + i * HOUR),
  rps: [61, 58, 63][i],
  cpu: r.walk(30, [34, 31, 47][i], 10, 5),
  mem: [412, 398, 455][i],
  go: "1.25.1",
  ok: true,
  leader: i === 0,
}));

/* Settings */
export const retention = [
  { key: "requests", value: "14 days", size: "6.2 GB", rows: "18.1M", next: NOW + 9 * HOUR },
  { key: "traces", value: "7 days", size: "11.4 GB", rows: "42.7M", next: NOW + 9 * HOUR },
  { key: "logs", value: "7 days", size: "3.9 GB", rows: "61.0M", next: NOW + 9 * HOUR },
  { key: "errors", value: "90 days", size: "140 MB", rows: "12.3k", next: NOW + 9 * HOUR },
  { key: "job runs", value: "30 days", size: "220 MB", rows: "88.2k", next: NOW + 9 * HOUR },
  { key: "mail", value: "30 days", size: "85 MB", rows: "31.9k", next: NOW + 9 * HOUR },
];
export const apiKeys = [
  { name: "acme-api production", prefix: "gau_live_7f3a", scope: "ingest", created: NOW - 40 * DAY, last: NOW - 2 * 1000, by: "Muhammad Qazi" },
  { name: "acme-api staging", prefix: "gau_test_2c91", scope: "ingest", created: NOW - 40 * DAY, last: NOW - 3 * HOUR, by: "Muhammad Qazi" },
  { name: "grafana read-only", prefix: "gau_live_e0b4", scope: "read", created: NOW - 12 * DAY, last: NOW - 15 * MIN, by: "Ada Lovelace" },
];
