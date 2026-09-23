/**
 * The mock env editor: an in-memory `.env` and `.env.example` for the
 * sample app, parsed and rewritten the way cli/internal/portal/env.go
 * does (comments, order and blank lines kept; new keys after the
 * example's comment block; secrets masked by name), behind
 * `/_portal/api/env`, `env/{key}` and `PUT env`.
 */
import type { EnvEntry } from "../env";
import type { Problem } from "../types";

const EXAMPLE = `# Copy to .env for local development. Never commit .env.
#
# Only secrets and infrastructure live here. Values operators change at
# runtime (like the email sender) are runtime settings, edited through
# /ops/settings, and job schedules are edited through /ops/jobs.

# development or production; required, so a deployment that forgets it
# doesn't run with development's relaxed checks.
APP_ENV=development

# Address the API listens on.
APP_ADDR=127.0.0.1:8080

# debug, info, warn or error.
APP_LOG_LEVEL=info
# Log encoding: json or text. Empty means JSON in production, text otherwise;
# orb dev sets json for the Dev Portal's log store and prints text.
APP_LOG_FORMAT=

# Serve interactive docs at /docs and the OpenAPI document at /openapi.json:
# true or false. Empty: on in development, off in production.
APP_DOCS_ENABLED=

# Comma-separated browser origins allowed to call the API (CORS). Empty
# disables CORS.
APP_CORS_ORIGINS=

# Largest accepted request body in bytes.
APP_MAX_BODY_BYTES=1048576

# OpenTelemetry export. Set an OTLP endpoint to send traces and metrics,
# for example http://localhost:4318. Empty keeps telemetry local.
OTEL_EXPORTER_OTLP_ENDPOINT=

# Development console APIs under /_dev/. orb dev sets a new token on every
# run and prints it, so leave this empty. Refused in production.
DEV_CONSOLE_TOKEN=

# PostgreSQL, from compose.yaml in development. In production use a secret
# (DATABASE_URL_FILE is also supported).
DATABASE_URL=postgres://acme:acme@127.0.0.1:5432/acme_api?sslmode=disable

# Host port for the development database in compose.yaml.
POSTGRES_PORT=5432

# Maximum database connections per instance.
APP_DB_MAX_CONNS=10

# Jobs worked at the same time per instance.
APP_JOB_WORKERS=10

# Encrypts two-factor authentication secrets: comma-separated id:base64key
# entries, each a 32-byte key; the first encrypts and all decrypt.
# Generate a key: echo "k1:$(openssl rand -base64 32)"
AUTH_ENCRYPTION_KEYS=

# The public URL of the API, for links in email and OAuth callbacks.
APP_PUBLIC_URL=

# Google sign-in: the OAuth client from the Google Cloud console. Empty
# leaves the provider off.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# GitHub sign-in: the OAuth app's client. Empty leaves the provider off.
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# How email leaves the app: devmail (orb dev's inbox, the default in
# development), mailpit, or provider (real email).
MAIL_DELIVERY=
# Where orb dev's mail catcher listens.
DEV_MAIL_SMTP_ADDR=127.0.0.1:1025

# Resend, the email provider: the API key and the webhook's signing secret.
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
`;

