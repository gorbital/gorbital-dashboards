/**
 * The New job form's state and what it becomes: the generator's input
 * (`generators/job/plan|apply`), the `orb gen job` command to copy, and the
 * way back from a generated job's marker (Duplicate as new).
 */

import type { JobDefinition, JobGeneratorInput, JobKind, JobSource, JobTrigger } from "@/lib/api/types";

export type JobForm = {
  name: string;
  description: string;
  trigger: JobTrigger;
  /** A preset's expression or "custom". */
  schedulePreset: string;
  schedule: string;
  /** A preset's duration or "custom". */
  everyPreset: string;
  every: string;
  timeout: string;
  maxAttempts: string;
  queue: string;
  priority: string;
  enabled: boolean;
  kind: JobKind;
  method: string;
  url: string;
  body: string;
  sql: string;
  to: string;
  subject: string;
  text: string;
  dispatch: string;
};

export const SCHEDULE_PRESETS: { value: string; label: string }[] = [
  { value: "0 3 * * *", label: "Daily at 03:00" },
  { value: "0 * * * *", label: "Hourly" },
  { value: "0 9 * * 1-5", label: "Weekdays at 09:00" },
  { value: "0 0 1 * *", label: "Monthly, on the 1st" },
  { value: "custom", label: "Custom cron…" },
];

export const INTERVAL_PRESETS: { value: string; label: string }[] = [
  { value: "5m", label: "Every 5 minutes" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "30m", label: "Every 30 minutes" },
  { value: "1h", label: "Every hour" },
  { value: "6h", label: "Every 6 hours" },
  { value: "custom", label: "Custom interval…" },
];

export const TIMEOUT_PRESETS = ["30s", "1m", "5m", "15m", "1h"];
export const ATTEMPT_PRESETS = [1, 3, 5, 10, 25];

export const KINDS: { value: JobKind; label: string; hint: string }[] = [
  { value: "custom", label: "Custom", hint: "A Work method to write in Go." },
  { value: "http", label: "HTTP request", hint: "Sends a request; a non-2xx answer fails the job so it is retried." },
  { value: "sql", label: "SQL", hint: "Runs one statement on the app's pool." },
  { value: "email", label: "Email", hint: "Sends a message through the app's mailer; the job ID is the idempotency key." },
  { value: "dispatch", label: "Dispatch another job", hint: "Starts the job named here, as Run now does." },
];

export function defaultJobForm(): JobForm {
  return {
    name: "",
    description: "",
    trigger: "schedule",
    schedulePreset: "0 3 * * *",
    schedule: "0 3 * * *",
    everyPreset: "1h",
    every: "1h",
    timeout: "1m",
    maxAttempts: "5",
    queue: "default",
    priority: "1",
    enabled: true,
    kind: "custom",
    method: "POST",
    url: "",
    body: "",
    sql: "",
    to: "",
    subject: "",
    text: "",
    dispatch: "",
  };
}

/** The schedule expression the form means, whatever the trigger: cron, `@every d`, or "" for on demand. */
export function formSchedule(f: JobForm): string {
  if (f.trigger === "schedule") return f.schedule.trim();
  if (f.trigger === "interval") return f.every.trim() ? `@every ${f.every.trim()}` : "";
  return "";
}

/** What's wrong before asking the portal; the portal validates again. */
export function validateJobForm(f: JobForm, existing: string[] = []): Partial<Record<keyof JobForm, string>> {
  const errors: Partial<Record<keyof JobForm, string>> = {};
  const name = f.name.trim();
  if (!name) errors.name = "A name is needed: CleanupSessions, cleanup-sessions or cleanup_sessions.";
  else if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) errors.name = "Letters, digits, - and _, starting with a letter.";
  else if (existing.includes(definitionName(name))) errors.name = `${definitionName(name)} is already a job.`;
  if (f.trigger === "schedule" && !f.schedule.trim()) errors.schedule = "A cron expression is needed.";
  if (f.trigger === "interval" && !/^(\d+(\.\d+)?(ms|s|m|h))+$/.test(f.every.trim())) errors.every = "A Go duration such as 15m.";
  if (!/^(\d+(\.\d+)?(ms|s|m|h))+$/.test(f.timeout.trim())) errors.timeout = "A Go duration such as 5m (1s to 24h).";
  const attempts = Number(f.maxAttempts);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 100) errors.maxAttempts = "1 to 100.";
  const priority = Number(f.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 4) errors.priority = "1 (highest) to 4.";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(f.queue.trim())) errors.queue = "Letters, digits, - and _.";
  switch (f.kind) {
    case "http":
      if (!/^https?:\/\/\S+$/.test(f.url.trim())) errors.url = "An http or https URL.";
      if (f.body.trim()) {
        try {
          JSON.parse(f.body);
        } catch {
          errors.body = "The body must be JSON.";
        }
      }
      break;
    case "sql":
      if (!f.sql.trim()) errors.sql = "A statement is needed.";
      break;
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.to.trim())) errors.to = "An email address.";
      if (!f.subject.trim()) errors.subject = "A subject is needed.";
      break;
    case "dispatch":
      if (!f.dispatch.trim()) errors.dispatch = "Pick the job to start.";
      break;
  }
  return errors;
}

