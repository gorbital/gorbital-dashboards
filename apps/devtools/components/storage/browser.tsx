"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ChevronRight, Download, FolderPlus, HardDrive, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { toast } from "@gorbital/dash/components/toast";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { errorMessage } from "@/lib/api/errors";
import { downloadObject, listAllKeys, uploadObject, useDeleteObjects, useInvalidateStorage, useStorageObjects, type StorageStatus } from "@/lib/api/storage";
import { contentTypeFor, formatSize } from "@/lib/storage/format";
import { breadcrumbs, isDirectoryMarker } from "@/lib/storage/keys";
import { describeListing, entriesOf, mergePages, sortEntries, type Entry, type Sort } from "@/lib/storage/list";
import { planUploads, updateItem, type UploadItem } from "@/lib/storage/upload";
import { ColumnView } from "./column-view";
import { ProblemNote } from "./common";
import { MoveDialog, NewFolderDialog, SignedUrlDialog, UploadDialog } from "./dialogs";
import { ListView, type EntryAction } from "./list-view";
import { PreviewPane } from "./preview";

export type View = "list" | "columns";

type Props = {
  status: StorageStatus;
  prefix: string;
  selectedKey?: string;
  view: View;
  limit: number;
  locked: boolean;
  onPrefix: (prefix: string) => void;
  onKey: (key: string | undefined) => void;
};

