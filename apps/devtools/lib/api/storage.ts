"use client";

/**
 * The Storage screen's data layer (ADR-0075): the operators' file storage
 * API (`/ops/storage…`) through the portal's proxy, like every other `/ops`
 * hook in `queries.ts`. Types match `internal/modules/ops/delivery/storage.go`
 * field for field. Uploads and downloads move bytes, not JSON, so they go
 * through `transportFetch`/XHR with the same headers `apiFetch` adds.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { DIRECTORY_MARKER, baseName, normalizePrefix } from "@/lib/storage/keys";
import { ApiError, MUTATION_HEADER, NotConnectedError, apiFetch, portalInit, readProblem, transportFetch } from "./client";
import { errorMessage } from "./errors";
import { dataMode } from "./mode";
import { queryString } from "./queries";

/* ---------- Types ---------- */

/** `GET /ops/storage` (`StorageStatusResponse`). */
export type StorageStatus = {
  /** local, s3, spaces, r2 or minio. */
  driver: string;
  bucket: string;
  /** The service's address, or the directory for local. */
  endpoint?: string;
  region?: string;
  /** A store on this machine, safe to change freely; the portal warns before writes elsewhere. */
  local: boolean;
  /** Where objects are reachable without a signature, when the bucket is public. */
  public_url?: string;
  /** Whether the service answered. */
  status: "ok" | "error";
  error?: string;
  ping_ms: number;
};

/** One object (`StorageObject`). */
export type StorageObject = {
  key: string;
  size: number;
  content_type: string;
  etag?: string;
  last_modified: string;
  metadata?: Record<string, string>;
};

/** `GET /ops/storage/objects` (`StoragePage`). Go's nil slices arrive as null. */
export type StoragePage = {
  prefix: string;
  objects: StorageObject[] | null;
  /** Directories under the prefix (keys folded at the next slash). */
  prefixes: string[] | null;
  next_cursor?: string;
};

export type SignedMethod = "GET" | "PUT";

export type SignedURLBody = {
  key: string;
  /** GET downloads, PUT uploads; default GET. */
  method?: SignedMethod;
  /** 1 to 604800; default 3600. */
  expiry_seconds?: number;
};

/** `POST /ops/storage/signed-url` (`SignedURLResponse`). */
export type SignedURL = {
  key: string;
  method: string;
  url: string;
  expires_at: string;
};

export type MoveObjectBody = { from: string; to: string };
export type MakeDirectoryBody = {
  /** The directory to create, with or without a trailing slash. */
  prefix: string;
};
export type StoragePrefix = { prefix: string };

/* ---------- Keys and helpers ---------- */

export const base = "/_portal/app/ops/storage";

export const storageKeys = {
  all: ["ops", "storage"] as const,
  status: ["ops", "storage", "status"] as const,
  objects: (prefix: string, limit: number) => ["ops", "storage", "objects", prefix, limit] as const,
  object: (key: string) => ["ops", "storage", "object", key] as const,
};

/** Don't retry what won't change by itself: not connected, not signed in, or refused. */
function retry(count: number, err: Error) {
  if (err instanceof NotConnectedError) return false;
  if (err instanceof ApiError && err.status < 500) return false;
  return count < 1;
}

/** 404 `storage_off`: the app has no store (STORAGE_DRIVER empty in production, or its config failed). */
export function isStorageOff(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.code === "storage_off";
}

/** 503 `storage_unavailable`: the service didn't answer. */
export function isStorageUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.status === 503 && err.code === "storage_unavailable";
}

type QC = ReturnType<typeof useQueryClient>;

/** After any write: every listing (a move can touch two folders), the object, and the audit log. */
function invalidateStorage(qc: QC, keys: string[] = []) {
  void qc.invalidateQueries({ queryKey: ["ops", "storage", "objects"] });
  for (const k of keys) void qc.invalidateQueries({ queryKey: storageKeys.object(k) });
  void qc.invalidateQueries({ queryKey: ["ops", "audit"] });
}

export const DEFAULT_PAGE_SIZE = 200;

/* ---------- Reads ---------- */

/** `GET /ops/storage`: the driver, bucket, endpoint and whether it answers; every 30 s. */
export function useStorageStatus(enabled: boolean) {
  return useQuery({
    queryKey: storageKeys.status,
    queryFn: () => apiFetch<StorageStatus>(base),
    enabled,
    refetchInterval: 30_000,
    retry,
  });
}

