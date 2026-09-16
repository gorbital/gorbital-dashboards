import { rng, NOW, MIN, HOUR } from "@gorbital/dash/lib/rand";
import type { DevApp, DevConfigList, DevJobRunList, DevLogList, DevMail, DevMigrations, DevRequestList, DevRouteList, OutputLine, Status } from "./api/types";

export { NOW };
const r = rng(1234);

/* Routes from openapi.json, grouped by module. */
export type Route = { id: string; method: string; path: string; module: string; handler: string; op: string; mw: string[]; p95?: number };

const mw = {
  pub: [] as string[],
  session: ["session"],
  member: ["session", "org member"],
  ops: ["session", "2fa", "platform role"],
};

export const routes: Route[] = [
  { id: "r1", method: "GET", path: "/healthz", module: "health", handler: "health.Live", op: "healthLive", mw: mw.pub, p95: 1.2 },
  { id: "r2", method: "GET", path: "/readyz", module: "health", handler: "health.Ready", op: "healthReady", mw: mw.pub, p95: 3.8 },
  { id: "r3", method: "POST", path: "/v1/auth/sign-up", module: "auth", handler: "auth.SignUp", op: "signUp", mw: ["ratelimit 5/min"], p95: 140 },
  { id: "r4", method: "POST", path: "/v1/auth/sign-in", module: "auth", handler: "auth.SignIn", op: "signIn", mw: ["ratelimit 10/min"], p95: 131 },
  { id: "r5", method: "POST", path: "/v1/auth/sign-out", module: "auth", handler: "auth.SignOut", op: "signOut", mw: mw.session, p95: 6 },
  { id: "r6", method: "POST", path: "/v1/auth/2fa/enroll", module: "auth", handler: "auth.EnrollTOTP", op: "enrollTotp", mw: mw.session, p95: 12 },
  { id: "r7", method: "POST", path: "/v1/auth/2fa/verify", module: "auth", handler: "auth.VerifyTOTP", op: "verifyTotp", mw: mw.session, p95: 9 },
  { id: "r8", method: "POST", path: "/v1/auth/passkeys/register", module: "auth", handler: "auth.RegisterPasskey", op: "registerPasskey", mw: mw.session, p95: 18 },
  { id: "r9", method: "POST", path: "/v1/auth/passkeys/verify", module: "auth", handler: "auth.VerifyPasskey", op: "verifyPasskey", mw: mw.pub, p95: 22 },
  { id: "r10", method: "POST", path: "/v1/auth/password/reset", module: "auth", handler: "auth.RequestReset", op: "requestPasswordReset", mw: ["ratelimit 3/min"], p95: 44 },
  { id: "r11", method: "GET", path: "/v1/me", module: "auth", handler: "auth.Me", op: "me", mw: mw.session, p95: 4 },
  { id: "r12", method: "GET", path: "/v1/me/sessions", module: "auth", handler: "auth.ListSessions", op: "listSessions", mw: mw.session, p95: 7 },
  { id: "r13", method: "GET", path: "/v1/orgs", module: "orgs", handler: "orgs.List", op: "listOrgs", mw: mw.session, p95: 11 },
  { id: "r14", method: "POST", path: "/v1/orgs", module: "orgs", handler: "orgs.Create", op: "createOrg", mw: mw.session, p95: 31 },
  { id: "r15", method: "GET", path: "/v1/orgs/{org}", module: "orgs", handler: "orgs.Get", op: "getOrg", mw: mw.member, p95: 8 },
  { id: "r16", method: "GET", path: "/v1/orgs/{org}/members", module: "orgs", handler: "orgs.ListMembers", op: "listMembers", mw: mw.member, p95: 148 },
  { id: "r17", method: "POST", path: "/v1/orgs/{org}/invites", module: "orgs", handler: "orgs.CreateInvite", op: "createInvite", mw: [...mw.member, "role admin"], p95: 64 },
  { id: "r18", method: "POST", path: "/v1/invites/{token}/accept", module: "orgs", handler: "orgs.AcceptInvite", op: "acceptInvite", mw: mw.session, p95: 40 },
  { id: "r19", method: "GET", path: "/v1/orgs/{org}/projects", module: "projects", handler: "projects.List", op: "listProjects", mw: mw.member, p95: 38 },
  { id: "r20", method: "POST", path: "/v1/orgs/{org}/projects", module: "projects", handler: "projects.Create", op: "createProject", mw: [...mw.member, "role editor"], p95: 29 },
  { id: "r21", method: "GET", path: "/v1/orgs/{org}/projects/{id}", module: "projects", handler: "projects.Get", op: "getProject", mw: mw.member, p95: 9 },
  { id: "r22", method: "PATCH", path: "/v1/orgs/{org}/projects/{id}", module: "projects", handler: "projects.Update", op: "updateProject", mw: [...mw.member, "role editor"], p95: 21 },
  { id: "r23", method: "DELETE", path: "/v1/orgs/{org}/projects/{id}", module: "projects", handler: "projects.Delete", op: "deleteProject", mw: [...mw.member, "role admin"], p95: 23 },
  { id: "r24", method: "GET", path: "/ops/system", module: "ops", handler: "ops.System", op: "opsSystem", mw: mw.ops, p95: 2 },
  { id: "r25", method: "GET", path: "/ops/settings", module: "ops", handler: "ops.ListSettings", op: "opsListSettings", mw: mw.ops, p95: 5 },
  { id: "r26", method: "PUT", path: "/ops/settings/{key}", module: "ops", handler: "ops.PutSetting", op: "opsPutSetting", mw: mw.ops, p95: 14 },
  { id: "r27", method: "GET", path: "/ops/jobs/definitions", module: "ops", handler: "ops.JobDefinitions", op: "opsJobDefinitions", mw: mw.ops, p95: 4 },
  { id: "r28", method: "GET", path: "/ops/jobs/runs", module: "ops", handler: "ops.JobRuns", op: "opsJobRuns", mw: mw.ops, p95: 19 },
  { id: "r29", method: "GET", path: "/ops/audit", module: "ops", handler: "ops.Audit", op: "opsAudit", mw: mw.ops, p95: 33 },
  { id: "r30", method: "GET", path: "/ops/audit/stats", module: "ops", handler: "ops.AuditStats", op: "opsAuditStats", mw: mw.ops, p95: 312 },
  { id: "r31", method: "GET", path: "/ops/releases/current", module: "ops", handler: "ops.ReleasesCurrent", op: "opsReleasesCurrent", mw: mw.ops, p95: 6 },
];

