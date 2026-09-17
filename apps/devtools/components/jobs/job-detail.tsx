"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, ExternalLink, FileCode2, Pencil, Play, RotateCcw, ScrollText, Square } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Field, Input, Switch, Textarea } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Tabs, TabPanel } from "@gorbital/dash/components/tabs";
import type { Tone } from "@gorbital/dash/theme";
import { errorMessage, needsReason } from "@/lib/api/errors";
import { useDevLogs, useJobRuns, useRunAction, useRunJob } from "@/lib/api/queries";
import { shortDuration } from "@/lib/api/setting-value";
import type { DevLog, JobDefinition, JobRun, JobSource, UpdateJobDefinitionBody } from "@/lib/api/types";
import { markerRows, type JobForm } from "@/lib/jobs/form";
import { describeSchedule, hasPlainSchedule } from "@/lib/jobs/schedule";
import { ago, between, clock } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { CopyButton } from "./plan-diff";

export const stateTone: Record<string, Tone> = { completed: "ok", running: "info", available: "accent", scheduled: "muted", pending: "muted", retryable: "warn", discarded: "danger", cancelled: "muted" };
export const canRetry = (s: string) => ["retryable", "discarded", "cancelled"].includes(s);
export const canCancel = (s: string) => ["available", "scheduled", "pending", "running", "retryable"].includes(s);

export type DetailTab = "overview" | "runs" | "config";

/** How a job came to be: made with the form and untouched, ejected (edited since), or written by hand. */
export function SourceBadge({ source }: { source?: JobSource }) {
  if (!source) return null;
  if (source.generated && !source.ejected) return <Badge tone="accent">Made with the form</Badge>;
  if (source.ejected) return <Badge tone="warn">Ejected: edit in code</Badge>;
  return <Badge tone="muted">Custom (code)</Badge>;
}

export const kindLabel: Record<string, string> = { custom: "custom", http: "HTTP request", sql: "SQL", email: "email", dispatch: "dispatch" };

type Props = {
  name: string | null;
  open: boolean;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  onClose: () => void;
  definitions: JobDefinition[];
  /** The definitions haven't answered yet, so an unknown name may just be early. */
  loading?: boolean;
  sources?: JobSource[];
  consoleAvailable: boolean;
  onToggle: (d: JobDefinition) => void;
  onReset: (d: JobDefinition) => void;
  onDuplicate: (form: JobForm) => void;
  makeForm: (source: JobSource, def: JobDefinition) => JobForm;
  saving: boolean;
  onSave: (name: string, body: UpdateJobDefinitionBody, done: (err: unknown) => void) => void;
};

