/**
 * The mock's jobs in code (`GET /_portal/api/jobs`, ADR-0071) and its job
 * generator: `generators/job/plan` renders the four files `orb gen job`
 * writes (worker, test, definition with the `//orb:job` marker, and
 * `internal/app/jobs.go` with `before`), validating like the CLI; `apply`
 * refuses a dirty tree unless allowed and keeps the job aside until the app
 * restarts, when it appears in `/ops/jobs/definitions` and `/_portal/api/jobs`.
 */
import type { GeneratorResponse, JobDefinition, JobGeneratorInput, JobKind, JobMarkerForm, JobSource, PlanChange, Problem } from "../types";

const KINDS: JobKind[] = ["custom", "http", "sql", "email", "dispatch"];

/** The sample app's jobs: a few made with the form, one of them ejected, the rest hand-written. */
export function initialJobSources(definitions: JobDefinition[]): JobSource[] {
  const markers: Record<string, { form?: JobMarkerForm; ejected?: boolean }> = {
    "audit.rollup": { form: { kind: "sql", sql: "INSERT INTO audit_rollups (hour, action, count) SELECT date_trunc('hour', at), action, count(*) FROM audit_events WHERE at > now() - interval '2 hours' GROUP BY 1, 2 ON CONFLICT (hour, action) DO UPDATE SET count = excluded.count", worker: "sha256:3f1c9d2a6e0b4c7d8a9f1e2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d" } },
    "invites.expire": { form: { kind: "http", http_method: "POST", http_url: "http://127.0.0.1:8080/v1/invitations/expire", http_body: '{"older_than":"72h"}', worker: "sha256:0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9" } },
    "sessions.prune": { form: { kind: "custom", worker: "sha256:9e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2b1a0f9e" }, ejected: true },
    "projects.reindex": { form: { kind: "dispatch", dispatch_target: "retention", worker: "sha256:5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d" } },
  };
  return definitions.map((d) => sourceOf(d.name, markers[d.name]?.form, markers[d.name]?.ejected ?? false));
}

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function sourceOf(name: string, form: JobMarkerForm | undefined, ejected: boolean): JobSource {
  const w = words(name);
  const pkg = w.join("");
  return {
    name,
    ident: w.map((x) => x[0].toUpperCase() + x.slice(1)).join(""),
    package: pkg,
    definition: `internal/app/job_${w.join("_")}.go`,
    worker: `internal/jobs/${pkg}/${pkg}.go`,
    generated: Boolean(form),
    ejected,
    kind: form && !ejected ? form.kind : "custom",
    form,
  };
}

export type PlannedJob = { definition: JobDefinition; source: JobSource; response: GeneratorResponse };

type Fail = { problem: Problem };

const usage = (detail: string): Fail => ({ problem: { title: "Unprocessable Entity", status: 422, code: "generator_failed", detail } });

