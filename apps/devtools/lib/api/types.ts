/**
 * Shapes the Dev Portal reads. Two sources, same origin:
 *
 * - `/_portal/api/*`: orb dev's own API (cli/internal/portal in the gorbital
 *   repository): the app's state and output, restarts, generators.
 * - `/_portal/app/*`: a proxy to the app; `/_portal/app/_dev/*` reaches the
 *   dev console APIs (modules/devconsole/openapi.json), with the token added
 *   by orb dev so the UI never holds it.
 *
 * Hand-written to match the Go types and the OpenAPI document exactly;
 * fields may be added there, never renamed without a note in the upgrade
 * notes.
 */

/* ---------- Errors ---------- */

/** RFC 9457 problem details, as both the portal and the app send them (`application/problem+json`). */
export type Problem = {
  type?: string;
  title?: string;
  status: number;
  code: string;
  detail?: string;
  request_id?: string;
};

/* ---------- Portal API ---------- */

export type AppState = "preparing" | "building" | "running" | "stopped";

export type AppStatus = {
  state: AppState;
  /** PID of the app process while it runs. */
  pid?: number;
  /** APP_ADDR as the app listens on it. */
  addr: string;
  /** How to reach the app from this machine. */
  url: string;
  /** When the current process started. */
  started_at?: string;
  /** Starts after the first. */
  restarts: number;
  /** The last build or migration failure, until the next success. */
  problem?: string;
  /** The app serves the dev console under /_dev/, which the portal proxies. */
  console: boolean;
};

export type PortalInfo = {
  /** The orb version. */
  version: string;
  ui: "bundled" | "placeholder";
  started_at: string;
};

export type Project = {
  name: string;
  module: string;
  preset: "minimal" | "full";
  tenancy?: "single" | "multi";
  features: string[];
  /** The email provider recorded in the manifest. */
  mail?: string;
  /** The app directory on this machine. */
  dir: string;
  /** The app has PostgreSQL (the Full preset). */
  database: boolean;
};

/** Addresses worth showing; orb dev fills in those that apply. */
export type LinkKey = "api" | "docs" | "mail" | "console" | "grafana";

export type Status = {
  portal: PortalInfo;
  project: Project;
  app: AppStatus;
  links: Partial<Record<LinkKey, string>> & Record<string, string>;
  /** The generators this orb offers: job, resource, migration. */
  generators: string[];
};

export type OutputStream = "app" | "orb";

export type OutputLine = {
  time: string;
  stream: OutputStream;
  text: string;
};

export type OutputList = {
  /** How many lines the portal keeps. */
  max: number;
  /** Oldest first. */
  lines: OutputLine[];
};

export type Accepted = {
  accepted: true;
  app: AppStatus;
};

export type AppAction = "restart" | "stop" | "start";

export type StreamEnd = { reason: "max_duration" | "shutdown" };
export type StreamDropped = { count: number };

/** What `/_portal/api/events` streams, after the client normalises the first bare `state` event and `dropped`. */
export type PortalEvent =
  | { type: "state"; time: string; state: AppStatus }
  | { type: "output"; time: string; output: OutputLine }
  | { type: "dropped"; time: string; count: number };

/* ---------- Generators ---------- */

export type GeneratorName = "job" | "resource" | "migration";

export type GeneratorRequest<I extends object = Record<string, unknown>> = {
  /** The generator's fields, named like its CLI flags with underscores. */
  input: I;
  /** Apply with uncommitted changes in the git repository. */
  allow_dirty?: boolean;
};

export type PlanChange = {
  path: string;
  kind: "create" | "modify";
  content: string;
  /** The file's current content, for modify. */
  before?: string;
};

export type Plan = {
  generator: string;
  name: string;
  summary: string;
  changes: PlanChange[];
  /** What to do after applying, in order. */
  next: string[];
  result?: unknown;
};

export type GeneratorResponse = {
  plan: Plan;
  /** The files were written. */
  applied: boolean;
};

/* ---------- Dev console (/_dev/*) ---------- */

export type DevIndex = {
  /** The paths this app serves, sorted. */
  endpoints: string[];
};

export type DevLibrary = {
  path: string;
  version: string;
  /** Replaced by a local directory or another module. */
  replaced?: boolean;
};

export type DevJob = {
  name: string;
  description: string;
  enabled: boolean;
  /** Cron expression or descriptor; empty for on-demand jobs. */
  schedule: string;
  modified: boolean;
  next_run_at?: string;
};

