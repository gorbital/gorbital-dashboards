/** A listing as the browser shows it: the pages of `/ops/storage/objects` merged, folders first, sorted. */
import type { StorageObject, StoragePage } from "@/lib/api/storage";
import { baseName, isDirectoryMarker } from "./keys";

export type Entry = { kind: "folder"; name: string; key: string } | { kind: "object"; name: string; key: string; object: StorageObject };

export type Listing = { prefixes: string[]; objects: StorageObject[] };

/**
 * Flattens the pages of one prefix. A prefix folded at a page boundary can
 * appear on two pages (the store's cursor is the last key it scanned), and a
 * refetched page may repeat an object; both are kept once. Directory markers
 * are hidden, as the store hides them.
 */
export function mergePages(pages: StoragePage[]): Listing {
  const prefixes: string[] = [];
  const seenPrefix = new Set<string>();
  const objects: StorageObject[] = [];
  const seenKey = new Set<string>();
  for (const p of pages) {
    for (const d of p.prefixes ?? []) {
      if (!seenPrefix.has(d)) {
        seenPrefix.add(d);
        prefixes.push(d);
      }
    }
    for (const o of p.objects ?? []) {
      if (isDirectoryMarker(o.key) || seenKey.has(o.key)) continue;
      seenKey.add(o.key);
      objects.push(o);
    }
  }
  return { prefixes, objects };
}

/** Folders then objects, each named by its last segment. */
export function entriesOf(listing: Listing): Entry[] {
  return [
    ...listing.prefixes.map((p): Entry => ({ kind: "folder", name: baseName(p), key: p })),
    ...listing.objects.map((o): Entry => ({ kind: "object", name: baseName(o.key), key: o.key, object: o })),
  ];
}

export type SortKey = "name" | "size" | "modified";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

/** Sorts within kinds: folders stay before objects whatever the sort; folders sort by name only. */
export function sortEntries(entries: Entry[], sort: Sort | undefined): Entry[] {
  if (!sort) return entries;
  const dir = sort.dir === "asc" ? 1 : -1;
  const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const value = (e: Entry): number => (e.kind === "object" ? (sort.key === "size" ? e.object.size : Date.parse(e.object.last_modified) || 0) : 0);
  const folders = entries.filter((e) => e.kind === "folder").sort((a, b) => byName(a, b) * (sort.key === "name" ? dir : 1));
  const objects = entries
    .filter((e) => e.kind === "object")
    .sort((a, b) => {
      if (sort.key === "name") return byName(a, b) * dir;
      const d = value(a) - value(b);
      return d === 0 ? byName(a, b) : d * dir;
    });
  return [...folders, ...objects];
}

/** The next sort after clicking a header: asc, then desc, then off. */
export function nextSort(current: Sort | undefined, key: SortKey): Sort | undefined {
  if (current?.key !== key) return { key, dir: "asc" };
  return current.dir === "asc" ? { key, dir: "desc" } : undefined;
}

/** "3 objects · 2 folders", "1 object", "empty". */
export function describeListing(listing: Listing, more: boolean): string {
  const parts: string[] = [];
  if (listing.prefixes.length) parts.push(`${listing.prefixes.length} ${listing.prefixes.length === 1 ? "folder" : "folders"}`);
  if (listing.objects.length) parts.push(`${listing.objects.length} ${listing.objects.length === 1 ? "object" : "objects"}`);
  if (!parts.length) return more ? "more…" : "empty";
  return `${parts.join(" · ")}${more ? " · more…" : ""}`;
}