/** `CleanupSessions`, `cleanup-sessions` or `HTTPPing` split into words the way `orb gen job` does. */
export function splitWords(input: string): string[] {
  const words: string[] = [];
  let word = "";
  const runes = [...input];
  const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
  const isLower = (c: string) => c !== c.toUpperCase() && c === c.toLowerCase();
  const flush = () => {
    if (word) words.push(word.toLowerCase());
    word = "";
  };
  runes.forEach((r, i) => {
    if (r === "_" || r === "-") return flush();
    if (isUpper(r) && i > 0) {
      const prev = runes[i - 1];
      const nextLower = i + 1 < runes.length && isLower(runes[i + 1]);
      if (isLower(prev) || /\d/.test(prev) || (isUpper(prev) && nextLower)) flush();
    }
    word += r;
  });
  flush();
  return words;
}

/** The three names `orb gen job` derives: `PingHealth` → ident `PingHealth`, definition `ping_health`, package `pinghealth`. */
export function jobNames(input: string): { ident: string; name: string; pkg: string } {
  const words = splitWords(input.trim());
  return { ident: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(""), name: words.join("_"), pkg: words.join("") };
}

/** `PingHealth` or `ping-health` → `ping_health`, the definition's name. */
export function definitionName(name: string): string {
  return jobNames(name).name;
}

/** The generator's input: only the fields it knows (it refuses unknown ones), and only the kind's own fields. */
export function toGeneratorInput(f: JobForm): JobGeneratorInput {
  const input: JobGeneratorInput = {
    name: f.name.trim(),
    trigger: f.trigger,
    timeout: f.timeout.trim(),
    max_attempts: Number(f.maxAttempts),
    queue: f.queue.trim(),
    priority: Number(f.priority),
    kind: f.kind,
  };
  if (f.description.trim()) input.description = f.description.trim();
  if (f.trigger === "schedule") input.schedule = f.schedule.trim();
  if (f.trigger === "interval") input.every = f.every.trim();
  if (!f.enabled) input.disabled = true;
  switch (f.kind) {
    case "http":
      input.method = f.method;
      input.url = f.url.trim();
      if (f.body.trim()) input.body = f.body.trim();
      break;
    case "sql":
      input.sql = f.sql.trim();
      break;
    case "email":
      input.to = f.to.trim();
      input.subject = f.subject.trim();
      if (f.text.trim()) input.text = f.text.trim();
      break;
    case "dispatch":
      input.dispatch = f.dispatch.trim();
      break;
  }
  return input;
}

