/**
 * Project Settings, the env editor and the ops API's service accounts in
 * mock mode (ADR-0077, ADR-0074): a `.env` in memory that `GET /_portal/api/project`
 * describes and `PUT /_portal/api/env` rewrites, the danger zone's
 * endpoints, and `/ops/service-accounts…` with keys shown once.
 */

import { portalStatus } from "@/lib/mock";
import type { EnvEntry } from "../env";
import type { ApiKey, DangerAction, ProjectSettings, ServiceAccount } from "../project";
import type { AppStatus, Problem } from "../types";

type Line = (stream: "orb" | "app", text: string) => void;

/* ---------- .env ---------- */

type Var = { key: string; value: string | null; example: string; inExample: boolean; description?: string };

const initialEnv = (): Var[] => [
  { key: "APP_ENV", value: "development", example: "development", inExample: true, description: "development or production; required, so a deployment that forgets it doesn't run with development's relaxed checks." },
  { key: "APP_ADDR", value: "127.0.0.1:8080", example: "127.0.0.1:8080", inExample: true, description: "Address the API listens on." },
  { key: "APP_LOG_LEVEL", value: "info", example: "info", inExample: true, description: "debug, info, warn or error." },
  { key: "APP_LOG_FORMAT", value: "", example: "", inExample: true, description: "Log encoding: json or text. Empty means JSON in production, text otherwise; orb dev sets json for the Dev Portal's log store and prints text." },
  { key: "APP_DOCS_ENABLED", value: "", example: "", inExample: true, description: "Serve interactive docs at /docs and the OpenAPI document at /openapi.json: true or false. Empty: on in development, off in production." },
  { key: "APP_CORS_ORIGINS", value: "https://app.acme.test,http://localhost:5173", example: "", inExample: true, description: "Comma-separated browser origins allowed to call the API (CORS), for example https://app.example.com; https only in production. Empty disables CORS." },
  { key: "DATABASE_URL", value: "postgres://acme:secret@127.0.0.1:55432/acme_api?sslmode=disable", example: "postgres://acme:acme@127.0.0.1:5432/acme_api?sslmode=disable", inExample: true, description: "PostgreSQL connection string; orb dev points it at the compose container." },
  { key: "POSTGRES_PORT", value: "55432", example: "5432", inExample: true, description: "Host port of the PostgreSQL container in compose.yaml." },
  { key: "DEV_PORTAL_PORT", value: "3100", example: "3100", inExample: true, description: "Port orb dev serves the Dev Portal on." },
  { key: "DEV_CONSOLE_TOKEN", value: "dct_9f3a1c0e7b5d4a2f8e6c1b0a", example: "", inExample: true, description: "Bearer token of the dev console (/_dev/*); orb dev sets one when it starts the app." },
  { key: "MAIL_DELIVERY", value: "mailpit", example: "devmail", inExample: true, description: "Where email goes in development: devmail (orb dev's catcher), mailpit (the compose container) or provider (real email)." },
  { key: "MAILPIT_WEB_PORT", value: "8025", example: "8025", inExample: true, description: "Host port of Mailpit's web UI." },
  { key: "RESEND_API_KEY", value: null, example: "", inExample: true, description: "Resend API key; the app sends through Resend when MAIL_DELIVERY=provider." },
  { key: "STORAGE_DRIVER", value: "local", example: "local", inExample: true, description: "local, s3, spaces, r2 or minio (orb add storage)." },
  { key: "STORAGE_LOCAL_DIR", value: ".orb/storage", example: ".orb/storage", inExample: true, description: "Where the local driver keeps files." },
  { key: "SESSION_SECRET", value: "c2Vzc2lvbi1zZWNyZXQtZm9yLWRldi1vbmx5", example: "", inExample: true, description: "Signs session cookies; 32 random bytes." },
];

let env: Var[] = initialEnv();
let restartNeeded = false;

const secretPattern = /(SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|APIKEY|PRIVATE_KEY|ENCRYPTION_KEY|_KEYS?$|_DSN$|_URL$|CREDENTIAL)/i;
const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function entries(): EnvEntry[] {
  let line = 0;
  return env.map((v) => {
    const set = v.value !== null;
    if (set) line += 3;
    const secret = secretPattern.test(v.key);
    return { key: v.key, value: set ? (secret && v.value ? "••••••••" : v.value!) : "", set, example: v.example, in_example: v.inExample, missing: v.inExample && !set, description: v.description, secret, line: set ? line : 0 };
  });
}

