import { describe, expect, it } from "vitest";
import type { StorageObject, StoragePage } from "@/lib/api/storage";
import { describeListing, entriesOf, mergePages, nextSort, sortEntries } from "./list";

const obj = (key: string, size = 1, at = "2026-09-15T10:00:00Z"): StorageObject => ({ key, size, content_type: "text/plain", last_modified: at });
const page = (objects: StorageObject[], prefixes: string[], next_cursor?: string): StoragePage => ({ prefix: "", objects, prefixes, next_cursor });

describe("mergePages", () => {
  it("keeps a prefix repeated at a page boundary once, drops markers and repeated keys", () => {
    const merged = mergePages([page([obj("a.txt"), obj("drafts/.keep")], ["images/"], "images/x.png"), page([obj("a.txt"), obj("b.txt")], ["images/", "invoices/"])]);
    expect(merged.prefixes).toEqual(["images/", "invoices/"]);
    expect(merged.objects.map((o) => o.key)).toEqual(["a.txt", "b.txt"]);
  });
  it("tolerates null arrays (Go's nil slices)", () => {
    const merged = mergePages([{ prefix: "", objects: null as unknown as StorageObject[], prefixes: null as unknown as string[] }]);
    expect(merged).toEqual({ prefixes: [], objects: [] });
  });
});

describe("entries and sorting", () => {
  const listing = { prefixes: ["images/", "exports/"], objects: [obj("b.txt", 10, "2026-09-15T10:00:00Z"), obj("a10.txt", 5, "2026-09-16T10:00:00Z"), obj("a2.txt", 20, "2026-09-14T10:00:00Z")] };
  it("names entries by their last segment, folders first", () => {
    expect(entriesOf(listing).map((e) => `${e.kind}:${e.name}`)).toEqual(["folder:images", "folder:exports", "object:b.txt", "object:a10.txt", "object:a2.txt"]);
  });
  it("sorts by name with numbers in order, folders always first", () => {
    const names = (s: Parameters<typeof sortEntries>[1]) => sortEntries(entriesOf(listing), s).map((e) => e.name);
    expect(names({ key: "name", dir: "asc" })).toEqual(["exports", "images", "a2.txt", "a10.txt", "b.txt"]);
    expect(names({ key: "name", dir: "desc" })).toEqual(["images", "exports", "b.txt", "a10.txt", "a2.txt"]);
    expect(names({ key: "size", dir: "asc" })).toEqual(["exports", "images", "a10.txt", "b.txt", "a2.txt"]);
    expect(names({ key: "modified", dir: "desc" })).toEqual(["exports", "images", "a10.txt", "b.txt", "a2.txt"]);
    expect(names(undefined)).toEqual(["images", "exports", "b.txt", "a10.txt", "a2.txt"]);
  });
  it("cycles a header's sort", () => {
    expect(nextSort(undefined, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "name")).toBeUndefined();
    expect(nextSort({ key: "name", dir: "desc" }, "size")).toEqual({ key: "size", dir: "asc" });
  });
  it("describes the listing", () => {
    expect(describeListing(listing, false)).toBe("2 folders · 3 objects");
    expect(describeListing({ prefixes: [], objects: [obj("a")] }, true)).toBe("1 object · more…");
    expect(describeListing({ prefixes: [], objects: [] }, false)).toBe("empty");
  });
});
