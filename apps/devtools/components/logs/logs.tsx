"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eraser, Filter, RefreshCw } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Switch } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { fmtBytes, fmtInt } from "@gorbital/dash/lib/format";
import { attrOf, isNoLogStore, useLogHistogram, useLogStats, useLogTail, useLogs, type LogRecord } from "@/lib/api/logs";
import { bucketFor, countActiveFilters, defaultRange, filtersToParams, normalizeFilters, parseFilters, resolveRange, type LogFilters, type RangePreset } from "@/lib/logs/filters";
import { mergeRecords } from "@/lib/logs/tail";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { ErrorsView } from "./errors-view";
import { FilterBar } from "./filter-bar";
import { Histogram } from "./histogram";
import { LogList } from "./log-list";
import { RecordSheet } from "./record-sheet";
import { SavedFiltersMenu } from "./saved-filters";
import { SourceChips } from "./source-chips";
import { NoLogStore } from "./store-gate";
import { LogStorePanel } from "./store-panel";

type View = "records" | "errors";

/**
 * Writes the whole view to the URL without a navigation: the filters, the
 * tab and the open record. The state passed is null, not `history.state`:
 * Next skips its own sync when the state carries its `__NA` marker, and
 * `useSearchParams` follows only a call it syncs.
 */
function writeUrl(filters: LogFilters, view: View, id: number | undefined) {
  if (typeof window === "undefined") return;
  const p = filtersToParams(filters);
  if (view === "errors") p.set("view", "errors");
  if (id !== undefined) p.set("id", String(id));
  const url = new URL(window.location.href);
  url.search = p.toString();
  window.history.replaceState(null, "", url);
}

/** The page before the query string is known: the static export prerenders this. */
export function LogsSkeleton() {
  return (
    <>
      <PageHeader product="devtools" title="Logs" description="every source, from orb dev's log store" />
      <Page>
        <SkeletonLines lines={10} className="p-4" />
      </Page>
    </>
  );
}