export type DevSetting = {
  key: string;
  group: string;
  description: string;
  kind: string;
  /** Effective value (any JSON). */
  value: unknown;
  /** Declared default (any JSON). */
  default: unknown;
  modified: boolean;
  org_overridable: boolean;
};

export type DevFlag = {
  key: string;
  group: string;
  description: string;
  client: boolean;
  enabled: boolean;
  default: boolean;
  /** Rollout percentage; null without a rollout. */
  percentage: number | null;
  /** Organisation and user IDs in allow and deny lists. */
  targets: number;
  modified: boolean;
};

export type DevPermission = { name: string; description: string };
export type DevRole = { name: string; description: string; permissions: string[] };
export type DevPermissionCatalog = { name: string; permissions: DevPermission[]; roles: DevRole[] };

export type DevApp = {
  /** Service name. */
  name: string;
  version: string;
  commit?: string;
  go_version: string;
  /** APP_ENV. */
  env: string;
  /** gorbital library modules linked into the binary. */
  libraries: DevLibrary[];
  /** The API's areas: OpenAPI tags. */
  modules: string[];
  /** Empty in apps without jobs. */
  jobs: DevJob[];
  /** Empty in apps without runtime settings. */
  settings: DevSetting[];
  /** Empty in apps without feature flags. */
  flags: DevFlag[];
  /** Empty in apps without authentication. */
  permissions: DevPermissionCatalog[];
};

export type DevRoute = {
  method: string;
  /** Route pattern, such as /v1/projects/{id}. */
  path: string;
  operation_id?: string;
  summary?: string;
  tags: string[];
  /** The operation declares a security requirement. */
  secured: boolean;
  /** openapi: in the OpenAPI document; handler: a plain handler outside it. */
  source: "openapi" | "handler";
};

export type DevRouteList = { routes: DevRoute[] };

export type DevEnvKey = {
  name: string;
  /** Read as a secret, or its name looks secret; the value is never shown. */
  secret: boolean;
  /** The value is non-empty. */
  set: boolean;
  /** Only for variables that aren't secret. */
  value?: string;
};

export type DevConfigList = { variables: DevEnvKey[] };

export type DevRequest = {
  /** When the request finished. */
  time: string;
  method: string;
  /** Matched route pattern; empty when none matched. */
  route: string;
  /** Path without the query string. */
  path: string;
  status: number;
  duration_ms: number;
  request_id?: string;
  trace_id?: string;
};

export type DevRequestList = {
  /** How many requests the console keeps. */
  max: number;
  /** Newest first. */
  requests: DevRequest[];
};

export type DevAttr = { key: string; value: string };

export type DevLog = {
  time: string;
  /** INFO, WARN or ERROR (with an offset such as INFO+2). */
  level: string;
  message: string;
  /** In order; groups flattened into dotted keys. */
  attrs: DevAttr[];
  /** Attributes over the limit of 50. */
  dropped_attrs?: number;
};

export type DevLogList = {
  /** How many records the console keeps. */
  max: number;
  /** Newest first. */
  logs: DevLog[];
};

export type DevAddress = { name: string; address: string };

export type DevMessage = {
  /** Mailpit's message ID. */
  id: string;
  from: DevAddress;
  to: DevAddress[];
  subject: string;
  snippet: string;
  created: string;
  size: number;
  attachments: number;
  read: boolean;
};

export type DevMail = {
  /** Mailpit's web interface. */
  web_url: string;
  /** Every captured message. */
  total: number;
  /** The newest 50. */
  messages: DevMessage[];
};

export type DevMigrations = {
  /** Highest applied version. */
  current: number;
  /** Newest migration file's version. */
  latest: number;
  /** Files not applied yet. */
  pending: number;
};

export type DevJobRun = {
  id: number;
  kind: string;
  queue: string;
  state: string;
  attempt: number;
  max_attempts: number;
  created_at: string;
  scheduled_at: string;
  attempted_at?: string;
  finalized_at?: string;
  /** Failed attempts' messages, oldest first. */
  errors: string[];
  request_id?: string;
};

export type DevJobRunList = {
  /** Newest first. */
  runs: DevJobRun[];
};

/** `GET /_portal/app/readyz`: the app's readiness, as the UI reads it. */
export type Readiness = {
  ok: boolean;
  status: number;
  /** The response body, trimmed, when short enough to show. */
  body?: string;
};
