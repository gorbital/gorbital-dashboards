"use client";

import Link from "next/link";
import { Copy } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { attrOf, isNoLogStore, useRequestLogs, type LogRecord } from "@/lib/api/logs";
import { copyText } from "@/lib/copy";
import { clock, when } from "@/lib/time";
import { LogLine, levelTone, sourceTone } from "./log-line";

type Props = {
  record: LogRecord | undefined;
  /** The id asked for, so the sheet can say a record isn't loaded. */
  id: number | undefined;
  onClose: () => void;
  onFilterRequest: (requestId: string) => void;
};

/** One record in full: its fields, its JSON, and the other records of its request. */
export function RecordSheet({ record, id, onClose, onFilterRequest }: Props) {
  const requestId = record ? attrOf(record, "request_id") : undefined;
  const request = useRequestLogs(requestId, Boolean(record));
  const json = record ? JSON.stringify(record, null, 2) : "";
  return (
    <Sheet open={id !== undefined} onOpenChange={(o) => !o && onClose()} title={record ? record.message || record.raw || "Record" : "Record"} meta={id !== undefined ? `#${id}` : undefined} width="lg" flush>
      {!record ? (
        <Empty title="Not in the loaded records" hint="Load older records, widen the window, or clear the filters to reach it." />
      ) : (
        <div className="grid gap-4 p-5">
          <div className="flex items-center gap-2">
            <Badge tone={levelTone(record.level)}>{record.level}</Badge>
            <Badge tone={sourceTone(record.source)}>{record.source}</Badge>
            <span className="font-mono text-[11px] text-dim">
              {when(record.time)} · {clock(record.time)}
            </span>
            <Button size="sm" kind="ghost" icon={<Copy size={11} />} className="ml-auto" onClick={() => void copyText(json, "Copied the record as JSON")}>
              Copy JSON
            </Button>
          </div>
          <KeyList
            rows={[
              { k: "Id", v: String(record.id) },
              { k: "Time", v: record.time },
              { k: "Source", v: record.source },
              { k: "Level", v: record.level },
              { k: "Message", v: record.message || "—" },
              ...(requestId ? [{ k: "Request", v: requestId }] : []),
              ...(attrOf(record, "trace_id") ? [{ k: "Trace", v: attrOf(record, "trace_id") }] : []),
            ]}
          />
          {record.raw && (
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">Raw line</div>
              <Code className="whitespace-pre-wrap break-all">{record.raw}</Code>
            </div>
          )}
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">Attributes</div>
            {(record.attrs ?? []).length === 0 ? (
              <p className="text-[12px] text-dim">none</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1 rounded-lg border border-hairline bg-code-bg p-3 font-mono text-[11px]">
                {record.attrs!.map((a, i) => (
                  <div key={`${a.key}-${i}`} className="group contents">
                    <dt className="text-primary">{a.key}</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-all text-text">{a.value}</dd>
                    <dd>
                      <button type="button" aria-label={`Copy ${a.key}`} onClick={() => void copyText(a.value, `Copied ${a.key}`)} className="grid h-5 w-5 place-items-center rounded text-faint opacity-0 hover:bg-elevated hover:text-text focus-visible:opacity-100 group-hover:opacity-100">
                        <Copy size={10} />
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">JSON</div>
            <Code className="max-h-[320px] overflow-auto whitespace-pre-wrap break-all">{json}</Code>
          </div>
          {requestId && (
            <Panel
              title="Request"
              meta={requestId}
              flush
              actions={
                <>
                  <Button size="sm" kind="ghost" onClick={() => onFilterRequest(requestId)}>
                    All logs for this request
                  </Button>
                  <Link href={`/requests?id=${encodeURIComponent(requestId)}`} className="text-[11px] text-primary hover:underline">
                    Open the request
                  </Link>
                </>
              }
            >
              {request.isPending ? (
                <SkeletonLines lines={4} className="p-4" />
              ) : request.error ? (
                <Empty title={isNoLogStore(request.error) ? "No log store" : "Couldn't load the request's records"} hint={request.error.message} />
              ) : (request.data?.logs ?? []).length === 0 ? (
                <Empty title="No other records" hint="Nothing else carries this request id." />
              ) : (
                <ol className="border-t border-hairline">
                  {request.data!.logs.map((l) => (
                    <LogLine key={l.id} log={l} showSource selected={l.id === record.id} open={l.id === record.id} />
                  ))}
                </ol>
              )}
            </Panel>
          )}
        </div>
      )}
    </Sheet>
  );
}
