"use client";

import { useEffect, useState } from "react";
import { FileCode2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Dialog } from "@gorbital/dash/components/dialog";
import { Checkbox, Field, Input } from "@gorbital/dash/components/input";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { ApiError } from "@/lib/api/client";
import { describeError, useMigrationGenerator } from "@/lib/api/schema";

/**
 * "New migration": the `migration` generator plans an empty file for the
 * name, the dialog shows it, Apply writes it. The file appears as pending;
 * the developer writes the SQL and applies it from the list.
 */
export function NewMigrationDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (path: string) => void }) {
  const plan = useMigrationGenerator(false);
  const apply = useMigrationGenerator(true);
  const [name, setName] = useState("");
  const [allowDirty, setAllowDirty] = useState(false);
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  useEffect(() => {
    if (!open) {
      setName("");
      plan.reset();
      apply.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !slug) return;
    const t = setTimeout(() => plan.mutate({ input: { name: slug } }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slug]);

  const res = plan.data;
  const error = apply.error ?? plan.error;
  const conflict = error instanceof ApiError && error.status === 409;
  const busy = apply.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="New migration"
      description="An empty goose file under db/migrations. Write the SQL in it (Up, and Down to undo it), then apply it here."
      size="lg"
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            kind="primary"
            size="sm"
            icon={<FileCode2 size={11} />}
            disabled={!slug || !res}
            loading={busy}
            onClick={() =>
              apply.mutate(
                { input: { name: slug }, allow_dirty: allowDirty },
                {
                  onSuccess: (r) => {
                    onOpenChange(false);
                    onCreated?.(r.plan.changes[0]?.path ?? "");
                  },
                },
              )
            }
          >
            Write the file
          </Button>
        </>
      }
    >
      <div className="grid gap-3 pb-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <Field label="Name" htmlFor="mig-name" hint={slug ? `db/migrations/<version>_${slug}.sql` : "letters, digits and underscores; the version is the current timestamp"}>
            <Input id="mig-name" mono autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="add_phone_to_projects" />
          </Field>
          <Field label="git" htmlFor="mig-dirty" inline className="pb-5">
            <Checkbox id="mig-dirty" checked={allowDirty} onCheckedChange={(c) => setAllowDirty(c === true)} />
            <span className="text-[12px]">allow uncommitted changes</span>
          </Field>
        </div>
        {plan.isPending && !res ? (
          <SkeletonLines lines={4} />
        ) : res ? (
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Badge tone="accent">{res.plan.summary}</Badge>
            </div>
            {res.plan.changes.map((c) => (
              <div key={c.path} className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{c.kind} {c.path}</span>
                <Code className="max-h-[220px] overflow-y-auto whitespace-pre-wrap">{c.content}</Code>
              </div>
            ))}
            {res.plan.next.length > 0 && (
              <ol className="grid gap-0.5 text-[11.5px] text-muted">
                {res.plan.next.map((n, i) => (
                  <li key={n}>
                    <span className="font-mono text-dim">{i + 1}.</span> {n}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11.5px] text-danger">
            {error instanceof ApiError ? `${error.status} ${error.code} · ${error.detail || error.title}` : describeError(error)}
            {conflict && !allowDirty && <div className="mt-1 text-warn">Tick &quot;allow uncommitted changes&quot; to write into a dirty working tree.</div>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
