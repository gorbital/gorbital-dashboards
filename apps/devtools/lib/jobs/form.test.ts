import { describe, expect, it } from "vitest";
import type { JobDefinition, JobSource } from "@/lib/api/types";
import { compactDuration, defaultJobForm, definitionName, formFromSource, formSchedule, jobNames, markerRows, shellQuote, splitWords, toCommand, toGeneratorInput, validateJobForm, workerTemplate } from "./form";

describe("names", () => {
  it("splits words like orb gen job", () => {
    expect(splitWords("CleanupSessions")).toEqual(["cleanup", "sessions"]);
    expect(splitWords("cleanup-sessions")).toEqual(["cleanup", "sessions"]);
    expect(splitWords("cleanup_sessions")).toEqual(["cleanup", "sessions"]);
    expect(splitWords("HTTPPing")).toEqual(["http", "ping"]);
    expect(splitWords("PingHealth2")).toEqual(["ping", "health2"]);
    expect(splitWords("Send2FA")).toEqual(["send2", "fa"]);
  });

  it("derives the ident, definition and package", () => {
    expect(jobNames("PingHealth")).toEqual({ ident: "PingHealth", name: "ping_health", pkg: "pinghealth" });
    expect(jobNames("ping-health")).toEqual({ ident: "PingHealth", name: "ping_health", pkg: "pinghealth" });
    expect(definitionName("NightlyReport")).toBe("nightly_report");
  });
});

describe("validateJobForm", () => {
  it("passes the defaults with a name and flags what's missing per kind", () => {
    const f = { ...defaultJobForm(), name: "PingHealth" };
    expect(validateJobForm(f)).toEqual({});
    expect(validateJobForm({ ...f, name: "" }).name).toBeDefined();
    expect(validateJobForm({ ...f, name: "9lives" }).name).toBeDefined();
    expect(validateJobForm(f, ["ping_health"]).name).toMatch(/already/);
    expect(validateJobForm({ ...f, kind: "http", url: "nope" }).url).toBeDefined();
    expect(validateJobForm({ ...f, kind: "http", url: "http://127.0.0.1:8093/healthz", body: "{" }).body).toBeDefined();
    expect(validateJobForm({ ...f, kind: "http", url: "http://127.0.0.1:8093/healthz", body: '{"ping":true}' })).toEqual({});
    expect(validateJobForm({ ...f, kind: "sql" }).sql).toBeDefined();
    expect(validateJobForm({ ...f, kind: "email", to: "x", subject: "" })).toMatchObject({ to: expect.any(String), subject: expect.any(String) });
    expect(validateJobForm({ ...f, kind: "dispatch" }).dispatch).toBeDefined();
    expect(validateJobForm({ ...f, trigger: "interval", every: "soon" }).every).toBeDefined();
    expect(validateJobForm({ ...f, timeout: "5 minutes" }).timeout).toBeDefined();
    expect(validateJobForm({ ...f, maxAttempts: "0" }).maxAttempts).toBeDefined();
    expect(validateJobForm({ ...f, priority: "9" }).priority).toBeDefined();
  });
});

describe("toGeneratorInput", () => {
  it("sends only the generator's fields and the kind's own", () => {
    const f = { ...defaultJobForm(), name: "PingHealth", trigger: "interval" as const, every: "5m", kind: "http" as const, method: "GET", url: "http://127.0.0.1:8093/healthz", sql: "leftover" };
    expect(toGeneratorInput(f)).toEqual({ name: "PingHealth", trigger: "interval", every: "5m", timeout: "1m", max_attempts: 5, queue: "default", priority: 1, kind: "http", method: "GET", url: "http://127.0.0.1:8093/healthz" });
    const sql = { ...defaultJobForm(), name: "Tick", trigger: "manual" as const, kind: "sql" as const, sql: "SELECT 1", enabled: false, description: "Ticks." };
    expect(toGeneratorInput(sql)).toEqual({ name: "Tick", description: "Ticks.", trigger: "manual", timeout: "1m", max_attempts: 5, queue: "default", priority: 1, kind: "sql", sql: "SELECT 1", disabled: true });
    expect(formSchedule(f)).toBe("@every 5m");
    expect(formSchedule(sql)).toBe("");
    expect(formSchedule(defaultJobForm())).toBe("0 3 * * *");
  });
});