/** The value in .env, or the default the settings fall back to. */
export function mockEnvValue(key: string, fallback = ""): string {
  const v = env.find((e) => e.key === key);
  return v && v.value !== null && v.value !== "" ? v.value : fallback;
}

/** Sets keys as the generators do (`orb add storage` writes .env); values already there are kept when `keep`. */
export function setMockEnv(values: Record<string, string>, keep = false) {
  for (const [key, value] of Object.entries(values)) {
    const v = env.find((e) => e.key === key);
    if (v) {
      if (!keep || v.value === null || v.value === "") v.value = value;
    } else env.push({ key, value, example: "", inExample: false });
  }
  restartNeeded = true;
}

/* ---------- Service accounts ---------- */

const iso = (ago: number) => new Date(Date.now() - ago).toISOString();
const DAY = 86_400_000;

let accounts: ServiceAccount[] = [];
let apiKeys: ApiKey[] = [];

function initialAccounts() {
  accounts = [
    { id: "svc_nbswy3dpeb3w64tmmq", name: "Billing sync", description: "Pulls invoices into the finance system every night.", roles: ["ops_viewer"], disabled: false, created_at: iso(41 * DAY), updated_at: iso(41 * DAY) },
    { id: "svc_mfrggzdfmztwq2lk", name: "CI deploys", description: "Runs the release checks from GitHub Actions.", roles: ["ops_operator"], disabled: false, created_at: iso(12 * DAY), updated_at: iso(2 * DAY) },
  ];
  apiKeys = [
    { id: "key_nbswy3dpeb3w64tmmq", name: "nightly", prefix: "gbk_nbswy3dpeb3w64tmmqaaaaaaaa", scopes: ["ops.audit.read"], status: "active", service_account_id: "svc_nbswy3dpeb3w64tmmq", created_at: iso(40 * DAY), expires_at: iso(-50 * DAY), last_used_at: iso(6 * 3_600_000) },
    { id: "key_old3dpeb3w64tmmq", name: "nightly (rotated out)", prefix: "gbk_old3dpeb3w64tmmqaaaaaaaaaa", scopes: [], status: "revoked", service_account_id: "svc_nbswy3dpeb3w64tmmq", created_at: iso(130 * DAY), expires_at: iso(40 * DAY), revoked_at: iso(40 * DAY) },
    { id: "key_mfrggzdfmztwq2lk", name: "github actions", prefix: "gbk_mfrggzdfmztwq2lkaaaaaaaa", scopes: [], status: "active", service_account_id: "svc_mfrggzdfmztwq2lk", created_at: iso(12 * DAY), expires_at: iso(-78 * DAY), last_used_at: iso(2 * DAY) },
  ];
}
initialAccounts();

const base32 = () => Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz234567"[Math.floor(Math.random() * 32)]).join("");

/* ---------- Responses ---------- */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 400: "Bad Request", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json" } });
}

