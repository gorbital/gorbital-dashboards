"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, NotConnectedError, apiFetch, portalInit, transportFetch } from "./client";
import { errorMessage } from "./errors";
import type {
  Accepted,
  AppAction,
  AuditEventPage,
  AuditFilter,
  AuditGroupBy,
  AuditStats,
  CurrentReleases,
  DevApp,
  DevLogList,
  DevMail,
  DevMigrations,
  DevRequestList,
  DevRouteList,
  GeneratorRequest,
  GeneratorResponse,
  JobDefinition,
  JobDefinitionList,
  JobGeneratorInput,
  JobRun,
  JobRunPage,
  JobsOverview,
  JobSource,
  JobSourceList,
  MailStatus,
  OpsSetting,
  OpsSettingHistory,
  OpsSettingList,
  OutputList,
  QueueList,
  Readiness,
  RemoveSuppressionBody,
  ResetSettingBody,
  SetSettingBody,
  Status,
  Suppression,
  SuppressionPage,
  SystemInfo,
  TestEmailBody,
  TestEmailResponse,
  UpdateJobDefinitionBody,
} from "./types";

export const keys = {
  status: ["portal", "status"] as const,
  output: (limit: number) => ["portal", "output", limit] as const,
  devApp: ["dev", "app"] as const,
  devRoutes: ["dev", "routes"] as const,
  devRequests: ["dev", "requests"] as const,
  devLogs: ["dev", "logs"] as const,
  devMigrations: ["dev", "migrations"] as const,
  devMail: ["dev", "mail"] as const,
  readiness: ["app", "readyz"] as const,
  settings: ["ops", "settings"] as const,
  settingHistory: (key: string) => ["ops", "settings", key, "history"] as const,
  jobDefinitions: ["ops", "jobs", "definitions"] as const,
  jobSources: ["portal", "jobs"] as const,
  jobsScheduled: ["ops", "jobs", "scheduled"] as const,
  jobsOverview: ["ops", "jobs", "overview"] as const,
  jobRuns: (filter: JobRunFilter) => ["ops", "jobs", "runs", filter] as const,
  queues: ["ops", "queues"] as const,
  audit: (filter: AuditFilter) => ["ops", "audit", filter] as const,
  auditStats: (groupBy: AuditGroupBy, filter: AuditFilter) => ["ops", "audit", "stats", groupBy, filter] as const,
  system: ["ops", "system"] as const,
  mail: ["ops", "mail"] as const,
  suppressions: ["ops", "mail", "suppressions"] as const,
  releasesCurrent: ["ops", "releases", "current"] as const,
};

/** Don't retry what won't change by itself: not connected, not signed in, or refused. */
export function retry(count: number, err: Error) {
  if (err instanceof NotConnectedError) return false;
  if (err instanceof ApiError && err.status < 500) return false;
  return count < 1;
}

/** Builds a query string from the defined, non-empty entries of `params`. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/* ---------- Portal ---------- */

/** The portal's status, every 5 s; state events patch `app` in between (see the provider). */
export function useStatus() {
  return useQuery({
    queryKey: keys.status,
    queryFn: () => apiFetch<Status>("/_portal/api/status"),
    refetchInterval: 5000,
    staleTime: 2000,
    retry,
  });
}

/**
 * What the status says the app can answer: the console (`/_dev/*`) and the
 * ops API (`/ops/*`, Full preset). Pages pass these as `enabled` flags.
 */
export function useCapabilities() {
  const status = useStatus();
  const app = status.data?.app;
  const project = status.data?.project;
  const running = app?.state === "running";
  const console = Boolean(running && app?.console);
  const ops = Boolean(running && project && (project.features.includes("ops") || project.preset === "full"));
  return { status, running, console, ops, database: Boolean(project?.database), consoleDeclared: app?.console };
}

/** The most recent output lines, oldest first. The live tail lives in the console store; this is for backfill. */
export function useOutput(limit = 200, enabled = true) {
  return useQuery({
    queryKey: keys.output(limit),
    queryFn: () => apiFetch<OutputList>(`/_portal/api/output?limit=${limit}`),
    enabled,
    retry,
  });
}

