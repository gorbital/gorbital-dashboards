"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, RefreshCw, X } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Input, Select } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table } from "@gorbital/dash/components/table";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { fmtInt } from "@gorbital/dash/lib/format";
import type { Tone } from "@gorbital/dash/theme";
import { useAudit, useAuditStats, useCapabilities } from "@/lib/api/queries";
import type { AuditEvent, AuditFilter, AuditOutcome } from "@/lib/api/types";
import { clock, when } from "@/lib/time";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";

const outcomeTone: Record<AuditOutcome, Tone> = { success: "ok", failure: "danger", denied: "warn" };

type Draft = { action: string; actor_kind: string; actor_id: string; outcome: "" | AuditOutcome; from: string; to: string };
const emptyDraft: Draft = { action: "", actor_kind: "", actor_id: "", outcome: "", from: "", to: "" };

/** The form's fields as the API wants them: empty strings dropped, local times as RFC 3339. */
function toFilter(d: Draft): AuditFilter {
  const iso = (v: string) => (v ? new Date(v).toISOString() : undefined);
  return {
    action: d.action.trim() || undefined,
    actor_kind: d.actor_kind || undefined,
    actor_id: d.actor_id.trim() || undefined,
    outcome: d.outcome || undefined,
    from: iso(d.from),
    to: iso(d.to),
  };
}

export function Audit() {
  const caps = useCapabilities();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filter, setFilter] = useState<AuditFilter>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onParam = useCallback((v: string | null) => setSelectedId(v), []);
  const events = useAudit(filter, caps.ops);
  const byOutcome = useAuditStats("outcome", filter, caps.ops);
  const byAction = useAuditStats("action", filter, caps.ops);

  const rows = useMemo(() => events.data?.pages.flatMap((p) => p.events ?? []) ?? [], [events.data]);
  const selected = useMemo(() => rows.find((e) => String(e.id) === selectedId), [rows, selectedId]);
  const count = (key: AuditOutcome) => byOutcome.data?.groups?.find((g) => g.key === key)?.count ?? 0;
  const topAction = byAction.data?.groups?.[0];
  const active = Object.values(filter).some(Boolean);

  const apply = () => setFilter(toFilter(draft));
  const clear = () => {
    setDraft(emptyDraft);
    setFilter({});
  };
  const open = (e: AuditEvent) => {
    setSelectedId(String(e.id));
    setQueryParam("id", String(e.id));
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
      <PageHeader product="devtools" title="Audit" description={byOutcome.data ? `${fmtInt(byOutcome.data.total)} events ${active ? "match" : "in the last 7 days"} · /ops/audit` : "who did what, as the app recorded it"}>
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void Promise.all([events.refetch(), byOutcome.refetch(), byAction.refetch()])} loading={events.isFetching && !events.isFetchingNextPage}>
          Refresh
        </Button>
      </PageHeader>
      <Page>
        <Gate need="ops" loading={<Table<AuditEvent> columns={columns} rows={[]} rowKey={(e) => String(e.id)} loading />}>
          {events.error && !events.data ? (
            <ProblemPanel error={events.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/audit" onRetry={() => void events.refetch()} retrying={events.isFetching} />
          ) : (
            <>
              <TileGrid>
                <Tile label="Events" value={byOutcome.data ? fmtInt(byOutcome.data.total) : "—"} unit={active ? "matching" : "7 days"} hero loading={byOutcome.isPending} footer={byOutcome.data ? `${when(byOutcome.data.from)} → ${when(byOutcome.data.to)}` : undefined} />
                <Tile label="Failures" value={byOutcome.data ? fmtInt(count("failure")) : "—"} loading={byOutcome.isPending} deltaTone={count("failure") > 0 ? "bad" : "flat"} footer="outcome: failure" />
                <Tile label="Denied" value={byOutcome.data ? fmtInt(count("denied")) : "—"} loading={byOutcome.isPending} footer="outcome: denied" />
                <Tile label="Top action" value={topAction?.key ?? (byAction.data ? "—" : "…")} unit={topAction ? `× ${fmtInt(topAction.count)}` : undefined} loading={byAction.isPending} footer={byAction.data ? `${byAction.data.groups?.length ?? 0} distinct actions` : undefined} />
              </TileGrid>
              <Panel title="Filters" meta="every field combines; times compare with occurred_at">
                <form
                  className="grid grid-cols-[1.4fr_1fr_1.2fr_1fr_1fr_1fr_auto] items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    apply();
                  }}
                >
                  <Input mono value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} placeholder="action, e.g. settings.value.changed" aria-label="Action" />
                  <Select value={draft.actor_kind} onChange={(e) => setDraft({ ...draft, actor_kind: e.target.value })} aria-label="Actor kind">
                    <option value="">Any actor kind</option>
                    <option value="user">user</option>
                    <option value="service_account">service_account</option>
                    <option value="dev_operator">dev_operator</option>
                    <option value="system">system</option>
                  </Select>
                  <Input mono value={draft.actor_id} onChange={(e) => setDraft({ ...draft, actor_id: e.target.value })} placeholder="actor id" aria-label="Actor id" />
                  <Select value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value as Draft["outcome"] })} aria-label="Outcome">
                    <option value="">Any outcome</option>
                    <option value="success">success</option>
                    <option value="failure">failure</option>
                    <option value="denied">denied</option>
                  </Select>
                  <Input type="datetime-local" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} aria-label="From" />
                  <Input type="datetime-local" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} aria-label="To" />
                  <span className="flex gap-1">
                    <Button type="submit" size="sm" kind="primary">
                      Apply
                    </Button>
                    <Button size="sm" kind="ghost" icon={<X size={11} />} onClick={clear} disabled={!active && draft === emptyDraft}>
                      Clear
                    </Button>
                  </span>
                </form>
              </Panel>
              <Panel flush>
                <Table<AuditEvent>
                  columns={columns}
                  rows={rows}
                  rowKey={(e) => String(e.id)}
                  dense
                  loading={events.isPending}
                  onRowClick={open}
                  selected={selectedId ?? undefined}
                  empty={<Empty title="No events" hint={active ? "Nothing matches these filters." : "The app hasn't recorded an audit event yet."} />}
                />
                {events.hasNextPage && (
                  <div className="flex justify-center border-t border-hairline p-2">
                    <Button size="sm" kind="ghost" icon={<ChevronDown size={11} />} onClick={() => void events.fetchNextPage()} loading={events.isFetchingNextPage}>
                      Load more
                    </Button>
                  </div>
                )}
              </Panel>
            </>
          )}
        </Gate>
      </Page>
      <Sheet open={Boolean(selectedId)} onOpenChange={(o) => !o && close()} title={selected?.action ?? "Audit event"} meta={selectedId ? `#${selectedId}` : undefined} width="lg">
        {selected ? <EventDetail event={selected} /> : <Empty title="Not on this page" hint="Load more events, or clear the filters, to reach this one." />}
      </Sheet>
    </>
  );
}