function parseBody<T>(body: BodyInit | null | undefined): T | null {
  if (typeof body !== "string" || body === "") return {} as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/** Resets the .env, the accounts and the keys; `resetMock` calls it. */
export function resetMockProject() {
  env = initialEnv();
  restartNeeded = false;
  initialAccounts();
}

/** Whether a change was saved since the app last (re)started; the restart clears it. */
export function mockRestartNeeded(): boolean {
  return restartNeeded;
}
export function mockRestarted() {
  restartNeeded = false;
}

/** The settings as `projectSettings` builds them from the manifest and .env. */
function projectSettings(): ProjectSettings {
  const addr = mockEnvValue("APP_ADDR", "127.0.0.1:8080");
  const delivery = mockEnvValue("MAIL_DELIVERY", "devmail");
  const driver = mockEnvValue("STORAGE_DRIVER", "local");
  const origins = mockEnvValue("APP_CORS_ORIGINS")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const dbURL = mockEnvValue("DATABASE_URL");
  const host = dbURL ? dbURL.replace(/^[a-z]+:\/\/(?:[^@/]*@)?/, "").replace(/\?.*$/, "") : undefined;
  const danger: DangerAction[] = [
    { name: "Reset the database", method: "POST", path: "/_portal/api/project/reset-database", loses: "every row of every table; the schema is dropped, then migrations and seed data run again", available: portalStatus.project.database },
    { name: "Clear the log store", method: "DELETE", path: "/_portal/api/logs", loses: "every stored log record under .orb/portal/logs", available: true },
    { name: "Clear the inbox", method: "DELETE", path: "/_portal/api/mail", loses: "every caught email under .orb/portal/mail", available: delivery === "devmail" },
    { name: "Clear the SQL history", method: "DELETE", path: "/_portal/api/db/sql/history", loses: "the SQL editor's run history (favourites and snippets stay)", available: portalStatus.project.database },
  ];
  return {
    ...portalStatus.project,
    git: true,
    app: { addr, url: `http://${addr.startsWith(":") ? "127.0.0.1" + addr : addr}`, key: "APP_ADDR" },
    portal: { port: mockEnvValue("DEV_PORTAL_PORT", "3100"), key: "DEV_PORTAL_PORT" },
    database_settings: { configured: Boolean(dbURL), host, key: "DATABASE_URL", port_key: "POSTGRES_PORT" },
    mail: { delivery, catcher_addr: delivery === "devmail" ? "127.0.0.1:1025" : undefined, key: "MAIL_DELIVERY" },
    storage: { driver, bucket: mockEnvValue("STORAGE_BUCKET") || undefined, local_dir: driver === "local" ? mockEnvValue("STORAGE_LOCAL_DIR", ".orb/storage") : undefined, key: "STORAGE_DRIVER" },
    cors: { origins, key: "APP_CORS_ORIGINS" },
    logging: { level: mockEnvValue("APP_LOG_LEVEL", "info"), format: mockEnvValue("APP_LOG_FORMAT", "json (orb dev)"), keys: ["APP_LOG_LEVEL", "APP_LOG_FORMAT"] },
    docs: { enabled: mockEnvValue("APP_DOCS_ENABLED", "true") !== "false", key: "APP_DOCS_ENABLED" },
    danger,
  };
}

/**
 * Answers `/_portal/api/project…`, `/_portal/api/env…` and `DELETE /_portal/api/mail`;
 * undefined for anything else. `log` writes to the output console.
 */
export function mockProjectFetch(url: URL, method: string, init: RequestInit, app: AppStatus, log: Line): Response | undefined {
  const p = url.pathname;
  if (p === "/_portal/api/project" && method === "GET") return json(projectSettings());
  if (p === "/_portal/api/project/reset-database" && method === "POST") {
    if (!portalStatus.project.database) return problem(404, "no_database", "this app has no database to reset");
    if (app.state !== "running") return problem(409, "reset_failed", `the app is ${app.state}; start it first`);
    log("orb", "database reset requested from the Dev Portal");
    log("orb", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    void (async () => {
      await new Promise((r) => setTimeout(r, 1200));
      log("orb", "running go run ./cmd/migrate");
      await new Promise((r) => setTimeout(r, 900));
      log("orb", "applied 12 migrations · seed data loaded (3 users, 2 organisations)");
    })();
    return json({ status: "accepted", detail: "the schema was dropped; migrations and seed data are being applied" }, 202);
  }
  if (p === "/_portal/api/mail" && method === "DELETE") {
    log("orb", "inbox cleared from the Dev Portal");
    return new Response(null, { status: 204 });
  }
  if (p === "/_portal/api/env" && method === "GET") return json({ entries: entries(), file: ".env", example: ".env.example" });
  const one = /^\/_portal\/api\/env\/([^/]+)$/.exec(p);
  if (one && method === "GET") {
    const v = env.find((e) => e.key === decodeURIComponent(one[1]));
    if (!v || v.value === null) return problem(404, "env_key_not_found", "the key isn't in .env");
    return json({ key: v.key, value: v.value });
  }
  if (p === "/_portal/api/env" && method === "PUT") {
    const body = parseBody<{ set?: Record<string, string>; unset?: string[] }>(init.body);
    if (!body) return problem(400, "invalid_body", "the body must be JSON");
    for (const [k, v] of Object.entries(body.set ?? {})) {
      if (!keyPattern.test(k)) return problem(400, "invalid_env_change", `${k} isn't a valid key: letters, digits and underscores, not starting with a digit`);
      if (typeof v !== "string" || /[\r\n]/.test(v)) return problem(400, "invalid_env_change", `${k}: values can't hold newlines`);
    }
    for (const k of body.unset ?? []) if (!keyPattern.test(k)) return problem(400, "invalid_env_change", `${k} isn't a valid key`);
    for (const [k, v] of Object.entries(body.set ?? {})) {
      const existing = env.find((e) => e.key === k);
      if (existing) existing.value = v;
      else env.push({ key: k, value: v, example: "", inExample: false });
    }
    for (const k of body.unset ?? []) {
      const existing = env.find((e) => e.key === k);
      if (existing) existing.value = null;
    }
    restartNeeded = true;
    const keys = [...Object.keys(body.set ?? {}), ...(body.unset ?? [])];
    if (keys.length) log("orb", `.env updated from the Dev Portal: ${keys.join(", ")} (restart to apply)`);
    return json({ entries: entries(), restart_needed: true });
  }
  return undefined;
}

/** `/ops/service-accounts…` as the auth module answers them; `body` is the parsed JSON body. */
export function mockServiceAccountsFetch(path: string, method: string, body: Record<string, unknown>): Response {
  const m = /^\/ops\/service-accounts(?:\/([^/]+)(?:\/keys(?:\/([^/]+))?)?)?$/.exec(path);
  if (!m) return problem(404, "not_found", `no route matches ${method} ${path}`);
  const [, id, keyId] = m;
  if (!id) {
    if (method === "GET") return json({ service_accounts: accounts });
    if (method === "POST") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return problem(422, "validation_failed", "name is required");
      if (name.length > 100) return problem(422, "validation_failed", "name must be at most 100 characters");
      if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) return problem(409, "service_account_name_taken", `a service account named ${name} exists`);
      const roles = Array.isArray(body.roles) ? (body.roles as string[]) : [];
      if (roles.includes("admin")) return problem(422, "role_requires_mfa", "roles that require two-factor authentication can't be given to a service account");
      const a: ServiceAccount = { id: `svc_${base32()}`, name, description: typeof body.description === "string" ? body.description : "", roles, disabled: false, created_at: iso(0), updated_at: iso(0) };
      accounts = [...accounts, a];
      return json(a, 201);
    }
    return problem(405, "method_not_allowed", `${method} isn't allowed on ${path}`);
  }
  const account = accounts.find((a) => a.id === id);
  if (!account) return problem(404, "service_account_not_found", "no service account has this ID");
  if (keyId === undefined && !path.endsWith("/keys")) {
    if (method === "GET") return json(account);
    if (method === "DELETE") {
      accounts = accounts.filter((a) => a.id !== id);
      apiKeys = apiKeys.map((k) => (k.service_account_id === id && k.status === "active" ? { ...k, status: "revoked", revoked_at: iso(0) } : k));
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH") {
      Object.assign(account, { name: typeof body.name === "string" ? body.name : account.name, description: typeof body.description === "string" ? body.description : account.description, disabled: typeof body.disabled === "boolean" ? body.disabled : account.disabled, updated_at: iso(0) });
      return json(account);
    }
    return problem(405, "method_not_allowed", `${method} isn't allowed on ${path}`);
  }
  if (keyId === undefined) {
    if (method === "GET") return json({ api_keys: apiKeys.filter((k) => k.service_account_id === id) });
    if (method === "POST") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return problem(422, "validation_failed", "name is required");
      const expires = typeof body.expires_at === "string" ? Date.parse(body.expires_at) : NaN;
      if (Number.isNaN(expires)) return problem(422, "validation_failed", "expires_at is required (RFC 3339)");
      if (expires < Date.now() + 3_600_000) return problem(422, "expiry_too_soon", "expires_at must be at least an hour away");
      if (expires > Date.now() + 90 * DAY) return problem(422, "expiry_too_far", "expires_at must be within auth.api_key_max_ttl (90 days)");
      if (account.disabled) return problem(409, "service_account_disabled", "the service account is disabled");
      const suffix = base32();
      const key: ApiKey = { id: `key_${suffix}`, name, prefix: `gbk_${suffix}aaaaaaaa`, scopes: Array.isArray(body.scopes) ? (body.scopes as string[]) : [], status: "active", service_account_id: id, created_at: iso(0), expires_at: new Date(expires).toISOString() };
      apiKeys = [...apiKeys, key];
      return json({ api_key: key, key: `${key.prefix}_${base32()}${base32()}${base32()}` }, 201);
    }
    return problem(405, "method_not_allowed", `${method} isn't allowed on ${path}`);
  }
  const key = apiKeys.find((k) => k.id === keyId && k.service_account_id === id);
  if (!key) return problem(404, "api_key_not_found", "no key has this ID");
  if (method === "DELETE") {
    if (key.status === "revoked") return problem(409, "api_key_revoked", "the key is already revoked");
    Object.assign(key, { status: "revoked", revoked_at: iso(0) });
    return new Response(null, { status: 204 });
  }
  return problem(405, "method_not_allowed", `${method} isn't allowed on ${path}`);
}