/** The app's `/readyz`, every 10 s while it runs. A 503 is a result, not an error. */
export function useReadiness(enabled: boolean) {
  return useQuery({
    queryKey: keys.readiness,
    queryFn: async (): Promise<Readiness> => {
      let res: Response;
      try {
        res = await transportFetch("/_portal/app/readyz", portalInit({ cache: "no-store" }));
      } catch (err) {
        throw new NotConnectedError(err);
      }
      if (res.status === 401) throw new ApiError({ status: 401, code: "unauthorized" });
      const body = (await res.text()).trim();
      return { ok: res.ok, status: res.status, body: body.length <= 200 ? body : undefined };
    },
    enabled,
    refetchInterval: 10_000,
    retry,
  });
}

const actionLabel: Record<AppAction, string> = { restart: "Restarting", stop: "Stopping", start: "Starting" };

/** Restart, stop or start the app. The portal answers 202 at once; the outcome arrives as state events. */
export function useAppAction(action: AppAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Accepted>(`/_portal/api/app/${action}`, { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData<Status>(keys.status, (old) => (old ? { ...old, app: data.app } : old));
      toast.success(`${actionLabel[action]} the app`, { description: `state: ${data.app.state}` });
    },
    onError: (err) => {
      toast.error(`Couldn't ${action} the app`, { description: errorMessage(err) });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.status }),
  });
}

/** `POST /_portal/api/app/migrate`: applies pending migrations without a restart. 409 for apps without a database. */
export function useMigrate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Accepted>("/_portal/api/app/migrate", { method: "POST" }),
    onSuccess: () => {
      toast.success("Applying pending migrations", { description: "orb dev runs the migrator; the console shows its output." });
    },
    onError: (err) => {
      toast.error("Couldn't apply migrations", { description: errorMessage(err) });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.status });
      // The migrator needs a moment; ask again once it has likely finished.
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: keys.devMigrations });
        void qc.invalidateQueries({ queryKey: keys.system });
      }, 2500);
    },
  });
}

/* ---------- Dev console (/_dev/*) ---------- */

/** `/_dev/app` through the proxy; only when the app runs and serves the console. */
export function useDevApp(enabled: boolean) {
  return useQuery({
    queryKey: keys.devApp,
    queryFn: () => apiFetch<DevApp>("/_portal/app/_dev/app"),
    enabled,
    staleTime: 30_000,
    retry,
  });
}

export function useDevRoutes(enabled: boolean) {
  return useQuery({
    queryKey: keys.devRoutes,
    queryFn: () => apiFetch<DevRouteList>("/_portal/app/_dev/routes"),
    enabled,
    staleTime: 30_000,
    retry,
  });
}

/** The 500 most recent requests, newest first. The Requests page adds the stream on top. */
export function useDevRequests(enabled: boolean) {
  return useQuery({
    queryKey: keys.devRequests,
    queryFn: () => apiFetch<DevRequestList>("/_portal/app/_dev/requests"),
    enabled,
    retry,
  });
}

/** The 1,000 most recent log records, newest first. */
export function useDevLogs(enabled: boolean) {
  return useQuery({
    queryKey: keys.devLogs,
    queryFn: () => apiFetch<DevLogList>("/_portal/app/_dev/logs"),
    enabled,
    retry,
  });
}

export function useDevMigrations(enabled: boolean) {
  return useQuery({
    queryKey: keys.devMigrations,
    queryFn: () => apiFetch<DevMigrations>("/_portal/app/_dev/migrations"),
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

/** Mailpit's inbox through the console; 503 `unavailable` while Mailpit is down. */
export function useDevMail(enabled: boolean) {
  return useQuery({
    queryKey: keys.devMail,
    queryFn: () => apiFetch<DevMail>("/_portal/app/_dev/mail"),
    enabled,
    refetchInterval: 10_000,
    retry,
  });
}

/* ---------- Ops: settings ---------- */

export function useSettings(enabled: boolean) {
  return useQuery({
    queryKey: keys.settings,
    queryFn: async () => {
      const list = await apiFetch<OpsSettingList>("/_portal/app/ops/settings");
      return list.settings ?? [];
    },
    enabled,
    retry,
  });
}

export function useSettingHistory(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.settingHistory(key ?? ""),
    queryFn: async () => {
      const h = await apiFetch<OpsSettingHistory>(`/_portal/app/ops/settings/${encodeURIComponent(key ?? "")}/history?limit=20`);
      return h.changes ?? [];
    },
    enabled: enabled && Boolean(key),
    retry,
  });
}

/** `PUT /ops/settings/{key}`; the page handles 422 `setting_reason_required` and 409 conflicts itself. */
export function useSetSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: SetSettingBody }) => apiFetch<OpsSetting>(`/_portal/app/ops/settings/${encodeURIComponent(key)}`, { method: "PUT", json: body }),
    onSuccess: (setting) => {
      qc.setQueryData<OpsSetting[]>(keys.settings, (old) => old?.map((s) => (s.key === setting.key ? setting : s)));
      void qc.invalidateQueries({ queryKey: keys.settingHistory(setting.key) });
      toast.success(`Saved ${setting.key}`, { description: `now v${setting.version}${setting.restart_pending ? " · restart required to apply" : ""}` });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.settings }),
  });
}

