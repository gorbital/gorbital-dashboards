"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, ExternalLink, Link2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Dialog } from "@gorbital/dash/components/dialog";
import { Field, Input, Select } from "@gorbital/dash/components/input";
import { Segmented } from "@gorbital/dash/components/pill";
import { Bar } from "@gorbital/dash/components/progress";
import { Spinner } from "@gorbital/dash/components/spinner";
import { theme } from "@gorbital/dash/theme";
import { errorMessage } from "@/lib/api/errors";
import { useMakeDirectory, useMoveObject, useSignedUrl, type SignedMethod, type SignedURL } from "@/lib/api/storage";
import { formatExpiry, formatModified, formatSize } from "@/lib/storage/format";
import { isRename, joinKey, keyError, normalizePrefix, parentPrefix } from "@/lib/storage/keys";
import { aggregateProgress, describeBatch, type UploadItem } from "@/lib/storage/upload";
import { CopyButton, ProblemNote } from "./common";

/* ---------- New folder ---------- */

export function NewFolderDialog({ open, prefix, onOpenChange, onCreated }: { open: boolean; prefix: string; onOpenChange: (v: boolean) => void; onCreated: (prefix: string) => void }) {
  const [name, setName] = useState("");
  const mkdir = useMakeDirectory();
  useEffect(() => {
    if (open) {
      setName("");
      mkdir.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open]);
  const target = joinKey(prefix, name.trim());
  const error = name.trim() ? keyError(target) : undefined;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || error) return;
    const res = await mkdir.mutateAsync({ prefix: target });
    onOpenChange(false);
    onCreated(res.prefix);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New folder" description={`In ${prefix || "the root"}. Object stores have no folders: a hidden .keep marker makes this one appear until something is in it.`} size="sm">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Name" htmlFor="folder-name" error={error} hint={name.trim() && !error ? `creates ${normalizePrefix(target)}` : "a/b makes nested folders"}>
          <Input id="folder-name" mono autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="2027" autoComplete="off" />
        </Field>
        {mkdir.error && <ProblemNote error={mkdir.error} />}
        <div className="flex justify-end gap-2 pb-4 pt-1">
          <Button kind="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" kind="primary" size="sm" disabled={!name.trim() || Boolean(error)} loading={mkdir.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Move / rename ---------- */

export function MoveDialog({ open, objectKey, onOpenChange, onMoved }: { open: boolean; objectKey: string; onOpenChange: (v: boolean) => void; onMoved: (to: string) => void }) {
  const [to, setTo] = useState(objectKey);
  const move = useMoveObject();
  useEffect(() => {
    if (open) {
      setTo(objectKey);
      move.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open, objectKey]);
  const trimmed = to.trim();
  const error = trimmed === objectKey ? undefined : keyError(trimmed);
  const same = trimmed === objectKey;
  const rename = !same && !error && isRename(objectKey, trimmed);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (same || error) return;
    const res = await move.mutateAsync({ from: objectKey, to: trimmed });
    onOpenChange(false);
    onMoved(res.key);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Move or rename" description="The whole key: the same folder with a new name renames, another folder moves. The store copies and deletes, since it has no rename." size="md">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="From" htmlFor="move-from">
          <Input id="move-from" mono value={objectKey} readOnly className="text-muted" />
        </Field>
        <Field label="To" htmlFor="move-to" error={error} hint={same ? "unchanged" : rename ? `rename in ${parentPrefix(objectKey) || "the root"}` : trimmed && !error ? `move to ${parentPrefix(trimmed) || "the root"}` : "a key, such as images/2026/logo.svg"}>
          <Input id="move-to" mono autoFocus value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        {move.error && <ProblemNote error={move.error} />}
        <div className="flex justify-end gap-2 pb-4 pt-1">
          <Button kind="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" kind="primary" size="sm" disabled={same || Boolean(error)} loading={move.isPending}>
            {rename ? "Rename" : "Move"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Signed URL ---------- */

const expiries: { value: number; label: string }[] = [
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 86_400, label: "24 hours" },
  { value: 604_800, label: "7 days" },
];

/** Item 75: a GET or PUT URL with a preset expiry; the result with copy and open, and when it stops working. */
export function SignedUrlDialog({ open, objectKey, locked, onOpenChange }: { open: boolean; objectKey: string; locked: boolean; onOpenChange: (v: boolean) => void }) {
  const [method, setMethod] = useState<SignedMethod>("GET");
  const [expiry, setExpiry] = useState(3600);
  const [result, setResult] = useState<SignedURL | undefined>();
  const sign = useSignedUrl();
  useEffect(() => {
    if (open) {
      setMethod("GET");
      setExpiry(3600);
      setResult(undefined);
      sign.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open, objectKey]);
  const create = async () => {
    const res = await sign.mutateAsync({ key: objectKey, method, expiry_seconds: expiry });
    setResult(res);
  };
  const curl = result?.method === "PUT" ? `curl -X PUT --upload-file ./${objectKey.slice(objectKey.lastIndexOf("/") + 1)} -H "Content-Type: application/octet-stream" "${result.url}"` : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Signed URL" description={<span className="font-mono text-[11.5px]">{objectKey}</span>} size="lg">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Method" hint={method === "GET" ? "downloads the object" : "uploads a body to this key, replacing it"}>
            <Segmented<SignedMethod>
              value={method}
              options={[
                { value: "GET", label: "GET" },
                { value: "PUT", label: locked ? "PUT (locked)" : "PUT" },
              ]}
              onChange={(m) => {
                if (m === "PUT" && locked) return;
                setMethod(m);
                setResult(undefined);
              }}
            />
          </Field>
          <Field label="Expires in" htmlFor="signed-expiry" hint="1 second to 7 days" className="w-[180px]">
            <Select id="signed-expiry" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
              {expiries.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button kind="primary" size="md" icon={<Link2 size={12} />} onClick={() => void create()} loading={sign.isPending} disabled={method === "PUT" && locked}>
            Create URL
          </Button>
        </div>
        {method === "PUT" && locked && (
          <p className="flex items-center gap-2 text-[11.5px] text-warn">
            <AlertTriangle size={12} /> Signed PUT URLs write to the bucket; unlock it for this session first.
          </p>
        )}
        {sign.error && <ProblemNote error={sign.error} />}
        {result && (
          <div className="grid gap-2 rounded-lg border border-hairline bg-code-bg p-3">
            <div className="flex items-center gap-2">
              <Badge tone={result.method === "PUT" ? "warn" : "accent"}>{result.method}</Badge>
              <span className="text-[11.5px] text-muted">
                expires <span className="font-mono text-text">{formatModified(result.expires_at)}</span> · {formatExpiry(result.expires_at)}
                <span className="text-dim"> · {result.expires_at}</span>
              </span>
              <span className="ml-auto flex items-center gap-1">
                <CopyButton text={result.url} />
                {result.method === "GET" && (
                  <Button size="sm" kind="ghost" icon={<ExternalLink size={11} />} onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}>
                    Open
                  </Button>
                )}
              </span>
            </div>
            <code className="block break-all font-mono text-[11px] leading-[1.6] text-text select-all">{result.url}</code>
            {curl && (
              <div className="mt-1 grid gap-1 border-t border-hairline pt-2">
                <span className="text-[11px] text-dim">Upload with curl:</span>
                <div className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-[1.6] text-muted">{curl}</code>
                  <CopyButton text={curl} label="" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="pb-4" />
    </Dialog>
  );
}

/* ---------- Upload progress ---------- */

/** The batch in flight: one row per file with its own bar, one bar for the whole. Closes on request once every file finished. */
export function UploadDialog({ open, items, prefix, onOpenChange }: { open: boolean; items: UploadItem[]; prefix: string; onOpenChange: (v: boolean) => void }) {
  const p = aggregateProgress(items);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !p.finished) return; // keep it open while files are still going
        onOpenChange(v);
      }}
      title={p.finished ? (p.failed ? `Uploaded ${p.done} of ${items.length}` : `Uploaded ${describeBatch(items, formatSize)}`) : `Uploading ${describeBatch(items, formatSize)}`}
      description={`into ${prefix || "the root"}`}
      size="md"
      footer={
        <Button kind={p.finished ? "primary" : "ghost"} size="sm" onClick={() => onOpenChange(false)} disabled={!p.finished}>
          {p.finished ? "Done" : "Uploading…"}
        </Button>
      }
    >
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <Bar value={p.percent} color={p.failed ? theme.warn : theme.primary} />
          <span className="w-10 text-right font-mono text-[11px] text-muted tnum">{p.percent}%</span>
        </div>
        <ul className="grid max-h-[320px] gap-1.5 overflow-y-auto">
          {items.map((it) => (
            <li key={it.id} className="grid gap-1 rounded-lg border border-hairline px-3 py-2">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="grid w-4 place-items-center">
                  {it.state === "done" ? <Check size={12} className="text-ok" /> : it.state === "error" ? <AlertTriangle size={12} className="text-danger" /> : it.state === "uploading" ? <Spinner size={11} className="text-primary" /> : <span className="h-1.5 w-1.5 rounded-full bg-faint" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text" title={it.key}>
                  {it.key}
                </span>
                <span className="font-mono text-[10.5px] text-dim tnum">{it.state === "uploading" ? `${formatSize(Math.min(it.loaded, it.size))} / ` : ""}{formatSize(it.size)}</span>
              </div>
              {it.state === "uploading" && <Bar value={it.size ? (it.loaded / it.size) * 100 : 100} height={3} />}
              {it.error && <span className="text-[11px] text-danger">{it.error}</span>}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

/** What a failed upload says in its row. */
export const uploadError = errorMessage;
