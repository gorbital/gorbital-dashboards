import { describe, expect, it } from "vitest";
import { bucketId, guardMessage, isLocked, readUnlock, writeUnlock } from "./guard";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
};

const spaces = { driver: "spaces", bucket: "acme-files", endpoint: "fra1.digitaloceanspaces.com", local: false };
const local = { driver: "local", bucket: "storage", endpoint: "/Users/you/src/acme-api/.orb/storage", local: true };

describe("guard", () => {
  it("names a bucket by driver, name and endpoint", () => {
    expect(bucketId(spaces)).toBe("spaces:acme-files@fra1.digitaloceanspaces.com");
    expect(bucketId({ ...spaces, endpoint: undefined })).toBe("spaces:acme-files@");
  });
  it("locks a store elsewhere until unlocked, never a local one", () => {
    expect(isLocked(spaces, false)).toBe(true);
    expect(isLocked(spaces, true)).toBe(false);
    expect(isLocked(local, false)).toBe(false);
    expect(isLocked(undefined, false)).toBe(false);
  });
  it("remembers the unlock per bucket in the given store", () => {
    const store = memory();
    const id = bucketId(spaces);
    expect(readUnlock(id, store)).toBe(false);
    writeUnlock(id, true, store);
    expect(readUnlock(id, store)).toBe(true);
    expect(readUnlock(bucketId({ ...spaces, bucket: "other" }), store)).toBe(false);
    writeUnlock(id, false, store);
    expect(readUnlock(id, store)).toBe(false);
    expect(store.map.size).toBe(0);
  });
  it("survives a broken or missing store", () => {
    const broken = { getItem: () => "{not json", setItem: () => {}, removeItem: () => {} };
    expect(readUnlock("x", broken)).toBe(false);
    expect(() => writeUnlock("x", true, broken)).not.toThrow();
    expect(readUnlock("x", undefined)).toBe(false);
  });
  it("words the banner", () => {
    expect(guardMessage(spaces)).toBe("This is the spaces bucket acme-files — not on this machine.");
  });
});