const columns = [
  { key: "t", header: "When", width: "150px", cell: (e: AuditEvent) => <span className="font-mono text-dim tnum">{when(e.occurred_at)}</span> },
  { key: "a", header: "Action", cell: (e: AuditEvent) => <span className="font-mono text-text">{e.action}</span> },
  {
    key: "who",
    header: "Actor",
    cell: (e: AuditEvent) => (
      <span className="flex items-center gap-1.5">
        <Badge tone={e.actor_kind === "user" ? "info" : e.actor_kind === "system" ? "muted" : "violet"}>{e.actor_kind}</Badge>
        <span className="truncate font-mono text-[11px] text-muted">{e.actor_label ?? e.actor_id ?? ""}</span>
      </span>
    ),
  },
  { key: "r", header: "Resource", cell: (e: AuditEvent) => <span className="font-mono text-[11px] text-dim">{e.resource_type ? `${e.resource_type} ${e.resource_id ?? ""}` : ""}</span> },
  { key: "o", header: "Outcome", width: "90px", cell: (e: AuditEvent) => <Badge tone={outcomeTone[e.outcome] ?? "muted"}>{e.outcome}</Badge> },
  {
    key: "req",
    header: "Request",
    width: "170px",
    cell: (e: AuditEvent) =>
      e.request_id ? (
        <Link href={`/requests?id=${encodeURIComponent(e.request_id)}`} onClick={(ev) => ev.stopPropagation()} className="font-mono text-[11px] text-dim hover:text-primary">
          {e.request_id}
        </Link>
      ) : null,
  },
];

function EventDetail({ event }: { event: AuditEvent }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Badge tone={outcomeTone[event.outcome] ?? "muted"}>{event.outcome}</Badge>
        <span className="font-mono text-[11px] text-dim">
          {when(event.occurred_at)} · {clock(event.occurred_at)}
        </span>
      </div>
      <KeyList
        rows={[
          { k: "Actor", v: `${event.actor_kind}${event.actor_id ? ` · ${event.actor_id}` : ""}` },
          { k: "Label", v: event.actor_label ?? "—" },
          { k: "Resource", v: event.resource_type ? `${event.resource_type} ${event.resource_id ?? ""}` : "—" },
          { k: "Organisation", v: event.org_id ?? "—" },
          { k: "Recorded", v: clock(event.recorded_at) },
          { k: "Request", v: event.request_id ?? "—" },
          { k: "Trace", v: event.trace_id ?? "—" },
          { k: "IP", v: event.ip ?? "—" },
          { k: "User agent", v: event.user_agent ?? "—" },
        ]}
      />
      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">Metadata</div>
        {Object.keys(event.metadata ?? {}).length === 0 ? <p className="text-[12px] text-dim">none</p> : <Code className="whitespace-pre-wrap">{JSON.stringify(event.metadata, null, 2)}</Code>}
      </div>
      {event.request_id && (
        <Link href={`/requests?id=${encodeURIComponent(event.request_id)}`} className="text-[12px] text-primary hover:underline">
          Open the request
        </Link>
      )}
    </div>
  );
}
