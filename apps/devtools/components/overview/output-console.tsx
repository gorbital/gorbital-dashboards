"use client";

import { useEffect, useRef, useState, type UIEvent } from "react";
import { ArrowDown, Eraser, History } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { toast } from "@gorbital/dash/components/toast";
import { fmtInt } from "@gorbital/dash/lib/format";
import { apiFetch } from "@/lib/api/client";
import { consoleStore, useConsole } from "@/lib/api/store";
import type { OutputList, OutputLine, OutputStream } from "@/lib/api/types";

type Filter = "all" | OutputStream;

const step = 500;

function tone(text: string) {
  if (/level=ERROR|\berror\b|panic:/i.test(text)) return "text-danger";
  if (/level=WARN|\bwarn(ing)?\b/i.test(text)) return "text-warn";
  return "text-muted";
}

function clock(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--:--:--" : d.toTimeString().slice(0, 8);
}

/** The live tail of the app's and orb's output, fed by the events stream, with the backlog from `/output`. */
export function OutputConsole() {
  const { lines, dropped, connection, backfilled } = useConsole();
  const [filter, setFilter] = useState<Filter>("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [limit, setLimit] = useState(200);
  const [atBottom, setAtBottom] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  const shown = filter === "all" ? lines : lines.filter((l) => l.stream === filter);

  useEffect(() => {
    if (atBottom && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [shown.length, atBottom, filter]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
  };

  const loadMore = async () => {
    const next = Math.min(2000, limit + step);
    setLoadingMore(true);
    try {
      const out = await apiFetch<OutputList>(`/_portal/api/output?limit=${next}`);
      consoleStore.backfill(out.lines);
      setLimit(next);
      if (box.current) setAtBottom(false);
    } catch (err) {
      toast.error("Couldn't load older output", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoadingMore(false);
    }
  };

  const conn =
    connection.state === "open" ? (
      <>
        <Dot tone="ok" pulse /> live
      </>
    ) : connection.state === "connecting" ? (
      <>
        <Dot tone="warn" /> connecting
      </>
    ) : (
      <>
        <Dot tone="danger" /> {connection.reason === "unauthorized" ? "not signed in" : "disconnected"} · retry in {Math.round(connection.retryIn / 1000)}s
      </>
    );

  return (
    <Panel
      title="Output"
      meta={
        <span className="inline-flex items-center gap-1.5">
          {conn}
          <span className="text-faint">·</span> {fmtInt(shown.length)} lines
          {dropped > 0 && <Badge tone="warn">{fmtInt(dropped)} dropped</Badge>}
        </span>
      }
      actions={
        <>
          <Segmented<Filter>
            options={[
              { value: "all", label: "All" },
              { value: "app", label: "App" },
              { value: "orb", label: "orb" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Button size="sm" kind="ghost" icon={<History size={11} />} onClick={loadMore} loading={loadingMore} disabled={limit >= 2000}>
            Load more
          </Button>
          <Button size="sm" kind="ghost" icon={<Eraser size={11} />} onClick={() => consoleStore.clear()} disabled={lines.length === 0}>
            Clear
          </Button>
        </>
      }
      flush
    >
      <div className="relative">
        <div ref={box} onScroll={onScroll} className="h-[460px] overflow-y-auto border-t border-hairline bg-code-bg px-3 py-2 font-mono text-[11.5px] leading-[1.6]">
          {shown.length === 0 ? (
            <Empty title={backfilled ? "Nothing here yet" : "Waiting for output"} hint={backfilled ? "New lines appear as the app and orb write them." : "The stream connects, then the last 200 lines load."} />
          ) : (
            <ol>
              {shown.map((l, i) => (
                <Line key={`${l.time}-${i}`} line={l} />
              ))}
            </ol>
          )}
        </div>
        {!atBottom && shown.length > 0 && (
          <Button
            size="sm"
            kind="secondary"
            icon={<ArrowDown size={11} />}
            className="absolute bottom-3 right-4 shadow-xl shadow-black/40"
            onClick={() => {
              setAtBottom(true);
              if (box.current) box.current.scrollTop = box.current.scrollHeight;
            }}
          >
            Jump to latest
          </Button>
        )}
      </div>
    </Panel>
  );
}

function Line({ line }: { line: OutputLine }) {
  return (
    <li className="flex items-start gap-2.5 py-px hover:bg-elevated/40">
      <span className="shrink-0 text-faint tnum">{clock(line.time)}</span>
      <span className={`inline-block w-[26px] shrink-0 text-[10px] uppercase tracking-wider ${line.stream === "orb" ? "text-primary" : "text-dim"}`}>{line.stream}</span>
      <span className={`min-w-0 whitespace-pre-wrap break-words ${tone(line.text)}`}>{line.text}</span>
    </li>
  );
}
