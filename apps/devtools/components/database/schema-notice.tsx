"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, RotateCw, Terminal, X } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { useAppAction, useStatus } from "@/lib/api/queries";
import { useMigrateAction, useMigrations } from "@/lib/api/schema";
import { dismissSchemaNotice, namesFile, pendingSentence, schemaNotices, useSchemaNoticeDismissed, useSchemaStatus, type SchemaNoticeItem } from "@/lib/api/schema-status";

type Props = {
  /** `flush` runs edge to edge under a header (the Table Editor); `panel` is a rounded block in a page's flow. */
  variant?: "panel" | "flush";
  className?: string;
};

/**
 * The live schema warning at the top of every Database screen and the
 * Overview: a migration in code that orb dev will not apply by itself
 * (Restart), an applied file edited since (Redo, or a new migration), or
 * the last migrate error (the output console). Dismissed per status; the
 * next status brings it back. Nothing when there is nothing to say, and
 * nothing at all against an orb without the endpoint.
 */
export function SchemaNotice({ variant = "panel", className = "" }: Props) {
  const hydrated = useHydrated();
  const status = useSchemaStatus();
  const items = schemaNotices(status.data);
  const dismissed = useSchemaNoticeDismissed(status.data?.checked_at);
  // The prerender has no status; a page that hydrates late (inside Suspense) may already have one in the cache, so the first client render stays empty too.
  if (!hydrated || items.length === 0 || dismissed || !status.data) return null;
  const s = status.data;
  const danger = items.some((i) => i.tone === "danger");
  const tone = danger ? "border-danger/30 bg-danger/8" : "border-warn/25 bg-warn/8";
  const shape = variant === "flush" ? "border-b px-4 py-2.5" : "rounded-xl border px-4 py-3";
  return (
    <div role="status" aria-live="polite" data-testid="schema-notice" className={`relative flex flex-col gap-2 text-[12px] text-text ${shape} ${tone} ${className}`}>
      {items.map((item) => (
        <NoticeRow key={item.kind} item={item} edited={s.edited} />
      ))}
      <button type="button" onClick={() => dismissSchemaNotice(s.checked_at)} aria-label="Dismiss" title="Dismiss until the status changes" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-dim hover:bg-elevated hover:text-text">
        <X size={13} />
      </button>
    </div>
  );
}

const noop = () => () => {};
/** False for the prerender and the hydrating render, true after; no effect, no extra commit for the server's tree. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function NoticeRow({ item, edited }: { item: SchemaNoticeItem; edited: { file: string }[] }) {
  switch (item.kind) {
    case "problem":
      return (
        <Row icon={<AlertOctagon size={14} className="mt-px shrink-0 text-danger" />} actions={<ConsoleLink />}>
          <span className="font-medium text-danger">The last migration failed.</span> <span className="break-words font-mono text-[11.5px]">{item.message}</span>
        </Row>
      );
    case "pending": {
      const words = pendingSentence(item.files);
      return (
        <Row icon={<AlertTriangle size={14} className="mt-px shrink-0 text-warn" />} actions={<RestartButton />}>
          {words.lead} <Files files={item.files} /> {words.tail}
          {item.outOfOrder.length > 0 && (
            <span className="mt-1 block text-muted">
              {item.outOfOrder.length === 1 ? "Its" : "Their"} version is lower than the last applied migration; goose applies migrations in order: rename {item.outOfOrder.length === 1 ? "it" : "them"} to a newer version.
            </span>
          )}
        </Row>
      );
    }
    case "edited":
      return (
        <Row icon={<AlertTriangle size={14} className="mt-px shrink-0 text-warn" />} actions={<RedoButton edited={edited} />}>
          <Files files={item.files} /> {item.files.length === 1 ? "was" : "were"} edited after {item.files.length === 1 ? "it was" : "they were"} applied; PostgreSQL still has the old version.
          <span className="mt-1 block text-muted">
            Or add a new migration with the change: <Link href="/database/migrations" className="underline decoration-hairline underline-offset-2 hover:text-text">Migrations</Link>.
          </span>
        </Row>
      );
  }
}

function Row({ icon, children, actions }: { icon: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 pr-7">
      {icon}
      <p className="min-w-0 flex-1 leading-relaxed">{children}</p>
      {actions && <div className="flex shrink-0 items-center gap-1.5 self-center">{actions}</div>}
    </div>
  );
}

function Files({ files }: { files: string[] }) {
  return (
    <>
      {files.map((f, i) => (
        <span key={f}>
          {i > 0 && ", "}
          <code className="break-all rounded border border-hairline bg-bg/60 px-1 py-px font-mono text-[11px] text-text">{f}</code>
        </span>
      ))}
    </>
  );
}

function ConsoleLink() {
  return (
    <Link href="/" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-elevated px-2.5 text-[11px] font-medium text-text hover:border-border-2">
      <Terminal size={11} /> Open the output
    </Link>
  );
}

/** `POST /_portal/api/app/restart`; the events stream reports the rebuild and, after it, the applied files. */
function RestartButton() {
  const status = useStatus();
  const restart = useAppAction("restart");
  const app = status.data?.app;
  const canRestart = Boolean(app) && app?.state !== "building" && app?.state !== "preparing";
  return (
    <Button size="sm" kind="primary" icon={<RotateCw size={11} />} onClick={() => restart.mutate()} disabled={!canRestart} loading={restart.isPending}>
      Restart
    </Button>
  );
}

/** `POST /_portal/api/app/migrate-redo` (development only), behind the same confirmation as the Migrations page's Redo last. */
function RedoButton({ edited }: { edited: { file: string }[] }) {
  const migrations = useMigrations(edited.length > 0);
  const redo = useMigrateAction("migrate-redo");
  const [open, setOpen] = useState(false);
  const last = [...(migrations.data ?? [])].reverse().find((m) => m.applied);
  // Redo only replays the last applied migration; an older edited file needs a new migration instead.
  const lastIsEdited = Boolean(last && namesFile(edited, last.path));
  if (migrations.data && !lastIsEdited) return <span className="text-[11px] text-dim">Redo replays only the last applied migration</span>;
  return (
    <>
      <Button size="sm" kind="secondary" icon={<RotateCw size={11} />} onClick={() => setOpen(true)} disabled={!last || redo.isPending} loading={redo.isPending} title="Roll the last migration back and apply it again, as the file is now">
        Redo
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Redo ${last?.name || "the last migration"}?`}
        description={`Roll back and apply again (cmd/migrate --redo): PostgreSQL gets ${last?.path || "the file"} as it is now. Development only; on a database with data, its Down runs first.${last && !last.has_down ? " This file has no Down, so the redo applies the Up on top of what is there and may fail." : ""}`}
        confirmLabel="Redo"
        loading={redo.isPending}
        onConfirm={() => {
          setOpen(false);
          redo.mutate();
        }}
      />
    </>
  );
}
