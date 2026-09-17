"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { bucketFor, filtersToApi, normalizeFilters, resolveRange, type LogFilters } from "@/lib/logs/filters";
import { initialTail, reduceTail, type TailState } from "@/lib/logs/tail";
import { ApiError, apiFetch, parseDevStreamEvent, subscribeSSE, type EventsStatus } from "./client";
import { errorMessage } from "./errors";
import { queryString, retry } from "./queries";

/*
 * The local log store (ADR-0072): orb dev keeps the app's records under
 * .orb/portal/logs and serves them at /_portal/api/logs. The shapes match
 * cli/internal/portal/logstore.go field for field.
 */

export type LogAttr = { key: string; value: string };

export type LogRecord = {
  /** Orders records; the paging cursor. */
  id: number;
  time: string;
  /** http, auth, jobs, mail, storage, postgres, orb, or app. */
  source: string;
  /** DEBUG, INFO, WARN or ERROR. */
  level: string;
  message: string;
  /** In order, groups flattened into dotted keys; absent on a raw line. */
  attrs?: LogAttr[];
  /** The line as written when it wasn't a log record. */
  raw?: string;
};

export type LogPage = {
  /** Newest first. */
  logs: LogRecord[];
  /** Pass as `before` for older records; absent when there are none. */
  next_before?: number;
};

export type LogBucket = { time: string; total: number; levels: { debug: number; info: number; warn: number; error: number } };

export type LogHistogram = { bucket: string; buckets: LogBucket[] };

export type ErrorGroup = {
  fingerprint: string;
  shape: string;
  top?: string;
  source: string;
  level: string;
  count: number;
  first_seen: string;
  last_seen: string;
  last: LogRecord;
};

export type ErrorGroups = { groups: ErrorGroup[] };

export type RequestLogs = { request_id: string; logs: LogRecord[] };

export type LogStats = { bytes: number; max_bytes: number; segments: number; oldest?: string; records: number; dir: string };

export type SavedFilter = { name: string; query: unknown; saved: string };

export type SavedFilters = { filters: SavedFilter[] };

export const MAX_LOG_QUERY = 1000;

export const logKeys = {
  all: ["portal", "logs"] as const,
  list: (f: LogFilters) => ["portal", "logs", "list", normalizeFilters(f)] as const,
  histogram: (f: LogFilters) => ["portal", "logs", "histogram", normalizeFilters(f)] as const,
  errors: (f: LogFilters) => ["portal", "logs", "errors", normalizeFilters(f)] as const,
  request: (id: string) => ["portal", "logs", "request", id] as const,
  stats: ["portal", "logs", "stats"] as const,
  filters: ["portal", "logs", "filters"] as const,
};

/** True when this orb dev keeps no store (404 `no_log_store`): the page shows how to get one. */
export function isNoLogStore(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.code === "no_log_store";
}

/** The attribute's value, or undefined. */
export function attrOf(r: { attrs?: LogAttr[] }, key: string): string | undefined {
  return r.attrs?.find((a) => a.key === key)?.value;
}