export const moduleCounts = routes.reduce<Record<string, number>>((a, x) => ((a[x.module] = (a[x.module] ?? 0) + 1), a), {});

/* Module graph: the wiring in internal/app, read from source. */
export type Node = { id: string; label: string; kind: "app" | "module" | "infra" | "handler"; x: number; y: number; pkg: string };
export type Edge = { from: string; to: string; via?: string };

export const nodes: Node[] = [
  { id: "app", label: "internal/app", kind: "app", x: 430, y: 40, pkg: "internal/app" },
  { id: "h.auth", label: "auth handlers", kind: "handler", x: 150, y: 150, pkg: "internal/app/auth" },
  { id: "h.orgs", label: "orgs handlers", kind: "handler", x: 340, y: 150, pkg: "internal/app/orgs" },
  { id: "h.projects", label: "projects handlers", kind: "handler", x: 530, y: 150, pkg: "internal/app/projects" },
  { id: "h.ops", label: "ops handlers", kind: "handler", x: 720, y: 150, pkg: "internal/app/ops" },
  { id: "auth", label: "modules/auth", kind: "module", x: 110, y: 280, pkg: "gorbital.dev/modules/auth" },
  { id: "orgs", label: "modules/orgs", kind: "module", x: 300, y: 280, pkg: "gorbital.dev/modules/orgs" },
  { id: "projects", label: "projects", kind: "module", x: 490, y: 280, pkg: "internal/projects" },
  { id: "settings", label: "modules/settings", kind: "module", x: 680, y: 280, pkg: "gorbital.dev/modules/settings" },
  { id: "jobs", label: "modules/jobs", kind: "module", x: 830, y: 280, pkg: "gorbital.dev/modules/jobs" },
  { id: "mail", label: "modules/mail", kind: "module", x: 200, y: 400, pkg: "gorbital.dev/modules/mail" },
  { id: "audit", label: "audit", kind: "module", x: 400, y: 400, pkg: "gorbital.dev/audit" },
  { id: "telemetry", label: "telemetry", kind: "module", x: 600, y: 400, pkg: "gorbital.dev/modules/telemetry" },
  { id: "releases", label: "releases", kind: "module", x: 780, y: 400, pkg: "gorbital.dev/modules/releases" },
  { id: "pg", label: "postgres pool", kind: "infra", x: 330, y: 520, pkg: "gorbital.dev/modules/postgres" },
  { id: "river", label: "river", kind: "infra", x: 560, y: 520, pkg: "github.com/riverqueue/river" },
  { id: "smtp", label: "smtp", kind: "infra", x: 130, y: 520, pkg: "net/smtp" },
  { id: "otel", label: "otlp exporter", kind: "infra", x: 770, y: 520, pkg: "go.opentelemetry.io/otel" },
];
export const edges: Edge[] = [
  { from: "app", to: "h.auth" }, { from: "app", to: "h.orgs" }, { from: "app", to: "h.projects" }, { from: "app", to: "h.ops" },
  { from: "h.auth", to: "auth" }, { from: "h.orgs", to: "orgs" }, { from: "h.projects", to: "projects" }, { from: "h.ops", to: "settings" }, { from: "h.ops", to: "jobs" }, { from: "h.ops", to: "audit" }, { from: "h.ops", to: "releases" },
  { from: "auth", to: "mail", via: "Sender" }, { from: "orgs", to: "mail", via: "Sender" }, { from: "auth", to: "audit" }, { from: "orgs", to: "audit" }, { from: "projects", to: "audit" },
  { from: "auth", to: "pg" }, { from: "orgs", to: "pg" }, { from: "projects", to: "pg" }, { from: "settings", to: "pg" }, { from: "audit", to: "pg" }, { from: "releases", to: "pg" },
  { from: "jobs", to: "river" }, { from: "mail", to: "jobs", via: "AsyncSender" }, { from: "mail", to: "smtp" }, { from: "telemetry", to: "otel" }, { from: "river", to: "pg" },
];

