"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileOutput } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { ConfirmDialog, Dialog } from "@gorbital/dash/components/dialog";
import { Checkbox, Field, Input } from "@gorbital/dash/components/input";
import { ApiError } from "@/lib/api/client";
import type { MigrationResponse, Snippet, Warning } from "@/lib/api/sql";
import { migrationSlug, snippetNameError } from "@/lib/sql-editor/snippets";

/* ---------- Save / rename ---------- */

type SaveProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rename: the snippet whose name changes; save: undefined. */
  rename?: Snippet;
  initialName: string;
  initialFavorite: boolean;
  existing: string[];
  saving: boolean;
  onSave: (name: string, favorite: boolean) => void;
};

/** Names a snippet (or renames one): the portal's name rule checked as you type, and a favourite toggle. */
export function SaveSnippetDialog({ open, onOpenChange, rename, initialName, initialFavorite, existing, saving, onSave }: SaveProps) {
  const [name, setName] = useState(initialName);
  const [favorite, setFavorite] = useState(initialFavorite);
  useEffect(() => {
    if (open) {
      setName(initialName);
      setFavorite(initialFavorite);
    }
  }, [open, initialName, initialFavorite]);
  const error = snippetNameError(name);
  const overwrites = !error && existing.includes(name) && name !== rename?.name;
  const submit = () => {
    if (error) return;
    onSave(name, favorite);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={rename ? `Rename ${rename.name}` : "Save snippet"}
      description={rename ? "Saved under the new name, then the old file is deleted." : "Written to db/queries/<name>.sql in the app, so it's committed and shared."}
      size="sm"
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button kind="primary" size="sm" onClick={submit} disabled={Boolean(error)} loading={saving}>
            {rename ? "Rename" : overwrites ? "Overwrite" : "Save"}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name" htmlFor="snippet-name" error={name ? error : undefined} hint={overwrites ? `db/queries/${name}.sql exists and will be replaced.` : `db/queries/${name || "<name>"}.sql`}>
          <Input id="snippet-name" mono autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="weekly-signups" autoComplete="off" spellCheck={false} aria-invalid={Boolean(name && error)} />
        </Field>
        {!rename && (
          <Field label="Favorite" htmlFor="snippet-fav" inline hint="Favourites are yours alone, under .orb/portal/.">
            <Checkbox id="snippet-fav" checked={favorite} onCheckedChange={(c) => setFavorite(c === true)} />
          </Field>
        )}
      </form>
    </Dialog>
  );
}

/* ---------- Warnings before a commit ---------- */

export function WarningsConfirm({ open, onOpenChange, warnings, lineOffset, onConfirm, loading }: { open: boolean; onOpenChange: (o: boolean) => void; warnings: Warning[]; lineOffset: number; onConfirm: () => void; loading: boolean }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Run and commit anyway?"
      danger
      confirmLabel="Run anyway"
      loading={loading}
      onConfirm={onConfirm}
      description={
        <span className="grid gap-2">
          <span>The script does things that can&apos;t be undone once committed:</span>
          {/* Spans, not a list: the description renders inside a <p>. */}
          <span role="list" className="grid gap-1">
            {warnings.map((w, i) => (
              <span role="listitem" key={i} className="flex items-start gap-2 font-mono text-[11.5px]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warn" />
                <span>
                  <Badge tone="warn" className="mr-1.5">
                    {w.kind}
                  </Badge>
                  line {w.line + lineOffset}: {w.message}
                </span>
              </span>
            ))}
          </span>
          <span className="text-dim">Run it in rollback mode first to see what it would do.</span>
        </span>
      }
    />
  );
}

/* ---------- Save as migration ---------- */

type MigrationProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sql: string;
  previewing: boolean;
  applying: boolean;
  preview?: MigrationResponse;
  error?: Error;
  onPreview: (name: string) => void;
  onApply: (name: string, allowDirty: boolean) => void;
};

/** Name → the file the portal would write (path and content), then Apply with the dirty-tree override. */
export function MigrationDialog({ open, onOpenChange, sql, previewing, applying, preview, error, onPreview, onApply }: MigrationProps) {
  const [name, setName] = useState("");
  const [allowDirty, setAllowDirty] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setAllowDirty(false);
    }
  }, [open]);
  const slug = migrationSlug(name);
  const busy = previewing || applying;
  const problem = error instanceof ApiError ? `${error.status} ${error.code}: ${error.detail || error.message}` : error?.message;
  const dirty = problem ? /dirty|uncommitted|git/i.test(problem) : false;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Save as migration"
      description="The script becomes the Up section of a new goose migration under db/migrations. Preview first; Apply writes the file and runs it through orb dev."
      size="lg"
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button kind="secondary" size="sm" onClick={() => onPreview(name)} disabled={!slug || busy} loading={previewing}>
            Preview
          </Button>
          <Button kind="primary" size="sm" icon={<FileOutput size={11} />} onClick={() => onApply(name, allowDirty)} disabled={!slug || !preview || busy} loading={applying}>
            Apply
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (slug && !busy) onPreview(name);
        }}
      >
        <Field label="Name" htmlFor="migration-name" hint={slug ? `db/migrations/<version>_${slug}.sql` : "Describe the change; the file name is derived from it."}>
          <Input id="migration-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Add index on projects(status)" autoComplete="off" />
        </Field>
        <Field label="Git" htmlFor="migration-dirty" inline hint="Applying refuses when the repository has uncommitted changes, unless allowed here.">
          <Checkbox id="migration-dirty" checked={allowDirty} onCheckedChange={(c) => setAllowDirty(c === true)} />
          <span className="text-[12px]">Allow a dirty working tree</span>
        </Field>
        {problem && (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 font-mono text-[11.5px] text-danger">
            {problem}
            {dirty && !allowDirty && <span className="mt-1 block text-muted">Tick “Allow a dirty working tree” to apply anyway.</span>}
          </p>
        )}
        {preview ? (
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <Badge tone={preview.applied ? "ok" : "info"}>{preview.applied ? "written" : preview.file.kind}</Badge>
              <span className="truncate text-text">{preview.file.path}</span>
            </div>
            <Code className="max-h-[38vh] overflow-auto whitespace-pre text-[11px]">{preview.file.content}</Code>
            {preview.plan.notes && preview.plan.notes.length > 0 && (
              <ul className="text-[11px] text-dim">
                {preview.plan.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Code className="max-h-[30vh] overflow-auto whitespace-pre text-[11px] opacity-60">{sql}</Code>
        )}
      </form>
    </Dialog>
  );
}