const ENV = `# Copy to .env for local development. Never commit .env.
#
# Only secrets and infrastructure live here. Values operators change at
# runtime (like the email sender) are runtime settings, edited through
# /ops/settings, and job schedules are edited through /ops/jobs.

# development or production; required, so a deployment that forgets it
# doesn't run with development's relaxed checks.
APP_ENV=development

# Address the API listens on.
APP_ADDR=127.0.0.1:8080

# debug, info, warn or error.
APP_LOG_LEVEL=debug
# Log encoding: json or text. Empty means JSON in production, text otherwise;
# orb dev sets json for the Dev Portal's log store and prints text.
APP_LOG_FORMAT=

# Serve interactive docs at /docs and the OpenAPI document at /openapi.json:
# true or false. Empty: on in development, off in production.
APP_DOCS_ENABLED=

# Comma-separated browser origins allowed to call the API (CORS). Empty
# disables CORS.
APP_CORS_ORIGINS=http://localhost:5173

# Largest accepted request body in bytes.
APP_MAX_BODY_BYTES=1048576

# OpenTelemetry export. Set an OTLP endpoint to send traces and metrics,
# for example http://localhost:4318. Empty keeps telemetry local.
OTEL_EXPORTER_OTLP_ENDPOINT=

# Development console APIs under /_dev/. orb dev sets a new token on every
# run and prints it, so leave this empty. Refused in production.
DEV_CONSOLE_TOKEN=

# PostgreSQL, from compose.yaml in development. In production use a secret
# (DATABASE_URL_FILE is also supported).
DATABASE_URL=postgres://acme:acme@127.0.0.1:5432/acme_api?sslmode=disable

# Host port for the development database in compose.yaml.
POSTGRES_PORT=5432

# Maximum database connections per instance.
APP_DB_MAX_CONNS=10

# Jobs worked at the same time per instance.
APP_JOB_WORKERS=10

# Encrypts two-factor authentication secrets: comma-separated id:base64key
# entries, each a 32-byte key; the first encrypts and all decrypt.
# Generate a key: echo "k1:$(openssl rand -base64 32)"
AUTH_ENCRYPTION_KEYS=k1:hM2uS7eC0f8Qk1yN4rT9vX6zA3bD5gJ8lP0sW2cF7iK=

# Google sign-in: the OAuth client from the Google Cloud console. Empty
# leaves the provider off.
GOOGLE_CLIENT_ID=812734567890-acme.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=example-google-client-secret

# How email leaves the app: devmail (orb dev's inbox, the default in
# development), mailpit, or provider (real email).
MAIL_DELIVERY=devmail
# Where orb dev's mail catcher listens.
DEV_MAIL_SMTP_ADDR=127.0.0.1:1025

# Resend, the email provider: the API key and the webhook's signing secret.
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=

# Local only: a bigger pool while profiling the importer.
IMPORT_BATCH_SIZE=500
`;

const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const linePattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const secretPattern = /(SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|APIKEY|PRIVATE_KEY|ENCRYPTION_KEY|_KEYS?$|_DSN$|_URL$|CREDENTIAL)/i;

/** Whether a key's value is masked until revealed, by its name (orb dev's rule). */
export function looksSecret(key: string): boolean {
  return secretPattern.test(key);
}

type Parsed = { keys: string[]; values: Record<string, string>; comments: Record<string, string>; lines: Record<string, number> };

function unquote(v: string): string {
  v = v.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'")) {
    const end = v.indexOf(v[0], 1);
    if (end >= 0) return v.slice(1, end);
  }
  const i = v.indexOf(" #");
  return i >= 0 ? v.slice(0, i).trim() : v;
}

function quote(v: string): string {
  return v === "" || /[ #"'\\\t]/.test(v) ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
}

function parse(lines: string[]): Parsed {
  const out: Parsed = { keys: [], values: {}, comments: {}, lines: {} };
  let block: string[] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t === "") {
      block = [];
      return;
    }
    if (t.startsWith("#")) {
      block.push(t.replace(/^#\s?/, "").trim());
      return;
    }
    const m = linePattern.exec(line);
    if (!m) {
      block = [];
      return;
    }
    const key = m[1];
    if (!(key in out.values)) out.keys.push(key);
    out.values[key] = unquote(m[2]);
    out.lines[key] = i + 1;
    if (block.length) out.comments[key] = block.join(" ");
    block = [];
  });
  return out;
}

function mask(v: string): string {
  return v.length <= 8 ? "••••••••" : `${v.slice(0, 2)}••••••••${v.slice(-2)}`;
}

