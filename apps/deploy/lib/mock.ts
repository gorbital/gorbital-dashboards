import { rng, NOW, MIN, HOUR, DAY } from "@gorbital/dash/lib/rand";

export { NOW, MIN, HOUR, DAY };
const r = rng(777);

export type Env = { id: "production" | "staging" | "preview"; name: string; version: string; commit: string; instances: number; region: string; domain: string; status: "healthy" | "rolling" | "degraded" | "idle"; since: number; rps: number };
export const envs: Env[] = [
  { id: "production", name: "production", version: "v0.5.1", commit: "c41e9d0", instances: 3, region: "eu-west-1", domain: "api.acme.dev", status: "rolling", since: NOW - 3 * MIN, rps: 182 },
  { id: "staging", name: "staging", version: "v0.5.1", commit: "c41e9d0", instances: 1, region: "eu-west-1", domain: "staging.api.acme.dev", status: "healthy", since: NOW - 2 * HOUR, rps: 4 },
  { id: "preview", name: "preview · pr-412", version: "pr-412", commit: "7a20fe3", instances: 1, region: "eu-west-1", domain: "pr-412.acme.dev", status: "idle", since: NOW - 26 * HOUR, rps: 0 },
];

export type ReleaseStatus = "rolling" | "live" | "succeeded" | "failed" | "rolled back" | "queued";
export type Release = {
  id: string;
  version: string;
  commit: string;
  message: string;
  author: string;
  env: Env["id"];
  status: ReleaseStatus;
  started: number;
  duration: number;
  migrations: number;
  instances: number;
  strategy: "rolling" | "blue-green" | "recreate";
};

const authors = ["Muhammad Qazi", "Ada Lovelace", "Grace Hopper", "Linus T."];
const messages = [
  "projects: full-text search on name and description",
  "orgs: hash invite tokens at rest",
  "ops: releases endpoints return running instances",
  "auth: require 2FA for platform roles",
  "mail: async sender with idempotency keys",
  "jobs: retention as a scheduled definition",
  "settings: history and NOTIFY reload",
  "audit: partition events by month",
  "projects: archive instead of delete",
  "auth: passkeys",
  "ratelimit: per-route buckets in postgres",
  "bootstrap: lazy SMTP connect",
];

export const releases: Release[] = [
  { id: "rel_1042", version: "v0.5.1", commit: "c41e9d0", message: messages[0], author: authors[0], env: "production", status: "rolling", started: NOW - 3 * MIN, duration: 0, migrations: 1, instances: 3, strategy: "rolling" },
  { id: "rel_1041", version: "v0.5.1", commit: "c41e9d0", message: messages[0], author: authors[0], env: "staging", status: "live", started: NOW - 2 * HOUR, duration: 164, migrations: 1, instances: 1, strategy: "recreate" },
  { id: "rel_1040", version: "pr-412", commit: "7a20fe3", message: messages[1], author: authors[1], env: "preview", status: "live", started: NOW - 26 * HOUR, duration: 98, migrations: 0, instances: 1, strategy: "recreate" },
  { id: "rel_1039", version: "v0.5.0", commit: "8f1c2ab", message: messages[2], author: authors[0], env: "production", status: "succeeded", started: NOW - 2 * DAY - 3 * HOUR, duration: 201, migrations: 0, instances: 3, strategy: "rolling" },
  { id: "rel_1038", version: "v0.5.0", commit: "8f1c2ab", message: messages[2], author: authors[0], env: "staging", status: "succeeded", started: NOW - 2 * DAY - 5 * HOUR, duration: 151, migrations: 0, instances: 1, strategy: "recreate" },
  { id: "rel_1037", version: "v0.4.3", commit: "b7d0e12", message: messages[3], author: authors[2], env: "production", status: "rolled back", started: NOW - 5 * DAY, duration: 88, migrations: 0, instances: 3, strategy: "rolling" },
  { id: "rel_1036", version: "v0.4.2", commit: "1e0a4c9", message: messages[4], author: authors[1], env: "production", status: "succeeded", started: NOW - 6 * DAY, duration: 192, migrations: 2, instances: 3, strategy: "rolling" },
  { id: "rel_1035", version: "v0.4.2", commit: "1e0a4c9", message: messages[4], author: authors[1], env: "staging", status: "succeeded", started: NOW - 6 * DAY - 2 * HOUR, duration: 140, migrations: 2, instances: 1, strategy: "recreate" },
  { id: "rel_1034", version: "v0.4.1", commit: "990fa31", message: messages[5], author: authors[3], env: "production", status: "succeeded", started: NOW - 9 * DAY, duration: 178, migrations: 1, instances: 3, strategy: "rolling" },
  { id: "rel_1033", version: "v0.4.0", commit: "5c7d21e", message: messages[6], author: authors[0], env: "production", status: "failed", started: NOW - 12 * DAY, duration: 61, migrations: 1, instances: 3, strategy: "rolling" },
  { id: "rel_1032", version: "v0.4.0", commit: "5c7d21e", message: messages[6], author: authors[0], env: "staging", status: "succeeded", started: NOW - 12 * DAY - 1 * HOUR, duration: 150, migrations: 1, instances: 1, strategy: "recreate" },
  { id: "rel_1031", version: "v0.3.9", commit: "e2b8c04", message: messages[7], author: authors[2], env: "production", status: "succeeded", started: NOW - 15 * DAY, duration: 411, migrations: 1, instances: 3, strategy: "rolling" },
];