/** Item 74: the file browser. Breadcrumbs, the list or column view, the toolbar, drag-and-drop uploads, and every dialog wired together. */
export function Browser({ status, prefix, selectedKey, view, limit, locked, onPrefix, onKey }: Props) {
  const enabled = status.status === "ok";
  const list = useStorageObjects(prefix, enabled, limit);
  const listing = useMemo(() => mergePages(list.data?.pages ?? []), [list.data]);
  const [sort, setSort] = useState<Sort | undefined>({ key: "name", dir: "asc" });
  const entries = useMemo(() => sortEntries(entriesOf(listing), sort), [listing, sort]);
  const invalidate = useInvalidateStorage();
  const remove = useDeleteObjects();

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  useEffect(() => setSelected(new Set()), [prefix]);
  const selectedEntries = entries.filter((e) => selected.has(e.key));

  const [newFolder, setNewFolder] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Entry[] | null>(null);
  const [resolving, setResolving] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragging, setDragging] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const refuseLocked = () => {
    toast.warning("Read-only", { description: `${status.driver} bucket ${status.bucket} is locked; unlock it for this session first.` });
  };

  const download = async (key: string) => {
    try {
      await downloadObject(key);
    } catch (err) {
      toast.error("Couldn't download", { description: errorMessage(err) });
    }
  };

  const onAction = (entry: Entry, action: EntryAction) => {
    if (action === "download" && entry.kind === "object") return void download(entry.key);
    if (action === "signed_url") return setSigning(entry.key);
    if (locked) return refuseLocked();
    if (action === "move") return setMoving(entry.key);
    if (action === "delete") return setDeleting([entry]);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setResolving(true);
    let keys: string[] = [];
    try {
      for (const e of deleting) {
        if (e.kind === "object") keys.push(e.key);
        else keys.push(...(await listAllKeys(e.key)));
      }
      keys = [...new Set(keys)];
      await remove.mutateAsync(keys);
      if (selectedKey && keys.includes(selectedKey)) onKey(undefined);
      setSelected(new Set());
      setDeleting(null);
    } catch (err) {
      if (!(err instanceof Error && remove.isError)) toast.error("Couldn't list the folder", { description: errorMessage(err) });
    } finally {
      setResolving(false);
    }
  };

  const startUploads = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (locked) return refuseLocked();
      const items = planUploads(files, prefix);
      setUploads(items);
      setUploadOpen(true);
      let done = 0;
      for (const [i, it] of items.entries()) {
        if (it.state === "error") continue;
        setUploads((u) => updateItem(u, it.id, { state: "uploading" }));
        try {
          await uploadObject(it.key, files[i], { contentType: contentTypeFor(files[i].name, files[i].type), onProgress: (loaded) => setUploads((u) => updateItem(u, it.id, { loaded })) });
          setUploads((u) => updateItem(u, it.id, { state: "done", loaded: it.size }));
          done++;
        } catch (err) {
          setUploads((u) => updateItem(u, it.id, { state: "error", error: errorMessage(err) }));
        }
        invalidate([it.key]);
      }
      if (done === items.length) toast.success(`Uploaded ${done} ${done === 1 ? "file" : "files"}`, { description: prefix || "the root" });
      else toast.error(`Uploaded ${done} of ${items.length}`, { description: "the rest are marked in the dialog" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refuseLocked reads the status of the render
    [locked, prefix, invalidate],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(0);
    void startUploads([...e.dataTransfer.files]);
  };
  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging((n) => n + 1);
  };
  const onDragLeave = () => setDragging((n) => Math.max(0, n - 1));
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = locked ? "none" : "copy";
  };

  const crumbs = breadcrumbs(prefix);
  const count = list.data ? describeListing(listing, Boolean(list.hasNextPage)) : "";
  const oneObject = selectedEntries.length === 1 && selectedEntries[0].kind === "object" ? selectedEntries[0] : undefined;

  return (
    <section className="panel relative flex min-h-[420px] flex-col" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      <header className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
        <nav aria-label="Folder" className="flex min-w-0 flex-1 items-center gap-1 text-[12px]">
          <button type="button" onClick={() => onPrefix("")} className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-elevated ${prefix ? "text-muted hover:text-text" : "font-medium text-text"}`}>
            <HardDrive size={12} className="text-primary" />
            <span className="font-mono">{status.bucket || "storage"}</span>
          </button>
          {crumbs.map((c, i) => (
            <span key={c.prefix} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-faint" />
              <button type="button" onClick={() => onPrefix(c.prefix)} className={`rounded-md px-1.5 py-0.5 font-mono hover:bg-elevated ${i === crumbs.length - 1 ? "font-medium text-text" : "text-muted hover:text-text"}`}>
                {c.name}
              </button>
            </span>
          ))}
          {count && <span className="ml-2 truncate font-mono text-[11px] text-dim">{count}</span>}
        </nav>
        {selectedEntries.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-muted">{selectedEntries.length} selected</span>
            {oneObject && (
              <Button size="sm" kind="secondary" icon={<Download size={11} />} onClick={() => void download(oneObject.key)}>
                Download
              </Button>
            )}
            <Button size="sm" kind="danger" icon={<Trash2 size={11} />} onClick={() => (locked ? refuseLocked() : setDeleting(selectedEntries))} disabled={locked}>
              Delete
            </Button>
            <Button size="sm" kind="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Tooltip content="Refetch this folder">
              <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void list.refetch()} loading={list.isFetching && !list.isFetchingNextPage} aria-label="Refresh">
                Refresh
              </Button>
            </Tooltip>
            <Tooltip content={locked ? "Read-only: unlock the bucket first" : "A hidden .keep marker makes the folder exist"}>
              <span className="inline-flex">
                <Button size="sm" kind="secondary" icon={<FolderPlus size={11} />} onClick={() => setNewFolder(true)} disabled={locked || !enabled}>
                  New folder
                </Button>
              </span>
            </Tooltip>
            <Tooltip content={locked ? "Read-only: unlock the bucket first" : "Pick files, or drop them onto the list"}>
              <span className="inline-flex">
                <Button size="sm" kind="primary" icon={<Upload size={11} />} onClick={() => fileInput.current?.click()} disabled={locked || !enabled}>
                  Upload
                </Button>
              </span>
            </Tooltip>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void startUploads(files);
              }}
            />
          </div>
        )}
      </header>

      {!enabled && status.error && <ProblemNote error={new Error(`${status.driver}: ${status.error}`)} className="m-3" />}
      {list.error && !list.data && enabled && <ProblemNote error={list.error} className="m-3" />}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {view === "list" ? (
            <ListView
              entries={entries}
              sort={sort}
              onSort={setSort}
              selected={selected}
              onSelect={setSelected}
              selectedKey={selectedKey}
              onOpenFolder={onPrefix}
              onOpenObject={onKey}
              onAction={onAction}
              locked={locked}
              loading={list.isPending && enabled}
              hasMore={Boolean(list.hasNextPage)}
              loadingMore={list.isFetchingNextPage}
              onMore={() => void list.fetchNextPage()}
              emptyHint={locked ? "The bucket is locked; unlock it to upload." : "Drop files here, or use Upload and New folder."}
            />
          ) : (
            <ColumnView prefix={prefix} selectedKey={selectedKey} enabled={enabled} limit={limit} onOpenFolder={onPrefix} onOpenObject={onKey} />
          )}
        </div>
        {selectedKey && !isDirectoryMarker(selectedKey) && (
          <PreviewPane objectKey={selectedKey} enabled={enabled} locked={locked} onClose={() => onKey(undefined)} onDownload={(k) => void download(k)} onSignedUrl={setSigning} onMove={(k) => (locked ? refuseLocked() : setMoving(k))} onDelete={(k) => (locked ? refuseLocked() : setDeleting([{ kind: "object", key: k, name: k, object: { key: k, size: 0, content_type: "", last_modified: "" } }]))} />
        )}
      </div>

      {dragging > 0 && (
        <div className={`pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[inherit] border-2 border-dashed ${locked ? "border-danger/60 bg-danger/10" : "border-primary/60 bg-primary/8"}`}>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-[12.5px] font-medium text-text shadow-2xl">
            <Upload size={14} className={locked ? "text-danger" : "text-primary"} />
            {locked ? "Read-only: unlock the bucket first" : `Drop to upload into ${prefix || "the root"}`}
          </div>
        </div>
      )}

      <NewFolderDialog open={newFolder} prefix={prefix} onOpenChange={setNewFolder} onCreated={() => undefined} />
      {moving && (
        <MoveDialog
          open
          objectKey={moving}
          onOpenChange={(v) => !v && setMoving(null)}
          onMoved={(to) => {
            setMoving(null);
            onKey(to);
          }}
        />
      )}
      {signing && <SignedUrlDialog open objectKey={signing} locked={locked} onOpenChange={(v) => !v && setSigning(null)} />}
      <UploadDialog open={uploadOpen} items={uploads} prefix={prefix} onOpenChange={setUploadOpen} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && !resolving && !remove.isPending && setDeleting(null)}
        danger
        title={deleteTitle(deleting ?? [])}
        description={
          <span className="grid gap-1">
            <span>{deleting?.some((e) => e.kind === "folder") ? "Folders are deleted with everything under them, markers included. " : ""}This can&apos;t be undone.</span>
            <span className="font-mono text-[11px] text-dim">
              {(deleting ?? []).slice(0, 6).map((e) => (
                <span key={e.key} className="block truncate">
                  {e.key}
                  {e.kind === "object" && e.object.size > 0 ? ` · ${formatSize(e.object.size)}` : ""}
                </span>
              ))}
              {(deleting?.length ?? 0) > 6 && <span className="block">… and {deleting!.length - 6} more</span>}
            </span>
          </span>
        }
        confirmLabel="Delete"
        loading={resolving || remove.isPending}
        onConfirm={confirmDelete}
      />
    </section>
  );
}

function deleteTitle(entries: Entry[]): string {
  const objects = entries.filter((e) => e.kind === "object").length;
  const folders = entries.length - objects;
  const parts: string[] = [];
  if (objects) parts.push(`${objects} ${objects === 1 ? "object" : "objects"}`);
  if (folders) parts.push(`${folders} ${folders === 1 ? "folder" : "folders"}`);
  return `Delete ${parts.join(" and ") || "nothing"}?`;
}