/** Plans a job the way `orb gen job` would, or answers the usage error the CLI prints. */
export function planJobMock(raw: Record<string, unknown>, existing: string[], applied: boolean): PlannedJob | Fail {
  const known = ["name", "description", "trigger", "schedule", "every", "timeout", "max_attempts", "queue", "priority", "disabled", "kind", "method", "url", "body", "sql", "to", "subject", "text", "dispatch"];
  const unknown = Object.keys(raw).find((k) => !known.includes(k));
  if (unknown) return usage(`invalid input: json: unknown field "${unknown}"`);
  const input = raw as JobGeneratorInput;
  const name = String(input.name ?? "").trim();
  if (!name) return usage("missing job name");
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || name.length > 60) return usage("job name must start with a letter and use letters, digits, hyphens or underscores (max 60), such as CleanupSessions");
  const w = words(name);
  const defName = w.join("_");
  const ident = w.map((x) => x[0].toUpperCase() + x.slice(1)).join("");
  const pkg = w.join("");
  let trigger = input.trigger ?? "";
  let schedule = input.schedule ?? "";
  if (trigger && !["schedule", "interval", "manual"].includes(trigger)) return usage(`unknown trigger "${trigger}" (want schedule, interval or manual)`);
  if (!trigger) trigger = input.every ? "interval" : "schedule";
  if (trigger === "schedule" && !schedule) schedule = "0 3 * * *";
  if (trigger === "interval") {
    if (!/^(\d+(\.\d+)?(ms|s|m|h))+$/.test(input.every ?? "")) return usage("--every must be a duration of at least 1m, such as 15m");
    schedule = `@every ${input.every}`;
  }
  if (trigger === "manual") schedule = "";
  if (trigger === "schedule" && !/^(@(hourly|daily|midnight|weekly|monthly|yearly|annually)|(\S+\s+){4}\S+)$/.test(schedule)) return usage("--schedule must be a 5-field cron expression such as \"0 3 * * *\" or a descriptor such as @daily");
  const timeout = input.timeout ?? "1m";
  if (!/^(\d+(\.\d+)?(ms|s|m|h))+$/.test(timeout)) return usage("--timeout must be a duration between 1s and 24h, such as 5m");
  const maxAttempts = input.max_attempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) return usage("--max-attempts must be between 1 and 100");
  const queue = input.queue ?? "default";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(queue)) return usage("--queue must use letters, digits, hyphens or underscores");
  const priority = input.priority ?? 1;
  if (!Number.isInteger(priority) || priority < 1 || priority > 4) return usage("--priority must be between 1 (highest) and 4");
  const kind = (input.kind || "custom") as JobKind;
  if (!KINDS.includes(kind)) return usage(`--kind must be one of ${KINDS.join(", ")}`);
  const fields: Record<string, string> = { url: input.url ?? "", body: input.body ?? "", sql: input.sql ?? "", to: input.to ?? "", subject: input.subject ?? "", text: input.text ?? "", dispatch: input.dispatch ?? "" };
  const allowed: Record<string, string[]> = { custom: [], http: ["url", "body"], sql: ["sql"], email: ["to", "subject", "text"], dispatch: ["dispatch"] };
  for (const f of ["url", "body", "sql", "to", "subject", "text", "dispatch"]) {
    if (fields[f].trim() && !allowed[kind].includes(f)) return usage(`--${f} is for another kind of job, not ${kind}`);
  }
  const marker: JobMarkerForm = { kind };
  switch (kind) {
    case "http": {
      const method = (input.method || "POST").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return usage("--method must be GET, POST, PUT, PATCH or DELETE");
      if (!/^https?:\/\/[^\s/]+/.test(fields.url.trim())) return usage("--url must be an http or https URL");
      if (fields.body.trim()) {
        try {
          JSON.parse(fields.body);
        } catch {
          return usage("--body must be JSON");
        }
        marker.http_body = fields.body.trim();
      }
      marker.http_method = method;
      marker.http_url = fields.url.trim();
      break;
    }
    case "sql":
      if (!fields.sql.trim()) return usage("--sql is required for a sql job");
      marker.sql = fields.sql.trim();
      break;
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.to.trim())) return usage("--to must be an email address");
      if (!fields.subject.trim()) return usage("--subject is required for an email job");
      marker.email_to = fields.to.trim();
      marker.email_subject = fields.subject.trim();
      if (fields.text.trim()) marker.email_text = fields.text.trim();
      break;
    case "dispatch":
      if (!fields.dispatch.trim()) return usage("--dispatch job name must start with a letter and use letters, digits, hyphens or underscores (max 60), such as CleanupSessions");
      marker.dispatch_target = words(fields.dispatch).join("_");
      break;
  }
  if (existing.includes(defName)) return { problem: { title: "Conflict", status: 409, code: "plan_conflict", detail: `internal/jobs/${pkg}/${pkg}.go: file already exists` } };
  marker.worker = `sha256:${hashish(pkg + kind + JSON.stringify(marker))}`;
  const description = input.description?.trim() || `${ident} job.`;
  const enabled = !input.disabled;
  const workerPath = `internal/jobs/${pkg}/${pkg}.go`;
  const definitionPath = `internal/app/job_${defName}.go`;
  const beforeJobs = jobsGo(existing);
  const afterJobs = jobsGo([defName, ...existing]);
  const changes: PlanChange[] = [
    { path: workerPath, kind: "create", content: workerGo(pkg, defName, kind, marker) },
    { path: `internal/jobs/${pkg}/${pkg}_test.go`, kind: "create", content: testGo(pkg, ident, kind) },
    { path: definitionPath, kind: "create", content: definitionGo(pkg, ident, defName, description, marker, enabled, schedule, timeout, maxAttempts, queue, priority, kind) },
    { path: "internal/app/jobs.go", kind: "modify", before: beforeJobs, content: afterJobs },
  ];
  const summary = [`  Job:       ${defName} (${enabled ? "enabled" : "disabled"})`, `  Runs:      ${schedule || "on demand"}`, `  Timeout:   ${timeout} · ${maxAttempts} attempts · queue ${queue} · priority ${priority}`, "  Files:", ...changes.map((c) => `    ${c.path}`)].join("\n");
  const config = { enabled, schedule, timeout: goDuration(timeout), max_attempts: maxAttempts, queue, priority };
  return {
    definition: { name: defName, description, config, defaults: { ...config }, modified: false, invalid_override: false, version: 0, next_run_at: enabled && schedule ? new Date(Date.now() + 5 * 60_000).toISOString() : undefined },
    source: sourceOf(defName, marker, false),
    response: {
      applied,
      plan: {
        generator: "job",
        name: ident,
        summary,
        changes,
        next: [kind === "custom" ? `Write the job in ${workerPath}` : `Review the ${kind} job in ${workerPath}; editing it makes it a custom job`, "go test ./internal/app -run TestPublicSurface -update (records the job name)", "go test ./...", "go run ./cmd/api"],
        result: { name: ident, definition: defName, files: changes.map((c) => c.path), dry_run: !applied },
      },
    },
  };
}