/** Quotes for a POSIX shell: bare when safe, single-quoted otherwise. */
export function shellQuote(s: string): string {
  if (s === "") return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The `orb gen job …` command that writes the same files. */
export function toCommand(f: JobForm): string {
  const parts = ["orb gen job", shellQuote(f.name.trim() || "<Name>")];
  const flag = (name: string, value: string) => parts.push(`--${name}`, shellQuote(value));
  if (f.description.trim()) flag("description", f.description.trim());
  if (f.trigger === "schedule") flag("schedule", f.schedule.trim());
  else if (f.trigger === "interval") flag("every", f.every.trim());
  else parts.push("--on-demand");
  if (f.timeout.trim() !== "1m") flag("timeout", f.timeout.trim());
  if (f.maxAttempts !== "5") flag("max-attempts", f.maxAttempts);
  if (f.queue.trim() !== "default") flag("queue", f.queue.trim());
  if (f.priority !== "1") flag("priority", f.priority);
  if (!f.enabled) parts.push("--disabled");
  if (f.kind !== "custom") flag("kind", f.kind);
  switch (f.kind) {
    case "http":
      if (f.method !== "POST") flag("method", f.method);
      flag("url", f.url.trim());
      if (f.body.trim()) flag("body", f.body.trim());
      break;
    case "sql":
      flag("sql", f.sql.trim());
      break;
    case "email":
      flag("to", f.to.trim());
      flag("subject", f.subject.trim());
      if (f.text.trim()) flag("text", f.text.trim());
      break;
    case "dispatch":
      flag("dispatch", f.dispatch.trim());
      break;
  }
  parts.push("--yes");
  return parts.join(" ");
}

/** Pre-fills the form from a generated job's marker and its definition, for "Duplicate as new". */
export function formFromSource(source: JobSource, def?: JobDefinition): JobForm {
  const f = defaultJobForm();
  const m = source.form ?? { kind: source.kind };
  f.name = `${source.ident}Copy`;
  f.description = def?.description ?? "";
  const schedule = def?.defaults.schedule ?? def?.config.schedule ?? "";
  if (!schedule) f.trigger = "manual";
  else if (schedule.startsWith("@every ")) {
    f.trigger = "interval";
    f.every = schedule.slice("@every ".length).trim();
    f.everyPreset = INTERVAL_PRESETS.some((p) => p.value === f.every) ? f.every : "custom";
  } else {
    f.trigger = "schedule";
    f.schedule = schedule;
    f.schedulePreset = SCHEDULE_PRESETS.some((p) => p.value === schedule) ? schedule : "custom";
  }
  if (def) {
    f.timeout = compactDuration(def.defaults.timeout);
    f.maxAttempts = String(def.defaults.max_attempts);
    f.queue = def.defaults.queue;
    f.priority = String(def.defaults.priority);
    f.enabled = def.defaults.enabled;
  }
  const kind = (["custom", "http", "sql", "email", "dispatch"] as JobKind[]).includes(m.kind as JobKind) ? (m.kind as JobKind) : "custom";
  f.kind = kind;
  f.method = m.http_method || "POST";
  f.url = m.http_url ?? "";
  f.body = m.http_body ?? "";
  f.sql = m.sql ?? "";
  f.to = m.email_to ?? "";
  f.subject = m.email_subject ?? "";
  f.text = m.email_text ?? "";
  f.dispatch = m.dispatch_target ?? "";
  return f;
}

/** `1m0s` → `1m`, `1h0m0s` → `1h`, `1h30m0s` → `1h30m`; the ops API prints Go durations long. */
export function compactDuration(d: string): string {
  const parts = [...d.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)];
  if (!parts.length || parts.map((p) => p[0]).join("") !== d) return d;
  const kept = parts.filter(([, n]) => Number(n) !== 0).map(([whole]) => whole);
  return kept.length ? kept.join("") : parts[parts.length - 1][0];
}

/** The kind's fields from a marker, labelled, for the read-only visual view. */
export function markerRows(m: { kind: string; http_method?: string; http_url?: string; http_body?: string; sql?: string; email_to?: string; email_subject?: string; email_text?: string; dispatch_target?: string }): { k: string; v: string; code?: boolean }[] {
  switch (m.kind) {
    case "http":
      return [
        { k: "Method", v: m.http_method || "POST" },
        { k: "URL", v: m.http_url ?? "" },
        ...(m.http_body ? [{ k: "Body", v: m.http_body, code: true }] : []),
      ];
    case "sql":
      return [{ k: "Statement", v: m.sql ?? "", code: true }];
    case "email":
      return [
        { k: "To", v: m.email_to ?? "" },
        { k: "Subject", v: m.email_subject ?? "" },
        ...(m.email_text ? [{ k: "Text", v: m.email_text }] : []),
      ];
    case "dispatch":
      return [{ k: "Starts", v: m.dispatch_target ?? "" }];
    default:
      return [];
  }
}

/** The Go skeleton the custom kind writes, for the Code tab's editor. */
export function workerTemplate(name: string): string {
  const names = jobNames(name.trim() || "MyJob");
  const pkg = names.pkg || "myjob";
  const def = names.name || "my_job";
  return `// Package ${pkg} runs the ${def} background job. Its configuration
// (enabled, schedule, timeout, retries) can be changed at runtime through
// /ops/jobs/definitions/${def}.
package ${pkg}

import (
\t"context"
\t"log/slog"

\t"github.com/riverqueue/river"
)

// Name identifies the job. It is public API: renaming it orphans its
// configuration overrides and history.
const Name = "${def}"

// Args are the job's arguments, stored as JSON with each job. Keep personal
// data out of them.
type Args struct{}

// Kind returns [Name].
func (Args) Kind() string { return Name }

// Worker runs ${def} jobs.
type Worker struct {
\triver.WorkerDefaults[Args]
\tlogger *slog.Logger
}

// NewWorker returns a Worker. Add the stores and clients the job needs as
// parameters and pass them from internal/app/job_${def}.go.
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