/* Bootstrap timings, ms, in start order. */
export const bootstrap = [
  { name: "config.Load", start: 0, ms: 3.1, kind: "infra" },
  { name: "telemetry.Init", start: 3.2, ms: 12.4, kind: "infra" },
  { name: "postgres.Connect", start: 15.8, ms: 148.6, kind: "infra" },
  { name: "settings.Load", start: 164.6, ms: 21.9, kind: "module" },
  { name: "auth.New", start: 186.7, ms: 8.4, kind: "module" },
  { name: "auth.passkeys.RP", start: 195.2, ms: 2.1, kind: "module" },
  { name: "orgs.New", start: 197.5, ms: 3.3, kind: "module" },
  { name: "projects.New", start: 200.9, ms: 1.2, kind: "module" },
  { name: "mail.NewSMTP", start: 202.2, ms: 39.8, kind: "module" },
  { name: "jobs.NewClient (river)", start: 242.1, ms: 96.3, kind: "module" },
  { name: "jobs.RegisterWorkers", start: 338.5, ms: 4.7, kind: "module" },
  { name: "audit.New", start: 343.3, ms: 2.0, kind: "module" },
  { name: "releases.Track", start: 345.4, ms: 18.9, kind: "module" },
  { name: "openapi.Build", start: 364.4, ms: 27.6, kind: "app" },
  { name: "app.Routes", start: 392.1, ms: 6.8, kind: "app" },
  { name: "http.Listen :8080", start: 399.0, ms: 13.2, kind: "app" },
];
export const bootstrapTotal = 412.2;