/** `DELETE /ops/settings/{key}`: back to the default declared in code. */
export function useResetSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: ResetSettingBody }) => apiFetch<OpsSetting>(`/_portal/app/ops/settings/${encodeURIComponent(key)}`, { method: "DELETE", json: body }),
    onSuccess: (setting) => {
      qc.setQueryData<OpsSetting[]>(keys.settings, (old) => old?.map((s) => (s.key === setting.key ? setting : s)));
      void qc.invalidateQueries({ queryKey: keys.settingHistory(setting.key) });
      toast.success(`Reset ${setting.key}`, { description: "back to the default declared in code" });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.settings }),
  });
}

/* ---------- Ops: jobs and queues ---------- */

export function useJobDefinitions(enabled: boolean) {
  return useQuery({
    queryKey: keys.jobDefinitions,
    queryFn: async () => (await apiFetch<JobDefinitionList>("/_portal/app/ops/jobs/definitions")).definitions ?? [],
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

export function useScheduledJobs(enabled: boolean) {
  return useQuery({
    queryKey: keys.jobsScheduled,
    queryFn: async () => (await apiFetch<JobDefinitionList>("/_portal/app/ops/jobs/scheduled")).definitions ?? [],
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

export function useJobsOverview(enabled: boolean) {
  return useQuery({
    queryKey: keys.jobsOverview,
    queryFn: () => apiFetch<JobsOverview>("/_portal/app/ops/jobs/overview"),
    enabled,
    refetchInterval: 10_000,
    retry,
  });
}

export type JobRunFilter = { kind?: string; queue?: string; state?: string; limit?: number };

/** Runs, newest first, a page at a time; `state` is comma-separated River states. */
export function useJobRuns(filter: JobRunFilter, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: keys.jobRuns(filter),
    queryFn: ({ pageParam }) => apiFetch<JobRunPage>(`/_portal/app/ops/jobs/runs${queryString({ ...filter, limit: filter.limit ?? 50, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled,
    refetchInterval: 10_000,
    retry,
  });
}

export function useQueues(enabled: boolean) {
  return useQuery({
    queryKey: keys.queues,
    queryFn: async () => (await apiFetch<QueueList>("/_portal/app/ops/queues")).queues ?? [],
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

/** `GET /_portal/api/jobs`: the app's jobs as they are in code (ADR-0071): files, kind, the marker's form, ejected. */
export function useJobSources(enabled: boolean) {
  return useQuery({
    queryKey: keys.jobSources,
    queryFn: async () => (await apiFetch<JobSourceList>("/_portal/api/jobs")).jobs ?? [],
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

/** `POST /_portal/api/generators/job/plan`: the files `orb gen job` would write, with `before` for the modified ones. 422 `generator_failed` carries the usage error. */
export function planJob(input: JobGeneratorInput): Promise<GeneratorResponse> {
  return apiFetch<GeneratorResponse>("/_portal/api/generators/job/plan", { method: "POST", json: { input } satisfies GeneratorRequest<JobGeneratorInput> });
}

/** `POST /_portal/api/generators/job/apply`: writes the plan; refused on a dirty git tree unless `allowDirty`. The app must restart for the job to exist. */
export function applyJob(input: JobGeneratorInput, allowDirty: boolean): Promise<GeneratorResponse> {
  return apiFetch<GeneratorResponse>("/_portal/api/generators/job/apply", { method: "POST", json: { input, allow_dirty: allowDirty || undefined } satisfies GeneratorRequest<JobGeneratorInput> });
}

/**
 * Asks `/ops/jobs/definitions` every 2 s until `name` is among them (the
 * restarted app registers it) or `timeoutMs` passes; answers the definition
 * or undefined. A refused or unanswered request (the app is still building)
 * is just another try.
 */
export async function waitForJobDefinition(name: string, timeoutMs = 120_000, signal?: AbortSignal): Promise<JobDefinition | undefined> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && !signal?.aborted) {
    try {
      const list = (await apiFetch<JobDefinitionList>("/_portal/app/ops/jobs/definitions")).definitions ?? [];
      const found = list.find((d) => d.name === name);
      if (found) return found;
    } catch {
      // The app is restarting; try again.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return undefined;
}

/** A source for a definition, by name; undefined while the sources haven't loaded or for a job the portal doesn't see in code. */
export function sourceFor(sources: JobSource[] | undefined, name: string): JobSource | undefined {
  return sources?.find((s) => s.name === name);
}

function invalidateJobs(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["ops", "jobs"] });
  void qc.invalidateQueries({ queryKey: keys.jobSources });
  void qc.invalidateQueries({ queryKey: keys.queues });
}

/** `POST /ops/jobs/definitions/{name}/run`; 429 `job_run_limited` within a minute of the last run. */
export function useRunJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch<JobRun>(`/_portal/app/ops/jobs/definitions/${encodeURIComponent(name)}/run`, { method: "POST" }),
    onSuccess: (run) => toast.success(`Queued ${run.kind}`, { description: `run #${run.id} on ${run.queue} · ${run.state}` }),
    onError: (err, name) => {
      if (err instanceof ApiError && err.code === "job_run_limited") toast.warning(`${name} ran less than a minute ago`, { description: err.detail || "Wait a minute, or for the queued run to finish." });
      else if (err instanceof ApiError && err.code === "job_definition_disabled") toast.warning(`${name} is disabled`, { description: "Enable it first." });
      else toast.error(`Couldn't run ${name}`, { description: errorMessage(err) });
    },
    onSettled: () => invalidateJobs(qc),
  });
}

/** `PUT /ops/jobs/definitions/{name}`; the page handles 422 `job_reason_required` and 409 conflicts. */
export function useUpdateJobDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, body }: { name: string; body: UpdateJobDefinitionBody }) => apiFetch<JobDefinition>(`/_portal/app/ops/jobs/definitions/${encodeURIComponent(name)}`, { method: "PUT", json: body }),
    onSuccess: (def) => {
      qc.setQueryData<JobDefinition[]>(keys.jobDefinitions, (old) => old?.map((d) => (d.name === def.name ? def : d)));
      toast.success(`Saved ${def.name}`, { description: `now v${def.version} · ${def.config.enabled ? "enabled" : "disabled"}` });
    },
    onSettled: () => invalidateJobs(qc),
  });
}

