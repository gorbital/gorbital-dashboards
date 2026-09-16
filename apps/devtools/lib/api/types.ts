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
  /** The portal can reach the app's database (the Table Editor, the SQL Editor, Schema, Objects and Migrations). */
  database: boolean;
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

/* ---------- Dev console streams ---------- */

/** What `/_dev/requests/stream` and `/_dev/logs/stream` deliver, after the client parses the message. */
export type DevStreamEvent<T> = { type: "item"; item: T } | { type: "dropped"; count: number } | { type: "end"; reason: string };

/* ---------- Ops API (/ops/*), reached as the development operator ---------- */

/**
 * The app's admin API (docs/guides/ops-api.md, `examples/full-single/api/openapi.json`).
 * orb dev adds the console token to `/_portal/app/ops/*`; the app treats it as a
 * development operator with every `/ops` permission, so the UI sends nothing of its own.
 */

/** Setting kinds as `modules/settings` declares them. */
export type SettingKind = "bool" | "int" | "float" | "string" | "enum" | "duration" | "string_list";

/** Validation summary: `min`, `max`, `one_of`, `max_len`, `max_items`; the keys depend on the kind. */
export type SettingConstraints = {
  min?: number | string;
  max?: number | string;
  one_of?: string[];
  max_len?: number;
  max_items?: number;
} & Record<string, unknown>;

export type OpsSetting = {
  key: string;
  kind: SettingKind | string;
  group: string;
  description: string;
  /** Effective value, JSON of the kind. */
  value: unknown;
  /** Value declared in code. */
  default: unknown;
  /** A stored value overrides the default. */
  modified: boolean;
  /** The stored value fails validation, so the default applies. */
  invalid_stored_value: boolean;
  /** Send back when changing the setting. */
  version: number;
  updated_at?: string;
  updated_by?: string;
  reason_required: boolean;
  restart_required: boolean;
  restart_pending: boolean;
  constraints?: SettingConstraints;
  org_overridable: boolean;
};

export type OpsSettingList = { settings: OpsSetting[] | null };

export type SetSettingBody = { value: unknown; version: number; reason?: string };
export type ResetSettingBody = { version: number; reason?: string };

export type OpsSettingChange = {
  id: number;
  key: string;
  /** null means the default. */
  old_value: unknown;
  /** null means the default. */
  new_value: unknown;
  version: number;
  reason?: string;
  actor_kind: string;
  actor_id: string;
  request_id?: string;
  changed_at: string;
};

export type OpsSettingHistory = { changes: OpsSettingChange[] | null };

export type JobConfig = {
  enabled: boolean;
  /** 5-field cron in UTC, `@every` duration, or empty for on-demand. */
  schedule: string;
  /** Go duration. */
  timeout: string;
  max_attempts: number;
  queue: string;
  priority: number;
};

export type JobRunState = "available" | "cancelled" | "completed" | "discarded" | "pending" | "retryable" | "running" | "scheduled";

export type JobRunError = { at: string; attempt: number; message: string };

export type JobRun = {
  id: number;
  kind: string;
  queue: string;
  state: JobRunState | string;
  attempt: number;
  max_attempts: number;
  priority: number;
  created_at: string;
  scheduled_at: string;
  attempted_at?: string;
  finalized_at?: string;
  errors?: JobRunError[] | null;
  request_id?: string;
  actor_kind?: string;
  actor_id?: string;
};

export type JobRunPage = { jobs: JobRun[] | null; next_cursor?: string };

export type JobDefinition = {
  name: string;
  description: string;
  config: JobConfig;
  defaults: JobConfig;
  modified: boolean;
  /** The stored override fails validation, so the defaults apply. */
  invalid_override: boolean;
  /** Send back when changing the definition. */
  version: number;
  updated_at?: string;
  updated_by?: string;
  /** Approximate next scheduled run. */
  next_run_at?: string;
  last_run?: JobRun;
};

export type JobDefinitionList = { definitions: JobDefinition[] | null };

/** `PUT /ops/jobs/definitions/{name}`: only the sent fields change. */
export type UpdateJobDefinitionBody = {
  enabled?: boolean;
  schedule?: string;
  timeout?: string;
  max_attempts?: number;
  queue?: string;
  priority?: number;
  version: number;
  reason?: string;
};

export type QueueOverview = {
  name: string;
  /** Some instance runs workers for the queue. */
  active: boolean;
  paused: boolean;
  available: number;
  scheduled: number;
  running: number;
  retryable: number;
  /** Jobs that ran out of attempts in the last 24 hours. */
  discarded_last_day: number;
};