/* Audit findings. */
export type Finding = { level: "error" | "warning" | "hint"; rule: string; title: string; where: string; detail: string };
export const findings: Finding[] = [
  { level: "error", rule: "ops/2fa-required", title: "Ops handler reachable without 2FA", where: "internal/app/ops/releases.go:31", detail: "ops.ReleasesCurrent is mounted with session middleware only. Every /ops/* route needs RequireTwoFactor before the platform-role check (ADR-0043)." },
  { level: "error", rule: "jobs/timeout", title: "Job has no timeout", where: "internal/jobs/reindex.go:14", detail: "projects.reindex declares no Timeout. River uses the client default (1m); a reindex over 20k rows takes longer and will be retried mid-way." },
  { level: "warning", rule: "sql/no-limit", title: "List query without LIMIT", where: "internal/projects/select_all.go:9", detail: "SELECT projects WHERE org_id = $1 has no LIMIT. Paginate with a cursor like the other list endpoints." },
  { level: "warning", rule: "handlers/large", title: "Handler over 200 lines", where: "internal/app/orgs/handlers.go", detail: "orgs handlers are 287 lines. Split invites into their own file, as `orb gen resource` would." },
  { level: "warning", rule: "settings/unused", title: "Setting declared but never read", where: "internal/settings/keys.go:22", detail: "projects.max_per_org has no config.Value reader. Either read it in projects.Create or remove it." },
  { level: "hint", rule: "mail/plaintext", title: "Template has no text/plain part", where: "internal/mail/templates/org_digest.html", detail: "Add org_digest.txt so mail clients that block HTML still show the digest." },
  { level: "hint", rule: "openapi/summary", title: "Operation missing summary", where: "internal/app/ops/audit.go:44", detail: "opsAuditStats has no summary; it shows as its operation ID in the API reference." },
];

/* Jobs on the bench. */
export const jobDefs = [
  { name: "mail.send", schedule: "on demand", queue: "mail", timeout: "30s", attempts: 5, last: NOW - 2 * MIN, lastState: "succeeded" },
  { name: "sessions.prune", schedule: "@every 10m", queue: "maintenance", timeout: "1m", attempts: 3, last: NOW - 7 * MIN, lastState: "succeeded" },
  { name: "retention", schedule: "0 3 * * *", queue: "maintenance", timeout: "10m", attempts: 3, last: NOW - 11 * HOUR, lastState: "succeeded" },
  { name: "audit.rollup", schedule: "*/15 * * * *", queue: "default", timeout: "2m", attempts: 3, last: NOW - 4 * MIN, lastState: "succeeded" },
  { name: "invites.expire", schedule: "0 * * * *", queue: "default", timeout: "1m", attempts: 3, last: NOW - 32 * MIN, lastState: "succeeded" },
  { name: "projects.reindex", schedule: "on demand", queue: "default", timeout: "—", attempts: 3, last: NOW - 3 * HOUR, lastState: "failed" },
];
export const jobRuns = [
  { id: "job_a91f", job: "audit.rollup", state: "succeeded", ms: 812, at: NOW - 4 * MIN, out: "rolled up 1,204 events into 16 buckets" },
  { id: "job_b02c", job: "mail.send", state: "succeeded", ms: 391, at: NOW - 2 * MIN, out: "delivered invite → ada@acme.dev (idempotency job_b02c:1)" },
  { id: "job_c3d4", job: "sessions.prune", state: "succeeded", ms: 58, at: NOW - 7 * MIN, out: "pruned 3 expired sessions" },
  { id: "job_d4e5", job: "projects.reindex", state: "failed", ms: 60_000, at: NOW - 3 * HOUR, out: "context deadline exceeded after 60s (attempt 3/3)" },
  { id: "job_e5f6", job: "mail.send", state: "succeeded", ms: 402, at: NOW - 22 * MIN, out: "delivered sign_in_notice → you@localhost" },
];

/* Outbox: mail the app sent while orb dev captured it. */
export const outbox = [
  { id: "msg_01", to: "ada@acme.dev", subject: "You're invited to acme on acme-api", template: "invite", at: NOW - 2 * MIN, size: "4.1 KB" },
  { id: "msg_02", to: "you@localhost", subject: "New sign-in to your acme-api account", template: "sign_in_notice", at: NOW - 22 * MIN, size: "3.2 KB" },
  { id: "msg_03", to: "grace@northwind.dev", subject: "Reset your acme-api password", template: "password_reset", at: NOW - 48 * MIN, size: "3.0 KB" },
  { id: "msg_04", to: "you@localhost", subject: "Your two-factor recovery codes", template: "2fa_recovery", at: NOW - 2 * HOUR, size: "2.7 KB" },
];