/* Pipeline for the rolling release. */
export type Stage = { name: string; status: "done" | "running" | "pending" | "failed"; took?: number; detail: string; steps?: { name: string; status: "done" | "running" | "pending"; took?: number }[] };
export const pipeline: Stage[] = [
  { name: "Build", status: "done", took: 48, detail: "go build · Go 1.25.1 · linux/amd64 · 21.4 MB" },
  { name: "Test", status: "done", took: 72, detail: "go test ./... · 412 passed · race on" },
  { name: "Migrate", status: "done", took: 1.2, detail: "0013_projects_search_tsvector · 1.2 s · lock held 0.3 s" },
  {
    name: "Roll out",
    status: "running",
    detail: "one instance at a time, drain 20 s, then health",
    steps: [
      { name: "i-7f3a", status: "done", took: 41 },
      { name: "i-9c21", status: "running" },
      { name: "i-b04e", status: "pending" },
    ],
  },
  { name: "Verify", status: "pending", detail: "GET /readyz on every instance, then 5 smoke requests" },
];

export const rolloutLog = [
  { t: NOW - 3 * MIN, l: "info", m: "release v0.5.1 (c41e9d0) → production, strategy rolling" },
  { t: NOW - 3 * MIN + 2000, l: "info", m: "migrate: 0013_projects_search_tsvector applied in 1.2 s" },
  { t: NOW - 3 * MIN + 4000, l: "info", m: "i-7f3a: draining (20 s), 14 in-flight requests" },
  { t: NOW - 3 * MIN + 24_000, l: "info", m: "i-7f3a: stopped v0.5.0, starting v0.5.1" },
  { t: NOW - 3 * MIN + 39_000, l: "info", m: "i-7f3a: GET /readyz 200 in 3.8 ms, postgres ok, jobs ok" },
  { t: NOW - 3 * MIN + 41_000, l: "ok", m: "i-7f3a: healthy, weight 33% restored" },
  { t: NOW - 3 * MIN + 45_000, l: "info", m: "i-9c21: draining (20 s), 22 in-flight requests" },
  { t: NOW - 3 * MIN + 65_000, l: "info", m: "i-9c21: stopped v0.5.0, starting v0.5.1" },
  { t: NOW - 3 * MIN + 79_000, l: "warn", m: "i-9c21: GET /readyz 503 (postgres pool warming), retry in 5 s" },
  { t: NOW - 3 * MIN + 84_000, l: "info", m: "i-9c21: GET /readyz 200 in 4.1 ms" },
];

/* Deploys per day, 30 days. */
export const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(NOW - (29 - i) * DAY);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
});
export const perDay = {
  ok: days.map((_, i) => (i % 7 === 5 || i % 7 === 6 ? r.int(0, 1) : r.int(1, 4))),
  failed: days.map((_, i): number => (i === 17 || i === 24 ? 1 : 0)),
};
export const leadTime = r.walk(30, 3.2, 1.4, 0.8);

/* Fleet */
export type Instance = { id: string; env: Env["id"]; region: string; version: string; commit: string; started: number; health: "healthy" | "starting" | "draining" | "stopped"; weight: number; rps: number; cpu: number; mem: number; size: string };
export const instances: Instance[] = [
  { id: "i-7f3a", env: "production", region: "eu-west-1a", version: "v0.5.1", commit: "c41e9d0", started: NOW - 2 * MIN, health: "healthy", weight: 33, rps: 64, cpu: 38, mem: 402, size: "shared-2x · 1 GB" },
  { id: "i-9c21", env: "production", region: "eu-west-1b", version: "v0.5.1", commit: "c41e9d0", started: NOW - 30 * 1000, health: "starting", weight: 0, rps: 0, cpu: 71, mem: 310, size: "shared-2x · 1 GB" },
  { id: "i-b04e", env: "production", region: "eu-west-1c", version: "v0.5.0", commit: "8f1c2ab", started: NOW - 2 * DAY - 3 * HOUR, health: "healthy", weight: 67, rps: 118, cpu: 52, mem: 461, size: "shared-2x · 1 GB" },
  { id: "i-s01a", env: "staging", region: "eu-west-1a", version: "v0.5.1", commit: "c41e9d0", started: NOW - 2 * HOUR, health: "healthy", weight: 100, rps: 4, cpu: 6, mem: 210, size: "shared-1x · 512 MB" },
];

