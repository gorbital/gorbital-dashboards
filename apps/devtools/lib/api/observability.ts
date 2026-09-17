"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, NotConnectedError, apiFetch, subscribeSSE, type EventsStatus } from "./client";
import { errorMessage } from "./errors";
import { queryString } from "./queries";

/**
 * The Observability screen's data layer (ADR-0073): the portal's health
 * table, the machine sampler and the pgmeta statistics under
 * `/_portal/api/`, and the app's request minutes under
 * `/_portal/app/ops/observability/`. Types match `cli/internal/portal/observe.go`,
 * `sysinfo.go`, `cli/internal/pgmeta/stats.go` and the ops OpenAPI schemas
 * field for field.
 */

/* ---------- Portal: health and the machine ---------- */

export type HealthStatus = "ok" | "degraded" | "down" | "unknown";

/** One service as orb dev sees it: app, postgres, mail, or a Compose service. */
export type ServiceHealth = {
  name: string;
  status: HealthStatus;
  /** Why, in a sentence. */
  detail?: string;
  /** What answered. */
  version?: string;
  /** Where to look, when there is a page. */
  url?: string;
  checked_at: string;
  latency_ms: number;
};

export type HealthResponse = { services: ServiceHealth[] };

export type HostInfo = {
  os: string;
  arch: string;
  cores: number;
  hostname: string;
  /** The whole machine's use over the last sample interval. */
  cpu_percent: number;
  /** Load averages; zero where the OS has none. */
  load1: number;
  load5: number;
  load15: number;
  uptime_seconds: number;
};

/** The machine's memory in bytes. */
export type MemoryInfo = { total: number; used: number; available: number; percent: number };

/** The volume holding the app directory. */
export type DiskInfo = { path: string; total: number; used: number; free: number; percent: number };

export type ProcInfo = {
  pid: number;
  cpu_percent: number;
  /** Resident memory in bytes. */
  rss: number;
  threads: number;
  /** -1 where the OS doesn't say. */
  open_files: number;
  started_at?: string;
};

/** `GET /_portal/api/system`: orb dev's last sample (every 2 s, gopsutil). */
export type HostSample = {
  sampled_at: string;
  host: HostInfo;
  app?: ProcInfo;
  orb: ProcInfo;
  disk?: DiskInfo;
  memory: MemoryInfo;
};

/* ---------- Portal: the database's statistics (pgmeta) ---------- */

/** One application's connections in one state. */
export type ClientUse = { application: string; state: string; count: number };

export type RelationSize = {
  schema: string;
  name: string;
  total: number;
  table: number;
  indexes: number;
  toast: number;
  /** The planner's estimate; -1 when the table was never analyzed. */
  rows: number;
  seq_scans: number;
  index_scans: number;
  dead_rows: number;
  last_vacuum: string | null;
};

/** A session waiting for a lock another session holds. */
export type LockWait = {
  pid: number;
  application: string;
  /** The waiting statement. */
  waiting: string;
  lock_type: string;
  mode: string;
  relation?: string;
  blocked_by: number[];
  /** Milliseconds, as a decimal string. */
  waiting_for_ms: string;
};

/** One session's current statement. */
export type Activity = { pid: number; application: string; state: string; query: string; duration_ms: number; wait_event?: string };

export type DatabaseStats = {
  database: string;
  version: string;
  /** Bytes. */
  size: number;
  connections: number;
  max_connections: number;
  clients: ClientUse[];
  /** 0 to 1, since the statistics were reset. */
  cache_hit_ratio: number;
  index_hit_ratio: number;
  commits: number;
  rollbacks: number;
  deadlocks: number;
  temp_bytes: number;
  stats_since: string | null;
  /** By total size, largest first (at most 50). */
  tables: RelationSize[];
  locks: LockWait[];
  /** Sessions in a statement for more than a second. */
  long_running: Activity[];
};

export type StatementSort = "total_time" | "mean_time" | "calls" | "rows" | "max_time";
export const statementSorts: StatementSort[] = ["total_time", "mean_time", "calls", "rows", "max_time"];

