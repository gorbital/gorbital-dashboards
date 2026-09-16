"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { Eraser, RefreshCw, X } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Input, Switch } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { fmtInt } from "@gorbital/dash/lib/format";
import { mergeTail, useLiveTail } from "@/lib/api/live";
import { useCapabilities, useDevLogs } from "@/lib/api/queries";
import type { DevLog } from "@/lib/api/types";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { LogLine } from "./log-line";

type Level = "all" | "INFO" | "WARN" | "ERROR";

const logKey = (l: DevLog) => `${l.time}|${l.level}|${l.message}|${l.attrs.map((a) => `${a.key}=${a.value}`).join(",")}`;

export function Logs() {
  const caps = useCapabilities();
  const [live, setLive] = useState(true);
  const list = useDevLogs(caps.console);
  const tail = useLiveTail<DevLog>({ path: "/_portal/app/_dev/logs/stream", event: "log", enabled: caps.console && live, max: 1000 });
  const [level, setLevel] = useState<Level>("all");
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const onParam = useCallback((v: string | null) => setRequestId(v), []);

  const all = useMemo(() => mergeTail(tail.items, list.data?.logs ?? [], logKey, 1000), [tail.items, list.data]);
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    return all.filter((l) => {
      if (level !== "all" && !l.level.toUpperCase().startsWith(level)) return false;
      if (requestId && !l.attrs.some((a) => a.key === "request_id" && a.value === requestId)) return false;
      if (q && !`${l.message} ${l.attrs.map((a) => `${a.key}=${a.value}`).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, level, text, requestId]);
  const counts = useMemo(() => ({ warn: all.filter((l) => l.level.startsWith("WARN")).length, error: all.filter((l) => l.level.startsWith("ERROR")).length }), [all]);
  const conn = tail.connection;

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="request_id" onValue={onParam} />
      </Suspense>
      <PageHeader product="devtools" title="Logs" description={list.data ? `the last ${fmtInt(list.data.max)} records at info and above · /_dev/logs` : "what the app logs, as it logs it"}>
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
        <Gate need="console" loading={<SkeletonLines lines={10} className="p-4" />}>
          {list.error && !list.data ? (
            <ProblemPanel error={list.error} scope="dev" console={caps.consoleDeclared} meta="GET /_dev/logs" onRetry={() => void list.refetch()} retrying={list.isFetching} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<Level>
                  options={[
                    { value: "all", label: "All" },
                    { value: "INFO", label: "Info" },
                    { value: "WARN", label: `Warn${counts.warn ? ` ${counts.warn}` : ""}` },
                    { value: "ERROR", label: `Error${counts.error ? ` ${counts.error}` : ""}` },
                  ]}
                  value={level}
                  onChange={setLevel}
                />
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="message or attribute" className="w-[300px]" aria-label="Search logs" />
                {requestId && (
                  <Badge tone="accent">
                    request_id={requestId}
                    <button
                      type="button"
                      aria-label="Clear request filter"
                      className="ml-1 text-primary/70 hover:text-primary"
                      onClick={() => {
                        setRequestId(null);
                        setQueryParam("request_id", null);
                      }}
                    >
                      <X size={10} />
                    </button>
                  </Badge>
                )}
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
                {list.isPending && tail.items.length === 0 ? (
                  <SkeletonLines lines={10} className="p-4" />
                ) : shown.length === 0 ? (
                  <Empty title="No log records" hint={all.length === 0 ? "The app hasn't logged anything at info level since it started." : "Nothing matches these filters."} />
                ) : (
                  <ol className="border-t border-hairline">
                    {shown.map((l) => (
                      <LogLine key={logKey(l)} log={l} />
                    ))}
                  </ol>
                )}
              </Panel>
            </>
          )}
        </Gate>
      </Page>
    </>
  );
}