/* Runtime settings, declared in code, stored in PostgreSQL when changed. */
export type Setting = { key: string; value: string; def: string; type: string; bounds?: string; version: number; live: boolean; changed?: string };
export const settings: Setting[] = [
  { key: "auth.session_ttl", value: "720h", def: "720h", type: "duration", bounds: "1h – 8760h", version: 1, live: true },
  { key: "auth.password_min_length", value: "12", def: "12", type: "int", bounds: "8 – 128", version: 1, live: true },
  { key: "auth.require_2fa_for_ops", value: "true", def: "true", type: "bool", version: 1, live: true },
  { key: "auth.lockout_after", value: "8", def: "10", type: "int", bounds: "3 – 50", version: 3, live: true, changed: "brute-force test, 2 days ago" },
  { key: "orgs.invite_ttl", value: "168h", def: "168h", type: "duration", bounds: "1h – 720h", version: 1, live: true },
  { key: "orgs.max_members_free", value: "5", def: "5", type: "int", bounds: "1 – 1000", version: 1, live: true },
  { key: "projects.max_per_org", value: "100", def: "100", type: "int", bounds: "1 – 10000", version: 1, live: false },
  { key: "mail.sender_name", value: "acme-api (dev)", def: "acme-api", type: "string", version: 2, live: true, changed: "tell dev mail apart, 5 days ago" },
  { key: "mail.reply_to", value: "", def: "", type: "string", version: 1, live: true },
  { key: "app.frontend_url", value: "http://localhost:5173", def: "http://localhost:5173", type: "url", version: 1, live: true },
  { key: "app.maintenance", value: "false", def: "false", type: "bool", version: 1, live: true },
  { key: "ratelimit.sign_in_per_min", value: "10", def: "10", type: "int", bounds: "1 – 1000", version: 1, live: true },
];

/* Database */
export const migrations = [
  { v: "0012", name: "projects_add_archived_at", applied: NOW - 20 * MIN, ms: 41, by: "cmd/migrate" },
  { v: "0011", name: "org_invites_token_hash", applied: NOW - 2 * HOUR, ms: 88, by: "cmd/migrate" },
  { v: "0010", name: "river_v6", applied: NOW - 3 * HOUR, ms: 302, by: "river" },
  { v: "0009", name: "audit_events_partition", applied: NOW - 3 * HOUR, ms: 1204, by: "cmd/migrate" },
  { v: "0008", name: "settings_history", applied: NOW - 3 * HOUR, ms: 27, by: "cmd/migrate" },
  { v: "0007", name: "releases_instances", applied: NOW - 3 * HOUR, ms: 34, by: "cmd/migrate" },
];
export const pending = [{ v: "0013", name: "projects_search_tsvector", file: "migrations/0013_projects_search_tsvector.sql" }];
export const tables = [
  { name: "users", rows: 42, size: "112 KB", seed: true },
  { name: "sessions", rows: 7, size: "48 KB", seed: false },
  { name: "orgs", rows: 6, size: "32 KB", seed: true },
  { name: "org_members", rows: 51, size: "64 KB", seed: true },
  { name: "org_invites", rows: 3, size: "16 KB", seed: false },
  { name: "projects", rows: 480, size: "1.2 MB", seed: true },
  { name: "audit_events", rows: 12_318, size: "9.8 MB", seed: false },
  { name: "settings", rows: 2, size: "16 KB", seed: false },
  { name: "river_job", rows: 3_114, size: "4.1 MB", seed: false },
];
export const slowQueries = [
  { sql: "SELECT date_trunc('hour', at), count(*) FROM audit_events WHERE at > $1 GROUP BY 1", ms: 241.8, calls: 12, route: "GET /ops/audit/stats", hint: "no index on audit_events(at)" },
  { sql: "SELECT * FROM org_members WHERE org_id = $1 ORDER BY joined_at", ms: 148.2, calls: 61, route: "GET /v1/orgs/{org}/members", hint: "SELECT * pulls the avatar blob" },
  { sql: "SELECT projects.* FROM projects WHERE org_id = $1", ms: 22.7, calls: 220, route: "GET /v1/orgs/{org}/projects", hint: "no LIMIT" },
];

export const seedR = r;

/* ---------- What orb dev's portal would answer, for mock mode ---------- */

const iso = (ts: number) => new Date(ts).toISOString();