/** One entry of pg_stat_statements. */
export type Statement = {
  query_id: number;
  query: string;
  calls: number;
  total_ms: number;
  mean_ms: number;
  min_ms: number;
  max_ms: number;
  stddev_ms: number;
  rows: number;
  /** Shared buffer hits over reads, 0 to 1. */
  hit_ratio: number;
  /** The statement's share of every statement's total time, 0 to 1. */
  total_share: number;
};

export type Statements = {
  available: boolean;
  /** Why not, when `available` is false: the compose line to add. */
  reason?: string;
  since: string | null;
  statements: Statement[];
  sort: StatementSort;
};

export type IndexAdvice = {
  schema: string;
  table: string;
  index?: string;
  columns?: string[];
  /** Why, with the numbers. */
  reason: string;
  /** What to run, when there is something to run. */
  sql?: string;
  /** Bytes, for unused indexes. */
  size?: number;
};

export type Advice = {
  missing_fk_indexes: IndexAdvice[];
  unused_indexes: IndexAdvice[];
  seq_scanned: IndexAdvice[];
  dead_rows: IndexAdvice[];
};

export type AdviceGroup = keyof Advice;

/* ---------- The app: /ops/observability ---------- */

export type ObservabilityRange = "15m" | "1h" | "6h" | "24h";
export const observabilityRanges: ObservabilityRange[] = ["15m", "1h", "6h", "24h"];

export type LatencyStats = { mean: number; p50: number; p95: number; p99: number; max: number };

export type RouteTraffic = {
  method: string;
  /** The route pattern; empty for requests no route matched, `_overflow` beyond the series limit. */
  route: string;
  requests: number;
  requests_per_minute: number;
  client_errors: number;
  server_errors: number;
  /** Server errors per request, 0 to 1. */
  error_rate: number;
  latency_ms: LatencyStats;
};

export type InstanceTraffic = {
  /** As in `GET /ops/releases/instances`. */
  instance_id: string;
  /** The latest minute with requests. */
  last_minute: string;
  /** When the instance last wrote its minutes; more than 15 s old means it stopped or can't reach the database. */
  last_write: string;
  requests: number;
  requests_per_minute: number;
  client_errors: number;
  server_errors: number;
  error_rate: number;
  latency_ms: LatencyStats;
};

export type MinuteTraffic = { minute: string; requests: number; server_errors: number; p95_ms: number };

export type TopRoutes = { by_requests: RouteTraffic[] | null; by_errors: RouteTraffic[] | null; by_latency: RouteTraffic[] | null };

/** `GET /ops/observability/overview`, and every `overview` event of the stream. */
export type ObservabilityOverview = {
  window: string;
  window_seconds: number;
  from: string;
  to: string;
  requests: number;
  requests_per_minute: number;
  client_errors: number;
  server_errors: number;
  error_rate: number;
  latency_ms: LatencyStats;
  instances: InstanceTraffic[] | null;
  top_routes: TopRoutes;
  /** Minutes with requests, oldest first. */
  minutes: MinuteTraffic[] | null;
};

export type RouteSort = "requests" | "errors" | "error_rate" | "p95" | "p99";

export type RoutesResponse = { window: string; from: string; to: string; routes: RouteTraffic[] | null };

/* ---------- Keys and hooks ---------- */

export const observabilityKeys = {
  health: ["portal", "health"] as const,
  hostSample: ["portal", "system"] as const,
  dbStats: ["db", "stats"] as const,
  statements: (sort: StatementSort, limit: number) => ["db", "statements", sort, limit] as const,
  advice: ["db", "advice"] as const,
  overview: (range: ObservabilityRange) => ["ops", "observability", "overview", range] as const,
  routes: (range: ObservabilityRange, sort: RouteSort) => ["ops", "observability", "routes", range, sort] as const,
};

function retry(count: number, err: Error) {
  if (err instanceof NotConnectedError) return false;
  if (err instanceof ApiError && err.status < 500) return false;
  return count < 1;
}

/** `GET /_portal/api/health`, every 10 s: orb dev checks every service with a 5 s budget. */
export function useServiceHealth(enabled = true) {
  return useQuery({
    queryKey: observabilityKeys.health,
    queryFn: async () => (await apiFetch<HealthResponse>("/_portal/api/health")).services ?? [],
    enabled,
    refetchInterval: 10_000,
    retry,
  });
}

