"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { fmtInt } from "@gorbital/dash/lib/format";
import type { LogRecord } from "@/lib/api/logs";
import { LogLine } from "./log-line";

const CHUNK = 150;

type Props = {
  rows: LogRecord[];
  loading?: boolean;
  empty: ReactNode;
  /** Records the tail holds back while the reader is scrolled into the list. */
  pending: number;
  /** The reader scrolled into the list (true) or back to its top (false). */
  onHold: (held: boolean) => void;
  onShowPending: () => void;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  selectedId?: number;
  actions: (log: LogRecord) => ReactNode;
};

/**
 * The records, newest first. Rows render in chunks of 150 as the reader
 * scrolls (a sentinel near the end asks for the next chunk), so a page of
 * 1,000 paints at once without a thousand rows in the tree; each row also
 * skips layout while off screen. A sentinel at the top tells the tail
 * when the reader has scrolled away, and the pill brings them back.
 */
export function LogList({ rows, loading, empty, pending, onHold, onShowPending, hasOlder, loadingOlder, onLoadOlder, selectedId, actions }: Props) {
  const [limit, setLimit] = useState(CHUNK);
  const top = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = top.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => onHold(!e.isIntersecting), { rootMargin: "80px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onHold]);

  useEffect(() => {
    const el = more.current;
    if (!el || limit >= rows.length) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setLimit((l) => Math.min(rows.length, l + CHUNK));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, rows.length]);

  useEffect(() => {
    if (rows.length <= CHUNK && limit !== CHUNK) setLimit(CHUNK);
  }, [rows.length, limit]);

  const shown = rows.length > limit ? rows.slice(0, limit) : rows;

  return (
    <div className="relative">
      <div ref={top} className="absolute top-0 h-px w-full" aria-hidden="true" />
      {pending > 0 && (
        <div className="sticky top-2 z-10 flex justify-center">
          <button
            type="button"
            onClick={() => {
              onShowPending();
              top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 font-mono text-[11px] text-primary shadow-lg shadow-black/40 backdrop-blur hover:bg-primary/25"
          >
            <ArrowUp size={11} /> {fmtInt(pending)} new record{pending === 1 ? "" : "s"}
          </button>
        </div>
      )}
      {loading && rows.length === 0 ? (
        <SkeletonLines lines={10} className="p-4" />
      ) : rows.length === 0 ? (
        empty
      ) : (
        <ol className="border-t border-hairline">
          {shown.map((l) => (
            <LogLine key={l.id} log={l} showSource selected={l.id === selectedId} actions={actions(l)} />
          ))}
        </ol>
      )}
      {rows.length > limit && <div ref={more} className="h-px w-full" aria-hidden="true" />}
      {rows.length > 0 && (
        <div className="flex items-center justify-center gap-3 border-t border-hairline p-2 font-mono text-[11px] text-dim">
          {shown.length < rows.length && (
            <Button size="sm" kind="ghost" onClick={() => setLimit((l) => l + CHUNK)}>
              Show {fmtInt(Math.min(CHUNK, rows.length - shown.length))} more of the loaded {fmtInt(rows.length)}
            </Button>
          )}
          {hasOlder && (
            <Button size="sm" kind="ghost" icon={<ChevronDown size={11} />} onClick={onLoadOlder} loading={loadingOlder}>
              Load older
            </Button>
          )}
          {!hasOlder && shown.length >= rows.length && <span>{fmtInt(rows.length)} record{rows.length === 1 ? "" : "s"} · the oldest in this window</span>}
        </div>
      )}
    </div>
  );
}

