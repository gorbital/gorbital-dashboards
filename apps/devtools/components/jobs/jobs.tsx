"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { ChevronDown, Copy, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, Square } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Dropdown } from "@gorbital/dash/components/dropdown";
import { Select, Switch } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Table } from "@gorbital/dash/components/table";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { toast } from "@gorbital/dash/components/toast";
import { fmtInt } from "@gorbital/dash/lib/format";
import { errorMessage, isVersionConflict, needsReason } from "@/lib/api/errors";
import { useCapabilities, useJobDefinitions, useJobRuns, useJobSources, useJobsOverview, useQueueAction, useQueues, useResetJobDefinition, useRunAction, useRunJob, useScheduledJobs, useUpdateJobDefinition, type JobRunFilter } from "@/lib/api/queries";
import { shortDuration } from "@/lib/api/setting-value";
import type { JobDefinition, JobRun, Queue } from "@/lib/api/types";
import { formFromSource, type JobForm } from "@/lib/jobs/form";
import { describeSchedule, hasPlainSchedule } from "@/lib/jobs/schedule";
import { ago, between, clock } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { canCancel, canRetry, JobDetailSheet, kindLabel, stateTone, type DetailTab } from "./job-detail";
import { NewJobSheet } from "./new-job-sheet";

const HOUR = 3_600_000;