/** `GET /ops/storage/objects?prefix=&limit=&cursor=`: one level, a page at a time; `fetchNextPage` follows `next_cursor`. */
export function useStorageObjects(prefix: string, enabled: boolean, limit = DEFAULT_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: storageKeys.objects(prefix, limit),
    queryFn: ({ pageParam }) => apiFetch<StoragePage>(`${base}/objects${queryString({ prefix, limit, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled,
    retry,
  });
}

/** `GET /ops/storage/object?key=`: size, content type, ETag, modification time and metadata. */
export function useStorageObject(key: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: storageKeys.object(key ?? ""),
    queryFn: () => apiFetch<StorageObject>(`${base}/object${queryString({ key: key ?? "" })}`),
    enabled: enabled && Boolean(key),
    retry,
  });
}

/**
 * Every key under a folder, for deleting it: the objects of each level
 * (recursive listings hide directory markers, so this walks one level at a
 * time) plus the `.keep` marker of every folder met, whether or not it
 * exists (deleting a missing key is fine).
 */
export async function listAllKeys(prefix: string, limit = 1000): Promise<string[]> {
  const keys: string[] = [];
  const queue = [normalizePrefix(prefix)];
  const seen = new Set<string>();
  while (queue.length) {
    const dir = queue.shift()!;
    if (seen.has(dir)) continue;
    seen.add(dir);
    let cursor: string | undefined;
    for (let i = 0; i < 10_000; i++) {
      const page = await apiFetch<StoragePage>(`${base}/objects${queryString({ prefix: dir, limit, cursor })}`);
      for (const o of page.objects ?? []) keys.push(o.key);
      for (const p of page.prefixes ?? []) queue.push(p);
      if (!page.next_cursor) break;
      cursor = page.next_cursor;
    }
    keys.push(`${dir}${DIRECTORY_MARKER}`);
  }
  return [...new Set(keys)];
}

/* ---------- Bytes ---------- */

/** `GET /ops/storage/object/content?key=` as a Blob with the object's content type. */
export async function fetchObjectContent(key: string, signal?: AbortSignal): Promise<Blob> {
  let res: Response;
  try {
    res = await transportFetch(`${base}/object/content${queryString({ key })}`, { ...portalInit({ headers: { Accept: "*/*" } }), signal, cache: "no-store" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NotConnectedError(err);
  }
  if (!res.ok) throw new ApiError(await readProblem(res));
  return res.blob();
}

/** Downloads the object through the browser: a blob from `/content`, saved under the key's last segment. */
export async function downloadObject(key: string): Promise<void> {
  const blob = await fetchObjectContent(key);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = baseName(key);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type UploadOptions = {
  contentType: string;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
};

/**
 * `PUT /ops/storage/object?key=` with the file as the raw body and its
 * Content-Type. Live: an XMLHttpRequest, for upload progress, with the
 * cookie and the mutation header `apiFetch` would send. Mock: the in-memory
 * portal through `transportFetch` (no progress events; done at once).
 */
export function uploadObject(key: string, body: Blob, { contentType, onProgress, signal }: UploadOptions): Promise<StorageObject> {
  const path = `${base}/object${queryString({ key })}`;
  if (dataMode() === "mock") {
    return (async () => {
      const init = portalInit({ method: "PUT", headers: { "Content-Type": contentType } });
      const res = await transportFetch(path, { ...init, body, signal });
      if (!res.ok) throw new ApiError(await readProblem(res));
      onProgress?.(body.size, body.size);
      return (await res.json()) as StorageObject;
    })();
  }
  return new Promise<StorageObject>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", path, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader(MUTATION_HEADER, "1");
    xhr.setRequestHeader("Accept", "application/json, application/problem+json");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded, e.lengthComputable ? e.total : body.size);
    xhr.onerror = () => reject(new NotConnectedError());
    xhr.onabort = () => reject(new DOMException("upload aborted", "AbortError"));
    xhr.onload = () => {
      const type = xhr.getResponseHeader("content-type") ?? "";
      const res = new Response(xhr.status === 204 ? null : xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers: type ? { "Content-Type": type } : {} });
      if (xhr.status < 200 || xhr.status >= 300) {
        void readProblem(res).then((p) => reject(new ApiError(p)));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as StorageObject);
      } catch (err) {
        reject(err);
      }
    };
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/* ---------- Writes ---------- */

/** `DELETE /ops/storage/object?key=` for each key, one after another; a missing key is fine. */
export function useDeleteObjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keys: string[]) => {
      let deleted = 0;
      for (const key of keys) {
        await apiFetch<void>(`${base}/object${queryString({ key })}`, { method: "DELETE" });
        deleted++;
      }
      return deleted;
    },
    onSuccess: (n, keys) => toast.success(`Deleted ${n} ${n === 1 ? "object" : "objects"}`, { description: keys.length === 1 ? keys[0] : undefined }),
    onError: (err, keys) => toast.error("Couldn't delete", { description: `${errorMessage(err)}${keys.length > 1 ? " · the objects before it were deleted" : ""}` }),
    onSettled: (_n, _e, keys) => invalidateStorage(qc, keys),
  });
}

/** `POST /ops/storage/object/move`: copies `from` to `to` and deletes `from`. */
export function useMoveObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MoveObjectBody) => apiFetch<StorageObject>(`${base}/object/move`, { method: "POST", json: body }),
    onSuccess: (o, body) => toast.success(body.from.slice(0, body.from.lastIndexOf("/") + 1) === o.key.slice(0, o.key.lastIndexOf("/") + 1) ? "Renamed" : "Moved", { description: `${body.from} → ${o.key}` }),
    onError: (err) => toast.error("Couldn't move", { description: errorMessage(err) }),
    onSettled: (_o, _e, body) => invalidateStorage(qc, [body.from, body.to]),
  });
}

/** `POST /ops/storage/directories` (201): a hidden `.keep` marker so the prefix appears in listings. */
export function useMakeDirectory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MakeDirectoryBody) => apiFetch<StoragePrefix>(`${base}/directories`, { method: "POST", json: body }),
    onSuccess: (p) => toast.success("Folder created", { description: p.prefix }),
    onError: (err) => toast.error("Couldn't create the folder", { description: errorMessage(err) }),
    onSettled: () => invalidateStorage(qc),
  });
}

/** `POST /ops/storage/signed-url` (201): a URL that downloads or uploads the object until it expires. */
export function useSignedUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SignedURLBody) => apiFetch<SignedURL>(`${base}/signed-url`, { method: "POST", json: body }),
    onError: (err) => toast.error("Couldn't sign the URL", { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["ops", "audit"] }),
  });
}

/** After an upload batch: refetch the listings the files landed in. */
export function useInvalidateStorage() {
  const qc = useQueryClient();
  return (keys: string[] = []) => invalidateStorage(qc, keys);
}