let envLines: string[] = [];
const exampleLines = EXAMPLE.split("\n").slice(0, -1);

/** Puts .env back as the sample app ships it; tests call it between cases. */
export function resetMockEnv() {
  envLines = ENV.split("\n").slice(0, -1);
}
resetMockEnv();

/** The text of the mock .env, for tests and the console. */
export function mockEnvText(): string {
  return envLines.join("\n") + "\n";
}

function entries(): EnvEntry[] {
  const env = parse(envLines);
  const ex = parse(exampleLines);
  const order = [...ex.keys, ...env.keys.filter((k) => !ex.keys.includes(k))];
  return order.map((key) => {
    const set = key in env.values;
    const inExample = key in ex.values;
    const secret = looksSecret(key);
    const raw = set ? env.values[key] : "";
    return {
      key,
      value: set && secret && raw !== "" ? mask(raw) : raw,
      set,
      example: ex.values[key] ?? "",
      in_example: inExample,
      missing: inExample && !set,
      description: ex.comments[key] || env.comments[key] || undefined,
      secret,
      line: env.lines[key] ?? 0,
    };
  });
}

function setKey(key: string, value: string) {
  const line = `${key}=${quote(value)}`;
  for (let i = 0; i < envLines.length; i++) {
    const m = linePattern.exec(envLines[i]);
    if (m && m[1] === key) {
      envLines[i] = line;
      return;
    }
  }
  const description = parse(exampleLines).comments[key];
  if (description && envLines.length && envLines[envLines.length - 1].trim() !== "") envLines.push("");
  if (description) envLines.push(`# ${description}`);
  envLines.push(line);
}

function unsetKey(key: string) {
  envLines = envLines.filter((l) => {
    const m = linePattern.exec(l);
    return !(m && m[1] === key);
  });
}

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 400: "Bad Request", 404: "Not Found" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function parseBody(init: RequestInit): Record<string, unknown> | null {
  if (typeof init.body !== "string" || init.body === "") return {};
  try {
    const v = JSON.parse(init.body) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Answers `GET env`, `GET env/{key}` and `PUT env`, like cli/internal/portal/env.go. */
export function mockEnvFetch(url: URL, method: string, init: RequestInit = {}): Response {
  const p = url.pathname;
  if (p === "/_portal/api/env") {
    if (method === "GET") return json({ entries: entries(), file: ".env", example: ".env.example" });
    if (method !== "PUT") return problem(405, "method_not_allowed", `${method} not allowed`);
    const body = parseBody(init);
    if (!body) return problem(400, "invalid_body", "the body must be JSON");
    const set = body.set && typeof body.set === "object" ? (body.set as Record<string, unknown>) : {};
    const unset = Array.isArray(body.unset) ? body.unset : [];
    for (const [k, v] of Object.entries(set)) {
      if (!keyPattern.test(k)) return problem(400, "invalid_env_change", `"${k}" is not an environment variable name`);
      if (typeof v !== "string") return problem(400, "invalid_env_change", `${k}: the value must be a string`);
      if (/[\r\n]/.test(v)) return problem(400, "invalid_env_change", `${k}: a value can't span lines`);
    }
    for (const k of unset) if (typeof k !== "string" || !keyPattern.test(k)) return problem(400, "invalid_env_change", `${JSON.stringify(k)} is not an environment variable name`);
    for (const k of Object.keys(set).sort()) setKey(k, set[k] as string);
    for (const k of unset as string[]) unsetKey(k);
    return json({ entries: entries(), restart_needed: true });
  }
  const m = /^\/_portal\/api\/env\/([^/]+)$/.exec(p);
  if (m && method === "GET") {
    const key = decodeURIComponent(m[1]);
    const env = parse(envLines);
    if (!(key in env.values)) return problem(404, "env_key_not_found", "the key isn't in .env");
    return json({ key, value: env.values[key] });
  }
  return problem(404, "not_found", `no portal endpoint ${method} ${p}`);
}