/** `GET logs`, newest first, `pageSize` at a time; `fetchNextPage` follows `next_before` into older records. */
export function useLogs(filters: LogFilters, enabled = true, pageSize = 200) {
  return useInfiniteQuery({
    queryKey: logKeys.list(filters),
    queryFn: ({ pageParam }) => apiFetch<LogPage>(`/_portal/api/logs${queryString({ ...filtersToApi(filters, Date.now()), limit: pageSize, before: pageParam })}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_before || undefined,
    enabled,
    retry,
  });
}

/** `GET logs/histogram` over the filters' window, with the bucket the window's size asks for. */
export function useLogHistogram(filters: LogFilters, enabled = true) {
  return useQuery({
    queryKey: logKeys.histogram(filters),
    queryFn: () => {
      const now = Date.now();
      const r = resolveRange(filters, now);
      const api = filtersToApi(filters, now);
      return apiFetch<LogHistogram>(`/_portal/api/logs/histogram${queryString({ ...api, to: api.to ?? new Date(r.to).toISOString(), bucket: bucketFor(r.ms).bucket })}`);
    },
    enabled,
    retry,
  });
}

/** `GET logs/errors`: records at WARN and above in the window, grouped by fingerprint, most recent first. */
export function useLogErrors(filters: LogFilters, enabled = true) {
  return useQuery({
    queryKey: logKeys.errors(filters),
    queryFn: () => apiFetch<ErrorGroups>(`/_portal/api/logs/errors${queryString(filtersToApi(filters, Date.now()))}`),
    enabled,
    retry,
  });
}

/** `GET logs/request/{id}`: every record of one request, oldest first. */
export function useRequestLogs(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: logKeys.request(id ?? ""),
    queryFn: () => apiFetch<RequestLogs>(`/_portal/api/logs/request/${encodeURIComponent(id ?? "")}`),
    enabled: enabled && Boolean(id),
    retry,
  });
}

/** `GET logs/stats`: the store's size, every 15 s. */
export function useLogStats(enabled = true) {
  return useQuery({
    queryKey: logKeys.stats,
    queryFn: () => apiFetch<LogStats>("/_portal/api/logs/stats"),
    enabled,
    refetchInterval: 15_000,
    retry,
  });
}

export function useSavedFilters(enabled = true) {
  return useQuery({
    queryKey: logKeys.filters,
    queryFn: async () => (await apiFetch<SavedFilters>("/_portal/api/logs/filters")).filters ?? [],
    enabled,
    staleTime: 60_000,
    retry,
  });
}

/** `PUT logs/filters` with `{name, query}`; the answer is the whole list. */
export function useSaveFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, query }: { name: string; query: LogFilters }) => apiFetch<SavedFilters>("/_portal/api/logs/filters", { method: "PUT", json: { name, query: normalizeFilters(query) } }),
    onSuccess: (list, { name }) => {
      qc.setQueryData<SavedFilter[]>(logKeys.filters, list.filters ?? []);
      toast.success(`Saved filter "${name}"`, { description: ".orb/portal/log-filters.json" });
    },
    onError: (err) => toast.error("Couldn't save the filter", { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: logKeys.filters }),
  });
}

export function useDeleteFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch<void>(`/_portal/api/logs/filters/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: (_, name) => {
      qc.setQueryData<SavedFilter[]>(logKeys.filters, (old) => old?.filter((f) => f.name !== name));
      toast.success(`Deleted filter "${name}"`);
    },
    onError: (err) => toast.error("Couldn't delete the filter", { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: logKeys.filters }),
  });
}

/** `DELETE logs`: empties the store; new records arrive as the app logs. */
export function useClearLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/_portal/api/logs", { method: "DELETE" }),
    onSuccess: () => toast.success("Cleared the log store", { description: "records reappear as the app logs" }),
    onError: (err) => toast.error("Couldn't clear the log store", { description: errorMessage(err) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: logKeys.all });
    },
  });
}

export type LogTail = TailState & {
  connection: EventsStatus;
  /** Hold new records back (the reader is scrolled into the list) or let them through, flushing what was held. */
  hold: (held: boolean) => void;
  flush: () => void;
  clear: () => void;
};

const idle: EventsStatus = { state: "connecting", attempt: 0 };

type TailOptions = {
  filters: LogFilters;
  /** Subscribe only while true (the tail is on and the window ends now). */
  enabled: boolean;
  /** The newest record id the list holds: the stream first sends what came after it, so nothing falls between. */
  after?: number;
  max?: number;
};

/**
 * Follows `GET logs/stream` with the same filters as the list: every `log`
 * event lands at the front (or in `pending` while held). The subscription
 * restarts when the filters or `after` change, and the reducer drops a
 * record it already has, so a replay after a reconnect shows nothing twice.
 */
export function useLogTail({ filters, enabled, after, max = 1000 }: TailOptions): LogTail {
  const [state, dispatch] = useReducer((s: TailState, a: Parameters<typeof reduceTail>[1]) => reduceTail(s, a, max), initialTail);
  const [connection, setConnection] = useState<EventsStatus>(idle);
  const query = queryString({ ...filtersToApi(filters, Date.now()), from: undefined, after });
  const key = `${JSON.stringify(normalizeFilters(filters))}`;
  const lastKey = useRef(key);

  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      dispatch({ type: "clear" });
    }
  }, [key]);

  useEffect(() => {
    if (!enabled) {
      setConnection(idle);
      return;
    }
    const stop = subscribeSSE(
      `/_portal/api/logs/stream${query}`,
      (m) => {
        const e = parseDevStreamEvent<LogRecord>(m.event, "log", m.data);
        if (e?.type === "item" && typeof e.item.id === "number") dispatch({ type: "record", record: e.item });
      },
      setConnection,
    );
    return stop;
  }, [enabled, query]);

  const hold = useCallback((held: boolean) => dispatch({ type: "hold", held }), []);
  const flush = useCallback(() => dispatch({ type: "flush" }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  return { ...state, connection, hold, flush, clear };
}