/* Migrations across environments. */
export const migrations = [
  { v: "0013", name: "projects_search_tsvector", production: "applying", staging: "applied", preview: "—", ms: 1200, lock: "0.3 s", reversible: true },
  { v: "0012", name: "projects_add_archived_at", production: "applied", staging: "applied", preview: "applied", ms: 41, lock: "—", reversible: true },
  { v: "0011", name: "org_invites_token_hash", production: "applied", staging: "applied", preview: "applied", ms: 88, lock: "—", reversible: false },
  { v: "0010", name: "river_v6", production: "applied", staging: "applied", preview: "applied", ms: 302, lock: "—", reversible: false },
  { v: "0009", name: "audit_events_partition", production: "applied", staging: "applied", preview: "applied", ms: 1204, lock: "1.1 s", reversible: false },
  { v: "0008", name: "settings_history", production: "applied", staging: "applied", preview: "applied", ms: 27, lock: "—", reversible: true },
];

/* Health checks + 90-day uptime. */
export const checks = [
  { name: "HTTP · /readyz", status: "ok", latency: "3.8 ms", detail: "3 of 3 instances (1 starting)" },
  { name: "PostgreSQL", status: "ok", latency: "1.1 ms", detail: "pool 9/30 · replica lag 0 s" },
  { name: "Jobs leader", status: "ok", latency: "—", detail: "i-7f3a elected 2 min ago" },
  { name: "SMTP · mail.acme.dev", status: "warn", latency: "412 ms", detail: "1 timeout in the last hour" },
  { name: "OTLP exporter", status: "ok", latency: "18 ms", detail: "→ ingest.gauge.gorbital.dev" },
  { name: "TLS · api.acme.dev", status: "ok", latency: "—", detail: "expires in 61 days · auto-renew" },
];
export const uptime90 = Array.from({ length: 90 }, (_, i) => (i === 62 ? 0.4 : i === 78 ? 0.85 : i === 85 ? 0.97 : 1));

/* History */
export type Event = { at: number; kind: "deploy" | "rollback" | "migration" | "incident" | "scale" | "config"; title: string; detail: string; who: string; env: Env["id"] };
export const history: Event[] = [
  { at: NOW - 3 * MIN, kind: "deploy", title: "v0.5.1 → production", detail: "rolling, 1 of 3 instances done", who: "Muhammad Qazi", env: "production" },
  { at: NOW - 3 * MIN + 2000, kind: "migration", title: "0013_projects_search_tsvector", detail: "applied in 1.2 s, lock held 0.3 s", who: "ship", env: "production" },
  { at: NOW - 2 * HOUR, kind: "deploy", title: "v0.5.1 → staging", detail: "recreate, 2 m 44 s", who: "Muhammad Qazi", env: "staging" },
  { at: NOW - 26 * HOUR, kind: "deploy", title: "pr-412 → preview", detail: "orgs: hash invite tokens at rest", who: "Ada Lovelace", env: "preview" },
  { at: NOW - 2 * DAY - 3 * HOUR, kind: "deploy", title: "v0.5.0 → production", detail: "rolling, 3 m 21 s", who: "Muhammad Qazi", env: "production" },
  { at: NOW - 3 * DAY, kind: "config", title: "auth.lockout_after 10 → 8", detail: "runtime setting v3, “brute-force test”", who: "Muhammad Qazi", env: "production" },
  { at: NOW - 4 * DAY, kind: "scale", title: "production 2 → 3 instances", detail: "p95 over 80 ms for 30 min", who: "autoscale", env: "production" },
  { at: NOW - 5 * DAY, kind: "rollback", title: "v0.4.3 → v0.4.2", detail: "5xx rate 4.1% after roll out; rolled back in 48 s", who: "ship (auto)", env: "production" },
  { at: NOW - 5 * DAY - 2 * MIN, kind: "incident", title: "5xx spike on POST /v1/auth/sign-in", detail: "2 m 10 s, 118 requests affected", who: "gauge", env: "production" },
  { at: NOW - 6 * DAY, kind: "deploy", title: "v0.4.2 → production", detail: "rolling, 3 m 12 s, 2 migrations", who: "Ada Lovelace", env: "production" },
  { at: NOW - 12 * DAY, kind: "deploy", title: "v0.4.0 → production failed", detail: "migration 0008 timed out acquiring lock", who: "Muhammad Qazi", env: "production" },
];

export const providers = [
  { name: "Fly.io", status: "connected", detail: "org acme · app acme-api · 3 machines in ams", primary: true },
  { name: "AWS ECS", status: "available", detail: "Fargate, one task definition per release", primary: false },
  { name: "Kubernetes", status: "available", detail: "a Deployment per app, rolling update by default", primary: false },
  { name: "Docker host", status: "available", detail: "docker compose over SSH, for one box", primary: false },
];

export const notifications = [
  { channel: "Slack #deploys", on: ["deploy started", "deploy finished", "rollback"], enabled: true },
  { channel: "Email · ops@acme.dev", on: ["deploy failed", "rollback"], enabled: true },
  { channel: "PagerDuty · api-oncall", on: ["auto rollback", "health failing 5 min"], enabled: false },
];