describe("toCommand", () => {
  it("builds orb gen job with only the flags that differ from the defaults", () => {
    expect(toCommand({ ...defaultJobForm(), name: "NightlyReport" })).toBe("orb gen job NightlyReport --schedule '0 3 * * *' --yes");
    expect(toCommand({ ...defaultJobForm(), name: "PingHealth", trigger: "interval", every: "5m", kind: "http", method: "GET", url: "http://127.0.0.1:8093/healthz" })).toBe("orb gen job PingHealth --every 5m --kind http --method GET --url http://127.0.0.1:8093/healthz --yes");
    expect(toCommand({ ...defaultJobForm(), name: "PurgeDrafts", trigger: "manual", kind: "sql", sql: "DELETE FROM drafts WHERE updated_at < now() - interval '30 days'", timeout: "5m", maxAttempts: "3", queue: "maintenance", priority: "2", enabled: false, description: "Purges drafts." })).toBe(
      "orb gen job PurgeDrafts --description 'Purges drafts.' --on-demand --timeout 5m --max-attempts 3 --queue maintenance --priority 2 --disabled --kind sql --sql 'DELETE FROM drafts WHERE updated_at < now() - interval '\\''30 days'\\''' --yes",
    );
    expect(toCommand({ ...defaultJobForm(), name: "Chain", kind: "dispatch", dispatch: "purge_drafts" })).toBe("orb gen job Chain --schedule '0 3 * * *' --kind dispatch --dispatch purge_drafts --yes");
  });

  it("quotes for the shell", () => {
    expect(shellQuote("plain")).toBe("plain");
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("has space")).toBe("'has space'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

describe("formFromSource", () => {
  const source: JobSource = { name: "ping_health", ident: "PingHealth", package: "pinghealth", definition: "internal/app/job_ping_health.go", worker: "internal/jobs/pinghealth/pinghealth.go", generated: true, ejected: false, kind: "http", form: { kind: "http", http_method: "GET", http_url: "http://127.0.0.1:8093/healthz", worker: "sha256:abc" } };
  const config = { enabled: true, schedule: "@every 5m", timeout: "1m0s", max_attempts: 5, queue: "default", priority: 1 };
  const def: JobDefinition = { name: "ping_health", description: "Pings healthz.", config, defaults: config, modified: false, invalid_override: false, version: 0 };

  it("pre-fills the form from the marker and the defaults", () => {
    const f = formFromSource(source, def);
    expect(f).toMatchObject({ name: "PingHealthCopy", description: "Pings healthz.", trigger: "interval", every: "5m", everyPreset: "5m", timeout: "1m", maxAttempts: "5", queue: "default", priority: "1", enabled: true, kind: "http", method: "GET", url: "http://127.0.0.1:8093/healthz" });
    const cron = formFromSource({ ...source, kind: "sql", form: { kind: "sql", sql: "SELECT 1" } }, { ...def, defaults: { ...config, schedule: "0 9 * * 1-5" } });
    expect(cron).toMatchObject({ trigger: "schedule", schedule: "0 9 * * 1-5", schedulePreset: "0 9 * * 1-5", kind: "sql", sql: "SELECT 1" });
    const odd = formFromSource({ ...source, form: undefined, kind: "custom" }, { ...def, defaults: { ...config, schedule: "7 7 * * *" } });
    expect(odd).toMatchObject({ trigger: "schedule", schedulePreset: "custom", kind: "custom" });
    expect(formFromSource(source, { ...def, defaults: { ...config, schedule: "" } }).trigger).toBe("manual");
  });

  it("labels the marker's fields", () => {
    expect(markerRows({ kind: "http", http_method: "GET", http_url: "http://x" })).toEqual([
      { k: "Method", v: "GET" },
      { k: "URL", v: "http://x" },
    ]);
    expect(markerRows({ kind: "email", email_to: "a@b.c", email_subject: "Hi", email_text: "Yo" })).toHaveLength(3);
    expect(markerRows({ kind: "dispatch", dispatch_target: "x" })).toEqual([{ k: "Starts", v: "x" }]);
    expect(markerRows({ kind: "custom" })).toEqual([]);
  });
});

describe("helpers", () => {
  it("compacts Go durations", () => {
    expect(compactDuration("1m0s")).toBe("1m");
    expect(compactDuration("5m0s")).toBe("5m");
    expect(compactDuration("1h0m0s")).toBe("1h");
    expect(compactDuration("1h30m0s")).toBe("1h30m");
    expect(compactDuration("30s")).toBe("30s");
    expect(compactDuration("0s")).toBe("0s");
    expect(compactDuration("weird")).toBe("weird");
  });

  it("renders the custom worker template for the name", () => {
    const t = workerTemplate("NightlyReport");
    expect(t).toContain("package nightlyreport");
    expect(t).toContain('const Name = "nightly_report"');
    expect(t).toContain("internal/app/job_nightly_report.go");
    expect(workerTemplate("")).toContain("package myjob");
  });
});