/** GET /_portal/api/status as the mock transport first answers it; the mock supervisor mutates `app`. */
export const portalStatus: Status = {
  portal: { version: "1.3.0", ui: "bundled", started_at: iso(NOW - 3 * HOUR - 2 * MIN) },
  project: {
    name: "acme-api",
    module: "github.com/acme/acme-api",
    preset: "full",
    tenancy: "multi",
    features: ["auth", "orgs", "jobs", "mail", "settings", "audit", "releases"],
    mail: "mailpit",
    dir: "/Users/you/src/acme-api",
    database: true,
  },
  app: {
    state: "running",
    pid: 48213,
    addr: "127.0.0.1:8080",
    url: "http://127.0.0.1:8080",
    started_at: iso(NOW - 20 * MIN),
    restarts: 3,
    console: true,
  },
  links: {
    api: "http://127.0.0.1:8080",
    docs: "http://127.0.0.1:8080/docs",
    mail: "http://127.0.0.1:8025",
    console: "http://127.0.0.1:8080/_dev/",
    grafana: "http://127.0.0.1:3000",
  },
  generators: ["job", "migration", "resource"],
};

/** The output tail, oldest first: orb's own messages and the app's log lines. */
export const outputLines: OutputLine[] = (
  [
    [-20 * MIN - 8000, "orb", "change detected: internal/projects/service.go"],
    [-20 * MIN - 7900, "orb", "building… go build ./cmd/api"],
    [-20 * MIN - 2100, "orb", "built in 5.8s"],
    [-20 * MIN - 2000, "orb", "starting app (pid 48213) on 127.0.0.1:8080"],
    [-20 * MIN - 1800, "app", 'level=INFO msg="config loaded" env=development'],
    [-20 * MIN - 1780, "app", 'level=INFO msg="postgres connected" pool=10 db=acme_api_dev'],
    [-20 * MIN - 1600, "app", 'level=INFO msg="migrations up to date" current=12 pending=1'],
    [-20 * MIN - 1500, "app", 'level=INFO msg="river started" queues=3 workers=6'],
    [-20 * MIN - 1400, "app", 'level=INFO msg="dev console on" endpoints=11'],
    [-20 * MIN - 1200, "app", 'level=INFO msg="listening" addr=127.0.0.1:8080'],
    [-20 * MIN - 1100, "orb", "ready · http://127.0.0.1:8080 · docs at /docs"],
    [-19 * MIN, "app", 'level=INFO msg="http request" method=GET route="/readyz" status=200 duration=3.8ms'],
    [-17 * MIN, "app", 'level=INFO msg="http request" method=POST route="/v1/auth/sign-in" status=200 duration=131ms request_id=req_2e9b1f'],
    [-17 * MIN + 400, "app", 'level=INFO msg="job enqueued" kind=mail.send queue=mail'],
    [-17 * MIN + 900, "app", 'level=INFO msg="job succeeded" kind=mail.send attempt=1 duration=402ms'],
    [-15 * MIN, "app", 'level=INFO msg="http request" method=GET route="/v1/orgs/{org}/projects" status=200 duration=38ms request_id=req_71c0aa'],
    [-12 * MIN, "app", 'level=WARN msg="slow query" duration=241ms route="GET /ops/audit/stats" hint="no index on audit_events(at)"'],
    [-11 * MIN, "app", 'level=INFO msg="http request" method=GET route="/ops/audit/stats" status=200 duration=312ms request_id=req_c04d11'],
    [-7 * MIN, "app", 'level=INFO msg="job succeeded" kind=sessions.prune pruned=3'],
    [-4 * MIN, "app", 'level=INFO msg="job succeeded" kind=audit.rollup events=1204 buckets=16'],
    [-2 * MIN, "app", 'level=INFO msg="http request" method=POST route="/v1/orgs/{org}/invites" status=201 duration=64ms request_id=req_9a12f0'],
    [-2 * MIN + 500, "app", 'level=INFO msg="mail sent" template=invite to=ada@acme.dev'],
  ] as const
).map(([offset, stream, text]) => ({ time: iso(NOW + offset), stream, text }));