export function Logs() {
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const view: View = params.get("view") === "errors" ? "errors" : "records";
  const selectedId = params.get("id") && Number.isInteger(Number(params.get("id"))) ? Number(params.get("id")) : undefined;
  const absolute = Boolean(filters.from || filters.to);
  const lastPreset = useRef<RangePreset>(filters.range ?? defaultRange);
  if (!absolute) lastPreset.current = filters.range ?? defaultRange;

  const [live, setLive] = useState(true);
  const [pinned, setPinned] = useState<LogRecord | undefined>();

  const setFilters = useCallback(
    (next: LogFilters, nextView: View = view) => {
      writeUrl(normalizeFilters(next), nextView, undefined);
    },
    [view],
  );
  const setView = (v: View) => writeUrl(filters, v, selectedId);
  const openRecord = (rec: LogRecord | number) => {
    if (typeof rec !== "number") setPinned(rec);
    writeUrl(filters, view, typeof rec === "number" ? rec : rec.id);
  };
  const closeRecord = () => writeUrl(filters, view, undefined);

  const list = useLogs(filters);
  const noStore = isNoLogStore(list.error);
  const ok = !noStore;
  const histogram = useLogHistogram(filters, ok);
  const stats = useLogStats(ok);
  const pages = useMemo(() => list.data?.pages.flatMap((p) => p.logs ?? []) ?? [], [list.data]);
  const newest = list.data?.pages[0]?.logs[0]?.id;
  const tail = useLogTail({ filters, enabled: ok && live && !absolute && list.isSuccess && view === "records", after: newest });
  const rows = useMemo(() => mergeRecords(tail.items, pages), [tail.items, pages]);
  const counts = useMemo(() => {
    if (!list.data) return undefined;
    const c: Record<string, number> = {};
    for (const r of rows) c[r.source] = (c[r.source] ?? 0) + 1;
    return c;
  }, [rows, list.data]);
  const selected = useMemo(() => (selectedId === undefined ? undefined : (rows.find((r) => r.id === selectedId) ?? (pinned?.id === selectedId ? pinned : undefined))), [rows, selectedId, pinned]);

  // A refetch of the first page (Refresh, a cleared store) makes the tail's copy of it redundant.
  const clearTail = tail.clear;
  const firstPageAt = list.dataUpdatedAt;
  useEffect(() => {
    if (!list.isFetchingNextPage) clearTail();
  }, [firstPageAt, list.isFetchingNextPage, clearTail]);

  const range = resolveRange(filters, Date.now());
  const conn = tail.connection;
  const tailOn = live && !absolute;
  const active = countActiveFilters(filters);

  const actions = (l: LogRecord) => {
    const rid = attrOf(l, "request_id");
    const user = attrOf(l, "user_id") ?? attrOf(l, "email");
    const trace = attrOf(l, "trace_id");
    return (
      <>
        {rid && (
          <Button size="sm" kind="secondary" icon={<Filter size={11} />} onClick={() => setFilters({ range: filters.range, from: filters.from, to: filters.to, request_id: rid })}>
            All logs for this request
          </Button>
        )}
        {user && (
          <Button size="sm" kind="ghost" onClick={() => setFilters({ ...filters, user })}>
            Filter by user
          </Button>
        )}
        {trace && (
          <Button size="sm" kind="ghost" onClick={() => setFilters({ ...filters, trace_id: trace })}>
            Filter by trace
          </Button>
        )}
        <Button size="sm" kind="ghost" onClick={() => openRecord(l)}>
          Details
        </Button>
        {rid && (
          <Link href={`/requests?id=${encodeURIComponent(rid)}`} className="text-[11px] text-primary hover:underline">
            Open the request
          </Link>
        )}
      </>
    );
  };

  return (
    <>
      <PageHeader product="devtools" title="Logs" description={stats.data ? `${fmtInt(stats.data.records)} records · ${fmtBytes(stats.data.bytes)} in ${stats.data.dir} · /_portal/api/logs` : "every source, from orb dev's log store"}>
        <label className="flex items-center gap-2 text-[12px] text-muted" title={absolute ? "The tail follows a window that ends now; pick a preset to resume it." : undefined}>
          <Switch checked={live} onCheckedChange={setLive} aria-label="Live tail" disabled={absolute} />
          Live tail
          {tailOn && ok && (conn.state === "open" ? <Dot tone="ok" pulse /> : conn.state === "connecting" ? <Dot tone="warn" /> : <Dot tone="danger" />)}
        </label>
        <SavedFiltersMenu filters={filters} enabled={ok} onApply={(f) => setFilters(f, "records")} />
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void Promise.all([list.refetch(), histogram.refetch(), stats.refetch()])} loading={list.isFetching && !list.isFetchingNextPage}>
          Refresh
        </Button>
        <Button size="sm" kind="ghost" icon={<Eraser size={11} />} onClick={tail.clear} disabled={tail.items.length === 0}>
          Clear tail
        </Button>
      </PageHeader>
      <Page>
        {list.error && !list.data ? (
          noStore ? (
            <NoLogStore meta="GET /_portal/api/logs" />
          ) : (
            <ProblemPanel error={list.error} scope="portal" meta="GET /_portal/api/logs" onRetry={() => void list.refetch()} retrying={list.isFetching} />
          )
        ) : (
          <>
            <SourceChips selected={filters.source ?? []} counts={counts} onChange={(source) => setFilters({ ...filters, source })} />
            <FilterBar filters={filters} onChange={setFilters} />
            <Histogram
              buckets={histogram.data?.buckets}
              bucketMs={bucketFor(range.ms).ms}
              loading={histogram.isPending}
              zoomed={absolute}
              onZoom={(from, to) => setFilters({ ...filters, range: undefined, from, to })}
              onReset={() => setFilters({ ...filters, range: lastPreset.current, from: undefined, to: undefined })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<View>
                options={[
                  { value: "records", label: list.data ? `Records ${fmtInt(rows.length)}` : "Records" },
                  { value: "errors", label: "Errors" },
                ]}
                value={view}
                onChange={setView}
              />
              {active > 0 && <Badge tone="accent">{active} filter{active === 1 ? "" : "s"}</Badge>}
              {absolute && <Badge tone="muted">zoomed</Badge>}
              <span className="ml-auto font-mono text-[11px] text-dim">
                {view === "records" && list.data && (
                  <>
                    {fmtInt(rows.length)} loaded{list.hasNextPage ? " · older available" : ""}
                    {tail.items.length > 0 && ` · ${fmtInt(tail.items.length)} from the tail`}
                  </>
                )}
                {tail.dropped > 0 && (
                  <Badge tone="warn" className="ml-2">
                    {fmtInt(tail.dropped)} dropped
                  </Badge>
                )}
                {tailOn && ok && conn.state === "closed" && conn.reason !== "end" && (
                  <Badge tone="danger" className="ml-2">
                    tail {conn.reason} · retry in {Math.round(conn.retryIn / 1000)}s
                  </Badge>
                )}
              </span>
            </div>
            {view === "records" ? (
              <Panel flush>
                <LogList
                  rows={rows}
                  loading={list.isPending}
                  empty={<Empty title="No log records" hint={active > 0 || absolute ? "Nothing matches these filters in this window." : `The store has nothing in the last ${filters.range ?? defaultRange}; widen the window, or send a request.`} />}
                  pending={tail.pending.length}
                  onHold={tail.hold}
                  onShowPending={tail.flush}
                  hasOlder={list.hasNextPage}
                  loadingOlder={list.isFetchingNextPage}
                  onLoadOlder={() => void list.fetchNextPage()}
                  selectedId={selectedId}
                  actions={actions}
                />
              </Panel>
            ) : (
              <ErrorsView filters={filters} enabled={ok} onSeeRecords={(f) => setFilters(f, "records")} onOpenRecord={openRecord} />
            )}
            <LogStorePanel compact enabled={ok} onCleared={tail.clear} />
          </>
        )}
      </Page>
      <RecordSheet record={selected} id={selectedId} onClose={closeRecord} onFilterRequest={(rid) => setFilters({ range: filters.range, from: filters.from, to: filters.to, request_id: rid }, "records")} />
    </>
  );
}