/** `1m` → `1m0s`, as the ops API prints Go durations. */
function goDuration(d: string): string {
  const m = /^(\d+)(s|m|h)$/.exec(d);
  if (!m) return d;
  if (m[2] === "h") return `${m[1]}h0m0s`;
  if (m[2] === "m") return `${m[1]}m0s`;
  return d;
}

/** A deterministic 64-hex "hash" for the marker; the mock never hashes a real file. */
function hashish(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 0x811c9dc5) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    h1 = Math.imul(h1 ^ (h1 >>> 15), 0x2c1b3c6d) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x297a2d39) >>> 0;
    out += ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}

function jobsGo(names: string[]): string {
  const lines = names.map((n) => `\tdefine${words(n)
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join("")}Job(defs, deps)`);
  return `package app

import (
\t"log/slog"
\t"net/http"

\t"github.com/jackc/pgx/v5/pgxpool"

\t"gorbital.dev/modules/jobs"
\t"gorbital.dev/modules/mail"
)

// jobDeps is what the job definitions need from the app: the built-in
// jobs take the logger; jobs made with orb gen job take what their kind
// needs (ADR-0071).
type jobDeps struct {
\tlogger     *slog.Logger
\tpool       *pgxpool.Pool
\tmailer     mail.Sender
\thttpClient *http.Client
\trunJob     func(ctx context.Context, name string) error
}

// defineJobs registers every job definition. orb gen job adds a line
// after the anchor.
func defineJobs(defs *jobs.Definitions, deps jobDeps) {
\t//orb:anchor jobs
${lines.join("\n")}
}
`;
}

