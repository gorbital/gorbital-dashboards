"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Eraser, RefreshCw } from "lucide-react";
import { Badge, Dot, Method, StatusCode } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Input, Select, Switch } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table } from "@gorbital/dash/components/table";
import { fmtInt, fmtMs } from "@gorbital/dash/lib/format";
import { mergeTail, useLiveTail } from "@/lib/api/live";
import { isNoLogStore, useRequestLogs } from "@/lib/api/logs";
import { useCapabilities, useDevLogs, useDevRequests } from "@/lib/api/queries";
import type { DevRequest } from "@/lib/api/types";
import { clock } from "@/lib/time";
import { LogLine, type LogLike } from "@/components/logs/log-line";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";

type StatusClass = "all" | "2xx" | "3xx" | "4xx" | "5xx";

const reqKey = (r: DevRequest) => `${r.time}|${r.method}|${r.path}|${r.request_id ?? ""}`;

export function Requests() {
  const caps = useCapabilities();
  const [live, setLive] = useState(true);
  const list = useDevRequests(caps.console);
  const tail = useLiveTail<DevRequest>({ path: "/_portal/app/_dev/requests/stream", event: "request", enabled: caps.console && live, max: 500 });
  const [method, setMethod] = useState("all");
  const [cls, setCls] = useState<StatusClass>("all");
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onParam = useCallback((v: string | null) => setSelectedId(v), []);

  const all = useMemo(() => mergeTail(tail.items, list.data?.requests ?? [], reqKey, 500), [tail.items, list.data]);
  const methods = useMemo(() => [...new Set(all.map((r) => r.method))].sort(), [all]);
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    return all.filter((r) => {
      if (method !== "all" && r.method !== method) return false;
      if (cls !== "all" && Math.floor(r.status / 100) !== Number(cls[0])) return false;
      if (q && !`${r.route} ${r.path} ${r.request_id ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, method, cls, text]);
  const selected = useMemo(() => all.find((r) => r.request_id && r.request_id === selectedId), [all, selectedId]);

  const conn = tail.connection;
  const open = (r: DevRequest) => {
    if (!r.request_id) return;
    setSelectedId(r.request_id);
    setQueryParam("id", r.request_id);
  };
  const close = () => {
    setSelectedId(null);
    setQueryParam("id", null);
  };

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="id" onValue={onParam} />
      </Suspense>
      <PageHeader product="devtools" title="Requests" description={list.data ? `the last ${fmtInt(list.data.max)} the app answered · /_dev/requests` : "every request the app answered, as it finishes"}>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <Switch checked={live} onCheckedChange={setLive} aria-label="Live tail" />
          Live tail
          {live && caps.console && (conn.state === "open" ? <Dot tone="ok" pulse /> : conn.state === "connecting" ? <Dot tone="warn" /> : <Dot tone="danger" />)}
        </label>
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void list.refetch()} loading={list.isFetching}>
          Refresh
        </Button>
        <Button size="sm" kind="ghost" icon={<Eraser size={11} />} onClick={tail.clear} disabled={tail.items.length === 0}>
          Clear tail
        </Button>
      </PageHeader>
      <Page>
        <Gate need="console" loading={<Table<DevRequest> columns={columns} rows={[]} rowKey={reqKey} loading />}>
          {list.error && !list.data ? (
            <ProblemPanel error={list.error} scope="dev" console={caps.consoleDeclared} meta="GET /_dev/requests" onRetry={() => void list.refetch()} retrying={list.isFetching} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-[120px]" aria-label="Method">
                  <option value="all">Any method</option>
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
                <Segmented<StatusClass>
                  options={[
                    { value: "all", label: "All" },
                    { value: "2xx", label: "2xx" },
                    { value: "3xx", label: "3xx" },
                    { value: "4xx", label: "4xx" },
                    { value: "5xx", label: "5xx" },
                  ]}
                  value={cls}
                  onChange={setCls}
                />
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="route, path or request id" className="w-[280px]" aria-label="Filter requests" />
                <span className="ml-auto font-mono text-[11px] text-dim">
                  {fmtInt(shown.length)} of {fmtInt(all.length)}
                  {tail.dropped > 0 && (
                    <Badge tone="warn" className="ml-2">
                      {fmtInt(tail.dropped)} dropped
                    </Badge>
                  )}
                </span>
              </div>
              <Panel flush>
                <Table<DevRequest>
                  columns={columns}
                  rows={shown}
                  rowKey={reqKey}
                  dense
                  loading={list.isPending && tail.items.length === 0}
                  onRowClick={open}
                  selected={selected ? reqKey(selected) : undefined}
                  empty={<Empty title="No requests yet" hint={all.length === 0 ? "Send one from the Routes page, or call the API; they appear here as they finish." : "Nothing matches these filters."} />}
                />
              </Panel>
            </>
          )}
        </Gate>
      </Page>
      <Sheet open={Boolean(selectedId)} onOpenChange={(o) => !o && close()} title={selected ? `${selected.method} ${selected.path}` : "Request"} meta={selectedId ?? undefined} width="lg" flush>
        {selected ? <RequestDetail request={selected} consoleOn={caps.console} /> : <Empty title="Not in the recent requests" hint="The console keeps the last 500; this one has already left the buffer or came from an earlier run." />}
      </Sheet>
    </>
  );
}

const columns = [
  { key: "t", header: "Time", width: "110px", cell: (r: DevRequest) => <span className="font-mono text-dim tnum">{clock(r.time)}</span> },
  { key: "m", header: "Method", width: "76px", cell: (r: DevRequest) => <Method m={r.method} /> },
  { key: "r", header: "Route", cell: (r: DevRequest) => <span className="font-mono text-text">{r.route || <span className="text-faint">(no route)</span>}</span> },
  { key: "p", header: "Path", cell: (r: DevRequest) => <span className="font-mono text-muted">{r.path}</span> },
  { key: "s", header: "Status", width: "70px", cell: (r: DevRequest) => <StatusCode code={r.status} /> },
  { key: "d", header: "Duration", width: "90px", align: "right" as const, cell: (r: DevRequest) => <span className={`font-mono tnum ${r.duration_ms > 250 ? "text-warn" : "text-dim"}`}>{fmtMs(r.duration_ms)}</span> },
  { key: "id", header: "Request", width: "170px", cell: (r: DevRequest) => <span className="font-mono text-[11px] text-dim">{r.request_id ?? ""}</span> },
  { key: "tr", header: "Trace", width: "120px", cell: (r: DevRequest) => <span className="font-mono text-[11px] text-faint">{r.trace_id ? `${r.trace_id.slice(0, 12)}…` : ""}</span> },
];

function RequestDetail({ request, consoleOn }: { request: DevRequest; consoleOn: boolean }) {
  // The store keeps every record of the request, oldest first; an orb dev without one falls back to the console's buffer.
  const store = useRequestLogs(request.request_id, true);
  const noStore = isNoLogStore(store.error);
  const buffer = useDevLogs(consoleOn && noStore);
  const fromBuffer = useMemo(() => (buffer.data?.logs ?? []).filter((l) => l.attrs.some((a) => a.key === "request_id" && a.value === request.request_id)).reverse(), [buffer.data, request.request_id]);
  const matching: LogLike[] = noStore ? fromBuffer : (store.data?.logs ?? []);
  const pending = noStore ? buffer.isPending : store.isPending;
  const meta = noStore ? "from /_dev/logs" : "from the log store · oldest first";
  return (
    <div className="grid gap-4 p-5">
      <KeyList
        rows={[
          { k: "Finished", v: `${clock(request.time)} · ${new Date(request.time).toLocaleDateString()}` },
          { k: "Status", v: String(request.status) },
          { k: "Duration", v: fmtMs(request.duration_ms) },
          { k: "Route", v: request.route || "(no route matched)" },
          { k: "Path", v: request.path },
          { k: "Request id", v: request.request_id ?? "—" },
          { k: "Trace id", v: request.trace_id ?? "—" },
        ]}
      />
      <div className="flex items-center gap-2">
        <Link href={`/logs?range=7d&request_id=${encodeURIComponent(request.request_id ?? "")}`} className="text-[12px] text-primary hover:underline">
          Open in Logs
        </Link>
        <span className="font-mono text-[11px] text-dim">· {matching.length} record{matching.length === 1 ? "" : "s"} carry this request id</span>
      </div>
      <Panel title="Log records" meta={meta} flush>
        {pending ? (
          <div className="p-4 font-mono text-[11px] text-dim">loading…</div>
        ) : store.error && !noStore ? (
          <Empty title="Couldn't load the records" hint={store.error.message} />
        ) : matching.length === 0 ? (
          <Empty title="No log records" hint="Nothing the app logged carries this request id, or the records have left the store." />
        ) : (
          <ol className="border-t border-hairline">
            {matching.map((l, i) => (
              <LogLine key={l.id ?? `${l.time}-${i}`} log={l} open showSource={!noStore} />
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