/** `DELETE /ops/jobs/definitions/{name}`: back to the code defaults. */
export function useResetJobDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, body }: { name: string; body: ResetSettingBody }) => apiFetch<JobDefinition>(`/_portal/app/ops/jobs/definitions/${encodeURIComponent(name)}`, { method: "DELETE", json: body }),
    onSuccess: (def) => toast.success(`Reset ${def.name}`, { description: "back to the defaults declared in code" }),
    onSettled: () => invalidateJobs(qc),
  });
}

export function useRunAction(action: "retry" | "cancel") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<JobRun>(`/_portal/app/ops/jobs/runs/${id}/${action}`, { method: "POST" }),
    onSuccess: (run) => toast.success(`${action === "retry" ? "Retrying" : "Cancelled"} run #${run.id}`, { description: `${run.kind} · ${run.state}` }),
    onError: (err, id) => toast.error(`Couldn't ${action} run #${id}`, { description: errorMessage(err) }),
    onSettled: () => invalidateJobs(qc),
  });
}

/** `POST /ops/queues/{name}/pause|resume`; pausing needs a reason (422 `job_reason_required` without one). */
export function useQueueAction(action: "pause" | "resume") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, reason }: { name: string; reason?: string }) => apiFetch<void>(`/_portal/app/ops/queues/${encodeURIComponent(name)}/${action}`, { method: "POST", json: reason ? { reason } : {} }),
    onSuccess: (_, { name }) => toast.success(`${action === "pause" ? "Paused" : "Resumed"} queue ${name}`, { description: action === "pause" ? "no instance fetches from it until it resumes" : "workers fetch from it again" }),
    onError: (err, { name }) => toast.error(`Couldn't ${action} ${name}`, { description: errorMessage(err) }),
    onSettled: () => invalidateJobs(qc),
  });
}