/** Lines the mock stream emits, one every few seconds, in a loop. */
export const liveOutputLines: { stream: "app" | "orb"; text: string }[] = [
  { stream: "app", text: 'level=INFO msg="http request" method=GET route="/readyz" status=200 duration=2.9ms' },
  { stream: "app", text: 'level=INFO msg="http request" method=GET route="/v1/me" status=200 duration=4.1ms request_id=req_b7e21c' },
  { stream: "app", text: 'level=INFO msg="job succeeded" kind=audit.rollup events=88 buckets=4' },
  { stream: "app", text: 'level=INFO msg="http request" method=GET route="/v1/orgs" status=200 duration=11ms request_id=req_44a0d9' },
  { stream: "app", text: 'level=WARN msg="rate limited" route="POST /v1/auth/sign-in" ip=127.0.0.1' },
  { stream: "orb", text: "watching 214 files in 31 packages" },
];

/** GET /_dev/app: what the app says about itself. */
export const devApp: DevApp = {
  name: "acme-api",
  version: "0.4.2",
  commit: "3f9a1c7",
  go_version: "go1.25.1",
  env: "development",
  libraries: [
    { path: "gorbital.dev/modules/auth", version: "v1.3.0" },
    { path: "gorbital.dev/modules/orgs", version: "v1.3.0" },
    { path: "gorbital.dev/modules/jobs", version: "v1.3.0" },
    { path: "gorbital.dev/modules/mail", version: "v1.3.0" },
    { path: "gorbital.dev/modules/settings", version: "v1.3.0" },
    { path: "gorbital.dev/modules/devconsole", version: "v1.3.0", replaced: true },
  ],
  modules: Object.keys(moduleCounts),
  jobs: jobDefs.map((d) => ({
    name: d.name,
    description: `${d.queue} queue · ${d.attempts} attempts`,
    enabled: true,
    schedule: d.schedule === "on demand" ? "" : d.schedule,
    modified: d.name === "auth.lockout_after",
    next_run_at: d.schedule === "on demand" ? undefined : iso(NOW + 6 * MIN),
  })),
  settings: settings.map((s) => ({
    key: s.key,
    group: s.key.split(".")[0],
    description: `${s.type}${s.bounds ? ` · ${s.bounds}` : ""}`,
    kind: s.type,
    value: s.type === "int" ? Number(s.value) : s.type === "bool" ? s.value === "true" : s.value,
    default: s.type === "int" ? Number(s.def) : s.type === "bool" ? s.def === "true" : s.def,
    modified: s.value !== s.def,
    org_overridable: s.key.startsWith("orgs.") || s.key.startsWith("projects."),
  })),
  flags: [
    { key: "projects.search", group: "projects", description: "Full-text search over projects", client: true, enabled: false, default: false, percentage: null, targets: 0, modified: false },
    { key: "orgs.sso", group: "orgs", description: "SAML sign-in for organisations", client: false, enabled: true, default: false, percentage: 25, targets: 2, modified: true },
    { key: "mail.digest", group: "mail", description: "Weekly organisation digest", client: false, enabled: true, default: true, percentage: null, targets: 0, modified: false },
  ],
  permissions: [
    {
      name: "org",
      permissions: [
        { name: "org.read", description: "See the organisation" },
        { name: "org.members.invite", description: "Invite members" },
        { name: "projects.write", description: "Create and edit projects" },
        { name: "projects.delete", description: "Delete projects" },
      ],
      roles: [
        { name: "viewer", description: "Read only", permissions: ["org.read"] },
        { name: "editor", description: "Edit projects", permissions: ["org.read", "projects.write"] },
        { name: "admin", description: "Everything", permissions: ["org.read", "org.members.invite", "projects.write", "projects.delete"] },
      ],
    },
  ],
};

/** GET /_dev/routes, from the same routes the Routes page shows, plus the plain handlers outside OpenAPI. */
export const devRoutes: DevRouteList = {
  routes: [
    ...routes.map((x) => ({ method: x.method, path: x.path, operation_id: x.op, summary: x.handler, tags: [x.module], secured: x.mw.includes("session"), source: "openapi" as const })),
    { method: "GET", path: "/docs", tags: [], secured: false, source: "handler" as const },
    { method: "GET", path: "/openapi.json", tags: [], secured: false, source: "handler" as const },
    { method: "GET", path: "/.well-known/security.txt", tags: [], secured: false, source: "handler" as const },
  ],
};