function workerGo(pkg: string, defName: string, kind: JobKind, m: JobMarkerForm): string {
  const head = `// Package ${pkg} runs the ${defName} background job. Its configuration
// (enabled, schedule, timeout, retries) can be changed at runtime through
// /ops/jobs/definitions/${defName}.
package ${pkg}
`;
  const common = `
// Name identifies the job. It is public API: renaming it orphans its
// configuration overrides and history.
const Name = "${defName}"

// Args are the job's arguments, stored as JSON with each job. Keep personal
// data out of them.
type Args struct{}

// Kind returns [Name].
func (Args) Kind() string { return Name }
`;
  switch (kind) {
    case "http":
      return `${head}
import (
\t"bytes"
\t"context"
\t"fmt"
\t"log/slog"
\t"net/http"

\t"github.com/riverqueue/river"
)
${common}
// The request the job sends. Edit these and the job becomes a custom job.
const (
\tMethod = "${m.http_method}"
\tURL    = "${m.http_url}"
\tBody   = ${JSON.stringify(m.http_body ?? "")}
)

// Worker runs ${defName} jobs.
type Worker struct {
\triver.WorkerDefaults[Args]
\tlogger *slog.Logger
\tclient *http.Client
}

// NewWorker returns a Worker using the app's HTTP client.
func NewWorker(logger *slog.Logger, client *http.Client) *Worker {
\treturn &Worker{logger: logger, client: client}
}

// Work sends the request; anything but a 2xx answer is an error, so the
// job is retried.
func (w *Worker) Work(ctx context.Context, job *river.Job[Args]) error {
\treq, err := http.NewRequestWithContext(ctx, Method, URL, bytes.NewReader([]byte(Body)))
\tif err != nil {
\t\treturn err
\t}
\tif Body != "" {
\t\treq.Header.Set("Content-Type", "application/json")
\t}
\tres, err := w.client.Do(req)
\tif err != nil {
\t\treturn err
\t}
\tdefer res.Body.Close()
\tif res.StatusCode < 200 || res.StatusCode > 299 {
\t\treturn fmt.Errorf("%s %s: %s", Method, URL, res.Status)
\t}
\tw.logger.InfoContext(ctx, "job ran", "job", Name, "job_id", job.ID, "status", res.StatusCode)
\treturn nil
}
`;
    case "sql":
      return `${head}
import (
\t"context"
\t"log/slog"

\t"github.com/jackc/pgx/v5/pgxpool"
\t"github.com/riverqueue/river"
)
${common}
// Statement is what the job runs. Edit it and the job becomes a custom job.
const Statement = ${JSON.stringify(m.sql ?? "")}

// Worker runs ${defName} jobs.
type Worker struct {
\triver.WorkerDefaults[Args]
\tlogger *slog.Logger
\tpool   *pgxpool.Pool
}

// NewWorker returns a Worker using the app's pool.
func NewWorker(logger *slog.Logger, pool *pgxpool.Pool) *Worker {
\treturn &Worker{logger: logger, pool: pool}
}

// Work runs the statement once.
func (w *Worker) Work(ctx context.Context, job *river.Job[Args]) error {
\ttag, err := w.pool.Exec(ctx, Statement)
\tif err != nil {
\t\treturn err
\t}
\tw.logger.InfoContext(ctx, "job ran", "job", Name, "job_id", job.ID, "rows", tag.RowsAffected())
\treturn nil
}
`;
    case "email":
      return `${head}
import (
\t"context"
\t"fmt"
\t"log/slog"

\t"github.com/riverqueue/river"

\t"gorbital.dev/modules/mail"
)
${common}
// The message the job sends. Edit these and the job becomes a custom job.
const (
\tTo      = "${m.email_to}"
\tSubject = ${JSON.stringify(m.email_subject ?? "")}
\tText    = ${JSON.stringify(m.email_text ?? "")}
)

// Worker runs ${defName} jobs.
type Worker struct {
\triver.WorkerDefaults[Args]
\tlogger *slog.Logger
\tmailer mail.Sender
}

// NewWorker returns a Worker using the app's mailer.
func NewWorker(logger *slog.Logger, mailer mail.Sender) *Worker {
\treturn &Worker{logger: logger, mailer: mailer}
}

// Work sends the message; the job ID is the idempotency key, so a retry
// never sends twice.
func (w *Worker) Work(ctx context.Context, job *river.Job[Args]) error {
\t_, err := w.mailer.Send(ctx, mail.Message{To: []string{To}, Subject: Subject, Text: Text, IdempotencyKey: fmt.Sprintf("%s-%d", Name, job.ID)})
\tif err != nil {
\t\treturn err
\t}
\tw.logger.InfoContext(ctx, "job ran", "job", Name, "job_id", job.ID)
\treturn nil
}
`;
    case "dispatch":
      return `${head}
import (
\t"context"
\t"log/slog"

\t"github.com/riverqueue/river"
)
${common}
// Target is the job this one starts. Edit it and the job becomes a custom job.
const Target = "${m.dispatch_target}"

// Worker runs ${defName} jobs.
type Worker struct {
\triver.WorkerDefaults[Args]
\tlogger *slog.Logger
\trunJob func(ctx context.Context, name string) error
}

// NewWorker returns a Worker using the app's job manager.
func NewWorker(logger *slog.Logger, runJob func(ctx context.Context, name string) error) *Worker {
\treturn &Worker{logger: logger, runJob: runJob}
}

// Work starts Target, as POST /ops/jobs/definitions/{name}/run does.
func (w *Worker) Work(ctx context.Context, job *river.Job[Args]) error {
\tif err := w.runJob(ctx, Target); err != nil {
\t\treturn err
\t}
\tw.logger.InfoContext(ctx, "job ran", "job", Name, "job_id", job.ID, "started", Target)
\treturn nil
}
`;
    default:
      return `${head}
import (
\t"context"
\t"log/slog"

\t"github.com/riverqueue/river"
)
${common}
// Worker runs ${defName} jobs.
type Worker struct {
\triver.WorkerDefaults[Args]
\tlogger *slog.Logger
}

// NewWorker returns a Worker. Add the stores and clients the job needs as
// parameters and pass them from internal/app/job_${defName}.go.
func NewWorker(logger *slog.Logger) *Worker {
\treturn &Worker{logger: logger}
}

// Work runs one job. Return an error to retry it, and respect ctx so
// shutdown and the timeout can stop the job.
func (w *Worker) Work(ctx context.Context, job *river.Job[Args]) error {
\tw.logger.InfoContext(ctx, "job ran", "job", Name, "job_id", job.ID, "attempt", job.Attempt)
\treturn nil
}
`;
  }
}