/* ---------- Ops: audit ---------- */

/** Events, newest first, a page at a time; `fetchNextPage` follows `next_cursor`. */
export function useAudit(filter: AuditFilter, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: keys.audit(filter),
    queryFn: ({ pageParam }) => apiFetch<AuditEventPage>(`/_portal/app/ops/audit${queryString({ ...filter, limit: filter.limit ?? 50, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled,
    retry,
  });
}

export function useAuditStats(groupBy: AuditGroupBy, filter: AuditFilter, enabled: boolean) {
  const { limit: _limit, request_id: _rid, resource_id: _res, ...rest } = filter;
  void _limit;
  void _rid;
  void _res;
  return useQuery({
    queryKey: keys.auditStats(groupBy, rest),
    queryFn: () => apiFetch<AuditStats>(`/_portal/app/ops/audit/stats${queryString({ ...rest, group_by: groupBy })}`),
    enabled,
    staleTime: 30_000,
    retry,
  });
}

/* ---------- Ops: system, mail, releases ---------- */

/** `GET /ops/system`: the instance that answers, its checks, pool, migrations and runtime. */
export function useSystem(enabled: boolean, every = 10_000) {
  return useQuery({
    queryKey: keys.system,
    queryFn: () => apiFetch<SystemInfo>("/_portal/app/ops/system"),
    enabled,
    refetchInterval: every,
    retry,
  });
}

export function useOpsMail(enabled: boolean) {
  return useQuery({
    queryKey: keys.mail,
    queryFn: () => apiFetch<MailStatus>("/_portal/app/ops/mail"),
    enabled,
    staleTime: 30_000,
    retry,
  });
}

/** `POST /ops/mail/test`; 5 an hour per operator (429 `rate_limited`). */
export function useSendTestEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TestEmailBody) => apiFetch<TestEmailResponse>("/_portal/app/ops/mail/test", { method: "POST", json: body }),
    onSuccess: (r) => toast.success(`Test email queued for ${r.to}`, { description: r.delivery === "mailpit" ? "it lands in Mailpit in a moment" : "delivered by the provider" }),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 429) toast.warning("Too many test emails", { description: err.detail || "Each operator can send 5 an hour." });
      else toast.error("Couldn't send the test email", { description: errorMessage(err) });
    },
    onSettled: () => {
      setTimeout(() => void qc.invalidateQueries({ queryKey: keys.devMail }), 2000);
      void qc.invalidateQueries({ queryKey: ["ops", "jobs"] });
    },
  });
}

export function useSuppressions(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: keys.suppressions,
    queryFn: ({ pageParam }) => apiFetch<SuppressionPage>(`/_portal/app/ops/mail/suppressions${queryString({ limit: 50, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled,
    retry,
  });
}

/** `DELETE /ops/mail/suppressions/{id}` with a reason (422 `mail_suppression_reason_required` without one). */
export function useRemoveSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: RemoveSuppressionBody }) => apiFetch<Suppression>(`/_portal/app/ops/mail/suppressions/${id}`, { method: "DELETE", json: body }),
    onSuccess: (s) => toast.success(`Removed ${s.email} from the suppression list`),
    onError: (err) => toast.error("Couldn't remove the suppression", { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.suppressions }),
  });
}

export function useCurrentReleases(enabled: boolean) {
  return useQuery({
    queryKey: keys.releasesCurrent,
    queryFn: async () => (await apiFetch<CurrentReleases>("/_portal/app/ops/releases/current")).releases ?? [],
    enabled,
    refetchInterval: 30_000,
    retry,
  });
}