/** `GET /_portal/api/system`, every 2 s while the caller is mounted (the sampler's interval); 404 `no_system_sampler` on an orb without one. */
export function useHostSample(enabled = true, every = 2000) {
  return useQuery({
    queryKey: observabilityKeys.hostSample,
    queryFn: () => apiFetch<HostSample>("/_portal/api/system"),
    enabled,
    refetchInterval: every,
    staleTime: 1000,
    retry,
  });
}

/** `GET /_portal/api/db/stats`, every 10 s. */
export function useDbStats(enabled = true) {
  return useQuery({
    queryKey: observabilityKeys.dbStats,
    queryFn: () => apiFetch<DatabaseStats>("/_portal/api/db/stats"),
    enabled,
    refetchInterval: 10_000,
    retry,
  });
}

/** `GET /_portal/api/db/statements?sort=&limit=`: fetched on demand, refreshed by hand (the counters only grow). */
export function useDbStatements(sort: StatementSort, limit: number, enabled = true) {
  return useQuery({
    queryKey: observabilityKeys.statements(sort, limit),
    queryFn: () => apiFetch<Statements>(`/_portal/api/db/statements${queryString({ sort, limit })}`),
    enabled,
    staleTime: 60_000,
    retry,
  });
}

/** `POST /_portal/api/db/statements/reset` (204); 409 `statements_unavailable` without the extension. */
export function useResetStatements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/_portal/api/db/statements/reset", { method: "POST" }),
    onSuccess: () => toast.success("Statement statistics reset", { description: "pg_stat_statements starts counting again from now." }),
    onError: (err) => {
      if (err instanceof ApiError && err.code === "statements_unavailable") toast.warning("pg_stat_statements isn't available", { description: err.detail });
      else toast.error("Couldn't reset the statistics", { description: errorMessage(err) });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["db", "statements"] }),
  });
}

/** `GET /_portal/api/db/advice`: index and vacuum suggestions from the catalog and the statistics. */
export function useDbAdvice(enabled = true) {
  return useQuery({
    queryKey: observabilityKeys.advice,
    queryFn: () => apiFetch<Advice>("/_portal/api/db/advice"),
    enabled,
    staleTime: 30_000,
    retry,
  });
}

/** `GET /ops/observability/overview?window=`, every 15 s; the stream (below) patches it in between. */
export function useObservabilityOverview(range: ObservabilityRange, enabled: boolean) {
  return useQuery({
    queryKey: observabilityKeys.overview(range),
    queryFn: () => apiFetch<ObservabilityOverview>(`/_portal/app/ops/observability/overview${queryString({ window: range })}`),
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

/** `GET /ops/observability/routes?window=&sort=&limit=500`: every route pattern over the window. */
export function useObservabilityRoutes(range: ObservabilityRange, sort: RouteSort, enabled: boolean) {
  return useQuery({
    queryKey: observabilityKeys.routes(range, sort),
    queryFn: async () => (await apiFetch<RoutesResponse>(`/_portal/app/ops/observability/routes${queryString({ window: range, sort, limit: 500 })}`)).routes ?? [],
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

/**
 * `GET /ops/observability/stream?window=`: an `overview` event every 5 s,
 * written into the overview query so the tiles and the sparkline move
 * between polls. Subscribed only while `enabled` (the API tab is open).
 */
export function useObservabilityStream(range: ObservabilityRange, enabled: boolean): EventsStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<EventsStatus>({ state: "connecting", attempt: 0 });
  const rangeRef = useRef(range);
  rangeRef.current = range;
  useEffect(() => {
    if (!enabled) return;
    const stop = subscribeSSE(
      `/_portal/app/ops/observability/stream${queryString({ window: range })}`,
      (m) => {
        if (m.event !== "overview") return;
        try {
          const overview = JSON.parse(m.data) as ObservabilityOverview;
          qc.setQueryData<ObservabilityOverview>(observabilityKeys.overview(rangeRef.current), overview);
        } catch {
          // A malformed event is skipped; the next poll corrects the picture.
        }
      },
      setStatus,
    );
    return stop;
  }, [range, enabled, qc]);
  return status;
}