function testGo(pkg: string, ident: string, kind: JobKind): string {
  return `package ${pkg}

import (
\t"context"
\t"log/slog"
\t"testing"

\t"github.com/riverqueue/river"
)

func TestWorker(t *testing.T) {
\tt.Parallel()
\t// ${kind === "custom" ? "Replace this with what the job does." : `Exercises the ${kind} job against a test double.`}
\tw := NewWorker(slog.Default()${kind === "custom" ? "" : ", nil"})
\tif err := w.Work(context.Background(), &river.Job[Args]{Args: Args{}}); err != nil {
\t\tt.Fatalf("${ident}: %v", err)
\t}
}
`;
}

function definitionGo(pkg: string, ident: string, defName: string, description: string, m: JobMarkerForm, enabled: boolean, schedule: string, timeout: string, maxAttempts: number, queue: string, priority: number, kind: JobKind): string {
  const dep = { custom: "deps.logger", http: "deps.logger, deps.httpClient", sql: "deps.logger, deps.pool", email: "deps.logger, deps.mailer", dispatch: "deps.logger, deps.runJob" }[kind];
  const goTimeout = /^(\d+)m$/.test(timeout) ? (timeout === "1m" ? "time.Minute" : `${timeout.slice(0, -1)} * time.Minute`) : /^(\d+)h$/.test(timeout) ? (timeout === "1h" ? "time.Hour" : `${timeout.slice(0, -1)} * time.Hour`) : /^(\d+)s$/.test(timeout) ? `${timeout.slice(0, -1)} * time.Second` : `mustParseDuration("${timeout}")`;
  return `package app

import (
\t"time"

\t"gorbital.dev/modules/jobs"

\t"example/internal/jobs/${pkg}"
)

// define${ident}Job declares the ${defName} job with its code defaults.
// Operators can override them in /ops/jobs/definitions/${defName}.
//
// The orb:job line records how the job was generated, so the Dev Portal
// can show it as a form until the worker is edited by hand (ADR-0071).
//
//orb:job ${JSON.stringify(m)}
func define${ident}Job(defs *jobs.Definitions, deps jobDeps) {
\tjobs.Define(defs, jobs.Definition[${pkg}.Args]{
\t\tName:        ${pkg}.Name,
\t\tDescription: ${JSON.stringify(description)},
\t\tWorker:      ${pkg}.NewWorker(${dep}),
\t\tNewArgs:     func() ${pkg}.Args { return ${pkg}.Args{} },
\t\tEnabled:     ${enabled},
\t\tSchedule:    ${JSON.stringify(schedule)},
\t\tTimeout:     ${goTimeout},
\t\tMaxAttempts: ${maxAttempts},
\t\tQueue:       ${JSON.stringify(queue)},
\t\tPriority:    ${priority},
\t})
}
`;
}
