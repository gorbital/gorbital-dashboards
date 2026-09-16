"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Pause, Pencil, Play, RefreshCw, RotateCcw, Square } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Dropdown } from "@gorbital/dash/components/dropdown";
import { Field, Input, Select, Textarea } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table } from "@gorbital/dash/components/table";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { toast } from "@gorbital/dash/components/toast";
import { fmtInt } from "@gorbital/dash/lib/format";
import type { Tone } from "@gorbital/dash/theme";
import { errorMessage, isVersionConflict, needsReason } from "@/lib/api/errors";
import { useCapabilities, useJobDefinitions, useJobRuns, useJobsOverview, useQueueAction, useQueues, useResetJobDefinition, useRunAction, useRunJob, useScheduledJobs, useUpdateJobDefinition, type JobRunFilter } from "@/lib/api/queries";
import { shortDuration } from "@/lib/api/setting-value";
import type { JobDefinition, JobRun, Queue, UpdateJobDefinitionBody } from "@/lib/api/types";
import { ago, between, clock } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { ReasonDialog } from "@/components/shared/reason-dialog";

const stateTone: Record<string, Tone> = { completed: "ok", running: "info", available: "accent", scheduled: "muted", pending: "muted", retryable: "warn", discarded: "danger", cancelled: "muted" };
const canRetry = (s: string) => ["retryable", "discarded", "cancelled"].includes(s);
const canCancel = (s: string) => ["available", "scheduled", "pending", "running", "retryable"].includes(s);

