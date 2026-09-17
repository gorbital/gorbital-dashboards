"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, FilePlus2, Play, RotateCcw, RotateCw, Terminal } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { fmtAgo } from "@gorbital/dash/lib/format";
import { SchemaNotice } from "@/components/database/schema-notice";
import { DbGate, DbPageSkeleton, DbProblem, useMounted } from "@/components/db-objects/common";
import { useStatus } from "@/lib/api/queries";
import { useDevMigrations, useMigrateAction, useMigrations, type Migration } from "@/lib/api/schema";
import { namesFile, useSchemaStatus } from "@/lib/api/schema-status";
import { useNow } from "@/lib/use-now";
import { badgesFor, formatVersion, newestFirst, splitSections, summarise } from "./migrations";
import { NewMigrationDialog } from "./new-migration-dialog";

/** `/database/migrations`: every file with its SQL and state; apply, roll back, redo; create an empty one. */
export function MigrationsPage() {
  const mounted = useMounted();
  const status = useStatus();
  const app = status.data?.app;
  const hasDb = status.data?.portal.database ?? false;
  const migrations = useMigrations(hasDb);
  const dev = useDevMigrations(Boolean(hasDb && app?.state === "running" && app.console));
  const migrate = useMigrateAction("migrate");
  const down = useMigrateAction("migrate-down");
  const redo = useMigrateAction("migrate-redo");
  const [confirm, setConfirm] = useState<"down" | "redo" | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const now = useNow();
  const schemaStatus = useSchemaStatus();
  const edited = schemaStatus.data?.edited ?? [];
  const outOfOrder = (schemaStatus.data?.pending ?? []).filter((p) => p.reason === "out_of_order");

  const list = migrations.data ?? [];
  const summary = summarise(list);
  const busy = migrate.isPending || down.isPending || redo.isPending;
  const rows = newestFirst(list);
  const toggle = (v: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });

  if (!mounted) return <DbPageSkeleton title="Migrations" description="db/migrations, with their state in the database" />;
  return (
    <>
      <PageHeader product="devtools" title="Migrations" description={migrations.data ? `${summary.applied} applied · ${summary.pending} pending · db/migrations` : "db/migrations, with their state in the database"}>
        <Button size="sm" kind="ghost" icon={<FilePlus2 size={11} />} onClick={() => setCreating(true)} disabled={!hasDb}>
          New migration
        </Button>
        <Button size="sm" kind="secondary" icon={<RotateCw size={11} />} onClick={() => setConfirm("redo")} disabled={!summary.last || busy} loading={redo.isPending} title="Roll the last migration back and apply it again: proves its Down works">
          Redo last
        </Button>
        <Button size="sm" kind="danger" icon={<RotateCcw size={11} />} onClick={() => setConfirm("down")} disabled={!summary.last || busy} loading={down.isPending}>
          Roll back last
        </Button>
        <Button size="sm" kind="primary" icon={<Play size={11} />} onClick={() => migrate.mutate()} disabled={summary.pending === 0 || busy} loading={migrate.isPending}>
          Apply {summary.pending > 0 ? `${summary.pending} pending` : "pending"}
        </Button>
      </PageHeader>
      <Page>
        <DbGate status={status}>
          <SchemaNotice />
          {migrations.error && !migrations.data ? (
            <DbProblem error={migrations.error} retrying={migrations.isFetching} onRetry={() => void migrations.refetch()} />
          ) : (
            <>
              {app?.problem && (
                <Panel
                  title={
                    <span className="flex items-center gap-2 text-danger">
                      <AlertTriangle size={14} /> The last migration failed
                    </span>
                  }
                  meta="app.problem"
                  actions={
                    <Link href="/" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-elevated px-2.5 text-[11px] font-medium text-text hover:border-border-2">
                      <Terminal size={11} /> Open the output
                    </Link>
                  }
                >
                  <p className="font-mono text-[12px] text-danger">{app.problem}</p>
                  <p className="mt-1 text-[11px] text-dim">orb dev keeps the previous version running; fix the SQL and apply again. The full log is in the Overview&apos;s output console.</p>
                </Panel>
              )}
              <TileGrid>
                <Tile label="Current version" value={summary.current ? formatVersion(summary.current).split(" · ")[0] : "—"} unit={summary.current ? formatVersion(summary.current).split(" · ")[1] : undefined} loading={migrations.isPending} hero footer={summary.last ? `${summary.last.name || "(no file)"} · ${summary.last.applied_at ? fmtAgo(Date.parse(summary.last.applied_at), now || Date.now()) : ""}` : "nothing applied"} />
                <Tile label="Pending" value={String(summary.pending)} unit={summary.pending === 1 ? "file" : "files"} deltaTone={summary.pending ? "bad" : "flat"} delta={summary.pending ? "not applied" : undefined} loading={migrations.isPending} footer={summary.pending ? summary.pendingList.map((m) => m.name).join(", ") : "the database is up to date"} />
                <Tile label="Applied" value={String(summary.applied)} unit={`of ${list.length}`} loading={migrations.isPending} footer={summary.orphans.length ? <span className="text-warn">{summary.orphans.length} applied without a file</span> : "from goose_db_version"} />
                <Tile
                  label="App's view"
                  value={dev.data ? String(dev.data.pending) : app?.state === "running" ? "…" : "—"}
                  unit="pending"
                  loading={dev.isPending && dev.isFetching}
                  deltaTone={dev.data && dev.data.current !== summary.current ? "bad" : "flat"}
                  delta={dev.data && dev.data.current !== summary.current ? "differs" : undefined}
                  footer={dev.data ? `current ${dev.data.current} · latest ${dev.data.latest} (/_dev/migrations)` : app?.state === "running" ? (app.console ? "reading /_dev/migrations" : "no dev console") : "app not running"}
                />
              </TileGrid>
              <Panel title="Files" meta="newest first" flush>
                {migrations.isPending ? (
                  <SkeletonLines lines={6} className="p-4" />
                ) : rows.length === 0 ? (
                  <Empty title="No migrations" hint="db/migrations is empty; New migration writes the first file." />
                ) : (
                  <ul>
                    {rows.map((m) => (
                      <Row key={m.version} m={m} open={expanded.has(m.version)} onToggle={() => toggle(m.version)} now={now || Date.now()} isLast={summary.last?.version === m.version} edited={namesFile(edited, m.path)} outOfOrder={namesFile(outOfOrder, m.path)} />
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </DbGate>
      </Page>
      <ConfirmDialog
        open={confirm === "down"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Roll back ${summary.last?.name || summary.last?.version}?`}
        description={
          summary.last?.has_down
            ? `orb dev runs cmd/migrate --down: the Down section of ${summary.last.path} runs and the version is forgotten. Apply pending puts it back.`
            : `${summary.last?.path || "This migration"} has no Down section: goose forgets the version but its objects stay in the database. Write a Down first if you need the change undone.`
        }
        confirmLabel="Roll back"
        danger
        loading={down.isPending}
        onConfirm={() => {
          setConfirm(null);
          down.mutate();
        }}
      />
      <ConfirmDialog
        open={confirm === "redo"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Redo ${summary.last?.name || summary.last?.version}?`}
        description={`Roll back and apply again (cmd/migrate --redo): the check that the Down of ${summary.last?.path || "the last migration"} works.${summary.last && !summary.last.has_down ? " This file has no Down, so the redo applies the Up on top of what is there and may fail." : ""}`}
        confirmLabel="Redo"
        loading={redo.isPending}
        onConfirm={() => {
          setConfirm(null);
          redo.mutate();
        }}
      />
      <NewMigrationDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

const badgeTone = { pending: "warn", applied: "ok", "no-down": "muted", orphan: "danger" } as const;
const badgeLabel = { pending: "pending", applied: "applied", "no-down": "no Down", orphan: "no file" } as const;

function Row({ m, open, onToggle, now, isLast, edited, outOfOrder }: { m: Migration; open: boolean; onToggle: () => void; now: number; isLast: boolean; edited?: boolean; outOfOrder?: boolean }) {
  const sections = splitSections(m.sql);
  return (
    <li className={`border-t border-hairline first:border-0 ${m.applied ? "" : "bg-warn/5"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-elevated/40" aria-expanded={open}>
        <span className="text-dim">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
        <Dot tone={m.applied ? "ok" : "warn"} />
        <span className="font-mono text-[11px] text-dim tnum">{formatVersion(m.version)}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text">{m.name || <span className="text-dim">(version only; no file in db/migrations)</span>}</span>
        {isLast && <Badge tone="accent">last applied</Badge>}
        {edited && (
          <span title="The file changed after it was applied; PostgreSQL still has the old version">
            <Badge tone="warn" mono={false} className="gap-1">
              <AlertTriangle size={10} /> edited after apply
            </Badge>
          </span>
        )}
        {outOfOrder && (
          <span title="Its version is lower than the last applied migration; goose applies migrations in order">
            <Badge tone="warn" mono={false}>
              out of order
            </Badge>
          </span>
        )}
        {badgesFor(m).map((b) => (
          <Badge key={b} tone={badgeTone[b]}>
            {badgeLabel[b]}
          </Badge>
        ))}
        <span className="w-24 text-right text-[11px] text-dim">{m.applied_at ? fmtAgo(Date.parse(m.applied_at), now) : ""}</span>
      </button>
      {open && (
        <div className="grid gap-2 px-4 pb-3 pl-11">
          <div className="flex items-center gap-3 font-mono text-[10.5px] text-dim">
            <span>{m.path || "no file"}</span>
            {m.applied_at && <span>applied {new Date(m.applied_at).toLocaleString()}</span>}
            {sections.noTransaction && <Badge tone="warn">no transaction</Badge>}
          </div>
          {m.sql ? (
            <>
              <Code className="max-h-[360px] overflow-y-auto whitespace-pre-wrap break-words">
                <Cmt>-- +goose Up</Cmt>
                {"\n"}
                {sections.up}
              </Code>
              <Code className="max-h-[240px] overflow-y-auto whitespace-pre-wrap break-words">
                <Cmt>-- +goose Down</Cmt>
                {"\n"}
                {sections.down ?? <Cmt>-- none: this migration can&apos;t be rolled back by goose</Cmt>}
              </Code>
            </>
          ) : (
            <p className="text-[11px] text-dim">The database recorded this version but no file carries it any more.</p>
          )}
        </div>
      )}
    </li>
  );
}
