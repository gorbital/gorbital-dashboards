"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, FileCode2, Play, RotateCw, Sparkles } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@gorbital/dash/components/input";
import { MonacoEditor } from "@gorbital/dash/components/monaco";
import { Segmented } from "@gorbital/dash/components/pill";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Tabs, TabPanel } from "@gorbital/dash/components/tabs";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { applyJob, keys, planJob, useAppAction, waitForJobDefinition } from "@/lib/api/queries";
import type { GeneratorResponse, JobDefinition, JobGeneratorResult } from "@/lib/api/types";
import { ATTEMPT_PRESETS, INTERVAL_PRESETS, KINDS, SCHEDULE_PRESETS, TIMEOUT_PRESETS, defaultJobForm, formSchedule, jobNames, toCommand, toGeneratorInput, validateJobForm, workerTemplate, type JobForm } from "@/lib/jobs/form";
import { describeSchedule } from "@/lib/jobs/schedule";
import { CopyButton, PlanView } from "./plan-diff";

type Stage =
  | { kind: "idle" }
  | { kind: "planning" }
  | { kind: "planned"; response: GeneratorResponse }
  | { kind: "applying"; response: GeneratorResponse }
  | { kind: "applied"; response: GeneratorResponse }
  | { kind: "waiting"; response: GeneratorResponse }
  | { kind: "done"; response: GeneratorResponse; definition: JobDefinition };

type Tab = "form" | "cli" | "code";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The form to start from (Duplicate as new); the defaults otherwise. */
  initial?: JobForm;
  /** The definitions, for the name check and the dispatch target list. */
  definitions: JobDefinition[];
  /** Called with the definition's name once the restarted app registers it. */
  onCreated: (name: string) => void;
};

const flagField: Record<string, keyof JobForm> = { url: "url", body: "body", sql: "sql", to: "to", subject: "subject", text: "text", dispatch: "dispatch", method: "method", schedule: "schedule", every: "every", timeout: "timeout", "max-attempts": "maxAttempts", queue: "queue", priority: "priority", kind: "kind", description: "description", name: "name" };

function isDirtyError(err: unknown) {
  return err instanceof ApiError && /uncommitted|allow-dirty|allow_dirty/i.test(err.detail);
}