export const devConfig: DevConfigList = {
  variables: [
    { name: "APP_ENV", secret: false, set: true, value: "development" },
    { name: "APP_ADDR", secret: false, set: true, value: "127.0.0.1:8080" },
    { name: "APP_LOG_LEVEL", secret: false, set: true, value: "debug" },
    { name: "DATABASE_URL", secret: true, set: true },
    { name: "DEV_CONSOLE_TOKEN", secret: true, set: true },
    { name: "MAIL_DELIVERY", secret: false, set: true, value: "mailpit" },
    { name: "MAILPIT_WEB_PORT", secret: false, set: true, value: "8025" },
    { name: "OTEL_EXPORTER_OTLP_ENDPOINT", secret: false, set: false },
    { name: "GITHUB_CLIENT_SECRET", secret: true, set: false },
  ],
};

export const devMigrations: DevMigrations = { current: 12, latest: 13, pending: 1 };

export const devRequests: DevRequestList = {
  max: 500,
  requests: [
    { time: iso(NOW - 2 * MIN), method: "POST", route: "/v1/orgs/{org}/invites", path: "/v1/orgs/acme/invites", status: 201, duration_ms: 64.2, request_id: "req_9a12f0", trace_id: r.hex(32) },
    { time: iso(NOW - 11 * MIN), method: "GET", route: "/ops/audit/stats", path: "/ops/audit/stats", status: 200, duration_ms: 312.4, request_id: "req_c04d11", trace_id: r.hex(32) },
    { time: iso(NOW - 15 * MIN), method: "GET", route: "/v1/orgs/{org}/projects", path: "/v1/orgs/acme/projects", status: 200, duration_ms: 38.1, request_id: "req_71c0aa", trace_id: r.hex(32) },
    { time: iso(NOW - 17 * MIN), method: "POST", route: "/v1/auth/sign-in", path: "/v1/auth/sign-in", status: 200, duration_ms: 131.0, request_id: "req_2e9b1f", trace_id: r.hex(32) },
    { time: iso(NOW - 19 * MIN), method: "GET", route: "/readyz", path: "/readyz", status: 200, duration_ms: 3.8 },
    { time: iso(NOW - 21 * MIN), method: "GET", route: "", path: "/favicon.ico", status: 404, duration_ms: 0.3 },
  ],
};

export const devLogs: DevLogList = {
  max: 1000,
  logs: outputLines
    .filter((l) => l.stream === "app")
    .reverse()
    .map((l) => {
      const level = /level=(\w+)/.exec(l.text)?.[1] ?? "INFO";
      const message = /msg="([^"]+)"/.exec(l.text)?.[1] ?? l.text;
      const attrs = [...l.text.matchAll(/(\w+)=("[^"]*"|\S+)/g)].filter((m) => m[1] !== "level" && m[1] !== "msg").map((m) => ({ key: m[1], value: m[2].replace(/^"|"$/g, "") }));
      return { time: l.time, level, message, attrs };
    }),
};

export const devJobRuns: DevJobRunList = {
  runs: jobRuns.map((j, i) => ({
    id: 3114 - i,
    kind: j.job,
    queue: jobDefs.find((d) => d.name === j.job)?.queue ?? "default",
    state: j.state === "failed" ? "discarded" : "completed",
    attempt: j.state === "failed" ? 3 : 1,
    max_attempts: j.state === "failed" ? 3 : jobDefs.find((d) => d.name === j.job)?.attempts ?? 3,
    created_at: iso(j.at - j.ms - 200),
    scheduled_at: iso(j.at - j.ms - 200),
    attempted_at: iso(j.at - j.ms),
    finalized_at: iso(j.at),
    errors: j.state === "failed" ? ["context deadline exceeded", "context deadline exceeded", j.out] : [],
    request_id: j.job === "mail.send" ? "req_2e9b1f" : undefined,
  })),
};

export const devMail: DevMail = {
  web_url: "http://127.0.0.1:8025",
  total: outbox.length,
  messages: outbox.map((m) => ({
    id: m.id,
    from: { name: "acme-api (dev)", address: "no-reply@acme.dev" },
    to: [{ name: "", address: m.to }],
    subject: m.subject,
    snippet: `${m.template} · ${m.subject.slice(0, 40)}`,
    created: iso(m.at),
    size: Math.round(parseFloat(m.size) * 1024),
    attachments: 0,
    read: m.id !== "msg_01",
  })),
};