export function Jobs() {
  const caps = useCapabilities();
  const enabled = caps.ops && caps.database;
  const now = useNow(5000);
  const definitions = useJobDefinitions(enabled);
  const sources = useJobSources(Boolean(caps.status.data));
  const overview = useJobsOverview(enabled);
  const scheduled = useScheduledJobs(enabled);
  const queues = useQueues(enabled);
  const [runFilter, setRunFilter] = useState<JobRunFilter>({});
  const runs = useJobRuns(runFilter, enabled);
  // For the queues' throughput: the last completed runs, whatever the filter above.
  const completed = useJobRuns({ state: "completed", limit: 100 }, enabled);
  const runJob = useRunJob();
  const update = useUpdateJobDefinition();
  const reset = useResetJobDefinition();
  const retry = useRunAction("retry");
  const cancel = useRunAction("cancel");
  const pause = useQueueAction("pause");
  const resume = useQueueAction("resume");

  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const onParam = useCallback((v: string | null) => setSelected(v), []);
  const [creating, setCreating] = useState(false);
  const [initialForm, setInitialForm] = useState<JobForm | undefined>();
  // `/jobs?new=1` (the ⌘K palette) opens the New job sheet once.
  const onNewParam = useCallback((v: string | null) => {
    if (v) {
      setInitialForm(undefined);
      setCreating(true);
      setQueryParam("new", null);
    }
  }, []);
  const [disabling, setDisabling] = useState<JobDefinition | null>(null);
  const [resetting, setResetting] = useState<JobDefinition | null>(null);
  const [pausing, setPausing] = useState<Queue | null>(null);

  const defs = useMemo(() => definitions.data ?? [], [definitions.data]);
  const runRows = useMemo(() => runs.data?.pages.flatMap((p) => p.jobs ?? []) ?? [], [runs.data]);
  const completedRows = useMemo(() => completed.data?.pages.flatMap((p) => p.jobs ?? []) ?? [], [completed.data]);
  const q = overview.data?.queues ?? [];
  const sum = (k: "running" | "retryable" | "scheduled" | "available" | "discarded_last_day") => q.reduce((a, x) => a + x[k], 0);
  const sourceOf = (name: string) => sources.data?.find((s) => s.name === name);

  const openDetail = (name: string | null, tab: DetailTab = "overview") => {
    setDetailTab(tab);
    setSelected(name);
    setQueryParam("job", name);
  };

  const openNew = (form?: JobForm) => {
    setInitialForm(form);
    setCreating(true);
  };

  const afterError = (err: unknown, refetch: () => void) => {
    if (isVersionConflict(err)) {
      toast.warning("Changed underneath you", { description: "The definition moved on; it has been reloaded. Try again." });
      refetch();
    } else if (needsReason(err)) {
      toast.warning("This change needs a reason", { description: errorMessage(err) });
    } else toast.error("Couldn't save", { description: errorMessage(err) });
  };

  const toggle = (d: JobDefinition) => {
    if (d.config.enabled) return setDisabling(d);
    update.mutate({ name: d.name, body: { enabled: true, version: d.version } }, { onError: (err) => afterError(err, () => void definitions.refetch()) });
  };

  const refreshAll = () => void Promise.all([definitions.refetch(), sources.refetch(), overview.refetch(), runs.refetch(), completed.refetch(), queues.refetch(), scheduled.refetch()]);

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

  const generated = sources.data?.filter((s) => s.generated && !s.ejected).length ?? 0;
  const ejected = sources.data?.filter((s) => s.ejected).length ?? 0;

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="job" onValue={onParam} />
        <QueryParam name="new" onValue={onNewParam} />
      </Suspense>
      <PageHeader product="devtools" title="Jobs" description={definitions.data ? `${defs.length} definitions · ${queues.data?.length ?? 0} queues · /ops/jobs` : "background jobs on River, from the ops API"}>
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={refreshAll} loading={definitions.isFetching}>
          Refresh
        </Button>
        <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => openNew()} disabled={!caps.status.data}>
          New job
        </Button>
      </PageHeader>
      <Page>
        <Gate need="ops" loading={<Table<JobDefinition> columns={[]} rows={[]} rowKey={(d) => d.name} loading />}>
          {definitions.error && !definitions.data ? (
            <ProblemPanel error={definitions.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/jobs/definitions" onRetry={() => void definitions.refetch()} retrying={definitions.isFetching} />
          ) : (
            <>
              <TileGrid cols={5}>
                <Tile label="Definitions" value={definitions.data ? String(defs.length) : "—"} unit="registered" hero loading={definitions.isPending} footer={definitions.data ? `${defs.filter((d) => !d.config.enabled).length} disabled · ${generated} made with the form${ejected ? ` · ${ejected} ejected` : ""}` : undefined} />
                <Tile label="Running" value={overview.data ? fmtInt(sum("running")) : "—"} loading={overview.isPending} footer={overview.data ? `${fmtInt(sum("available") + sum("scheduled"))} queued or scheduled` : undefined} />
                <Tile label="Retrying" value={overview.data ? fmtInt(sum("retryable")) : "—"} loading={overview.isPending} deltaTone={sum("retryable") > 0 ? "bad" : "flat"} footer="waiting for their next attempt" />
                <Tile label="Discarded" value={overview.data ? fmtInt(sum("discarded_last_day")) : "—"} unit="24 h" loading={overview.isPending} deltaTone={sum("discarded_last_day") > 0 ? "bad" : "flat"} footer="ran out of attempts" />
                <Tile label="Failing" value={overview.data ? String(overview.data.failing?.length ?? 0) : "—"} unit="definitions" loading={overview.isPending} footer={overview.data?.failing?.length ? overview.data.failing.map((d) => d.name).join(", ") : "last runs all finished"} />
              </TileGrid>
              <Panel title="Definitions" meta="click a job for its runs, code and configuration · a reason is recorded with every risky change" flush>
                <Table<JobDefinition>
                  rows={defs}
                  rowKey={(d) => d.name}
                  loading={definitions.isPending}
                  dense
                  selected={selected ?? undefined}
                  onRowClick={(d) => openDetail(d.name)}
                  columns={[
                    {
                      key: "n",
                      header: "Job",
                      cell: (d) => {
                        const src = sourceOf(d.name);
                        return (
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-mono text-[12px] text-text">
                              <Dot tone={!d.config.enabled ? "muted" : d.last_run?.state === "discarded" ? "danger" : d.last_run?.state === "retryable" ? "warn" : "ok"} />
                              {d.name}
                              {src && src.generated && !src.ejected && <Badge tone="accent">form · {kindLabel[src.kind] ?? src.kind}</Badge>}
                              {src?.ejected && <Badge tone="warn">ejected</Badge>}
                              {d.modified && <Badge tone="accent">modified</Badge>}
                              {d.invalid_override && <Badge tone="danger">invalid override</Badge>}
                            </div>
                            <div className="mt-0.5 max-w-[360px] truncate text-[11px] text-dim">{d.description}</div>
                          </div>
                        );
                      },
                    },
                    {
                      key: "s",
                      header: "Schedule",
                      width: "200px",
                      cell: (d) => (
                        <div className="min-w-0">
                          <div className={`truncate text-[12px] ${d.config.schedule ? "text-text" : "text-faint"}`}>{describeSchedule(d.config.schedule)}</div>
                          {d.config.schedule && hasPlainSchedule(d.config.schedule) && <div className="font-mono text-[10.5px] text-dim">{d.config.schedule}</div>}
                        </div>
                      ),
                    },
                    {
                      key: "e",
                      header: "Active",
                      width: "60px",
                      cell: (d) => (
                        <span onClick={(e) => e.stopPropagation()}>
                          <Switch checked={d.config.enabled} onCheckedChange={() => toggle(d)} aria-label={`${d.config.enabled ? "Disable" : "Enable"} ${d.name}`} disabled={update.isPending && update.variables?.name === d.name} />
                        </span>
                      ),
                    },
                    {
                      key: "c",
                      header: "Timeout · attempts · queue",
                      width: "180px",
                      cell: (d) => (
                        <span className="font-mono text-dim">
                          {shortDuration(d.config.timeout)} · {d.config.max_attempts} · {d.config.queue}
                        </span>
                      ),
                    },
                    {
                      key: "l",
                      header: "Last run",
                      width: "150px",
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
                      key: "x",
                      header: "Next run",
                      width: "120px",
                      cell: (d) =>
                        d.config.enabled && d.next_run_at ? (
                          <span className="font-mono text-[11px] text-dim tnum" title={clock(d.next_run_at, false)}>
                            {ago(d.next_run_at, now)}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-faint">{d.config.enabled ? "on demand" : "—"}</span>
                        ),
                    },
                    {
                      key: "act",
                      header: "",
                      width: "130px",
                      align: "right",
                      cell: (d) => {
                        const src = sourceOf(d.name);
                        return (
                          <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
                                { label: "Edit schedule, timeout, attempts…", icon: <Pencil size={12} />, onSelect: () => openDetail(d.name, "config") },
                                { label: d.config.enabled ? "Disable" : "Enable", icon: d.config.enabled ? <Square size={12} /> : <Play size={12} />, onSelect: () => toggle(d), danger: d.config.enabled },
                                { label: "Duplicate as new job", icon: <Copy size={12} />, onSelect: () => src && openNew(formFromSource(src, d)), disabled: !src || !src.generated || src.ejected },
                                "separator",
                                { label: "Reset to code defaults", icon: <RotateCcw size={12} />, onSelect: () => setResetting(d), disabled: !d.modified },
                              ]}
                            />
                          </span>
                        );
                      },
                    },
                  ]}
                  empty={<Empty title="No job definitions" hint="The app registers no jobs. New job writes one through orb gen job." />}
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
                    onRowClick={(r) => openDetail(r.kind, "runs")}
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
                          <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
                  <Panel title="Queues" meta="depth from /ops/jobs/overview · throughput from the last completed runs" flush>
                    {queues.isPending ? (
                      <div className="p-4 font-mono text-[11px] text-dim">loading…</div>
                    ) : (queues.data ?? []).length === 0 ? (
                      <Empty title="No active queues" hint="No worker runs yet." />
                    ) : (
                      <ul>
                        {(queues.data ?? []).map((qu) => {
                          const ov = q.find((x) => x.name === qu.name);
                          const depth = ov ? ov.available + ov.scheduled + ov.retryable : undefined;
                          const mine = completedRows.filter((r) => r.queue === qu.name);
                          const lastHour = mine.filter((r) => r.finalized_at && now - Date.parse(r.finalized_at) < HOUR).length;
                          const oldest = mine.at(-1)?.finalized_at;
                          // Scale up when the loaded runs don't reach back an hour, so a busy queue isn't under-read.
                          const windowMs = oldest ? Math.min(HOUR, Math.max(60_000, now - Date.parse(oldest))) : HOUR;
                          const perHour = completed.data ? Math.round((lastHour * HOUR) / windowMs) : undefined;
                          return (
                            <li key={qu.name} className="flex items-center gap-2 border-t border-hairline px-4 py-2.5 first:border-0">
                              <Dot tone={qu.paused ? "warn" : "ok"} pulse={!qu.paused && (ov?.running ?? 0) > 0} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 font-mono text-[12px] text-text">
                                  {qu.name}
                                  {qu.paused && <Badge tone="warn">paused</Badge>}
                                </div>
                                <div className="font-mono text-[10.5px] text-dim">
                                  {qu.paused ? `paused ${ago(qu.paused_at, now)} · ` : ""}
                                  {ov ? `${ov.running} running · depth ${depth} · ${ov.retryable} retrying` : "active"}
                                </div>
                                <div className="font-mono text-[10.5px] text-dim">
                                  {perHour === undefined ? "throughput —" : `≈ ${fmtInt(perHour)} completed/h`}
                                  {ov?.discarded_last_day ? ` · ${ov.discarded_last_day} discarded 24 h` : ""}
                                </div>
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
                  <Panel title="Scheduled" meta="upcoming runs, soonest first · /ops/jobs/scheduled" flush>
                    {scheduled.isPending ? (
                      <div className="p-4 font-mono text-[11px] text-dim">loading…</div>
                    ) : (scheduled.data ?? []).length === 0 ? (
                      <Empty title="Nothing scheduled" hint="Every job is on demand or disabled." />
                    ) : (
                      <ul>
                        {(scheduled.data ?? []).map((d) => (
                          <li key={d.name} className="flex cursor-pointer items-center gap-2 border-t border-hairline px-4 py-2 text-[12px] first:border-0 hover:bg-elevated/40" onClick={() => openDetail(d.name)}>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-text">{d.name}</div>
                              <div className="truncate text-[11px] text-dim">
                                {describeSchedule(d.config.schedule)}
                                {hasPlainSchedule(d.config.schedule) && <span className="ml-1.5 font-mono text-faint">{d.config.schedule}</span>}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-[11px] text-muted tnum">{ago(d.next_run_at, now)}</div>
                              {d.next_run_at && <div className="font-mono text-[10.5px] text-faint tnum">{clock(d.next_run_at, false)}</div>}
                            </div>
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
      <JobDetailSheet
        name={selected}
        open={Boolean(selected)}
        tab={detailTab}
        onTab={setDetailTab}
        onClose={() => openDetail(null)}
        definitions={defs}
        loading={definitions.isPending}
        sources={sources.data}
        consoleAvailable={caps.console}
        onToggle={toggle}
        onReset={setResetting}
        onDuplicate={(form) => {
          openDetail(null);
          openNew(form);
        }}
        makeForm={formFromSource}
        saving={update.isPending}
        onSave={(name, body, done) =>
          update.mutate(
            { name, body },
            {
              onSuccess: () => {
                setDetailTab("overview");
                done(undefined);
              },
              onError: (err) => {
                afterError(err, () => void definitions.refetch());
                done(err);
              },
            },
          )
        }
      />
      <NewJobSheet
        open={creating}
        onClose={() => setCreating(false)}
        initial={initialForm}
        definitions={defs}
        onCreated={(name) => {
          setCreating(false);
          openDetail(name);
        }}
      />
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
        description={resetting ? `Back to ${resetting.defaults.schedule ? `${describeSchedule(resetting.defaults.schedule)} (${resetting.defaults.schedule})` : "on demand"} · ${shortDuration(resetting.defaults.timeout)} · ${resetting.defaults.max_attempts} attempts · ${resetting.defaults.queue}, as declared in code. Undoing a schedule, timeout, attempts or queue change counts as a risky change, so the app asks why.` : undefined}
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