/** New job three ways: the form (plan → diff → apply → restart), the `orb gen job` command, and the custom kind's code. */
export function NewJobSheet({ open, onClose, initial, definitions, onCreated }: Props) {
  const qc = useQueryClient();
  const restart = useAppAction("restart");
  const [tab, setTab] = useState<Tab>("form");
  const [form, setForm] = useState<JobForm>(() => initial ?? defaultJobForm());
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<unknown>();
  const [allowDirty, setAllowDirty] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initial ?? defaultJobForm());
    setTouched(false);
    setStage({ kind: "idle" });
    setError(undefined);
    setTab("form");
  }, [open, initial]);

  useEffect(() => () => abort.current?.abort(), []);

  const existing = useMemo(() => definitions.map((d) => d.name), [definitions]);
  const errors = useMemo(() => validateJobForm(form, existing), [form, existing]);
  const valid = Object.keys(errors).length === 0;
  const names = jobNames(form.name || "MyJob");
  const set = <K extends keyof JobForm>(key: K, value: JobForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Editing after a preview means the plan is stale.
    setStage((s) => (s.kind === "planned" ? { kind: "idle" } : s));
  };

  // The portal's usage error, mapped to a field when it names a flag.
  const serverField = useMemo(() => {
    if (!(error instanceof ApiError)) return undefined;
    const m = /^--([a-z-]+)/.exec(error.detail);
    return m ? flagField[m[1]] : undefined;
  }, [error]);
  const fieldError = (key: keyof JobForm) => (touched ? errors[key] : undefined) ?? (serverField === key ? (error as ApiError).detail : undefined);

  const preview = useCallback(async () => {
    setTouched(true);
    if (!valid) return;
    setStage({ kind: "planning" });
    setError(undefined);
    try {
      const response = await planJob(toGeneratorInput(form));
      setStage({ kind: "planned", response });
    } catch (err) {
      setError(err);
      setStage({ kind: "idle" });
    }
  }, [form, valid]);

  const apply = useCallback(async () => {
    if (stage.kind !== "planned") return;
    setStage({ kind: "applying", response: stage.response });
    setError(undefined);
    try {
      const response = await applyJob(toGeneratorInput(form), allowDirty);
      setStage({ kind: "applied", response });
      toast.success(`Wrote ${response.plan.changes.length} files for ${names.name}`, { description: "Restart the app to register the job." });
    } catch (err) {
      setError(err);
      setStage({ kind: "planned", response: stage.response });
    }
  }, [stage, form, allowDirty, names.name]);

  const restartAndWait = useCallback(async () => {
    if (stage.kind !== "applied") return;
    const response = stage.response;
    const defName = (response.plan.result as JobGeneratorResult | undefined)?.definition ?? names.name;
    setStage({ kind: "waiting", response });
    restart.mutate();
    abort.current?.abort();
    abort.current = new AbortController();
    // Give the restart a moment to take the old app down, so a stale answer isn't mistaken for the new one.
    await new Promise((r) => setTimeout(r, 2500));
    const definition = await waitForJobDefinition(defName, 120_000, abort.current.signal);
    void qc.invalidateQueries({ queryKey: ["ops", "jobs"] });
    void qc.invalidateQueries({ queryKey: keys.jobSources });
    if (definition) {
      setStage({ kind: "done", response, definition });
      toast.success(`${definition.name} is registered`, { description: describeSchedule(definition.config.schedule) });
      onCreated(definition.name);
    } else {
      setStage({ kind: "applied", response });
      setError(new Error(`The app restarted but ${defName} isn't in /ops/jobs/definitions yet. Check the build output on the Overview page, then try again.`));
    }
  }, [stage, names.name, restart, qc, onCreated]);

  const busy = stage.kind === "planning" || stage.kind === "applying" || stage.kind === "waiting";
  const plan = stage.kind === "idle" || stage.kind === "planning" ? undefined : stage.response.plan;
  const command = toCommand(form) + (allowDirty ? " --allow-dirty" : "");
  const expectedFiles = plan?.changes.map((c) => c.path) ?? [`internal/jobs/${names.pkg}/${names.pkg}.go`, `internal/jobs/${names.pkg}/${names.pkg}_test.go`, `internal/app/job_${names.name}.go`, "internal/app/jobs.go"];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && !busy && onClose()}
      title="New job"
      meta={names.name ? `/ops/jobs/definitions/${names.name}` : undefined}
      description="Ordinary Go through orb gen job: reviewed, tested and deployed like the hand-written ones."
      width="lg"
      footer={
        tab === "form" ? (
          <>
            {(stage.kind === "idle" || stage.kind === "planning" || stage.kind === "planned" || stage.kind === "applying") && (
              <label className="mr-auto flex items-center gap-2 text-[11.5px] text-muted">
                <Checkbox checked={allowDirty} onCheckedChange={(v) => setAllowDirty(v === true)} aria-label="Allow uncommitted changes" />
                allow uncommitted changes
                <span className="font-mono text-[10.5px] text-dim">--allow-dirty</span>
              </label>
            )}
            {(stage.kind === "idle" || stage.kind === "planning" || stage.kind === "planned" || stage.kind === "applying") && (
              <>
                <Button size="sm" kind={stage.kind === "planned" ? "ghost" : "secondary"} icon={<Eye size={11} />} onClick={() => void preview()} disabled={busy || (touched && !valid)} loading={stage.kind === "planning"}>
                  {stage.kind === "planned" ? "Preview again" : "Preview"}
                </Button>
                <Button size="sm" kind="primary" icon={<Sparkles size={11} />} onClick={() => void apply()} disabled={stage.kind !== "planned" && stage.kind !== "applying"} loading={stage.kind === "applying"}>
                  Create
                </Button>
              </>
            )}
            {(stage.kind === "applied" || stage.kind === "waiting") && (
              <>
                <span className="mr-auto text-[11.5px] text-muted">{stage.kind === "waiting" ? "Rebuilding and waiting for the job to register…" : "Files written. The app must restart for the job to exist."}</span>
                <Button size="sm" kind="ghost" onClick={onClose} disabled={busy}>
                  Later
                </Button>
                <Button size="sm" kind="primary" icon={<RotateCw size={11} />} onClick={() => void restartAndWait()} loading={stage.kind === "waiting"}>
                  Restart the app
                </Button>
              </>
            )}
            {stage.kind === "done" && (
              <>
                <span className="mr-auto text-[11.5px] text-ok">{stage.definition.name} is registered and {stage.definition.config.enabled ? "enabled" : "disabled"}.</span>
                <Button size="sm" kind="primary" onClick={onClose}>
                  Open {stage.definition.name}
                </Button>
              </>
            )}
          </>
        ) : (
          <Button size="sm" kind="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <Tabs<Tab>
        tabs={[
          { value: "form", label: "Form" },
          { value: "cli", label: "CLI" },
          { value: "code", label: "Code" },
        ]}
        value={tab}
        onChange={setTab}
      >
        <TabPanel value="form">
          <div className="grid min-w-0 gap-4">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
              <Field label="Name" htmlFor="nj-name" hint={form.name.trim() ? `${names.ident} · ${names.name} · package ${names.pkg}` : "CleanupSessions, cleanup-sessions or cleanup_sessions"} error={fieldError("name")}>
                <Input id="nj-name" mono value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="PingHealth" autoFocus disabled={stage.kind === "applied" || stage.kind === "waiting" || stage.kind === "done"} />
              </Field>
              <Field label="Description" htmlFor="nj-description" hint="One line; the default is “<Name> job.”" error={fieldError("description")}>
                <Input id="nj-description" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Pings the health endpoint." />
              </Field>
            </div>

            <div className="grid gap-2">
              <Field label="Trigger" hint={<span>{describeSchedule(formSchedule(form))}{formSchedule(form) ? <span className="ml-2 font-mono text-dim">{formSchedule(form)} · UTC</span> : null}</span>}>
                <Segmented<JobForm["trigger"]>
                  options={[
                    { value: "schedule", label: "Schedule" },
                    { value: "interval", label: "Interval" },
                    { value: "manual", label: "On demand" },
                  ]}
                  value={form.trigger}
                  onChange={(v) => set("trigger", v)}
                />
              </Field>
              {form.trigger === "schedule" && (
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    aria-label="Schedule preset"
                    value={form.schedulePreset}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, schedulePreset: v, schedule: v === "custom" ? f.schedule : v }));
                      setStage((s) => (s.kind === "planned" ? { kind: "idle" } : s));
                    }}
                  >
                    {SCHEDULE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                  <Field label="" htmlFor="nj-schedule" error={fieldError("schedule")} className="-mt-1">
                    <Input id="nj-schedule" mono value={form.schedule} onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value, schedulePreset: SCHEDULE_PRESETS.some((p) => p.value === e.target.value) ? e.target.value : "custom" }))} placeholder="0 3 * * *  or  @daily" aria-label="Cron expression" />
                  </Field>
                </div>
              )}
              {form.trigger === "interval" && (
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    aria-label="Interval preset"
                    value={form.everyPreset}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, everyPreset: v, every: v === "custom" ? f.every : v }));
                      setStage((s) => (s.kind === "planned" ? { kind: "idle" } : s));
                    }}
                  >
                    {INTERVAL_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                  <Field label="" htmlFor="nj-every" error={fieldError("every")} className="-mt-1">
                    <Input id="nj-every" mono value={form.every} onChange={(e) => setForm((f) => ({ ...f, every: e.target.value, everyPreset: INTERVAL_PRESETS.some((p) => p.value === e.target.value) ? e.target.value : "custom" }))} placeholder="15m" aria-label="Interval" />
                  </Field>
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Field label="Timeout" htmlFor="nj-timeout" hint="1s to 24h" error={fieldError("timeout")}>
                <Input id="nj-timeout" mono list="nj-timeouts" value={form.timeout} onChange={(e) => set("timeout", e.target.value)} />
                <datalist id="nj-timeouts">
                  {TIMEOUT_PRESETS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Field>
              <Field label="Attempts" htmlFor="nj-attempts" hint="before giving up" error={fieldError("maxAttempts")}>
                <Input id="nj-attempts" mono inputMode="numeric" list="nj-attempt-presets" value={form.maxAttempts} onChange={(e) => set("maxAttempts", e.target.value)} />
                <datalist id="nj-attempt-presets">
                  {ATTEMPT_PRESETS.map((t) => (
                    <option key={t} value={String(t)} />
                  ))}
                </datalist>
              </Field>
              <Field label="Queue" htmlFor="nj-queue" hint="a queue a worker runs" error={fieldError("queue")}>
                <Input id="nj-queue" mono value={form.queue} onChange={(e) => set("queue", e.target.value)} />
              </Field>
              <Field label="Priority" htmlFor="nj-priority" hint="1 highest, 4 lowest" error={fieldError("priority")}>
                <Input id="nj-priority" mono inputMode="numeric" value={form.priority} onChange={(e) => set("priority", e.target.value)} />
              </Field>
            </div>

            <Field label="Enabled from the start" htmlFor="nj-enabled" inline hint={form.enabled ? "Runs on its schedule as soon as the app restarts." : "Registered disabled; enable it in the list when ready."}>
              <Switch id="nj-enabled" checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
            </Field>

            <div className="grid gap-2 rounded-lg border border-hairline bg-bg/40 p-3">
              <Field label="What the job does" htmlFor="nj-kind" hint={KINDS.find((k) => k.value === form.kind)?.hint} error={fieldError("kind")}>
                <Select id="nj-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as JobForm["kind"])}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {form.kind === "custom" && (
                <div className="text-[11.5px] text-muted">
                  The generator writes a <span className="font-mono text-text">Work</span> method that logs a line; you write the rest in <span className="font-mono text-text">internal/jobs/{names.pkg}/{names.pkg}.go</span>. The Code tab shows the file.
                </div>
              )}
              {form.kind === "http" && (
                <>
                  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                    <Field label="Method" htmlFor="nj-method" error={fieldError("method")}>
                      <Select id="nj-method" value={form.method} onChange={(e) => set("method", e.target.value)}>
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="URL" htmlFor="nj-url" hint="http or https; the answer must be 2xx" error={fieldError("url")}>
                      <Input id="nj-url" mono value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com/hook" />
                    </Field>
                  </div>
                  <Field label="JSON body" htmlFor="nj-body" hint="optional; sent as application/json" error={fieldError("body")}>
                    <Textarea id="nj-body" mono rows={3} value={form.body} onChange={(e) => set("body", e.target.value)} placeholder='{"ping": true}' />
                  </Field>
                </>
              )}
              {form.kind === "sql" && (
                <Field label="Statement" hint="one statement on the app's pool, no parameters" error={fieldError("sql")}>
                  <div className="h-[160px] overflow-hidden rounded-lg border border-border">
                    <MonacoEditor value={form.sql} onChange={(v) => set("sql", v)} language="pgsql" placeholder="DELETE FROM drafts WHERE updated_at < now() - interval '30 days'" className="h-full" />
                  </div>
                </Field>
              )}
              {form.kind === "email" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="To" htmlFor="nj-to" error={fieldError("to")}>
                      <Input id="nj-to" mono value={form.to} onChange={(e) => set("to", e.target.value)} placeholder="ops@example.com" />
                    </Field>
                    <Field label="Subject" htmlFor="nj-subject" error={fieldError("subject")}>
                      <Input id="nj-subject" value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Weekly digest" />
                    </Field>
                  </div>
                  <Field label="Text" htmlFor="nj-text" hint="through the app's mailer; suppressions and mail.* settings apply" error={fieldError("text")}>
                    <Textarea id="nj-text" rows={3} value={form.text} onChange={(e) => set("text", e.target.value)} placeholder="All is well." />
                  </Field>
                </>
              )}
              {form.kind === "dispatch" && (
                <Field label="Starts" htmlFor="nj-dispatch" hint="as POST /ops/jobs/definitions/{name}/run does" error={fieldError("dispatch")}>
                  <Select id="nj-dispatch" value={form.dispatch} onChange={(e) => set("dispatch", e.target.value)}>
                    <option value="">Pick a job…</option>
                    {definitions.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>

            {error !== undefined && (
              <div className="grid gap-1.5">
                <div className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-[12px]">
                  {error instanceof ApiError && <span className="mr-2 font-mono text-[10.5px] uppercase tracking-wider text-danger">{error.status} {error.code}</span>}
                  <span className="font-mono text-[11.5px] text-text">{errorMessage(error)}</span>
                </div>
                {isDirtyError(error) && (
                  <div className="flex items-start gap-1.5 text-[11.5px] text-warn">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> The app&apos;s git tree has uncommitted changes. Commit them, or tick &ldquo;allow uncommitted changes&rdquo; and create again.
                  </div>
                )}
              </div>
            )}

            {plan && (
              <div className="grid min-w-0 gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{stage.kind === "planned" ? "Preview" : "Written"}</span>
                  {stage.kind === "planned" && <Badge tone="muted">nothing written yet</Badge>}
                </div>
                <PlanView plan={plan} applied={stage.kind !== "planned" && stage.kind !== "applying"} />
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel value="cli">
          <div className="grid gap-3">
            <div className="text-[12px] text-muted">The same job from a terminal in the app&apos;s directory. Flags left at their defaults are omitted; the form on the other tab is the source.</div>
            <Code className="whitespace-pre-wrap break-all text-text">{command}</Code>
            <div className="flex items-center gap-2">
              <CopyButton text={command} label="Copy command" kind="primary" />
              <span className="text-[11px] text-dim">
                <span className="font-mono">--dry-run</span> shows the files without writing; <span className="font-mono">--json</span> prints the result for scripts.
              </span>
            </div>
            {!valid && touched && <div className="text-[11.5px] text-warn">The form has problems; the command reflects it as typed.</div>}
          </div>
        </TabPanel>

        <TabPanel value="code">
          <div className="grid gap-3">
            <div className="text-[12px] text-muted">
              Every job is Go. The <span className="font-mono text-text">custom</span> kind writes the skeleton below with a <span className="font-mono text-text">Work</span> method to fill in; the other kinds write a <span className="font-mono text-text">Work</span> that already does the request, statement, message or dispatch, with its values as constants at the top. Edit any generated worker and it becomes a custom job: the form never overwrites it.
            </div>
            <div className="grid gap-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{plan ? "Files in the plan" : "Files the generator will write"}</div>
              {expectedFiles.map((f, i) => (
                <div key={f} className="flex items-center gap-2 font-mono text-[11.5px]">
                  <FileCode2 size={11} className={i === 0 ? "text-primary" : "text-dim"} />
                  <span className={i === 0 ? "text-text" : "text-muted"}>{f}</span>
                  {i === 0 && <Badge tone="accent">open this one</Badge>}
                  {f === "internal/app/jobs.go" && <span className="text-[10.5px] text-dim">one line after //orb:anchor jobs</span>}
                </div>
              ))}
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                  {plan?.changes[0]?.kind === "create" ? plan.changes[0].path : `internal/jobs/${names.pkg}/${names.pkg}.go`} · {plan ? "as planned" : "the custom template"}
                </div>
                <CopyButton text={plan?.changes[0]?.content ?? workerTemplate(form.name)} label="Copy Go" />
              </div>
              <div className="h-[360px] overflow-hidden rounded-lg border border-border">
                <MonacoEditor value={plan?.changes[0]?.content ?? workerTemplate(form.name)} onChange={() => undefined} language="go" readOnly className="h-full" />
              </div>
            </div>
            {!plan && (
              <Button size="sm" kind="secondary" icon={<Play size={11} />} onClick={() => setTab("form")}>
                Set the name and preview to see the real files
              </Button>
            )}
          </div>
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
