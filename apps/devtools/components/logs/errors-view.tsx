"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Filter, RefreshCw } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { fmtInt } from "@gorbital/dash/lib/format";
import { attrOf, useLogErrors, type ErrorGroup } from "@/lib/api/logs";
import { literalOfShape } from "@/lib/logs/fingerprint";
import type { LogFilters } from "@/lib/logs/filters";
import { ago, clock, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { LogLine, levelTone, sourceTone } from "./log-line";

type Props = {
  filters: LogFilters;
  enabled: boolean;
  /** Switch to the records with these filters. */
  onSeeRecords: (next: LogFilters) => void;
  onOpenRecord: (id: number) => void;
};

/** Records at WARN and above in the window, grouped by fingerprint: shape, stack top, count, first and last seen, the last record. */
export function ErrorsView({ filters, enabled, onSeeRecords, onOpenRecord }: Props) {
  const errors = useLogErrors(filters, enabled);
  const now = useNow(10_000);
  const [open, setOpen] = useState<string | null>(null);
  const groups = errors.data?.groups ?? [];

  const seeRecords = (g: ErrorGroup) => {
    const rid = attrOf(g.last, "request_id");
    const next: LogFilters = { range: filters.range, from: filters.from, to: filters.to, source: [g.source], min_level: "WARN" };
    if (rid && g.count === 1) next.request_id = rid;
    else next.q = literalOfShape(g.shape);
    onSeeRecords(next);
  };

  if (errors.error && !errors.data) return <ProblemPanel error={errors.error} scope="portal" meta="GET /_portal/api/logs/errors" onRetry={() => void errors.refetch()} retrying={errors.isFetching} />;

  return (
    <Panel
      title="Errors"
      meta={errors.data ? `${fmtInt(groups.length)} groups · ${fmtInt(groups.reduce((a, g) => a + g.count, 0))} records at WARN and above` : "grouped by message shape and stack top"}
      actions={
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void errors.refetch()} loading={errors.isFetching}>
          Refresh
        </Button>
      }
      flush
    >
      {errors.isPending ? (
        <SkeletonLines lines={6} className="p-4" />
      ) : groups.length === 0 ? (
        <Empty title="No errors" hint="Nothing at WARN or above matches the filters in this window." />
      ) : (
        <ol className="border-t border-hairline">
          {groups.map((g) => {
            const isOpen = open === g.fingerprint;
            const rid = attrOf(g.last, "request_id");
            return (
              <li key={g.fingerprint} className="border-b border-hairline last:border-0">
                <button type="button" onClick={() => setOpen(isOpen ? null : g.fingerprint)} aria-expanded={isOpen} className="grid w-full grid-cols-[14px_52px_66px_1fr_70px_130px_130px] items-center gap-3 px-4 py-2 text-left text-[12px] hover:bg-elevated/40">
                  <ChevronRight size={11} className={`text-faint transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <Badge tone={levelTone(g.level)} className="justify-center">
                    {g.level}
                  </Badge>
                  <Badge tone={sourceTone(g.source)} className="justify-center">
                    {g.source}
                  </Badge>
                  <span className="min-w-0">
                    <span className={`block truncate font-mono text-[11.5px] ${levelTone(g.level) === "danger" ? "text-danger" : "text-text"}`}>{g.shape || <span className="text-faint">(empty message)</span>}</span>
                    {g.top && <span className="block truncate font-mono text-[11px] text-dim">{g.top}</span>}
                  </span>
                  <span className="text-right font-mono text-[12px] text-text tnum">× {fmtInt(g.count)}</span>
                  <span className="font-mono text-[11px] text-dim tnum" title={`first seen ${when(g.first_seen)}`}>
                    first {ago(g.first_seen, now)}
                  </span>
                  <span className="font-mono text-[11px] text-dim tnum" title={`last seen ${when(g.last_seen)}`}>
                    last {ago(g.last_seen, now)}
                  </span>
                </button>
                {isOpen && (
                  <div className="grid gap-2 bg-code-bg/40 px-4 pb-3 pt-1">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-dim">
                      <span>fingerprint {g.fingerprint}</span>
                      <span>
                        first {when(g.first_seen)} · {clock(g.first_seen)}
                      </span>
                      <span>
                        last {when(g.last_seen)} · {clock(g.last_seen)}
                      </span>
                    </div>
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-dim">Last record</div>
                    <ol className="rounded-lg border border-hairline">
                      <LogLine
                        log={g.last}
                        open
                        showSource
                        actions={
                          <>
                            <Button size="sm" kind="secondary" icon={<Filter size={11} />} onClick={() => seeRecords(g)}>
                              See records
                            </Button>
                            <Button size="sm" kind="ghost" onClick={() => onOpenRecord(g.last.id)}>
                              Details
                            </Button>
                            {rid && (
                              <Link href={`/requests?id=${encodeURIComponent(rid)}`} className="text-[11px] text-primary hover:underline">
                                Open the request
                              </Link>
                            )}
                          </>
                        }
                      />
                    </ol>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
