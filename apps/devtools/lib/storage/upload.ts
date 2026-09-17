/** The upload queue's bookkeeping: one item per file, progress per item, one figure for the batch. */
import { joinKey, keyError } from "./keys";

export type UploadState = "queued" | "uploading" | "done" | "error";

export type UploadItem = {
  id: string;
  /** The key the file lands under: the folder's prefix plus the file's name. */
  key: string;
  name: string;
  size: number;
  /** Bytes sent so far. */
  loaded: number;
  state: UploadState;
  error?: string;
};

export type UploadProgress = {
  total: number;
  loaded: number;
  /** 0–100, whole numbers; 100 only once every item finished. */
  percent: number;
  done: number;
  failed: number;
  /** Items still queued or uploading. */
  remaining: number;
  finished: boolean;
};

/** One item per file, refused up front (state `error`) when the key wouldn't be accepted. */
export function planUploads(files: { name: string; size: number }[], prefix: string, id: (i: number) => string = (i) => `up_${Date.now().toString(36)}_${i}`): UploadItem[] {
  return files.map((f, i) => {
    const key = joinKey(prefix, f.name);
    const err = keyError(key);
    return { id: id(i), key, name: f.name, size: f.size, loaded: 0, state: err ? "error" : "queued", error: err };
  });
}

/** The batch's figure from its items; a finished item counts its whole size whatever `loaded` says. */
export function aggregateProgress(items: UploadItem[]): UploadProgress {
  let total = 0;
  let loaded = 0;
  let done = 0;
  let failed = 0;
  let remaining = 0;
  for (const it of items) {
    total += it.size;
    if (it.state === "done") {
      loaded += it.size;
      done++;
    } else if (it.state === "error") {
      loaded += it.size;
      failed++;
    } else {
      loaded += Math.min(it.loaded, it.size);
      remaining++;
    }
  }
  const finished = items.length > 0 && remaining === 0;
  const percent = items.length === 0 ? 0 : finished ? 100 : total === 0 ? 0 : Math.min(99, Math.floor((loaded / total) * 100));
  return { total, loaded, percent, done, failed, remaining, finished };
}

/** A new list with one item changed. */
export function updateItem(items: UploadItem[], id: string, patch: Partial<UploadItem>): UploadItem[] {
  return items.map((it) => (it.id === id ? { ...it, ...patch } : it));
}

/** "3 files · 1.2 MB", "1 file · 14 B". */
export function describeBatch(items: UploadItem[], size: (n: number) => string): string {
  const total = items.reduce((a, it) => a + it.size, 0);
  return `${items.length} ${items.length === 1 ? "file" : "files"} · ${size(total)}`;
}
