"use client";

import { useEffect, useState } from "react";
import { Download, Link2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Skeleton, SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { errorMessage } from "@/lib/api/errors";
import { fetchObjectContent, useStorageObject, type StorageObject } from "@/lib/api/storage";
import { TEXT_PREVIEW_LIMIT, formatBytes, formatModified, formatSize, previewKind, type PreviewKind } from "@/lib/storage/format";
import { baseName } from "@/lib/storage/keys";
import { CopyButton, KindBadge, MetaRow, ProblemNote, SectionLabel } from "./common";

/** Above this the pane shows metadata only; the download still works. */
const PREVIEW_MAX_BYTES = 32 * 1024 * 1024;

type Props = {
  objectKey: string;
  enabled: boolean;
  locked: boolean;
  onClose: () => void;
  onDownload: (key: string) => void;
  onSignedUrl: (key: string) => void;
  onMove: (key: string) => void;
  onDelete: (key: string) => void;
};

/** Items 74 and 75: the selected object inline (image, PDF, text) or as metadata only, with its key, size, type, ETag, modified, metadata map and the actions. */
export function PreviewPane({ objectKey, enabled, locked, onClose, onDownload, onSignedUrl, onMove, onDelete }: Props) {
  const object = useStorageObject(objectKey, enabled);
  const o = object.data;
  const kind = previewKind(o?.content_type, objectKey);
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-hairline" aria-label="Preview">
      <header className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <h3 className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-semibold text-text" title={objectKey}>
          {baseName(objectKey)}
        </h3>
        {o && <KindBadge kind={kind} />}
        <Tooltip content="Close preview">
          <button type="button" onClick={onClose} aria-label="Close preview" className="grid h-6 w-6 place-items-center rounded-md text-dim hover:bg-elevated hover:text-text">
            <X size={13} />
          </button>
        </Tooltip>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {object.isPending && enabled && <SkeletonLines lines={5} className="p-4" />}
        {object.error && !o && <ProblemNote error={object.error} className="m-4" />}
        {o && (
          <>
            <Media object={o} kind={kind} />
            <div className="px-4 pb-3">
              <SectionLabel className="pb-1 pt-3">Object</SectionLabel>
              <dl className="divide-y divide-hairline">
                <MetaRow label="Key">
                  <span className="flex items-start gap-1">
                    <span className="min-w-0 flex-1 break-all">{o.key}</span>
                    <CopyButton text={o.key} label="" />
                  </span>
                </MetaRow>
                <MetaRow label="Size">
                  {formatSize(o.size)} <span className="text-dim">· {formatBytes(o.size)}</span>
                </MetaRow>
                <MetaRow label="Type">{o.content_type || "—"}</MetaRow>
                <MetaRow label="ETag">{o.etag || <span className="text-faint">—</span>}</MetaRow>
                <MetaRow label="Modified">
                  <span title={o.last_modified}>{formatModified(o.last_modified)}</span> <span className="text-dim">· {o.last_modified}</span>
                </MetaRow>
              </dl>
              <SectionLabel className="pb-1 pt-4">Metadata</SectionLabel>
              {o.metadata && Object.keys(o.metadata).length > 0 ? (
                <dl className="divide-y divide-hairline">
                  {Object.entries(o.metadata).map(([k, v]) => (
                    <MetaRow key={k} label={<span className="font-mono text-[11px] break-all">{k}</span>}>
                      {v}
                    </MetaRow>
                  ))}
                </dl>
              ) : (
                <p className="py-1.5 text-[12px] text-faint">none</p>
              )}
            </div>
          </>
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-1.5 border-t border-hairline px-3 py-2">
        <Button size="sm" kind="secondary" icon={<Download size={11} />} onClick={() => onDownload(objectKey)} disabled={!o}>
          Download
        </Button>
        <Button size="sm" kind="secondary" icon={<Link2 size={11} />} onClick={() => onSignedUrl(objectKey)} disabled={!o}>
          Signed URL
        </Button>
        <Tooltip content={locked ? "Read-only: unlock the bucket first" : "Rename or move to another folder"}>
          <span className="inline-flex">
            <Button size="sm" kind="ghost" icon={<Pencil size={11} />} onClick={() => onMove(objectKey)} disabled={!o || locked}>
              Move
            </Button>
          </span>
        </Tooltip>
        <Tooltip content={locked ? "Read-only: unlock the bucket first" : "Delete this object"}>
          <span className="ml-auto inline-flex">
            <Button size="sm" kind="danger" icon={<Trash2 size={11} />} onClick={() => onDelete(objectKey)} disabled={!o || locked}>
              Delete
            </Button>
          </span>
        </Tooltip>
      </footer>
    </aside>
  );
}

type Content = { key: string; etag?: string; url?: string; text?: string; truncated?: boolean; error?: string };

/** Fetches the bytes once per object (key + ETag) and shows them by kind; revokes the blob URL on the way out. */
function Media({ object, kind }: { object: StorageObject; kind: PreviewKind }) {
  const [content, setContent] = useState<Content | undefined>();
  const tooBig = object.size > PREVIEW_MAX_BYTES;
  const { key, etag } = object;
  useEffect(() => {
    if (kind === "other" || tooBig) {
      setContent(undefined);
      return;
    }
    const ac = new AbortController();
    let url: string | undefined;
    setContent(undefined);
    fetchObjectContent(key, ac.signal)
      .then(async (blob) => {
        if (ac.signal.aborted) return;
        if (kind === "text") {
          const text = await blob.slice(0, TEXT_PREVIEW_LIMIT).text();
          setContent({ key, etag, text, truncated: blob.size > TEXT_PREVIEW_LIMIT });
          return;
        }
        url = URL.createObjectURL(kind === "pdf" ? new Blob([blob], { type: "application/pdf" }) : blob);
        setContent({ key, etag, url });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setContent({ key, etag, error: errorMessage(err) });
      });
    return () => {
      ac.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, etag, kind, tooBig]);

  if (kind === "other") return <Note>No preview for this type. Download it, or open a signed URL.</Note>;
  if (tooBig) return <Note>Too large to preview here ({formatSize(object.size)}). Download it, or open a signed URL.</Note>;
  if (!content || content.key !== key) return <Skeleton className="m-4 h-40 w-[calc(100%-2rem)]" rounded="rounded-lg" />;
  if (content.error) return <ProblemNote error={new Error(content.error)} className="m-4" />;
  if (kind === "image") {
    return (
      <div className="dotgrid m-4 grid place-items-center rounded-lg border border-hairline p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL of the object's own bytes */}
        <img src={content.url} alt={baseName(key)} className="max-h-[260px] max-w-full object-contain" />
      </div>
    );
  }
  if (kind === "pdf") return <iframe src={content.url} title={baseName(key)} className="m-4 h-[380px] w-[calc(100%-2rem)] rounded-lg border border-hairline bg-white" />;
  return (
    <div className="m-4">
      <pre className="max-h-[320px] overflow-auto rounded-lg border border-hairline bg-code-bg p-3 font-mono text-[11px] leading-[1.55] text-text whitespace-pre-wrap break-words">{content.text}</pre>
      {content.truncated && <p className="mt-1 text-[11px] text-dim">The first {formatSize(TEXT_PREVIEW_LIMIT)} of {formatSize(object.size)}; download for the rest.</p>}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="dotgrid m-4 rounded-lg border border-hairline px-4 py-8 text-center text-[12px] text-dim">{children}</p>;
}