export function Jobs() {
  const caps = useCapabilities();
  const enabled = caps.ops && caps.database;
  const now = useNow(5000);
  const definitions = useJobDefinitions(enabled);
  const overview = useJobsOverview(enabled);
  const scheduled = useScheduledJobs(enabled);
  const queues = useQueues(enabled);
  const [runFilter, setRunFilter] = useState<JobRunFilter>({});
  const runs = useJobRuns(runFilter, enabled);
  const runJob = useRunJob();
  const update = useUpdateJobDefinition();
  const reset = useResetJobDefinition();
  const retry = useRunAction("retry");
  const cancel = useRunAction("cancel");
  const pause = useQueueAction("pause");
  const resume = useQueueAction("resume");

  const [editing, setEditing] = useState<string | null>(null);
  const onParam = useCallback((v: string | null) => setEditing(v), []);
  const [disabling, setDisabling] = useState<JobDefinition | null>(null);
  const [resetting, setResetting] = useState<JobDefinition | null>(null);
  const [pausing, setPausing] = useState<Queue | null>(null);

  const defs = useMemo(() => definitions.data ?? [], [definitions.data]);
  const editingDef = defs.find((d) => d.name === editing);
  const runRows = useMemo(() => runs.data?.pages.flatMap((p) => p.jobs ?? []) ?? [], [runs.data]);
  const q = overview.data?.queues ?? [];
  const sum = (k: "running" | "retryable" | "scheduled" | "available" | "discarded_last_day") => q.reduce((a, x) => a + x[k], 0);

  const openEdit = (name: string | null) => {
    setEditing(name);
    setQueryParam("job", name);
  };

  const toggle = (d: JobDefinition) => {
    if (d.config.enabled) return setDisabling(d);
    update.mutate({ name: d.name, body: { enabled: true, version: d.version } }, { onError: (err) => afterError(err, () => void definitions.refetch()) });
  };

  const afterError = (err: unknown, refetch: () => void) => {
    if (isVersionConflict(err)) {
      toast.warning("Changed underneath you", { description: "The definition moved on; it has been reloaded. Try again." });
      refetch();
    } else if (needsReason(err)) {
      toast.warning("This change needs a reason", { description: errorMessage(err) });
    } else toast.error("Couldn't save", { description: errorMessage(err) });
  };

  if (caps.status.data && !caps.database) {
    return (
      <>
        <PageHeader product="devtools" title="Jobs" description="background jobs on River, from the ops API" />
        <Page>
          <Empty title="This app has no jobs (Minimal preset)" hint="Jobs need PostgreSQL; the Full preset, or orb add jobs, brings River and the /ops/jobs endpoints." />
        </Page>
      </>
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="job" onValue={onParam} />
      </Suspense>
      <PageHeader product="devtools" title="Jobs" description={definitions.data ? `${defs.length} definitions · ${queues.data?.length ?? 0} queues · /ops/jobs` : "background jobs on River, from the ops API"}>
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void Promise.all([definitions.refetch(), overview.refetch(), runs.refetch(), queues.refetch(), scheduled.refetch()])} loading={definitions.isFetching}>
          Refresh
        </Button>
      </PageHeader>
      <Page>
        <Gate need="ops" loading={<Table<JobDefinition> columns={[]} rows={[]} rowKey={(d) => d.name} loading />}>
          {definitions.error && !definitions.data ? (
            <ProblemPanel error={definitions.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/jobs/definitions" onRetry={() => void definitions.refetch()} retrying={definitions.isFetching} />
          ) : (
            <>
              <TileGrid cols={5}>
                <Tile label="Definitions" value={definitions.data ? String(defs.length) : "—"} unit="registered" hero loading={definitions.isPending} footer={definitions.data ? `${defs.filter((d) => !d.config.enabled).length} disabled · ${defs.filter((d) => d.modified).length} modified` : undefined} />
                <Tile label="Running" value={overview.data ? fmtInt(sum("running")) : "—"} loading={overview.isPending} footer={overview.data ? `${fmtInt(sum("available") + sum("scheduled"))} queued or scheduled` : undefined} />
                <Tile label="Retrying" value={overview.data ? fmtInt(sum("retryable")) : "—"} loading={overview.isPending} deltaTone={sum("retryable") > 0 ? "bad" : "flat"} footer="waiting for their next attempt" />
                <Tile label="Discarded" value={overview.data ? fmtInt(sum("discarded_last_day")) : "—"} unit="24 h" loading={overview.isPending} deltaTone={sum("discarded_last_day") > 0 ? "bad" : "flat"} footer="ran out of attempts" />
                <Tile label="Failing" value={overview.data ? String(overview.data.failing?.length ?? 0) : "—"} unit="definitions" loading={overview.isPending} footer={overview.data?.failing?.length ? overview.data.failing.map((d) => d.name).join(", ") : "last runs all finished"} />
              </TileGrid>
              <Panel title="Definitions" meta="effective config; a reason is recorded with every risky change" flush>
                <Table<JobDefinition>
                  rows={defs}
                  rowKey={(d) => d.name}
                  loading={definitions.isPending}
                  dense
                  selected={editing ?? undefined}
                  columns={[
                    {
                      key: "n",
                      header: "Job",
                      cell: (d) => (
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-mono text-[12px] text-text">
                            <Dot tone={!d.config.enabled ? "muted" : d.last_run?.state === "discarded" ? "danger" : d.last_run?.state === "retryable" ? "warn" : "ok"} />
                            {d.name}
                            {d.modified && <Badge tone="accent">modified</Badge>}
                            {d.invalid_override && <Badge tone="danger">invalid override</Badge>}
                          </div>
                          <div className="mt-0.5 max-w-[360px] truncate text-[11px] text-dim">{d.description}</div>
                        </div>
                      ),
                    },
                    { key: "s", header: "Schedule", width: "120px", cell: (d) => <span className="font-mono text-muted">{d.config.schedule || <span className="text-faint">on demand</span>}</span> },
                    { key: "e", header: "Enabled", width: "70px", cell: (d) => <Badge tone={d.config.enabled ? "ok" : "muted"}>{d.config.enabled ? "on" : "off"}</Badge> },
                    {
                      key: "c",
                      header: "Timeout · attempts · queue",
                      width: "190px",
                      cell: (d) => (
                        <span className="font-mono text-dim">
                          {shortDuration(d.config.timeout)} · {d.config.max_attempts} · {d.config.queue}
                        </span>
                      ),
                    },
                    { key: "x", header: "Next run", width: "90px", cell: (d) => <span className="font-mono text-dim tnum">{d.config.enabled ? ago(d.next_run_at, now) : "—"}</span> },
                    {
                      key: "l",
                      header: "Last run",
                      width: "130px",
                      cell: (d) =>
                        d.last_run ? (
                          <span className="flex items-center gap-1.5">
                            <Badge tone={stateTone[d.last_run.state] ?? "muted"}>{d.last_run.state}</Badge>
                            <span className="font-mono text-[11px] text-dim tnum">{ago(d.last_run.finalized_at ?? d.last_run.attempted_at ?? d.last_run.created_at, now)}</span>
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-faint">never</span>
                        ),
                    },
                    {
                      key: "act",
                      header: "",
                      width: "130px",
                      align: "right",
                      cell: (d) => (
                        <span className="flex justify-end gap-1">
                          <Button size="sm" kind="primary" icon={<Play size={11} />} onClick={() => runJob.mutate(d.name)} disabled={!d.config.enabled} loading={runJob.isPending && runJob.variables === d.name}>
                            Run now
                          </Button>
                          <Dropdown
                            trigger={
                              <Button size="sm" kind="ghost" className="px-1.5" aria-label={`More for ${d.name}`}>
                                <ChevronDown size={12} />
                              </Button>
                            }
                            items={[
                              { label: "Edit schedule, timeout, attempts…", icon: <Pencil size={12} />, onSelect: () => openEdit(d.name) },
                              { label: d.config.enabled ? "Disable" : "Enable", icon: d.config.enabled ? <Square size={12} /> : <Play size={12} />, onSelect: () => toggle(d), danger: d.config.enabled },
                              "separator",
                              { label: "Reset to code defaults", icon: <RotateCcw size={12} />, onSelect: () => setResetting(d), disabled: !d.modified },
                            ]}
                          />
                        </span>
                      ),
                    },
                  ]}
                  empty={<Empty title="No job definitions" hint="The app registers no jobs." />}
                />
              </Panel>
              <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-3">
                <Panel
                  title="Runs"
                  meta="newest first · /ops/jobs/runs"
                  actions={
                    <>
                      <Select value={runFilter.kind ?? ""} onChange={(e) => setRunFilter({ ...runFilter, kind: e.target.value || undefined })} className="w-[160px]" aria-label="Job kind">
                        <option value="">Any job</option>
                        {defs.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                      <Select value={runFilter.state ?? ""} onChange={(e) => setRunFilter({ ...runFilter, state: e.target.value || undefined })} className="w-[150px]" aria-label="Run state">
                        <option value="">Any state</option>
                        {["running", "available", "scheduled", "retryable", "completed", "discarded", "cancelled", "pending"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </>
                  }
                  flush
                >
                  <Table<JobRun>
                    rows={runRows}
                    rowKey={(r) => String(r.id)}
                    loading={runs.isPending}
                    dense
                    columns={[
                      { key: "id", header: "#", width: "70px", cell: (r) => <span className="font-mono text-dim tnum">{r.id}</span> },
                      { key: "k", header: "Job", cell: (r) => <span className="font-mono text-text">{r.kind}</span> },
                      { key: "s", header: "State", width: "100px", cell: (r) => <Badge tone={stateTone[r.state] ?? "muted"}>{r.state}</Badge> },
                      { key: "a", header: "Attempt", width: "80px", cell: (r) => <span className="font-mono text-dim tnum">{r.attempt}/{r.max_attempts}</span> },
                      { key: "q", header: "Queue", width: "90px", cell: (r) => <span className="font-mono text-dim">{r.queue}</span> },
                      { key: "t", header: "When", width: "90px", cell: (r) => <span className="font-mono text-dim tnum">{ago(r.finalized_at ?? r.attempted_at ?? r.scheduled_at, now)}</span> },
                      { key: "d", header: "Took", width: "70px", align: "right", cell: (r) => <span className="font-mono text-dim tnum">{between(r.attempted_at, r.finalized_at)}</span> },
                      {
                        key: "e",
                        header: "Last error",
                        cell: (r) => {
                          const last = r.errors?.at(-1);
                          return last ? (
                            <span className="block max-w-[260px] truncate font-mono text-[11px] text-danger" title={last.message}>
                              {last.message}
                            </span>
                          ) : null;
                        },
                      },
                      {
                        key: "act",
                        header: "",
                        width: "120px",
                        align: "right",
                        cell: (r) => (
                          <span className="flex justify-end gap-1">
                            {canRetry(r.state) && (
                              <Button size="sm" kind="ghost" icon={<RotateCcw size={11} />} onClick={() => retry.mutate(r.id)} loading={retry.isPending && retry.variables === r.id}>
                                Retry
                              </Button>
                            )}
                            {canCancel(r.state) && (
                              <Button size="sm" kind="ghost" icon={<Square size={11} />} onClick={() => cancel.mutate(r.id)} loading={cancel.isPending && cancel.variables === r.id}>
                                Cancel
                              </Button>
                            )}
                          </span>
                        ),
                      },
                    ]}
                    empty={<Empty title="No runs" hint={runFilter.kind || runFilter.state ? "Nothing matches these filters." : "Nothing has run yet; Run now enqueues one."} />}
                  />
                  {runs.hasNextPage && (
                    <div className="flex justify-center border-t border-hairline p-2">
                      <Button size="sm" kind="ghost" icon={<ChevronDown size={11} />} onClick={() => void runs.fetchNextPage()} loading={runs.isFetchingNextPage}>
                        Load more
                      </Button>
                    </div>
                  )}
                </Panel>
                <div className="flex flex-col gap-3">
                  <Panel title="Queues" meta="pausing stops every job in it" flush>
                    {queues.isPending ? (
                      <div className="p-4 font-mono text-[11px] text-dim">loading…</div>
                    ) : (queues.data ?? []).length === 0 ? (
                      <Empty title="No active queues" hint="No worker runs yet." />
                    ) : (
                      <ul>
                        {(queues.data ?? []).map((qu) => {
                          const ov = q.find((x) => x.name === qu.name);
                          return (
                            <li key={qu.name} className="flex items-center gap-2 border-t border-hairline px-4 py-2.5 first:border-0">
                              <Dot tone={qu.paused ? "warn" : "ok"} pulse={!qu.paused && (ov?.running ?? 0) > 0} />
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-[12px] text-text">{qu.name}</div>
                                <div className="font-mono text-[10.5px] text-dim">{qu.paused ? `paused ${ago(qu.paused_at, now)}` : ov ? `${ov.running} running · ${ov.available + ov.scheduled} waiting · ${ov.retryable} retrying` : "active"}</div>
                              </div>
                              {qu.paused ? (
                                <Button size="sm" kind="secondary" icon={<Play size={11} />} onClick={() => resume.mutate({ name: qu.name })} loading={resume.isPending && resume.variables?.name === qu.name}>
                                  Resume
                                </Button>
                              ) : (
                                <Button size="sm" kind="ghost" icon={<Pause size={11} />} onClick={() => setPausing(qu)}>
                                  Pause
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Panel>
                  <Panel title="Scheduled" meta="soonest first · /ops/jobs/scheduled" flush>
                    {scheduled.isPending ? (
                      <div className="p-4 font-mono text-[11px] text-dim">loading…</div>
                    ) : (scheduled.data ?? []).length === 0 ? (
                      <Empty title="Nothing scheduled" hint="Every job is on demand or disabled." />
                    ) : (
                      <ul>
                        {(scheduled.data ?? []).map((d) => (
                          <li key={d.name} className="flex items-center gap-2 border-t border-hairline px-4 py-2 first:border-0 text-[12px]">
                            <span className="font-mono text-text">{d.name}</span>
                            <span className="font-mono text-[11px] text-dim">{d.config.schedule}</span>
                            <span className="ml-auto font-mono text-[11px] text-muted tnum">{ago(d.next_run_at, now)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </div>
              </div>
            </>
          )}
        </Gate>
      </Page>
      <EditSheet def={editingDef} open={Boolean(editing)} onClose={() => openEdit(null)} saving={update.isPending} onSave={(body, done) => update.mutate({ name: editingDef!.name, body }, { onSuccess: () => openEdit(null), onError: (err) => { afterError(err, () => void definitions.refetch()); done(err); } })} />
      <ReasonDialog
        open={Boolean(disabling)}
        onOpenChange={(o) => !o && setDisabling(null)}
        title={`Disable ${disabling?.name}?`}
        description="The job stops running on its schedule and Run now refuses it until it's enabled again."
        confirmLabel="Disable"
        danger
        loading={update.isPending}
        onConfirm={(reason) => disabling && update.mutate({ name: disabling.name, body: { enabled: false, version: disabling.version, reason } }, { onSettled: () => setDisabling(null), onError: (err) => afterError(err, () => void definitions.refetch()) })}
      />
      <ReasonDialog
        open={Boolean(resetting)}
        onOpenChange={(o) => !o && setResetting(null)}
        title={`Reset ${resetting?.name} to its defaults?`}
        description={resetting ? `Back to ${resetting.defaults.schedule || "on demand"} · ${shortDuration(resetting.defaults.timeout)} · ${resetting.defaults.max_attempts} attempts · ${resetting.defaults.queue}, as declared in code. Undoing a schedule, timeout, attempts or queue change counts as a risky change, so the app asks why.` : undefined}
        confirmLabel="Reset"
        loading={reset.isPending}
        onConfirm={(reason) => resetting && reset.mutate({ name: resetting.name, body: { version: resetting.version, reason: reason || undefined } }, { onSettled: () => setResetting(null), onError: (err) => afterError(err, () => void definitions.refetch()) })}
      />
      <ReasonDialog
        open={Boolean(pausing)}
        onOpenChange={(o) => !o && setPausing(null)}
        title={`Pause queue ${pausing?.name}?`}
        description="Every instance stops fetching from it; jobs in it, email delivery included, wait until it resumes."
        confirmLabel="Pause"
        danger
        loading={pause.isPending}
        onConfirm={(reason) => pausing && pause.mutate({ name: pausing.name, reason }, { onSettled: () => setPausing(null) })}
      />
    </>
  );
}

/* ---------- The edit form ---------- */

type Form = { schedule: string; timeout: string; max_attempts: string; queue: string; priority: string; reason: string };

function EditSheet({ def, open, onClose, saving, onSave }: { def?: JobDefinition; open: boolean; onClose: () => void; saving: boolean; onSave: (body: UpdateJobDefinitionBody, done: (err: unknown) => void) => void }) {
  const [form, setForm] = useState<Form>({ schedule: "", timeout: "", max_attempts: "", queue: "", priority: "", reason: "" });
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (def) setForm({ schedule: def.config.schedule, timeout: def.config.timeout, max_attempts: String(def.config.max_attempts), queue: def.config.queue, priority: String(def.config.priority), reason: "" });
    setError(undefined);
  }, [def, open]);
  if (!def) return <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Job">{open ? <Empty title="Unknown job" hint="No definition with that name." /> : null}</Sheet>;
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
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={def.name}
      meta={`v${def.version}`}
      description={def.description}
      footer={
        <>
          <Button size="sm" kind="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            kind="primary"
            disabled={!dirty || needReason}
            loading={saving}
            onClick={() => {
              setError(undefined);
              onSave({ ...changed, reason: form.reason.trim() || undefined }, (err) => setError(needsReason(err) ? "This change needs a reason." : errorMessage(err)));
            }}
          >
            Save as v{def.version + 1}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Schedule" htmlFor="job-schedule" hint="5-field cron in UTC, @every 10m, or empty for on demand">
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
        <Panel title="Defaults" meta="declared in code">
          <KeyList
            rows={[
              { k: "Schedule", v: def.defaults.schedule || "on demand" },
              { k: "Timeout", v: def.defaults.timeout },
              { k: "Attempts", v: String(def.defaults.max_attempts) },
              { k: "Queue", v: def.defaults.queue },
              { k: "Priority", v: String(def.defaults.priority) },
              { k: "Last change", v: def.updated_at ? `${clock(def.updated_at, false)} by ${def.updated_by ?? "—"}` : "never" },
            ]}
          />
        </Panel>
      </div>
    </Sheet>
  );
}