export type JobsOverview = {
  /** Queues with active workers or unfinished jobs, by name. */
  queues: QueueOverview[] | null;
  /** Definitions whose most recent run is retrying or was discarded. */
  failing: JobDefinition[] | null;
};

export type Queue = {
  name: string;
  paused: boolean;
  paused_at?: string;
  created_at: string;
  updated_at: string;
};

export type QueueList = { queues: Queue[] | null };

export type QueueControlBody = { reason?: string };

export type AuditOutcome = "success" | "failure" | "denied";

export type AuditEvent = {
  id: number;
  occurred_at: string;
  recorded_at: string;
  actor_kind: string;
  actor_id?: string;
  actor_label?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  org_id?: string;
  outcome: AuditOutcome;
  /** Action-specific detail; sensitive keys are redacted. */
  metadata: Record<string, unknown>;
  request_id?: string;
  trace_id?: string;
  ip?: string;
  user_agent?: string;
};

export type AuditEventPage = { events: AuditEvent[] | null; next_cursor?: string };

/** The filters `GET /ops/audit` accepts; every one optional. */
export type AuditFilter = {
  actor_kind?: string;
  actor_id?: string;
  action?: string;
  action_prefix?: string;
  resource_type?: string;
  resource_id?: string;
  org_id?: string;
  outcome?: AuditOutcome;
  request_id?: string;
  /** RFC 3339, inclusive. */
  from?: string;
  /** RFC 3339, exclusive. */
  to?: string;
  limit?: number;
};

export type AuditGroupBy = "action" | "outcome" | "actor_kind" | "resource_type" | "day";

export type AuditStatsGroup = { key: string; count: number };

export type AuditStats = {
  from: string;
  to: string;
  group_by: AuditGroupBy;
  total: number;
  /** Largest first, at most 50; every day in order for `day`. */
  groups: AuditStatsGroup[] | null;
  /** Events in groups beyond the first 50. */
  other: number;
};

export type SystemCheck = { name: string; status: "ok" | "error"; duration_ms: number };

export type PoolStats = {
  total: number;
  idle: number;
  in_use: number;
  max: number;
  acquires: number;
  average_acquire_ms: number;
  /** Acquires that waited because no connection was idle. */
  empty_acquires: number;
  canceled_acquires: number;
};

export type MigrationStatus = { current: number; latest: number; pending: number };

export type SystemInfo = {
  instance: {
    id: string;
    version: string;
    commit?: string;
    build_time?: string;
    /** Built with uncommitted changes. */
    modified: boolean;
    started_at: string;
    uptime_seconds: number;
  };
  /** Readiness checks, as /readyz runs them. */
  checks: SystemCheck[] | null;
  database: {
    status: "ok" | "error";
    /** What failed; never the driver's message. */
    error?: string;
    ping_ms: number;
    pool: PoolStats;
    migrations: MigrationStatus;
  };
  runtime: {
    go_version: string;
    gomaxprocs: number;
    goroutines: number;
    heap_in_use_bytes: number;
    last_gc_pause_ms: number;
    gcs: number;
  };
  jobs: { workers: number; queues: string[] | null };
};

export type MailStatus = {
  provider: "resend" | "smtp" | string;
  /** mailpit: every email goes to the development inbox; provider: real email. */
  delivery: "mailpit" | "provider" | string;
  /** Provider configuration from the environment, without secrets. */
  details: Record<string, string>;
  from_name: string;
  from_email: string;
  reply_to?: string;
};

export type TestEmailBody = { to: string };
export type TestEmailResponse = { status: "queued"; to: string; delivery: "mailpit" | "provider" | string };

export type Suppression = {
  id: number;
  /** Normalised: trimmed and in lower case. */
  email: string;
  reason: "bounce" | "complaint" | string;
  /** Who reported it. */
  source: string;
  detail?: string;
  created_at: string;
  updated_at: string;
};

export type SuppressionPage = { suppressions: Suppression[] | null; next_cursor?: string };

export type RemoveSuppressionBody = { reason: string };

export type ReleaseInstance = {
  id: number;
  instance_id: string;
  version: string;
  commit?: string;
  build_time?: string;
  modified: boolean;
  go_version?: string;
  host?: string;
  started_at: string;
  last_seen_at: string;
  stopped_at?: string;
  running: boolean;
};

export type CurrentRelease = { version: string; commit?: string; instances: ReleaseInstance[] | null };

export type CurrentReleases = { releases: CurrentRelease[] | null };
