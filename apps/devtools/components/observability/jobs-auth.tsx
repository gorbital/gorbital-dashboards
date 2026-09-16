"use client";

import { useMemo } from "react";
import Link from "next/link";
import { KeyRound, Zap } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Empty, Legend, Panel } from "@gorbital/dash/components/panel";
import { Split } from "@gorbital/dash/components/progress";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { theme } from "@gorbital/dash/theme";
import { useAudit, useAuditStats, useCapabilities, useJobsOverview } from "@/lib/api/queries";
import type { AuditEvent, AuditStatsGroup, QueueOverview } from "@/lib/api/types";
import { count, percent } from "@/lib/observability/format";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";

const signInActions = ["auth.login.succeeded", "auth.login.failed", "auth.session.created"];

/** Item 68: job throughput and failures per queue from /ops/jobs/overview, and sign-ins from the audit statistics (auth.* by action) with the methods of the latest successful logins. */
export function JobsAuthTab() {
  return (
    <Gate need="ops" loading={<SkeletonLines lines={6} className="p-4" />}>
      <JobsAuthBody />
    </Gate>
  );
}

function JobsAuthBody() {
  const caps = useCapabilities();
  const overview = useJobsOverview(caps.ops);
  const auth = useAuditStats("action", { action_prefix: "auth." }, caps.ops);
  const logins = useAudit({ action: "auth.login.succeeded", limit: 100 }, caps.ops);
  const queues = overview.data?.queues ?? [];
  const sum = (k: keyof Omit<QueueOverview, "name" | "active" | "paused">) => queues.reduce((a, q) => a + q[k], 0);
  const groups = auth.data?.groups ?? [];
  const signIns = groups.filter((g) => signInActions.includes(g.key));
  const succeeded = groups.find((g) => g.key === "auth.login.succeeded")?.count ?? 0;
  const failed = groups.find((g) => g.key === "auth.login.failed")?.count ?? 0;
  const methods = useMemo(() => byMethod(logins.data?.pages.flatMap((p) => p.events ?? []) ?? []), [logins.data]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-3">
        <TileGrid cols={3}>
          <Tile label="Running" value={overview.data ? count(sum("running")) : "—"} hero loading={overview.isPending} icon={<Zap size={12} />} footer={overview.data ? `${count(sum("available") + sum("scheduled"))} queued or scheduled` : "/ops/jobs/overview"} />
          <Tile label="Retrying" value={overview.data ? count(sum("retryable")) : "—"} loading={overview.isPending} deltaTone={sum("retryable") > 0 ? "bad" : "flat"} footer="waiting for their next attempt" />
          <Tile label="Discarded" value={overview.data ? count(sum("discarded_last_day")) : "—"} unit="24 h" loading={overview.isPending} deltaTone={sum("discarded_last_day") > 0 ? "bad" : "flat"} footer="ran out of attempts" />
        </TileGrid>
        <Panel title="Queues" meta="/ops/jobs/overview · every 10 s" flush actions={overview.data?.failing?.length ? <Badge tone="danger">{overview.data.failing.length} failing definition{overview.data.failing.length === 1 ? "" : "s"}</Badge> : undefined}>
          {overview.error && !overview.data ? (
            <ProblemPanel error={overview.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/jobs/overview" onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
          ) : (
            <Table<QueueOverview>
              rows={queues}
              rowKey={(q) => q.name}
              loading={overview.isPending}
              dense
              columns={[
                {
                  key: "name",
                  header: "Queue",
                  cell: (q) => (
                    <span className="flex items-center gap-2">
                      <Dot tone={q.paused ? "warn" : q.active ? "ok" : "muted"} pulse={q.running > 0} />
                      <Link href={`/jobs?queue=${encodeURIComponent(q.name)}`} className="font-mono text-text hover:underline">
                        {q.name}
                      </Link>
                      {q.paused && <Badge tone="warn">paused</Badge>}
                    </span>
                  ),
                },
                {
                  key: "mix",
                  header: "Unfinished",
                  width: "160px",
                  cell: (q) => (
                    <Split
                      parts={[
                        { value: q.running, color: theme.primary },
                        { value: q.available, color: theme.info },
                        { value: q.scheduled, color: theme.muted },
                        { value: q.retryable, color: theme.warn },
                      ]}
                      height={4}
                    />
                  ),
                },
                { key: "running", header: "Running", width: "80px", align: "right", cell: (q) => <span className="font-mono text-text tnum">{q.running}</span> },
                { key: "available", header: "Available", width: "90px", align: "right", cell: (q) => <span className="font-mono text-dim tnum">{q.available}</span> },
                { key: "scheduled", header: "Scheduled", width: "90px", align: "right", cell: (q) => <span className="font-mono text-dim tnum">{q.scheduled}</span> },
                { key: "retryable", header: "Retrying", width: "80px", align: "right", cell: (q) => <span className={`font-mono tnum ${q.retryable > 0 ? "text-warn" : "text-dim"}`}>{q.retryable}</span> },
                { key: "discarded", header: "Discarded 24 h", width: "120px", align: "right", cell: (q) => <span className={`font-mono tnum ${q.discarded_last_day > 0 ? "text-danger" : "text-dim"}`}>{q.discarded_last_day}</span> },
              ]}
              empty={<Empty title="No active queues" hint="Queues appear when a worker runs or a job waits." />}
            />
          )}
          <div className="px-4 py-2.5">
            <Legend
              items={[
                { label: "running", color: theme.primary },
                { label: "available", color: theme.info },
                { label: "scheduled", color: theme.muted },
                { label: "retrying", color: theme.warn },
              ]}
            />
          </div>
        </Panel>
        {overview.data?.failing && overview.data.failing.length > 0 && (
          <Panel title="Failing definitions" meta="latest run retrying or discarded" flush>
            <ul>
              {overview.data.failing.map((d) => (
                <li key={d.name} className="flex items-center gap-3 border-t border-hairline px-4 py-2 text-[12px] first:border-0">
                  <Dot tone="danger" />
                  <Link href={`/jobs?kind=${encodeURIComponent(d.name)}`} className="font-mono text-text hover:underline">
                    {d.name}
                  </Link>
                  <span className="ml-auto font-mono text-[11px] text-dim">
                    {d.last_run ? `run #${d.last_run.id} · ${d.last_run.state} · attempt ${d.last_run.attempt} of ${d.last_run.max_attempts}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <TileGrid cols={3}>
          <Tile label="Sign-ins" value={auth.data ? count(succeeded) : "—"} hero loading={auth.isPending} icon={<KeyRound size={12} />} footer={auth.data ? `last 7 days · ${count(auth.data.total)} auth.* events` : "/ops/audit/stats"} />
          <Tile label="Failed" value={auth.data ? count(failed) : "—"} loading={auth.isPending} deltaTone={failed > 0 && failed > succeeded / 4 ? "bad" : "flat"} footer={auth.data && succeeded + failed > 0 ? `${percent(failed / (succeeded + failed), 1)} of attempts` : "wrong password, locked, refused"} />
          <Tile label="Methods" value={logins.data ? String(methods.length) : "—"} loading={logins.isPending} footer={methods.length ? methods.map((m) => m.key).join(", ") : "of the latest successful logins"} />
        </TileGrid>
        <Panel title="Sign-ins by method" meta="metadata.method of the last 100 auth.login.succeeded" flush>
          {logins.error && !logins.data ? (
            <ProblemPanel error={logins.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/audit?action=auth.login.succeeded" onRetry={() => void logins.refetch()} retrying={logins.isFetching} />
          ) : (
            <Table<AuditStatsGroup>
              rows={methods}
              rowKey={(m) => m.key}
              loading={logins.isPending}
              dense
              columns={[
                { key: "m", header: "Method", cell: (m) => <span className="font-mono text-text">{m.key}</span> },
                { key: "share", header: "Share", width: "160px", cell: (m) => <Split parts={[{ value: m.count, color: theme.primary }, { value: Math.max(0, methods.reduce((a, x) => a + x.count, 0) - m.count), color: theme.elevated }]} height={4} /> },
                { key: "n", header: "Logins", width: "90px", align: "right", cell: (m) => <span className="font-mono text-text tnum">{count(m.count)}</span> },
              ]}
              empty={<Empty title="No successful sign-ins yet" hint="Sign in through the API, or act as a user from the Authentication screen; the method comes from the audit record." />}
            />
          )}
        </Panel>
        <Panel title="Auth events by action" meta="/ops/audit/stats?group_by=action&action_prefix=auth." flush>
          {auth.error && !auth.data ? (
            <ProblemPanel error={auth.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/audit/stats" onRetry={() => void auth.refetch()} retrying={auth.isFetching} />
          ) : (
            <Table<AuditStatsGroup>
              rows={groups}
              rowKey={(g) => g.key}
              loading={auth.isPending}
              dense
              columns={[
                {
                  key: "a",
                  header: "Action",
                  cell: (g) => (
                    <Link href={`/audit?action=${encodeURIComponent(g.key)}`} className="font-mono text-text hover:underline">
                      {g.key}
                    </Link>
                  ),
                },
                { key: "k", header: "", width: "90px", cell: (g) => (signIns.includes(g) ? <Badge tone="accent">sign-in</Badge> : null) },
                { key: "n", header: "Events", width: "90px", align: "right", cell: (g) => <span className="font-mono text-text tnum">{count(g.count)}</span> },
              ]}
              empty={<Empty title="No auth events in the last 7 days" hint="Sign-ins, sessions, MFA and role changes land in the audit log under auth.*." />}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Successful logins grouped by `metadata.method` (a social provider), else `mfa_method` (password + a second factor), else password. */
function byMethod(events: AuditEvent[]): AuditStatsGroup[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const m = e.metadata?.method;
    const mfa = e.metadata?.mfa_method;
    const key = typeof m === "string" && m ? m : typeof mfa === "string" && mfa ? `password + ${mfa}` : "password";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}