/** One job: what it is and where it lives, its runs with their logs, and its configuration. */
export function JobDetailSheet({ name, open, tab, onTab, onClose, definitions, loading, sources, consoleAvailable, onToggle, onReset, onDuplicate, makeForm, saving, onSave }: Props) {
  const def = definitions.find((d) => d.name === name);
  const source = sources?.find((s) => s.name === name);
  const now = useNow(5000);
  const runJob = useRunJob();
  if (!def) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={name ?? "Job"} width="lg">
        {!open ? null : loading ? <div className="p-4 font-mono text-[11px] text-dim">loading…</div> : <Empty title="Unknown job" hint="No definition with that name. If you just created it, the app may still be restarting." />}
      </Sheet>
    );
  }
  const schedule = def.config.schedule;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={def.name}
      meta={`v${def.version}`}
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <span>{def.description}</span>
        </span>
      }
      width="lg"
      flush
    >
      <div className="px-5 pt-3">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Badge tone={def.config.enabled ? "ok" : "muted"}>{def.config.enabled ? "enabled" : "disabled"}</Badge>
          <SourceBadge source={source} />
          {source && <Badge tone="muted">{kindLabel[source.kind] ?? source.kind}</Badge>}
          {def.modified && <Badge tone="accent">modified</Badge>}
          {def.invalid_override && <Badge tone="danger">invalid override</Badge>}
          <span className="ml-auto flex gap-1">
            <Button size="sm" kind="primary" icon={<Play size={11} />} onClick={() => runJob.mutate(def.name)} disabled={!def.config.enabled} loading={runJob.isPending}>
              Run now
            </Button>
            {source?.generated && !source.ejected && (
              <Button size="sm" kind="secondary" icon={<Copy size={11} />} onClick={() => onDuplicate(makeForm(source, def))}>
                Duplicate as new
              </Button>
            )}
          </span>
        </div>
        <Tabs<DetailTab>
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "runs", label: "Runs" },
            { value: "config", label: "Configure" },
          ]}
          value={tab}
          onChange={onTab}
        >
          <TabPanel value="overview" className="pb-5">
            <div className="grid gap-4">
              <KeyList
                rows={[
                  { k: "Schedule", v: <span>{describeSchedule(schedule)}{schedule && hasPlainSchedule(schedule) ? <span className="ml-2 text-dim">{schedule} · UTC</span> : null}</span> },
                  { k: "Next run", v: def.config.enabled && def.next_run_at ? `${ago(def.next_run_at, now)} · ${clock(def.next_run_at, false)}` : def.config.enabled ? "on demand" : "disabled" },
                  { k: "Last run", v: def.last_run ? <span className="flex items-center gap-1.5"><Badge tone={stateTone[def.last_run.state] ?? "muted"}>{def.last_run.state}</Badge><span>{ago(def.last_run.finalized_at ?? def.last_run.attempted_at ?? def.last_run.created_at, now)} · run #{def.last_run.id}</span></span> : "never" },
                  { k: "Timeout", v: shortDuration(def.config.timeout) },
                  { k: "Attempts", v: String(def.config.max_attempts) },
                  { k: "Queue", v: `${def.config.queue} · priority ${def.config.priority}` },
                  { k: "Active", v: <span className="flex items-center gap-2"><Switch checked={def.config.enabled} onCheckedChange={() => onToggle(def)} aria-label={`${def.config.enabled ? "Disable" : "Enable"} ${def.name}`} /><span className="text-dim">{def.config.enabled ? "on its schedule and Run now" : "schedule stopped, Run now refused"}</span></span> },
                ]}
              />
              {source ? (
                <Panel title={source.generated && !source.ejected ? "Made with the form" : source.ejected ? "Ejected: edit in code" : "Custom (code)"} meta={source.generated && !source.ejected ? `kind ${source.kind} · read from the //orb:job marker` : source.ejected ? "the worker no longer matches the marker" : "no marker: written by hand"}>
                  <div className="grid gap-3">
                    {source.generated && !source.ejected && source.form && (
                      <div className="grid gap-2">
                        {markerRows(source.form).length === 0 ? (
                          <div className="text-[11.5px] text-muted">A custom job made with the form: its Work method is yours to write in the worker file below.</div>
                        ) : (
                          markerRows(source.form).map((r) => (
                            <div key={r.k} className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 text-[12px]">
                              <span className="text-dim">{r.k}</span>
                              {r.code ? <Code className="whitespace-pre-wrap break-all text-text">{r.v}</Code> : <span className="break-all font-mono text-text">{r.v}</span>}
                            </div>
                          ))
                        )}
                        <div className="text-[11px] text-dim">These values are constants in the worker. To change them, duplicate as a new job or edit the file: an edit ejects the job and the form never overwrites it.</div>
                      </div>
                    )}
                    {source.ejected && <div className="text-[11.5px] text-muted">The worker was edited after the form wrote it, so it is a custom job now: the form doesn&apos;t offer to change or overwrite it. Its marker still records the kind it started as{source.form?.kind ? ` (${source.form.kind})` : ""}.</div>}
                    {!source.generated && <div className="text-[11.5px] text-muted">Written by hand, with no <span className="font-mono">//orb:job</span> marker. The files below are where it lives.</div>}
                    <div className="grid gap-1">
                      {[
                        { label: "worker", path: source.worker },
                        { label: "definition", path: source.definition },
                      ].map((f) => (
                        <div key={f.path} className="flex items-center gap-2 font-mono text-[11.5px]">
                          <FileCode2 size={11} className="text-dim" />
                          <span className="w-[68px] text-dim">{f.label}</span>
                          <span className="min-w-0 flex-1 truncate text-text">{f.path}</span>
                          <CopyButton text={f.path} label="Copy path" />
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
              ) : (
                <div className="text-[11px] text-dim">The portal hasn&apos;t said where this job lives in code (GET /_portal/api/jobs).</div>
              )}
              <Panel title="Defaults" meta="declared in code">
                <KeyList
                  rows={[
                    { k: "Schedule", v: def.defaults.schedule ? `${describeSchedule(def.defaults.schedule)} (${def.defaults.schedule})` : "on demand" },
                    { k: "Timeout", v: def.defaults.timeout },
                    { k: "Attempts", v: String(def.defaults.max_attempts) },
                    { k: "Queue", v: `${def.defaults.queue} · priority ${def.defaults.priority}` },
                    { k: "Last change", v: def.updated_at ? `${clock(def.updated_at, false)} by ${def.updated_by ?? "—"}` : "never" },
                  ]}
                />
                <div className="mt-3 flex gap-1.5">
                  <Button size="sm" kind="ghost" icon={<Pencil size={11} />} onClick={() => onTab("config")}>
                    Edit configuration
                  </Button>
                  <Button size="sm" kind="ghost" icon={<RotateCcw size={11} />} onClick={() => onReset(def)} disabled={!def.modified}>
                    Reset to defaults
                  </Button>
                </div>
              </Panel>
            </div>
          </TabPanel>
          <TabPanel value="runs" className="pb-5">
            <RunHistory def={def} consoleAvailable={consoleAvailable} />
          </TabPanel>
          <TabPanel value="config" className="pb-5">
            <JobConfigForm def={def} saving={saving} onSave={(body, done) => onSave(def.name, body, done)} onCancel={() => onTab("overview")} />
          </TabPanel>
        </Tabs>
      </div>
    </Sheet>
  );
}

/* ---------- Runs ---------- */

function RunHistory({ def, consoleAvailable }: { def: JobDefinition; consoleAvailable: boolean }) {
  const now = useNow(5000);
  const runs = useJobRuns({ kind: def.name, limit: 25 }, true);
  const logs = useDevLogs(consoleAvailable);
  const retry = useRunAction("retry");
  const cancel = useRunAction("cancel");
  const [openRun, setOpenRun] = useState<number | null>(null);
  const rows = useMemo(() => runs.data?.pages.flatMap((p) => p.jobs ?? []) ?? [], [runs.data]);
  const logsByJob = useMemo(() => {
    const m = new Map<string, DevLog[]>();
    for (const l of logs.data?.logs ?? []) {
      const id = l.attrs.find((a) => a.key === "job_id")?.value;
      if (id) m.set(id, [...(m.get(id) ?? []), l]);
    }
    return m;
  }, [logs.data]);
  if (runs.isPending) return <div className="p-4 font-mono text-[11px] text-dim">loading…</div>;
  if (rows.length === 0) return <Empty title="No runs yet" hint={def.config.enabled ? "Run now enqueues one; scheduled runs appear here as they happen." : "The job is disabled."} />;
  return (
    <div className="grid gap-1.5">
      <div className="font-mono text-[10.5px] text-dim">
        {rows.length} runs, newest first · <span className="text-muted">arguments are never shown by the ops API</span>
      </div>
      <ul className="grid gap-1">
        {rows.map((r) => {
          const last = r.errors?.at(-1);
          const isOpen = openRun === r.id;
          const runLogs = logsByJob.get(String(r.id)) ?? [];
          return (
            <li key={r.id} className="rounded-lg border border-hairline bg-bg/40">
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-elevated/40" onClick={() => setOpenRun(isOpen ? null : r.id)} aria-expanded={isOpen}>
                <ChevronDown size={12} className={`shrink-0 text-dim transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                <span className="font-mono text-dim tnum">#{r.id}</span>
                <Badge tone={stateTone[r.state] ?? "muted"}>{r.state}</Badge>
                <span className="font-mono text-[11px] text-dim tnum">
                  {r.attempt}/{r.max_attempts}
                </span>
                <span className="font-mono text-[11px] text-dim">{r.queue}</span>
                <span className="ml-auto font-mono text-[11px] text-dim tnum">{ago(r.finalized_at ?? r.attempted_at ?? r.scheduled_at, now)}</span>
                <span className="w-[56px] text-right font-mono text-[11px] text-dim tnum">{between(r.attempted_at, r.finalized_at)}</span>
              </button>
              {last && !isOpen && (
                <div className="truncate px-3 pb-2 pl-9 font-mono text-[11px] text-danger" title={last.message}>
                  {last.message}
                </div>
              )}
              {isOpen && <RunDetail run={r} logs={runLogs} consoleAvailable={consoleAvailable} logsLoaded={Boolean(logs.data)} onRetry={() => retry.mutate(r.id)} onCancel={() => cancel.mutate(r.id)} retrying={retry.isPending && retry.variables === r.id} cancelling={cancel.isPending && cancel.variables === r.id} />}
            </li>
          );
        })}
      </ul>
      {runs.hasNextPage && (
        <div className="flex justify-center pt-1">
          <Button size="sm" kind="ghost" icon={<ChevronDown size={11} />} onClick={() => void runs.fetchNextPage()} loading={runs.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function RunDetail({ run, logs, consoleAvailable, logsLoaded, onRetry, onCancel, retrying, cancelling }: { run: JobRun; logs: DevLog[]; consoleAvailable: boolean; logsLoaded: boolean; onRetry: () => void; onCancel: () => void; retrying: boolean; cancelling: boolean }) {
  return (
    <div className="grid gap-3 border-t border-hairline px-3 py-2.5">
      <KeyList
        rows={[
          { k: "Created", v: clock(run.created_at) },
          { k: "Scheduled", v: clock(run.scheduled_at) },
          { k: "Attempted", v: run.attempted_at ? clock(run.attempted_at) : "—" },
          { k: "Finalized", v: run.finalized_at ? `${clock(run.finalized_at)} · took ${between(run.attempted_at, run.finalized_at)}` : "—" },
          { k: "Priority", v: String(run.priority) },
          { k: "Enqueued by", v: run.actor_kind ? `${run.actor_kind}${run.actor_id ? ` ${run.actor_id}` : ""}` : "the scheduler" },
          ...(run.request_id ? [{ k: "Request", v: <a className="text-primary hover:underline" href={`/logs?request_id=${encodeURIComponent(run.request_id)}`}>{run.request_id}</a> }] : []),
        ]}
      />
      <div className="grid gap-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Arguments</div>
        <Code className="whitespace-pre-wrap text-dim">
          {"{}"}
          <span className="ml-2 text-[10.5px]">— the ops API never returns a run&apos;s arguments (they may hold personal data); the worker declares them in its Args type</span>
        </Code>
      </div>
      {run.errors && run.errors.length > 0 && (
        <div className="grid gap-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Errors</div>
          {run.errors.map((e, i) => (
            <div key={i} className="rounded-lg border border-danger/30 bg-danger/8 px-2.5 py-1.5 font-mono text-[11px]">
              <span className="mr-2 text-dim tnum">attempt {e.attempt} · {clock(e.at)}</span>
              <span className="text-danger">{e.message}</span>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-1">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          <ScrollText size={11} /> Logs
          <span className="normal-case tracking-normal">records with job_id={run.id}</span>
          <a className="ml-auto flex items-center gap-1 normal-case tracking-normal text-primary hover:underline" href={`/logs?q=${encodeURIComponent(`job_id=${run.id}`)}`}>
            open in Logs <ExternalLink size={10} />
          </a>
        </div>
        {!consoleAvailable ? (
          <div className="text-[11px] text-dim">The app serves no dev console, so per-run logs aren&apos;t available here.</div>
        ) : !logsLoaded ? (
          <div className="font-mono text-[11px] text-dim">loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-[11px] text-dim">No record carries this run&apos;s job_id among the console&apos;s recent logs. Generated workers log one line per run; failures carry job_id and job_kind.</div>
        ) : (
          <Code className="max-h-[200px] overflow-auto">
            {logs.map((l, i) => (
              <div key={i}>
                <span className="text-dim">{clock(l.time)}</span> <span className={l.level.startsWith("ERROR") ? "text-danger" : l.level.startsWith("WARN") ? "text-warn" : "text-info"}>{l.level}</span> <span className="text-text">{l.message}</span>{" "}
                <span className="text-dim">{l.attrs.map((a) => `${a.key}=${a.value}`).join(" ")}</span>
              </div>
            ))}
          </Code>
        )}
      </div>
      <div className="flex justify-end gap-1">
        {canRetry(run.state) && (
          <Button size="sm" kind="secondary" icon={<RotateCcw size={11} />} onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        )}
        {canCancel(run.state) && (
          <Button size="sm" kind="ghost" icon={<Square size={11} />} onClick={onCancel} loading={cancelling}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- The configuration form (schedule, timeout, attempts, queue, priority, with a reason) ---------- */

type ConfigForm = { schedule: string; timeout: string; max_attempts: string; queue: string; priority: string; reason: string };

export function JobConfigForm({ def, saving, onSave, onCancel }: { def: JobDefinition; saving: boolean; onSave: (body: UpdateJobDefinitionBody, done: (err: unknown) => void) => void; onCancel: () => void }) {
  const [form, setForm] = useState<ConfigForm>({ schedule: "", timeout: "", max_attempts: "", queue: "", priority: "", reason: "" });
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setForm({ schedule: def.config.schedule, timeout: def.config.timeout, max_attempts: String(def.config.max_attempts), queue: def.config.queue, priority: String(def.config.priority), reason: "" });
    setError(undefined);
  }, [def]);
  const c = def.config;
  const changed: UpdateJobDefinitionBody = { version: def.version };
  if (form.schedule !== c.schedule) changed.schedule = form.schedule;
  if (form.timeout !== c.timeout) changed.timeout = form.timeout;
  if (Number(form.max_attempts) !== c.max_attempts && /^\d+$/.test(form.max_attempts)) changed.max_attempts = Number(form.max_attempts);
  if (form.queue !== c.queue && form.queue.trim()) changed.queue = form.queue.trim();
  if (Number(form.priority) !== c.priority && /^\d+$/.test(form.priority)) changed.priority = Number(form.priority);
  const dirty = Object.keys(changed).length > 1;
  const risky = (changed.schedule !== undefined && c.enabled) || changed.timeout !== undefined || changed.max_attempts !== undefined || changed.queue !== undefined;
  const needReason = risky && form.reason.trim() === "";
  return (
    <div className="grid gap-4">
      <Field label="Schedule" htmlFor="job-schedule" hint={<span>{describeSchedule(form.schedule)} · 5-field cron in UTC, @every 10m, or empty for on demand</span>}>
        <Input id="job-schedule" mono value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="on demand" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Timeout" htmlFor="job-timeout" hint="Go duration">
          <Input id="job-timeout" mono value={form.timeout} onChange={(e) => setForm({ ...form, timeout: e.target.value })} />
        </Field>
        <Field label="Max attempts" htmlFor="job-attempts" hint="1 – 25">
          <Input id="job-attempts" mono inputMode="numeric" value={form.max_attempts} onChange={(e) => setForm({ ...form, max_attempts: e.target.value })} />
        </Field>
        <Field label="Priority" htmlFor="job-priority" hint="1 is highest">
          <Input id="job-priority" mono inputMode="numeric" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
        </Field>
      </div>
      <Field label="Queue" htmlFor="job-queue">
        <Input id="job-queue" mono value={form.queue} onChange={(e) => setForm({ ...form, queue: e.target.value })} />
      </Field>
      <Field label={risky ? "Reason · required" : "Reason · optional"} htmlFor="job-reason" hint={risky ? "Rescheduling or changing the timeout, attempts or queue can stop the job doing its work; say why." : "Recorded in the definition's history."} error={error}>
        <Textarea id="job-reason" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="why this change" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" kind="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          kind="primary"
          disabled={!dirty || needReason}
          loading={saving}
          onClick={() => {
            setError(undefined);
            onSave({ ...changed, reason: form.reason.trim() || undefined }, (err) => {
              if (err) setError(needsReason(err) ? "This change needs a reason." : errorMessage(err));
            });
          }}
        >
          Save as v{def.version + 1}
        </Button>
      </div>
    </div>
  );
}
