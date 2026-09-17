"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Panel } from "@gorbital/dash/components/panel";
import { Bar } from "@gorbital/dash/components/progress";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { fmtBytes, fmtInt } from "@gorbital/dash/lib/format";
import { theme } from "@gorbital/dash/theme";
import { isNoLogStore, useClearLogs, useLogStats } from "@/lib/api/logs";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";

type Props = {
  /** One row for the Logs page's footer; the full panel for Project Settings. */
  compact?: boolean;
  enabled?: boolean;
  /** Called after a successful clear, for a page that holds records of its own (the tail). */
  onCleared?: () => void;
};

/**
 * The log store's size, records and oldest record, with Clear behind a
 * confirmation. Used at the foot of the Logs page and, later, in Project
 * Settings.
 */
export function LogStorePanel({ compact, enabled = true, onCleared }: Props) {
  const stats = useLogStats(enabled);
  const clear = useClearLogs();
  const now = useNow(10_000);
  const [confirm, setConfirm] = useState(false);
  const st = stats.data;
  const pct = st ? Math.round((st.bytes / st.max_bytes) * 1000) / 10 : 0;

  const facts = st ? (
    <>
      <span>
        <b className="text-text">{fmtBytes(st.bytes)}</b> of {fmtBytes(st.max_bytes)}
      </span>
      <span>
        <b className="text-text">{fmtInt(st.records)}</b> records
      </span>
      <span>
        {st.segments} segment{st.segments === 1 ? "" : "s"}
      </span>
      <span title={st.oldest ? when(st.oldest) : undefined}>oldest {st.oldest ? ago(st.oldest, now) : "—"}</span>
    </>
  ) : stats.error ? (
    <span className="text-warn">{isNoLogStore(stats.error) ? "this orb dev keeps no log store" : stats.error.message}</span>
  ) : (
    <Skeleton className="h-3 w-48" />
  );

  const clearButton = (
    <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => setConfirm(true)} disabled={!st || st.records === 0} className="text-danger hover:text-danger">
      Clear
    </Button>
  );

  const dialog = (
    <ConfirmDialog
      open={confirm}
      onOpenChange={setConfirm}
      title="Clear the log store?"
      description={st ? `Deletes the ${fmtInt(st.records)} records (${fmtBytes(st.bytes)}) under ${st.dir}. The app keeps logging, so new records appear at once; saved filters stay.` : undefined}
      confirmLabel="Clear the store"
      danger
      loading={clear.isPending}
      onConfirm={() =>
        clear.mutate(undefined, {
          onSuccess: () => {
            setConfirm(false);
            onCleared?.();
          },
        })
      }
    />
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-hairline bg-surface px-4 py-2 font-mono text-[11px] text-dim">
        <span className="uppercase tracking-wider text-faint">Log store</span>
        {facts}
        {st && (
          <span className="w-24">
            <Bar value={st.bytes} max={st.max_bytes} height={4} color={pct > 80 ? theme.warn : theme.primaryMid} />
          </span>
        )}
        <span className="ml-auto">{clearButton}</span>
        {dialog}
      </div>
    );
  }

  return (
    <Panel title="Log store" meta={st?.dir ?? ".orb/portal/logs"} actions={clearButton}>
      <div className="grid gap-3 text-[12px] text-muted">
        <p>orb dev keeps the app's records here as JSON Lines, 8 MiB a segment and 64 MiB in all, the oldest segment dropped first. They survive the app's restarts; Clear deletes them.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-dim">{facts}</div>
        {st && <Bar value={st.bytes} max={st.max_bytes} height={6} color={pct > 80 ? theme.warn : theme.primaryMid} />}
      </div>
      {dialog}
    </Panel>
  );
}
