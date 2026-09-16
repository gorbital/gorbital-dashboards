"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Eraser, RefreshCw, Search } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { ConfirmDialog, Dialog } from "@gorbital/dash/components/dialog";
import { Select } from "@gorbital/dash/components/input";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { toneColor } from "@gorbital/dash/theme";
import { statementSorts, useDbStatements, useResetStatements, type Statement, type StatementSort } from "@/lib/api/observability";
import { useCapabilities } from "@/lib/api/queries";
import { useExplainSql, type PlanRoot } from "@/lib/api/sql";
import { count, millis, oneLine, percent } from "@/lib/observability/format";
import { gradeTone, hitGrade } from "@/lib/observability/grade";
import { hasPlaceholders, shareLabel, statementForEditor, statementRows, statementSortLabel } from "@/lib/observability/statements";
import { when } from "@/lib/time";
import { ExplainView } from "@/components/sql-editor/explain-view";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { CopyButton } from "@/components/auth/common";
import { NoDatabase, OpenInSqlEditorButton } from "./common";

const limits = [25, 50, 100, 250, 500];

/** Item 66: pg_stat_statements with a share bar per statement, Explain (the SQL editor's generic plan), Open in SQL editor, and Reset. */
export function QueriesTab() {
  const caps = useCapabilities();
  const noDatabase = caps.status.data?.portal.database === false;
  const [sort, setSort] = useState<StatementSort>("total_time");
  const [limit, setLimit] = useState(50);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [explaining, setExplaining] = useState<Statement | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const statements = useDbStatements(sort, limit, !noDatabase);
  const reset = useResetStatements();
  const data = statements.data;
  const rows = data ? statementRows(data.statements) : [];
  const toggle = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (noDatabase) return <NoDatabase />;
  if (statements.error && !data) return <ProblemPanel error={statements.error} scope="portal" meta="GET /_portal/api/db/statements" onRetry={() => void statements.refetch()} retrying={statements.isFetching} />;

  if (data && !data.available) {
    return (
      <Panel title="pg_stat_statements isn't available" meta="GET /_portal/api/db/statements">
        <div className="grid max-w-3xl gap-3 text-[12px] text-muted">
          <p>{data.reason}</p>
          <Code>
            <Cmt># compose.yaml, the postgres service; then recreate the container</Cmt>
            {'\nservices:\n  postgres:\n    command: ["postgres", "-c", "shared_preload_libraries=pg_stat_statements"]\n\n'}
            <Cmt># docker compose up -d --force-recreate postgres</Cmt>
          </Code>
          <p className="text-dim">orb dev creates the extension on first use once the server preloads it. The Database and Advice tabs work without it.</p>
          <div>
            <Button size="sm" kind="secondary" icon={<RefreshCw size={11} />} onClick={() => void statements.refetch()} loading={statements.isFetching}>
              Check again
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  const totalMs = rows.reduce((a, s) => a + s.total_ms, 0);
  const totalCalls = rows.reduce((a, s) => a + s.calls, 0);
  const shown = rows.reduce((a, s) => a + s.total_share, 0);

  return (
    <div className="flex flex-col gap-3">
      <TileGrid>
        <Tile label="Statements" value={data ? String(rows.length) : "—"} unit={data ? `shown · ${percent(shown, 0)} of all time` : undefined} hero loading={statements.isPending} footer={data?.since ? `counting since ${when(data.since)}` : "since the last reset"} />
        <Tile label="Calls" value={data ? count(totalCalls) : "—"} loading={statements.isPending} footer="across the statements shown" />
        <Tile label="Total time" value={data ? millis(totalMs) : "—"} loading={statements.isPending} footer="execution time, shown statements" />
        <Tile label="Heaviest" value={rows[0] ? shareLabel(rows[0].total_share) : "—"} unit={rows[0] ? "of all time" : undefined} loading={statements.isPending} deltaTone={rows[0] && rows[0].total_share > 0.5 ? "bad" : "flat"} footer={rows[0] ? oneLine(rows[0].query, 60) : undefined} />
      </TileGrid>
      <Panel
        title="Statements"
        meta="pg_stat_statements · normalised text, $n placeholders"
        flush
        actions={
          <>
            <span className="w-[130px]">
              <Select value={sort} onChange={(e) => setSort(e.target.value as StatementSort)} aria-label="Sort">
                {statementSorts.map((s) => (
                  <option key={s} value={s}>
                    {statementSortLabel[s]}
                  </option>
                ))}
              </Select>
            </span>
            <span className="w-[100px]">
              <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Limit">
                {limits.map((l) => (
                  <option key={l} value={l}>
                    top {l}
                  </option>
                ))}
              </Select>
            </span>
            <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void statements.refetch()} loading={statements.isFetching}>
              Refresh
            </Button>
            <Button size="sm" kind="secondary" icon={<Eraser size={11} />} onClick={() => setResetOpen(true)} disabled={!data}>
              Reset
            </Button>
          </>
        }
      >
        <Table<(typeof rows)[number]>
          rows={rows}
          rowKey={(s) => String(s.query_id)}
          loading={statements.isPending}
          dense
          columns={[
            {
              key: "q",
              header: "Query",
              cell: (s) => (
                <div className="min-w-[320px]">
                  <button type="button" onClick={() => toggle(s.query_id)} className="flex w-full items-start gap-1.5 text-left" aria-expanded={expanded.has(s.query_id)}>
                    <span className="mt-0.5 text-faint">{expanded.has(s.query_id) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</span>
                    {expanded.has(s.query_id) ? <span className="whitespace-pre-wrap font-mono text-[11px] text-text">{s.query}</span> : <span className="block max-w-[560px] truncate font-mono text-[11px] text-text">{oneLine(s.query, 140)}</span>}
                  </button>
                  {expanded.has(s.query_id) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
                      <Button size="sm" kind="secondary" icon={<Search size={11} />} onClick={() => setExplaining(s)}>
                        Explain
                      </Button>
                      <OpenInSqlEditorButton sql={statementForEditor(s)} kind="ghost" />
                      <CopyButton text={s.query} />
                      <span className="font-mono text-[10.5px] text-dim">
                        id {s.query_id} · stddev {millis(s.stddev_ms)}
                        {hasPlaceholders(s.query) ? " · generic plan" : ""}
                      </span>
                    </div>
                  )}
                </div>
              ),
            },
            { key: "calls", header: "Calls", width: "90px", align: "right", cell: (s) => <span className="font-mono text-text tnum">{count(s.calls)}</span> },
            {
              key: "total",
              header: "Total",
              width: "170px",
              align: "right",
              cell: (s) => (
                <div className="grid gap-1">
                  <span className="font-mono text-text tnum">
                    {millis(s.total_ms)} <span className="text-dim">· {shareLabel(s.total_share)}</span>
                  </span>
                  <div className="h-[3px] w-full overflow-hidden rounded-full bg-elevated">
                    <div className="h-full rounded-full" style={{ width: `${s.share_width}%`, background: s.total_share >= 0.5 ? toneColor.danger : s.total_share >= 0.2 ? toneColor.warn : toneColor.accent }} />
                  </div>
                </div>
              ),
            },
            { key: "mean", header: "Mean", width: "90px", align: "right", cell: (s) => <span className="font-mono text-text tnum">{millis(s.mean_ms)}</span> },
            { key: "minmax", header: "Min / max", width: "150px", align: "right", cell: (s) => <span className="font-mono text-[11px] text-dim tnum">{millis(s.min_ms)} / {millis(s.max_ms)}</span> },
            { key: "rows", header: "Rows", width: "90px", align: "right", cell: (s) => <span className="font-mono text-dim tnum">{count(s.rows)}</span> },
            { key: "hit", header: "Hit", width: "80px", align: "right", cell: (s) => <Badge tone={gradeTone[hitGrade(s.hit_ratio)]}>{percent(s.hit_ratio, 0)}</Badge> },
          ]}
          empty={<Empty title="No statements yet" hint="pg_stat_statements counts from the app's next query; Refresh when it has run some." />}
        />
      </Panel>
      <ExplainDialog statement={explaining} onClose={() => setExplaining(null)} />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset the statement statistics?"
        description="pg_stat_statements_reset() forgets every counter for this server; the table fills again as the app runs queries."
        confirmLabel="Reset"
        danger
        loading={reset.isPending}
        onConfirm={() => reset.mutate(undefined, { onSettled: () => setResetOpen(false) })}
      />
    </div>
  );
}

/** Explain runs the SQL editor's EXPLAIN on the normalised text (a generic plan where placeholders remain) and shows the plan tree. */
function ExplainDialog({ statement, onClose }: { statement: Statement | null; onClose: () => void }) {
  const explain = useExplainSql();
  const [plan, setPlan] = useState<PlanRoot[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const open = statement !== null;
  const sql = statement?.query;
  const { mutate } = explain;
  // Every opening explains afresh: the plan can change with the statistics, and a failure shouldn't stick.
  useEffect(() => {
    if (!sql) return;
    setPlan(undefined);
    setError(undefined);
    mutate({ sql }, { onSuccess: (r) => setPlan(r.plan), onError: (e) => setError(e.message) });
  }, [sql, mutate]);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Plan"
      description={statement ? oneLine(statement.query, 140) : undefined}
      size="lg"
      footer={
        statement && (
          <>
            <OpenInSqlEditorButton sql={statementForEditor(statement)} kind="secondary" />
            <Button size="sm" kind="primary" onClick={onClose}>
              Close
            </Button>
          </>
        )
      }
    >
      {statement && hasPlaceholders(statement.query) && <p className="mb-2 font-mono text-[11px] text-dim">The text is normalised ($1, $2…), so this is a generic plan: PostgreSQL plans without the parameter values.</p>}
      {error ? (
        <div className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-[12px] text-danger">{error}</div>
      ) : (
        <div className="h-[380px] rounded-lg border border-hairline">
          <ExplainView plan={plan} explaining={explain.isPending} />
        </div>
      )}
    </Dialog>
  );
}
